"""Timeline QC: hard FAILs block render; WARNs go to the human checklist."""
from .planner import PROFILES

FRAME = 1 / 30


def effective_face_px(tl, c, cat):
    """Face height in OUTPUT pixels after crop/scale/pip — the number that decides lip-sync sharpness."""
    if not c.get("shot"):
        return 0.0
    s = cat.shots[c["shot"]]
    plate = cat.plates[s["plate"]]
    src_h = plate.get("size", [1920, 1080])[1]
    out_w, out_h = tl["meta"]["size"]
    fh = s["camera"].get("face_h_px", 0)
    k = out_h / src_h
    for o in c.get("ops", []):
        if o["op"] == "scale":
            k *= o["s"]
        if o["op"] == "pip":
            k *= o["size"]
    return fh * k


def run(tl, cat):
    F = []
    add = lambda sev, code, msg, at=None: F.append({"sev": sev, "code": code, "msg": msg, "at": at})
    meta = tl["meta"]
    prof = PROFILES.get(meta.get("profile", "short"), PROFILES["short"])
    host = tl["host"]
    dur = meta["duration"]
    beats = {b["id"]: b for b in tl.get("beats", [])}
    # 1 coverage
    t = 0.0
    for c in host:
        if abs(c["rec"]["in"] - t) > FRAME + 1e-6:
            add("FAIL", "coverage", f"gap/overlap before {c['id']} ({t:.3f} → {c['rec']['in']:.3f})", c["rec"]["in"])
        t = c["rec"]["out"]
    if abs(t - dur) > FRAME + 1e-6:
        add("FAIL", "coverage", f"host track ends at {t:.3f}, VO duration {dur:.3f}", t)
    # 2 opening presence
    c0 = host[0]
    if c0["layout"] not in ("full", "punch") or not c0.get("shot"):
        add("FAIL", "opening", "the first shot must show the host (full frame) — openings need natural presence", 0.0)
    else:
        s0 = cat.shots[c0["shot"]]
        if not (s0.has_role("open") or s0["edit"].get("position") == "first_only"):
            add("WARN", "opening", f"first shot {c0['shot']} is not an opening shot (role open / first_only)", 0.0)
    seen = {}
    prev = None
    lens = []
    for c in host:
        L = c["rec"]["out"] - c["rec"]["in"]
        sid = c.get("shot")
        if sid:
            s = cat.shots[sid]
            if c["layout"] != "pip":
                lens.append(L)
            # 3 repetition
            vsig = (round(next((o["s"] for o in c.get("ops", []) if o["op"] == "scale"), 1.0), 2),
                    any(o["op"] == "reverse" for o in c.get("ops", [])), c["layout"] == "pip")
            for (ua, ub, t0, s0) in seen.get(sid, []):
                if ua < c["src"]["out"] and ub > c["src"]["in"]:
                    gap = c["rec"]["in"] - t0
                    if gap < 12.0:
                        add("FAIL", "repeat", f"{c['id']} reuses {sid} only {gap:.1f}s after it was shown", c["rec"]["in"])
                    elif s0 == vsig and gap < prof["no_repeat_s"]:
                        add("FAIL", "repeat", f"{c['id']} reuses {sid} (same variant) {gap:.1f}s after {t0:.1f}s", c["rec"]["in"])
                    else:
                        add("WARN", "repeat", f"{c['id']} reuses {sid} as a variant (scale/reverse/PiP) {gap:.1f}s after {t0:.1f}s — check by eye", c["rec"]["in"])
            seen.setdefault(sid, []).append((c["src"]["in"], c["src"]["out"], c["rec"]["in"], vsig))
            # 16 first_only
            if s["edit"].get("position") == "first_only" and c is not host[0]:
                add("FAIL", "position", f"{sid} is an opening-only shot used at {c['rec']['in']:.1f}s", c["rec"]["in"])
            # 5 speech vs mouth
            speech = any(beats.get(b, {}).get("text") for b in c.get("beats", []))
            if speech and not (s.speaking() and s["lipsync"].get("ready")):
                add("FAIL", "mouth", f"{c['id']} carries speech but {sid} is not a lip-sync-ready talking shot", c["rec"]["in"])
            # 14 hands near face
            if s["performance"].get("hands") == "near_face":
                add("FAIL", "hands", f"{sid} has hands near the face", c["rec"]["in"])
            # 7 defects
            a, b = c["src"]["in"] - s["src"]["in"], c["src"]["out"] - s["src"]["in"]
            crop = next((o for o in c.get("ops", []) if o["op"] == "crop"), None)
            for d in s.defects_in(a, b):
                covered = False
                if crop and d.get("zone") in ("right_half", "left_half"):
                    lo, hi = crop["cx"] - crop["frac"] / 2, crop["cx"] + crop["frac"] / 2
                    covered = hi <= 0.5 + 1e-6 if d["zone"] == "right_half" else lo >= 0.5 - 1e-6
                if not covered:
                    add("FAIL", "defect", f"{c['id']} shows defect '{d['type']}' of {sid} ({d['in']:.2f}-{d['out']:.2f}s)", c["rec"]["in"])
            # 8 scale
            for o in c.get("ops", []):
                if o["op"] == "scale" and o["s"] > s["edit"].get("scale_max", 1.0) + 1e-6:
                    add("FAIL", "scale", f"{c['id']} scale {o['s']} > scale_max {s['edit'].get('scale_max')}", c["rec"]["in"])
                if o["op"] == "reverse" and s["edit"].get("reversible", "no") == "no":
                    add("FAIL", "reverse", f"{c['id']} reverses non-reversible {sid}", c["rec"]["in"])
            # 9 face size
            fpx = effective_face_px(tl, c, cat)
            if c["layout"] in ("full", "punch", "split") and fpx < 120:
                add("WARN", "face", f"{c['id']} face ≈{fpx:.0f}px in output — mouth will look soft; prefer a tighter shot or a pro engine", c["rec"]["in"])
            # 4 invisible jump
            if prev and prev.get("shot") and prev.get("plate") == c.get("plate") and c.get("transition_in") in ("cut", "zoomcut"):
                ps = next((o["s"] for o in prev.get("ops", []) if o["op"] == "scale"), 1.0)
                cs = next((o["s"] for o in c.get("ops", []) if o["op"] == "scale"), 1.0)
                pc = next((o.get("cx") for o in prev.get("ops", []) if o["op"] == "crop"), None)
                cc = next((o.get("cx") for o in c.get("ops", []) if o["op"] == "crop"), None)
                contiguous = abs(prev["src"]["out"] - c["src"]["in"]) < 0.05
                if not contiguous and abs(ps - cs) < 0.08 and pc == cc and c["layout"] != "pip" and prev["layout"] != "pip":
                    add("WARN", "jumpcut", f"{prev['id']}→{c['id']} same plate, same scale: reads as a skip — change scale ≥8% or cut away", c["rec"]["in"])
            # 6 long pause inside a visible talking clip
            for bid in c.get("beats", []):
                bb = beats.get(bid, {})
                if bb.get("pause_after", 0) >= 0.8 and bb.get("end", 0) < c["rec"]["out"] - 0.3 and s["performance"]["mouth"] == "talking":
                    add("WARN", "pause", f"{c['id']}: {bb['pause_after']}s pause inside a talking shot — make sure the lip-sync engine closes the mouth, or cut to a listen shot", bb.get("end"))
        # 15 transitions
        if prev is not None and c.get("transition_in") == "broll_fade" and c["layout"] != "hidden" and prev["layout"] != "hidden":
            add("FAIL", "transition", f"{c['id']}: fades between two visible host shots overlap two faces (lip-sync breaks)", c["rec"]["in"])
        prev = c
    # 17 upscale: crop / punch blow the source up → soft picture (reported once per plate)
    up = {}
    for c in host:
        if not c.get("shot"):
            continue
        s = cat.shots[c["shot"]]
        sw, sh = cat.plates[s["plate"]].get("size", [1920, 1080])
        out_w, out_h = meta["size"]
        crop = next((o for o in c.get("ops", []) if o["op"] == "crop"), None)
        region_h = sh if crop or (sw / sh) >= (out_w / out_h) else sw / (out_w / out_h)
        k = out_h / region_h * next((o["s"] for o in c.get("ops", []) if o["op"] == "scale"), 1.0)
        if c["layout"] != "pip" and k > 1.6:
            up.setdefault(s["plate"], []).append(k)
    for pl, ks in up.items():
        add("WARN", "upscale", f"{pl}: {len(ks)} clips upscaled up to {max(ks):.2f}× — generate this plate at higher resolution (or native aspect) for the final master")
    # 10 MG zones vs host
    for m in tl.get("mg", []):
        if m["zone"] not in ("right_half", "left_half"):
            continue
        for c in host:
            if c.get("shot") and c["layout"] in ("full", "split", "punch") and c["rec"]["in"] < m["rec"]["out"] - 0.15 and c["rec"]["out"] > m["rec"]["in"] + 0.15:
                s = cat.shots[c["shot"]]
                crop = next((o for o in c.get("ops", []) if o["op"] == "crop"), None)
                if crop:
                    continue      # reframed: overlay zones are re-laid out for the new aspect
                if m["zone"] not in s.get("mg", {}).get("safe_zones", []):
                    add("FAIL", "mg_zone", f"MG {m['id']} ({m['template']}) in {m['zone']} collides with host in {c['id']} ({c['shot']})", m["rec"]["in"])
    # 11 rhythm
    asl = sum(lens) / len(lens) if lens else 0
    longest = max(lens) if lens else 0
    if lens and longest > prof["slot_max"] + 0.6:
        add("WARN", "rhythm", f"longest host shot {longest:.1f}s > {prof['slot_max']}s for profile {meta.get('profile')}")
    # 12 coverage
    cov = sum(c["rec"]["out"] - c["rec"]["in"] for c in host if c["layout"] in ("hidden", "pip")) / dur
    lo, hi = prof["coverage"]
    if not lo - 0.05 <= cov <= hi + 0.05:
        add("WARN", "coverage_ratio", f"B-roll/MG coverage {cov:.0%} outside {lo:.0%}–{hi:.0%}")
    # 13 Chinese speech rate
    for b in tl.get("beats", []):
        r = b.get("rate_cps", 0)
        if r > 6.6:
            add("RISK", "rate", f"{b['id']} {r:.1f} 字/s — high risk for Chinese lip-sync (b/p/m closures); slow TTS 5–10% / split the sentence, or review this span frame by frame", b["start"])
        elif r > 6.0:
            add("WARN", "rate", f"{b['id']} {r:.1f} 字/s — at the edge for b/p/m closures; listen at 1x", b["start"])
    metrics = {"clips": len(host), "host_shots": len(lens), "unique_shots": len({c['shot'] for c in host if c.get('shot')}),
               "asl_s": round(asl, 2), "longest_s": round(longest, 2), "coverage": round(cov, 3),
               "visible_talking_s": round(sum(c["rec"]["out"] - c["rec"]["in"] for c in host if c.get("shot")), 2)}
    return F, metrics


def report(findings, metrics):
    n_f = sum(1 for f in findings if f["sev"] == "FAIL")
    n_r = sum(1 for f in findings if f["sev"] == "RISK")
    n_w = sum(1 for f in findings if f["sev"] == "WARN")
    lines = [f"QC: {'PASS' if n_f == 0 else 'FAIL'} — {n_f} FAIL, {n_r} RISK (must review after lip-sync), {n_w} WARN",
             "metrics: " + ", ".join(f"{k}={v}" for k, v in metrics.items())]
    order = {"FAIL": 0, "RISK": 1, "WARN": 2}
    for f in sorted(findings, key=lambda x: (order[x["sev"]], x["at"] or 0)):
        at = f"@{f['at']:.2f}s " if f.get("at") is not None else ""
        lines.append(f"  [{f['sev']}] {f['code']}: {at}{f['msg']}")
    return "\n".join(lines)
