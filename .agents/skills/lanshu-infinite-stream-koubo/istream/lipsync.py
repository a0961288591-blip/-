"""Lip-sync stage: engine registry, Chinese mouth-risk analysis, visibility/size routing, job manifests, adapters.

Order of operations (the core rule of this skill):
  temporal ops (trim / reverse / speed) → LIP-SYNC on the clean host plate at source resolution → spatial ops (crop / punch / PiP) + MG.
Only *visible* host spans are sent to an engine; hidden spans (B-roll / cards) cost nothing.

Prices are the 2026-10 public figures used in digital-human-asset-feasibility.md — verify before budgeting.
Adapters other than `passthrough` are TEMPLATES: they print the request/command they would run and refuse to fake output.
"""
import json
import os
import re
import shutil

from .qc import effective_face_px

ENGINES = {
    # mouth-only, video-to-video (the reuse engine)
    "sync-2-pro": dict(kind="commercial", mode="mouth_only", tier="hero", usd_per_min=(4.0, 5.0),
                       zh="Phase 0 必测：快语速闭唇音、英文字母夹杂", note="sync.so lipsync-2-pro — highest mouth fidelity in the 2026-10 survey"),
    "sync-2": dict(kind="commercial", mode="mouth_only", tier="standard", usd_per_min=(3.0, 3.0), zh="同上", note="sync.so lipsync-2"),
    "kling-lipsync": dict(kind="commercial", mode="mouth_only", tier="standard", usd_per_min=None, zh="中文训练数据充足，国内首选候选之一；注意单次时长上限", note="可灵对口型 — pricing per console"),
    "heygen-twin": dict(kind="commercial", mode="avatar_service", tier="standard", usd_per_min=(1.0, 1.5),
                        zh="需要真人授权素材；适合本人出镜、低产量", note="HeyGen digital twin (Avatar III-class) — productized plate+mouth"),
    "latentsync": dict(kind="open_source", mode="mouth_only", tier="standard", usd_per_min=(0.05, 0.5), zh="Apache-2.0，画质优先、较慢；中文需实测",
                       note="ByteDance LatentSync (diffusion) — self-host on GPU"),
    "musetalk": dict(kind="open_source", mode="mouth_only", tier="small", usd_per_min=(0.05, 0.3), zh="接近实时；脸部区域 256px，适合小脸 / 画中画",
                     note="MuseTalk — fast, 256px face crop"),
    "passthrough": dict(kind="none", mode="none", tier="preview", usd_per_min=(0.0, 0.0), zh="不改嘴，只用于拼接预览", note="no lip-sync (preview only)"),
    # full re-performance (not reuse): for hero shots that need new head/body motion
    "omnihuman": dict(kind="commercial", mode="full_regen", tier="hero", usd_per_min=None, zh="即梦数字人：头、身、嘴全部重做", note="re-performs the whole shot"),
    "infinitetalk": dict(kind="open_source", mode="full_regen", tier="hero", usd_per_min=None, zh="开源，头部和身体一起重做", note="re-performs; not mouth-only"),
}

DEFAULT_POLICY = {
    "hero": "sync-2-pro",        # opening / hook / emphasis / CTA / punch-ins, big faces
    "standard": "latentsync",    # ordinary visible talking
    "small": "musetalk",         # PiP / small faces: speed beats fidelity, nobody can see the difference
    "hero_roles": ["open", "hook", "emphasis", "cta"],
    "small_face_px": 160,
    "hero_face_px": 300,
    "min_job_s": 2.0,
}

# approximate initials for frequent characters (install `pypinyin` for exact analysis)
BILABIAL = set("八巴吧爸把拔白百摆败拜班般搬板版办半伴扮帮榜绑棒包薄保宝饱抱报暴爆杯悲北备背倍被辈本奔笨崩逼鼻比彼笔币必毕闭避壁边编鞭扁变便遍辩标表别宾冰兵饼并病拨波玻剥播伯脖博补不布步部簿"
               "怕拍排牌派攀盘判盼旁胖抛跑泡炮陪培赔配喷盆朋棚蓬捧碰批披皮疲脾匹屁偏篇片骗漂飘票拼贫频品聘平评凭瓶苹坡泼婆破迫剖扑铺仆葡朴普谱"
               "妈麻马码吗嘛埋买迈麦卖脉满慢漫忙盲猫毛矛茂冒帽貌么没眉梅媒煤每美妹门闷们萌盟猛梦迷米秘密蜜眠绵棉免面苗描秒妙灭民敏名明鸣命模摸磨魔抹末莫默墨谋某母亩木目牧墓幕慕暮穆")
LABIODENTAL = set("发乏伐罚法帆番翻凡烦繁反返犯泛饭范方房防仿访纺放飞非啡肥废沸费分纷芬坟粉份奋愤丰风封疯峰锋蜂逢缝讽凤奉佛否夫肤孵扶服浮符幅福府辅腐父付负妇附复副赋富覆")
LATIN = re.compile(r"[A-Za-z][A-Za-z0-9\-]*")


def zh_mouth_risk(text, seconds):
    """Chinese lip-sync risk for one span of speech."""
    try:
        from pypinyin import lazy_pinyin, Style  # optional, exact
        ini = lazy_pinyin(text, style=Style.INITIALS, strict=False)
        bil = sum(1 for i in ini if i in ("b", "p", "m"))
        lab = sum(1 for i in ini if i == "f")
        exact = True
    except Exception:
        bil = sum(1 for ch in text if ch in BILABIAL)
        lab = sum(1 for ch in text if ch in LABIODENTAL)
        exact = False
    latin = LATIN.findall(text)
    bil += sum(w.lower().count("b") + w.lower().count("p") + w.lower().count("m") for w in latin)
    cjk = len(re.findall(r"[㐀-鿿]", text))
    s = max(0.1, seconds)
    rate = cjk / s
    score = 0.0
    tips = []
    if rate > 6.0:
        score += 2
        tips.append(f"语速 {rate:.1f} 字/s 偏快：TTS 放慢 5–10% 或拆句")
    elif rate > 5.5:
        score += 1
    if bil / s > 1.2:
        score += 1
        tips.append(f"闭唇音 b/p/m 密集（{bil} 个）：重点检查是否真正闭合")
    if lab:
        tips.append(f"唇齿音 f ×{lab}：看上齿是否压下唇")
    if latin:
        score += 1
        tips.append("夹杂英文 / 缩写（" + "、".join(sorted(set(latin))) + "）：字母口型和中文不同，单独看一遍")
    if re.search(r"[0-9]", text):
        score += 0.5
        tips.append("数字读法要和 TTS 一致（十 / 一百 / 10）")
    level = "high" if score >= 3 else ("mid" if score >= 1.5 else "low")
    return {"rate_cps": round(rate, 2), "bilabial": bil, "labiodental": lab, "latin": latin, "level": level,
            "exact_pinyin": exact, "tips": tips}


def runs(tl):
    """Contiguous visible host spans."""
    out, cur = [], None
    for c in tl["host"]:
        vis = c["layout"] != "hidden" and c.get("shot")
        if vis:
            if cur is None:
                cur = {"clips": [], "in": c["rec"]["in"]}
            cur["clips"].append(c)
            cur["out"] = c["rec"]["out"]
        elif cur is not None:
            out.append(cur)
            cur = None
    if cur is not None:
        out.append(cur)
    return out


def tier_of(tl, c, cat, policy):
    fpx = effective_face_px(tl, c, cat)
    if c["layout"] == "pip" or fpx < policy["small_face_px"]:
        return "small", fpx
    if c.get("role") in policy["hero_roles"] or c["layout"] == "punch" or fpx >= policy["hero_face_px"]:
        return "hero", fpx
    return "standard", fpx


def make_jobs(tl, cat, policy=None, engine_override=None):
    policy = dict(DEFAULT_POLICY, **(policy or {}))
    beats = tl.get("beats", [])
    jobs = []
    rank = {"small": 0, "standard": 1, "hero": 2}
    for r in runs(tl):
        # split a run where the tier changes, as long as every piece stays ≥ min_job_s
        pieces, cur = [], None
        for c in r["clips"]:
            t, fpx = tier_of(tl, c, cat, policy)
            L = c["rec"]["out"] - c["rec"]["in"]
            if cur and (t == cur["tier"] or L < policy["min_job_s"] or (cur["out"] - cur["in"]) < policy["min_job_s"]):
                cur["clips"].append(c["id"])
                cur["out"] = c["rec"]["out"]
                cur["secs"][t] = cur["secs"].get(t, 0.0) + L
                # a merged job takes its dominant tier by seconds (a 0.7 s punch-in must not promote 10 s to the pro engine)
                cur["tier"] = max(cur["secs"], key=lambda k: (cur["secs"][k], rank[k]))
                cur["face_px"] = max(cur["face_px"], fpx)
            else:
                cur = {"tier": t, "in": c["rec"]["in"], "out": c["rec"]["out"], "clips": [c["id"]], "face_px": fpx, "secs": {t: L}}
                pieces.append(cur)
        for p in pieces:
            text = "".join(b["text"] for b in beats if b["start"] < p["out"] and b["end"] > p["in"])
            part, speech_s = "", 0.0
            for b in beats:
                o0, o1 = max(b["start"], p["in"]), min(b["end"], p["out"])
                if o1 <= o0:
                    continue
                d = max(1e-6, b["end"] - b["start"])
                n = len(b["text"])
                part += b["text"][int(n * (o0 - b["start"]) / d):int(round(n * (o1 - b["start"]) / d))]
                speech_s += o1 - o0
            eng = engine_override or policy[p["tier"]]
            lock = None
            cm = {c["id"]: c for c in tl["host"]}
            for cid in p["clips"]:
                sh = cat.shots.get(cm[cid].get("shot") or "", {})
                if sh and sh.get("lipsync", {}).get("second_face"):
                    lock = sh["camera"].get("face_box")
            jobs.append({"id": f"j{len(jobs) + 1:02d}", "rec": {"in": p["in"], "out": p["out"]}, "seconds": round(p["out"] - p["in"], 3),
                         "clips": p["clips"], "tier": p["tier"], "engine": eng, "face_px_out": round(p["face_px"]),
                         "zh_risk": zh_mouth_risk(part, speech_s or (p["out"] - p["in"])), "text": text,
                         "inputs": {"video": f"lipsync/in/{len(jobs) + 1:02d}_video.mp4", "audio": f"lipsync/in/{len(jobs) + 1:02d}_audio.wav"},
                         "output": f"lipsync/out/{len(jobs) + 1:02d}_synced.mp4",
                         **({"face_lock": lock, "face_lock_note": "second face (reflection) in frame — pass this box to the engine / crop to it"} if lock else {})})
    total = tl["meta"]["duration"]
    sent = sum(j["seconds"] for j in jobs)
    return {"version": "istream.lipsync/1", "policy": policy, "duration": total, "seconds_sent": round(sent, 2),
            "seconds_skipped_hidden": round(total - sent, 2), "jobs": jobs}


# ----------------------------------------------------------------------------- adapters
class NotConfigured(RuntimeError):
    pass


def resolve_job_path(workdir, path):
    """Keep imported job inputs and outputs within their build directory."""
    if not isinstance(path, str) or not path.strip():
        raise ValueError("job paths must be non-empty strings")
    base = os.path.realpath(workdir)
    resolved = os.path.realpath(os.path.join(base, path))
    if resolved == base or os.path.commonpath([base, resolved]) != base:
        raise ValueError("job paths must remain inside workdir")
    return resolved


def run_job(job, workdir, engine=None):
    eng = engine or job["engine"]
    vin = resolve_job_path(workdir, job["inputs"]["video"])
    ain = resolve_job_path(workdir, job["inputs"]["audio"])
    out = resolve_job_path(workdir, job["output"])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if eng == "passthrough":
        shutil.copyfile(vin, out)
        return {"engine": "passthrough", "output": out, "synced": False}
    tmpl = TEMPLATES.get(eng)
    if not tmpl:
        raise NotConfigured(f"no adapter template for {eng}")
    raise NotConfigured(f"{eng} is a template adapter in this package. Run it yourself:\n  " + tmpl.format(video=vin, audio=ain, out=out) +
                        "\nthen place the result at the job output path and continue with `istream render --stage composite`.")


TEMPLATES = {
    # Fill in from the provider's current docs; these show the *shape* of the call, not verified endpoints.
    "sync-2-pro": 'POST <sync.so generate endpoint> {{"model": "lipsync-2-pro", "input": [{{"type": "video", "url": "<upload {video}>"}}, {{"type": "audio", "url": "<upload {audio}>"}}]}} → download to {out}',
    "sync-2": 'POST <sync.so generate endpoint> {{"model": "lipsync-2", "input": [{{"type": "video", "url": "<upload {video}>"}}, {{"type": "audio", "url": "<upload {audio}>"}}]}} → download to {out}',
    "kling-lipsync": "Kling console/API lip-sync task: video={video} audio={audio} → save {out}",
    "heygen-twin": "HeyGen: train the twin once from consented footage, then submit audio={audio} per job → save {out}",
    "latentsync": "cd LatentSync && python -m scripts.inference --unet_config_path configs/unet/stage2.yaml --inference_ckpt_path checkpoints/latentsync_unet.pt "
                  "--video_path {video} --audio_path {audio} --video_out_path {out}   # check flags for your installed version",
    "musetalk": "cd MuseTalk && write a task yaml (video_path: {video}, audio_path: {audio}) → python -m scripts.inference --inference_config <yaml> --result_dir <dir>; move result to {out}",
}


def write_jobs(jobs, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(jobs, f, ensure_ascii=False, indent=1)


def jobs_report(jobs):
    lines = [f"lip-sync: {len(jobs['jobs'])} jobs, {jobs['seconds_sent']}s sent, {jobs['seconds_skipped_hidden']}s skipped (host hidden)"]
    for j in jobs["jobs"]:
        r = j["zh_risk"]
        lines.append(f"  {j['id']} {j['rec']['in']:6.2f}-{j['rec']['out']:6.2f} ({j['seconds']:5.2f}s) tier={j['tier']:<8} engine={j['engine']:<11} "
                     f"face≈{j['face_px_out']}px zh-risk={r['level']} ({r['rate_cps']} 字/s, b/p/m×{r['bilabial']}{', ' + '/'.join(sorted(set(r['latin']))) if r['latin'] else ''})")
        for t in r["tips"]:
            lines.append(f"       · {t}")
    return "\n".join(lines)
