"""Build prompts/library.json — the modular prompt source of truth.

K01–K03 + IMG-A/B are extracted verbatim from prompts/plates-source.md (frozen, already approved);
L01/L02 (60 s), O01 (openings), K01H (16:9 left-third) and the refresh micro-action menu are authored here in the same block system.
Run:  python tools/build_library.py  [path/to/dh-plates-final-koubo.md]
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "prompts", "plates-source.md")

doc = open(SRC, encoding="utf-8").read()
frozen = {(lang, k): txt for lang, k, txt in re.findall(r"<!-- final:(en|zh):(K0[123]) -->\n```text\n(.*?)\n```", doc, re.S)}
imgs = {k: {"en": en, "zh": zh} for k, en, zh in re.findall(r"### (IMG-[AB]).*?\*\*EN\*\*\n\n```text\n(.*?)\n```.*?\*\*中文\*\*\n\n```text\n(.*?)\n```", doc, re.S)}
negs = re.findall(r"`Negative: (.*?)`", doc)
assert len(frozen) == 6 and len(imgs) == 2 and len(negs) == 3, (len(frozen), len(imgs), len(negs))

TL_EN = re.compile(r"^([0-9.]+)–([0-9.]+)s: (.*)$")
TL_ZH = re.compile(r"^([0-9.]+)–([0-9.]+) 秒：(.*)$")


def split(lang, k):
    lines = frozen[(lang, k)].split("\n")
    hdr = "Timeline:" if lang == "en" else "时间线："
    ti = lines.index(hdr)
    tl = [TL_EN.match(l) if lang == "en" else TL_ZH.match(l) for l in lines[ti + 1:-1]]
    return {"lock": lines[0], "identity": lines[1], "setting": lines[2], "performance": lines[3],
            "timeline": [(float(m.group(1)), float(m.group(2)), m.group(3)) for m in tl], "avoid": lines[-1]}


P = {k: {lang: split(lang, k) for lang in ("en", "zh")} for k in ("K01", "K02", "K03")}
assert P["K01"]["en"]["identity"] == P["K02"]["en"]["identity"] == P["K03"]["en"]["identity"]
assert P["K01"]["en"]["setting"] == P["K02"]["en"]["setting"]


def num(x):
    return str(int(x)) if float(x).is_integer() else str(x)


blocks = {
    "identity": {"en": P["K01"]["en"]["identity"], "zh": P["K01"]["zh"]["identity"]},
    "setting": {"en": P["K01"]["en"]["setting"], "zh": P["K01"]["zh"]["setting"]},
    "lock.mcu.916.30": {"en": P["K01"]["en"]["lock"], "zh": P["K01"]["zh"]["lock"]},
    "lock.ms.916.30": {"en": P["K02"]["en"]["lock"], "zh": P["K02"]["zh"]["lock"]},
    "lock.mcu.916.60": {"en": P["K01"]["en"]["lock"].replace("30-second", "60-second"), "zh": P["K01"]["zh"]["lock"].replace("30 秒", "60 秒")},
    "lock.ms.916.60": {"en": P["K02"]["en"]["lock"].replace("30-second", "60-second"), "zh": P["K02"]["zh"]["lock"].replace("30 秒", "60 秒")},
    "lock.mcu.169L.30": {
        "en": "30-second single continuous shot, locked-off camera on a tripod, no camera movement, no zoom, no cuts. 16:9 horizontal. Medium close-up from mid-chest up, "
              "subject on the left third of the frame facing the lens, eyes on the upper third line, a little headroom; the right half of the frame is clean, softly lit wall left free for graphics.",
        "zh": "30 秒单个连续镜头，三脚架固定机位，无运镜、无变焦、无剪辑。16:9 横屏。胸部以上近景，人物位于画面左三分之一处、正对镜头，眼睛位于画面上三分之一线，头顶略留空间；画面右半边是干净、柔和受光的墙面，留给后期放图形。"},
    "continue": {"en": "Continue seamlessly from the previous shot, starting from the home pose.", "zh": "从上一段的回位姿势无缝接续。"},
}

HOME_EN, HOME_ZH = "She returns to the home pose and holds it still for one second.", "回到回位姿势，静止保持一秒。"
START_EN, START_ZH = "She holds the home pose, then begins speaking.", "保持回位姿势，然后开始说话。"


def sec(t0, t1, en, zh, kind="section", **tags):
    d = {"t": [t0, t1], "en": en, "zh": zh, "kind": kind}
    if tags:
        d["tags"] = tags
    return d


def from_frozen(k, tags):
    """frozen plate: keep the exact text, attach tags to its four sections"""
    en, zh = P[k]["en"]["timeline"], P[k]["zh"]["timeline"]
    out, si = [], 0
    for (a, b, te), (_, _, tz) in zip(en, zh):
        kind = "section" if (b - a) >= 5 else ("start" if a == 0 else ("end" if b == 30 else "home"))
        d = sec(a, b, te, tz, kind)
        if kind == "section":
            d["tags"] = tags[si]
            si += 1
        out.append(d)
    return out


T = lambda **k: k   # readability
plates = {
    "K01": dict(title_zh="近景口播主底板", title_en="Main close-up talking plate", file="liz01_o1_mcu_916_koubo-main_mid_30s_v01.mov", framing="mcu", aspect="9:16",
                duration=30, lock="lock.mcu.916.30", first_frame="IMG-A", status="frozen (dh-plates-final-koubo.md)",
                performance={"en": P["K01"]["en"]["performance"], "zh": P["K01"]["zh"]["performance"]}, avoid={"en": P["K01"]["en"]["avoid"], "zh": P["K01"]["zh"]["avoid"]},
                negative=negs[0], cut_points=[0.5, 7.5, 14.5, 21.5, 29.0],
                timeline=from_frozen("K01", [
                    T(roles=["narrate", "explain"], energy=2, emotion="neutral", gestures=[{"g": "nod", "t": 3.0}], mouth="talking", hands="out_of_frame", reversible="good"),
                    T(roles=["narrate", "question"], energy=3, emotion="curious", gestures=[{"g": "head_tilt", "t": 2.0}, {"g": "brow_raise", "t": 3.5}], mouth="talking", hands="out_of_frame", reversible="good"),
                    T(roles=["open", "hook", "close"], energy=3, emotion="warm", gestures=[{"g": "smile_greet", "t": 1.0}, {"g": "nod", "t": 2.0}], mouth="talking", hands="out_of_frame", reversible="no"),
                    T(roles=["pause", "listen", "close", "cta"], energy=1, emotion="warm", gestures=[{"g": "nod", "t": 2.0}, {"g": "nod", "t": 4.0}], mouth="smile_closed", hands="out_of_frame", reversible="good"),
                ])),
    "K02": dict(title_zh="中景口播底板（自然手势）", title_en="Medium-shot talking plate with natural hands", file="liz01_o1_ms_916_koubo-hands_mid_30s_v01.mov", framing="ms", aspect="9:16",
                duration=30, lock="lock.ms.916.30", first_frame="IMG-B", status="frozen (dh-plates-final-koubo.md)",
                performance={"en": P["K02"]["en"]["performance"], "zh": P["K02"]["zh"]["performance"]}, avoid={"en": P["K02"]["en"]["avoid"], "zh": P["K02"]["zh"]["avoid"]},
                negative=negs[1], cut_points=[0.5, 7.5, 14.5, 21.5, 29.0],
                timeline=from_frozen("K02", [
                    T(roles=["narrate"], energy=3, emotion="neutral", gestures=[{"g": "nod", "t": 3.0}], mouth="talking", hands="low", reversible="ok"),
                    T(roles=["explain"], energy=3, emotion="neutral", gestures=[{"g": "palms_open", "t": 2.5}], mouth="talking", hands="chest", reversible="no", keep_out=[[1.5, 4.5]]),
                    T(roles=["narrate", "story"], energy=3, emotion="warm", gestures=[{"g": "palm_single", "t": 3.0}], mouth="talking", hands="low", reversible="no", keep_out=[[2.0, 4.5]]),
                    T(roles=["summary", "emphasis"], energy=3, emotion="confident", gestures=[{"g": "hands_together", "t": 2.0}, {"g": "nod", "t": 3.5}], mouth="talking", hands="chest", reversible="no"),
                ])),
    "K03": dict(title_zh="近景口播变体（可选）", title_en="Alternate close-up talking plate", file="liz01_o1_mcu_916_koubo-alt_mid_30s_v01.mov", framing="mcu", aspect="9:16",
                duration=30, lock="lock.mcu.916.30", first_frame="IMG-A", status="frozen (dh-plates-final-koubo.md)",
                performance={"en": P["K03"]["en"]["performance"], "zh": P["K03"]["zh"]["performance"]}, avoid={"en": P["K03"]["en"]["avoid"], "zh": P["K03"]["zh"]["avoid"]},
                negative=negs[2], cut_points=[0.5, 7.5, 14.5, 21.5, 29.0],
                timeline=from_frozen("K03", [
                    T(roles=["narrate", "story"], energy=3, emotion="warm", gestures=[{"g": "sway", "t": 3.0}], mouth="talking", hands="out_of_frame", reversible="good"),
                    T(roles=["summary", "emphasis"], energy=3, emotion="confident", gestures=[{"g": "nod_multi", "t": 2.5}], mouth="talking", hands="out_of_frame", reversible="ok"),
                    T(roles=["data", "emphasis", "explain"], energy=2, emotion="serious", gestures=[{"g": "nod", "t": 4.0}], mouth="talking", hands="out_of_frame", reversible="no"),
                    T(roles=["close", "cta", "summary"], energy=3, emotion="warm", gestures=[{"g": "lean_back", "t": 3.0}], mouth="talking", hands="out_of_frame", reversible="no"),
                ])),
}

# ----------------------------------------------------------------- K01H: 16:9 left-third twin of K01 (split layouts with a clean right half)
plates["K01H"] = dict(plates["K01"], title_zh="近景口播主底板 · 横屏左三分之一", title_en="Main close-up talking plate · 16:9 left third",
                      file="liz01_o1_mcu_169_koubo-main-left_mid_30s_v01.mov", aspect="16:9", lock="lock.mcu.169L.30", first_frame="IMG-A169",
                      status="new (lock-line swap of K01)", subject_pos="left")

# ----------------------------------------------------------------- L01: 60 s close-up, eight different sections
MCU_PERF_60 = {
    "en": "Performance: She speaks to the camera calmly and naturally as if mid-conversation, with natural jaw and lip movement and a relaxed rhythm; whenever the timeline says she listens, she stops speaking and keeps her lips gently closed. "
          "Her eyes stay on the lens except for one brief thoughtful glance, she blinks naturally, head turns stay within 20 degrees, and her hands stay out of view below the frame the whole time. "
          "Home pose: head centered and facing the lens, shoulders relaxed and level, hands resting together low and out of view below the bottom edge of the frame, lips relaxed. "
          "Energy: low to medium — small, natural movements only, and every section looks different from the others so the sections can be reused in any order.",
    "zh": "表演：她像正在对话一样，平静自然地对着镜头说话，下颌与嘴唇自然运动，节奏放松；时间线写到“倾听”时，她停止说话，双唇轻轻闭合。除了一次短暂的思考式目光，视线始终看镜头，自然眨眼，头部转动不超过 20 度，双手全程在画面底边以下不入画。"
          "回位姿势：头部居中面向镜头，双肩放松、水平，双手放低并拢在画面底边以下（不入画），嘴唇放松。能量：低到中——只有细小、自然的动作，而且每一段都和其他段不一样，方便以任意顺序复用。",
}
plates["L01"] = dict(
    title_zh="近景 60 秒长底板（8 段不重样）", title_en="60-second close-up plate, eight distinct sections", file="liz01_o1_mcu_916_koubo-long_mid_60s_v01.mov",
    framing="mcu", aspect="9:16", duration=60, lock="lock.mcu.916.60", first_frame="IMG-A", status="new", performance=MCU_PERF_60,
    avoid={"en": P["K03"]["en"]["avoid"], "zh": P["K03"]["zh"]["avoid"]}, negative=negs[2],
    cut_points=[0.5, 7.5, 14.5, 21.5, 29.5, 37.5, 44.5, 51.5, 59.0], chain_split=29.5,
    timeline=[
        sec(0, 1, START_EN, START_ZH, "start"),
        sec(1, 7, "Calm, measured narration with one slow nod at the end of each phrase; shoulders still.", "平稳、从容地叙述，每句话末尾缓慢点头一次，肩部保持不动。",
            roles=["narrate", "explain"], energy=2, emotion="neutral", gestures=[{"g": "nod", "t": 4.5}], mouth="talking", hands="out_of_frame", reversible="good"),
        sec(7, 8, HOME_EN, HOME_ZH, "home"),
        sec(8, 14, "She leans in very slightly toward the lens for an important point, eyebrows lifting a little, then settles back.", "讲到重点时身体极轻微地向镜头前倾，眉毛微微上扬，然后坐回。",
            roles=["emphasis", "explain"], energy=3, emotion="confident", gestures=[{"g": "lean_in", "t": 2.5}, {"g": "brow_raise", "t": 3.0}], mouth="talking", hands="out_of_frame", reversible="no"),
        sec(14, 15, HOME_EN, HOME_ZH, "home"),
        sec(15, 21, "A brief thoughtful glance up and to the left as if recalling something, then her eyes come back to the lens and she continues with a small knowing nod.",
            "像在回想什么，目光短暂地向左上方看一下，随即回到镜头，带着心中有数的小点头继续说。",
            roles=["question", "story"], energy=3, emotion="curious", gestures=[{"g": "nod", "t": 3.5}], mouth="talking", hands="out_of_frame", reversible="no", keep_out=[[0.5, 2.5]]),
        sec(21, 22, HOME_EN, HOME_ZH, "home"),
        sec(22, 28, "A light smile with a slight head tilt to the right, friendly and relaxed.", "带着浅笑，头部轻微向右侧倾，亲切放松。",
            roles=["narrate", "open"], energy=3, emotion="warm", gestures=[{"g": "head_tilt", "t": 2.0}], mouth="talking", hands="out_of_frame", reversible="ok"),
        sec(28, 30, "She returns to the home pose and holds it still for two seconds.", "回到回位姿势，静止保持两秒。", "home"),
        sec(30, 31, "She holds the home pose, then begins speaking again.", "保持回位姿势，然后重新开始说话。", "home"),
        sec(31, 37, "Serious and focused for a key fact: steady gaze, almost no movement, one slow nod.", "讲关键事实时严肃专注：目光稳定，几乎不动，缓慢点头一次。",
            roles=["data", "emphasis"], energy=2, emotion="serious", gestures=[{"g": "nod", "t": 4.0}], mouth="talking", hands="out_of_frame", reversible="good"),
        sec(37, 38, HOME_EN, HOME_ZH, "home"),
        sec(38, 44, "Two quick small nods as if saying \"right?\", with a small confident smile.", "连续两个快速的小点头，像在说“对吧？”，带一点笃定的浅笑。",
            roles=["summary", "emphasis"], energy=3, emotion="confident", gestures=[{"g": "nod_multi", "t": 2.5}], mouth="talking", hands="out_of_frame", reversible="ok"),
        sec(44, 45, HOME_EN, HOME_ZH, "home"),
        sec(45, 51, "Softer, empathetic delivery: slightly slower, warm eyes, one gentle nod.", "语气更柔和、带共情：语速略慢，眼神温暖，轻轻点头一次。",
            roles=["explain", "narrate"], energy=2, emotion="empathetic", gestures=[{"g": "nod", "t": 3.5}], mouth="talking", hands="out_of_frame", reversible="good"),
        sec(51, 52, HOME_EN, HOME_ZH, "home"),
        sec(52, 58, "She stops speaking and listens with her lips gently closed, a soft closed-lip smile, one slow nod and a natural blink.", "她停止说话，双唇轻闭地倾听，带着闭唇浅笑缓慢点头一次，自然眨眼。",
            roles=["pause", "listen", "close"], energy=1, emotion="warm", gestures=[{"g": "nod", "t": 3.0}], mouth="smile_closed", hands="out_of_frame", reversible="good"),
        sec(58, 60, "She relaxes into the home pose and holds it still until the end, the final frame matching the first frame as closely as possible.",
            "放松回到回位姿势，静止保持到结束，最后一帧尽量与第一帧一致。", "end"),
    ])

MS_PERF_60 = {
    "en": "Performance: She speaks to the camera calmly and naturally as if mid-conversation, with natural jaw and lip movement and a relaxed rhythm. Her eyes stay on the lens, she blinks naturally, head turns stay within 20 degrees, "
          "and her hands stay between waist and chest height and never touch or cover the face or mouth. Home pose: head centered and facing the lens, shoulders relaxed and level, hands loosely clasped in front of the waist, lips relaxed. "
          "Energy: medium — natural conversational nods; hand movements are small and relaxed, every gesture starts from and returns to the home pose, and no two sections use the same gesture.",
    "zh": "表演：她像正在对话一样，平静自然地对着镜头说话，下颌与嘴唇自然运动，节奏放松。视线始终看镜头，自然眨眼，头部转动不超过 20 度，双手始终在腰部到胸口之间活动，绝不触碰或遮挡脸部和嘴。"
          "回位姿势：头部居中面向镜头，双肩放松、水平，双手在腰前轻握，嘴唇放松。能量：中——自然的对话式点头；手部动作小而放松，每个手势都从回位姿势开始并回到回位姿势，任意两段不用同一个手势。",
}
plates["L02"] = dict(
    title_zh="中景 60 秒长底板（含左右托举位）", title_en="60-second medium plate with left/right present beats", file="liz01_o1_ms_916_koubo-hands-long_mid_60s_v01.mov",
    framing="ms", aspect="9:16", duration=60, lock="lock.ms.916.60", first_frame="IMG-B", status="new", performance=MS_PERF_60,
    avoid={"en": P["K02"]["en"]["avoid"], "zh": P["K02"]["zh"]["avoid"]}, negative=negs[1],
    cut_points=[0.5, 7.5, 14.5, 21.5, 29.5, 37.5, 44.5, 51.5, 59.0], chain_split=29.5,
    timeline=[
        sec(0, 1, START_EN, START_ZH, "start"),
        sec(1, 7, "Natural conversational talking with her hands loosely clasped at the waist and small nods.", "自然的对话式说话，双手在腰前轻握，小幅点头。",
            roles=["narrate"], energy=3, emotion="neutral", gestures=[{"g": "nod", "t": 3.0}], mouth="talking", hands="low", reversible="ok"),
        sec(7, 8, HOME_EN, HOME_ZH, "home"),
        sec(8, 14, "Her hand on the screen-right side turns palm-up at chest height and gently presents toward screen-right as if holding something small on her palm, holds for a beat, then returns to the waist.",
            "画面右侧的那只手在胸口高度掌心向上，轻轻向画面右侧呈现，像托着一个小东西，停一拍，然后回到腰前。",
            roles=["emphasis", "data", "explain"], energy=3, emotion="confident", gestures=[{"g": "palm_present", "t": 2.5, "zone": "right_half"}], mouth="talking", hands="chest", reversible="no", keep_out=[[1.5, 4.5]]),
        sec(14, 15, HOME_EN, HOME_ZH, "home"),
        sec(15, 21, "Both palms open outward at chest height in a relaxed explaining gesture, then come back together at the waist.", "双手在胸口高度向外摊开，做一个放松的讲解手势，然后回到腰前合拢。",
            roles=["explain"], energy=3, emotion="neutral", gestures=[{"g": "palms_open", "t": 2.5}], mouth="talking", hands="chest", reversible="no", keep_out=[[1.5, 4.5]]),
        sec(21, 22, HOME_EN, HOME_ZH, "home"),
        sec(22, 28, "To sum up, both hands come loosely together in front of her chest with one confident nod, then lower back to the waist.", "总结时双手在胸前轻轻合拢，自信地点头一次，再放回腰前。",
            roles=["summary"], energy=3, emotion="confident", gestures=[{"g": "hands_together", "t": 2.0}, {"g": "nod", "t": 3.0}], mouth="talking", hands="chest", reversible="no"),
        sec(28, 30, "She returns to the home pose and holds it still for two seconds.", "回到回位姿势，静止保持两秒。", "home"),
        sec(30, 31, "She holds the home pose, then begins speaking again.", "保持回位姿势，然后重新开始说话。", "home"),
        sec(31, 37, "She leans forward very slightly with her hands resting at the waist and speaks in a serious, focused tone.", "她身体极轻微地前倾，双手放在腰前，用严肃专注的语气说话。",
            roles=["data", "emphasis"], energy=2, emotion="serious", gestures=[{"g": "lean_in", "t": 1.5}], mouth="talking", hands="low", reversible="ok"),
        sec(37, 38, HOME_EN, HOME_ZH, "home"),
        sec(38, 44, "Her hand on the screen-left side turns palm-up at chest height and gently presents toward screen-left, holds for a beat, then returns to the waist.",
            "画面左侧的那只手在胸口高度掌心向上，轻轻向画面左侧呈现，停一拍，然后回到腰前。",
            roles=["emphasis", "data", "explain"], energy=3, emotion="confident", gestures=[{"g": "palm_present", "t": 2.5, "zone": "left_half"}], mouth="talking", hands="chest", reversible="no", keep_out=[[1.5, 4.5]]),
        sec(44, 45, HOME_EN, HOME_ZH, "home"),
        sec(45, 51, "Hands loosely clasped, she marks three short phrases with three small nods, without counting on her fingers.", "双手轻握，用三个小点头标出三个短句，不数手指。",
            roles=["list"], energy=3, emotion="neutral", gestures=[{"g": "nod_multi", "t": 2.5}], mouth="talking", hands="low", reversible="ok"),
        sec(51, 52, HOME_EN, HOME_ZH, "home"),
        sec(52, 58, "A warm close: a friendly smile while finishing her sentence, then her hands rest together at the waist and she gives a small, warm nod.", "温暖收尾：说完这句话时露出亲切的笑容，然后双手在腰前合拢，温暖地轻轻点头。",
            roles=["close", "cta"], energy=2, emotion="warm", gestures=[{"g": "nod", "t": 4.0}], mouth="talking", hands="low", reversible="no"),
        sec(58, 60, "She returns to the home pose and holds it still until the end, the final frame matching the first frame as closely as possible.",
            "回到回位姿势，静止保持到结束，最后一帧尽量与第一帧一致。", "end"),
    ])

# ----------------------------------------------------------------- O01: four natural openings (the host *arrives* instead of popping on)
plates["O01"] = dict(
    title_zh="开场入镜底板（4 种自然开场）", title_en="Opening plate — four natural ways to arrive on camera", file="liz01_o1_mcu_916_opening-set_mid_30s_v01.mov",
    framing="mcu", aspect="9:16", duration=30, lock="lock.mcu.916.30", first_frame="IMG-A", status="new",
    performance={
        "en": "Performance: This plate holds four different natural ways of starting a video, separated by returns to the home pose. When she speaks, she is calm and natural with natural jaw and lip movement. "
              "Her hands stay out of view below the frame the whole time; head turns up to 30 degrees happen only in the short set-up moments before she starts speaking. "
              "Home pose: head centered and facing the lens, shoulders relaxed and level, hands resting together low and out of view below the bottom edge of the frame, lips relaxed. "
              "Energy: medium — unforced, like a real presenter settling in, never performed or theatrical.",
        "zh": "表演：这条底板包含四种不同的自然开场方式，之间都回到回位姿势。她说话时平静自然，下颌与嘴唇自然运动。双手全程在画面底边以下不入画；最多 30 度的转头只出现在开口前的短暂准备动作里。"
              "回位姿势：头部居中面向镜头，双肩放松、水平，双手放低并拢在画面底边以下（不入画），嘴唇放松。能量：中——不刻意，像真实主播坐定开讲，绝不表演化、戏剧化。"},
    avoid={"en": "Avoid: hands touching or covering the face or mouth, head turned more than 30 degrees, hair crossing the face, jewelry, glasses, patterned clothing, logos, text, subtitles, camera movement, zoom, cuts, lighting changes, extra people, objects in the background, hands entering the frame, props, waving, laughing.",
           "zh": "避免：手触碰或遮挡脸和嘴，头部转动超过 30 度，头发遮挡脸部，首饰，眼镜，有图案的服装，logo，文字，字幕，镜头运动，变焦，剪辑，光线变化，其他人物，背景杂物，手进入画面，道具，挥手，大笑。"},
    negative=negs[0].replace("head turned away, ", ""),
    cut_points=[0.5, 7.5, 14.5, 21.5, 29.0],
    shots_override=[  # opening shots begin *inside* the set-up state on purpose (first frame = host already present, mid-action)
        {"id": "O01_s1", "in": 2.2, "out": 7.5, "first_only": True, "speech_offset": 1.6},
        {"id": "O01_s2", "in": 9.2, "out": 14.5, "first_only": True, "speech_offset": 1.3},
        {"id": "O01_s3", "in": 16.2, "out": 21.5, "first_only": True, "speech_offset": 1.3},
        {"id": "O01_s4", "in": 21.5, "out": 29.0, "first_only": False, "speech_offset": 1.4},
    ],
    timeline=[
        sec(0, 1, "She holds the home pose.", "保持回位姿势。", "start"),
        sec(1, 2.5, "Her eyes drop down and slightly to her left as if glancing at notes below the frame, lips closed.", "她的目光向下、略偏左，像在看画面下方的提纲，嘴唇闭合。", "setup"),
        sec(2.5, 7, "She lifts her eyes to the lens, takes a small natural breath, breaks into a warm smile and begins speaking.", "她抬眼看向镜头，自然地吸一小口气，绽开温暖的笑容，开始说话。",
            roles=["open"], energy=3, emotion="warm", gestures=[{"g": "look_up_to_lens", "t": 0.5}, {"g": "smile_greet", "t": 1.3}], mouth="talking", hands="out_of_frame", reversible="no"),
        sec(7, 8, HOME_EN, HOME_ZH, "home"),
        sec(8, 9.5, "She turns her head about 25 degrees to her right as if finishing a word with someone off camera, lips closed.", "她把头向自己的右侧转约 25 度，像刚和镜头外的人说完一句话，嘴唇闭合。", "setup"),
        sec(9.5, 14, "She turns back to the lens with a bright, easy smile and begins speaking.", "她转回镜头，带着明亮、轻松的笑容开始说话。",
            roles=["open"], energy=3, emotion="warm", gestures=[{"g": "turn_to_lens", "t": 0.4}, {"g": "smile_greet", "t": 1.0}], mouth="talking", hands="out_of_frame", reversible="no"),
        sec(14, 15, HOME_EN, HOME_ZH, "home"),
        sec(15, 16.5, "She sits back slightly and relaxes her shoulders.", "她身体略向后靠，放松双肩。", "setup"),
        sec(16.5, 21, "She leans in toward the lens into the home framing, eyebrows lifting with friendly energy, and begins speaking.", "她向镜头前倾回到回位构图，眉毛带着友好的劲头微微上扬，开始说话。",
            roles=["open", "hook"], energy=4, emotion="curious", gestures=[{"g": "lean_in", "t": 0.3}, {"g": "brow_raise", "t": 1.0}], mouth="talking", hands="out_of_frame", reversible="no"),
        sec(21, 22, HOME_EN, HOME_ZH, "home"),
        sec(22, 28, "From complete stillness she takes a visible, calm breath with her shoulders rising slightly, gives a small smile and begins speaking calmly.",
            "从完全静止开始，她平静地吸一口气，双肩微微抬起，露出一个小小的笑容，然后平静地开始说话。",
            roles=["open", "transition"], energy=2, emotion="warm", gestures=[{"g": "settle_in", "t": 0.8}, {"g": "smile_greet", "t": 1.2}], mouth="talking", hands="out_of_frame", reversible="no"),
        sec(28, 30, "She relaxes back into the home pose and holds it still until the end, the final frame matching the first frame as closely as possible.",
            "放松回到回位姿势，静止保持到结束，最后一帧尽量与第一帧一致。", "end"),
    ])

first_frames = dict(imgs)
first_frames["IMG-A169"] = {
    "en": imgs["IMG-A"]["en"].replace("Photorealistic 9:16 vertical portrait photo, medium close-up from mid-chest up, subject centered, eyes on the upper third line, a little headroom.",
                                       "Photorealistic 16:9 horizontal photo, medium close-up from mid-chest up, subject on the left third facing the lens, eyes on the upper third line, a little headroom, the right half of the frame clean softly lit wall."),
    "zh": imgs["IMG-A"]["zh"].replace("写实 9:16 竖幅人像照片，胸部以上近景，人物居中，眼睛位于画面上三分之一线，头顶略留空间。",
                                       "写实 16:9 横幅照片，胸部以上近景，人物位于左三分之一处、正对镜头，眼睛位于画面上三分之一线，头顶略留空间，画面右半边是干净、柔和受光的墙面。"),
}
assert first_frames["IMG-A169"]["en"] != imgs["IMG-A"]["en"] and first_frames["IMG-A169"]["zh"] != imgs["IMG-A"]["zh"]

# ----------------------------------------------------------------- refresh menu: micro-actions for monthly new plates (combinatorial)
menu = []
for pid, p in plates.items():
    if pid == "K01H":
        continue
    for s in p["timeline"]:
        if s["kind"] == "section" and "open" not in s["tags"]["roles"]:
            menu.append({"id": f"{pid}.{len(menu) + 1}", "framing": p["framing"], "en": s["en"], "zh": s["zh"], "tags": s["tags"], "from": pid})
extra = [
    ("mcu", "Mid-sentence she pauses for half a beat with her lips closed, as if choosing the right word, then continues with a small nod.", "说到一半，双唇闭合停顿半拍，像在挑一个合适的词，然后轻轻点头继续说。",
     dict(roles=["question", "narrate"], energy=2, emotion="curious", gestures=[{"g": "nod", "t": 3.5}], mouth="talking", hands="out_of_frame", reversible="no")),
    ("mcu", "A small amused smile breaks through mid-sentence, then she continues warmly.", "说到一半忍不住露出一个被逗乐的浅笑，然后温暖地继续说。",
     dict(roles=["story", "narrate"], energy=3, emotion="playful", gestures=[{"g": "smile_greet", "t": 2.5}], mouth="talking", hands="out_of_frame", reversible="no")),
    ("mcu", "She narrows her focus slightly and lowers her voice as if sharing something important, one slow nod.", "她稍稍收拢目光、压低一点声音，像在分享一件重要的事，缓慢点头一次。",
     dict(roles=["emphasis", "data"], energy=2, emotion="serious", gestures=[{"g": "nod", "t": 4.0}], mouth="talking", hands="out_of_frame", reversible="good")),
    ("ms", "A small modest shrug of the shoulders with an easy smile, as if saying 'it is simpler than it sounds'.", "带着轻松的笑容，双肩小幅耸一下，像在说“其实没那么难”。",
     dict(roles=["explain", "narrate"], energy=3, emotion="playful", gestures=[{"g": "lean_back", "t": 2.5}], mouth="talking", hands="low", reversible="no")),
    ("ms", "One hand rises to chest height and makes a slow, small horizontal sweep as if laying out a timeline, then returns to the waist.", "一只手抬到胸口高度，缓慢地做一个小幅水平划动，像在摆出一条时间线，然后回到腰前。",
     dict(roles=["story", "explain"], energy=3, emotion="neutral", gestures=[{"g": "palm_single", "t": 2.5}], mouth="talking", hands="chest", reversible="no")),
]
for fr, en, zh, tg in extra:
    menu.append({"id": f"X.{len(menu) + 1}", "framing": fr, "en": en, "zh": zh, "tags": tg, "from": "menu"})

library = {
    "version": "istream.prompts/1",
    "note": "Source of truth for plate prompts. Compose = lock + identity + setting + performance + timeline + avoid. K01–K03 recompose byte-for-byte to dh-plates-final-koubo.md.",
    "blocks": blocks, "first_frames": first_frames, "plates": plates, "micro_actions": menu,
    "frozen_check": {f"{lang}:{k}": frozen[(lang, k)] for (lang, k) in frozen},
}
os.makedirs(os.path.join(ROOT, "prompts"), exist_ok=True)
with open(os.path.join(ROOT, "prompts", "library.json"), "w", encoding="utf-8") as f:
    json.dump(library, f, ensure_ascii=False, indent=1)
print("library.json:", len(plates), "plates,", len(menu), "micro-actions")
