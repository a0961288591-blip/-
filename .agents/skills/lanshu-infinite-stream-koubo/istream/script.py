"""Script markup → beats, and beat timing (from a VO alignment file or estimated from Chinese speech rate).

Markup (inline, Chinese or English aliases):
  # 章节标题                      chapter boundary
  [开场] [钩子] [强调] [列点] [提问] [数据] [故事] [解释] [总结] [结尾] [关注]   roles
  [停顿 0.6]                     silence after this sentence (seconds)
  [B-roll: 关键词或文件]          cover this sentence with B-roll (host hidden, VO continues)
  [MG: 模板或素材 id]             motion-graphics overlay for this sentence
  [画中画] [隐藏] [主播] [推近] [切]  layout hints: pip / hidden / force host / punch-in / force a cut before
  [重音: 词]                      keyword for emphasis timing (punch-in / MG hit lands on it)
"""
import json
import re

from .vocab import GESTURE_ALIASES, ROLE_ALIASES, VOCAB

SENT_END = "。！？!?；;"
TAG_RE = re.compile(r"\[([^\]]+)\]")
CJK_RE = re.compile(r"[㐀-鿿]")
LATIN_RE = re.compile(r"[A-Za-z][A-Za-z\-]*")
DIGIT_RE = re.compile(r"[0-9]")


def _parse_tag(raw):
    raw = raw.strip()
    m = re.match(r"^(停顿|pause)\s*([0-9.]+)?$", raw, re.I)
    if m:
        return ("pause", float(m.group(2) or 0.6))
    m = re.match(r"^(B-?roll|broll|素材)\s*[:：]\s*(.+)$", raw, re.I)
    if m:
        return ("broll", m.group(2).strip())
    m = re.match(r"^(MG|动效)\s*[:：]\s*(.+)$", raw, re.I)
    if m:
        return ("mg", m.group(2).strip())
    m = re.match(r"^(重音|kw|key)\s*[:：]\s*(.+)$", raw, re.I)
    if m:
        return ("kw", m.group(2).strip())
    m = re.match(r"^(手势|表情|gesture|expr|expression)\s*[:：]\s*(.+)$", raw, re.I)
    if m:                                               # docs/GESTURE_EXPRESSION.md §E: request a gesture / expression for this sentence
        out = []
        for w in re.split(r"[、,，/+\s]+", m.group(2).strip()):
            k = GESTURE_ALIASES.get(w.lower(), w if w in VOCAB["gesture"] else None)
            if w and not k:
                return ("unknown", raw)
            if k and k not in out:
                out.append(k)
        return ("want", out)
    low = raw.lower()
    if low in ("画中画", "pip"):
        return ("layout", "pip")
    if low in ("隐藏", "hide", "hidden"):
        return ("layout", "hidden")
    if low in ("主播", "host", "full"):
        return ("layout", "full")
    if low in ("推近", "punch"):
        return ("layout", "punch")
    if low in ("切", "cut"):
        return ("cut", True)
    if low in ROLE_ALIASES or raw in ROLE_ALIASES:
        return ("role", ROLE_ALIASES.get(raw, ROLE_ALIASES.get(low)))
    return ("unknown", raw)


def parse(text):
    meta, body = {}, text
    if text.startswith("---"):
        _, fm, body = text.split("---", 2)
        for line in fm.strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
    beats, chapter, warnings = [], None, []
    chapter_start = False
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith("<!--"):
            continue
        if line.startswith("#"):
            chapter = line.lstrip("#").strip()
            chapter_start = True
            continue
        # tokenise into text / tags
        pos, cur, pending, line_beats = 0, None, [], []

        def new_beat():
            nonlocal chapter_start
            b = {"text": "", "chapter": chapter, "roles": [], "broll": None, "mg": [], "layout_hint": None,
                 "pause_after": 0.0, "keywords": [], "force_cut": False, "chapter_start": chapter_start}
            chapter_start = False
            return b

        def apply(b, tag):
            k, v = tag
            if k == "role":
                if v not in b["roles"]:
                    b["roles"].append(v)
            elif k == "pause":
                b["pause_after"] = max(b["pause_after"], v)
            elif k == "broll":
                b["broll"] = v
            elif k == "mg":
                b["mg"].append(v)
            elif k == "kw":
                b["keywords"].append(v)
            elif k == "layout":
                b["layout_hint"] = v
            elif k == "cut":
                b["force_cut"] = True
            elif k == "want":                       # only present when requested → older plans stay byte-identical
                b.setdefault("want", [])
                b["want"] += [g for g in v if g not in b["want"]]
            else:
                warnings.append(f"unknown tag [{v}] ignored")

        for m in TAG_RE.finditer(line + "\n"):
            seg = line[pos:m.start()]
            pos = m.end()
            for ch in seg:
                if cur is None:
                    if ch.isspace():
                        continue
                    cur = new_beat()
                    for t in pending:
                        apply(cur, t)
                    pending = []
                cur["text"] += ch
                if ch in SENT_END:
                    line_beats.append(cur)
                    cur = None
            tag = _parse_tag(m.group(1))
            if cur is not None:
                apply(cur, tag)
            else:
                pending.append(tag)
        seg = line[pos:]
        for ch in seg:
            if cur is None:
                if ch.isspace():
                    continue
                cur = new_beat()
                for t in pending:
                    apply(cur, t)
                pending = []
            cur["text"] += ch
            if ch in SENT_END:
                line_beats.append(cur)
                cur = None
        if cur is not None and cur["text"].strip():
            line_beats.append(cur)
            cur = None
        if pending and line_beats:          # trailing tags belong to the last sentence of the line
            for t in pending:
                apply(line_beats[-1], t)
        beats += line_beats
    for i, b in enumerate(beats):
        b["id"] = f"b{i + 1:02d}"
        b["text"] = b["text"].strip()
        if any(c in b["text"] for c in "①②③④⑤") and "list" not in b["roles"]:
            b["roles"].append("list")
        if not b["roles"]:
            b["roles"] = [infer_role(b, i, len(beats))]
    return meta, beats, warnings


def infer_role(b, i, n):
    t = b["text"]
    if i == 0:
        return "hook"
    if i == n - 1 and any(k in t for k in ("关注", "点赞", "收藏", "下集", "下期")):
        return "cta"
    if t.endswith(("？", "?")):
        return "question"
    if re.search(r"[0-9０-９]+|百分之|倍", t):
        return "data"
    if t.startswith(("因为", "所以", "原因")):
        return "explain"
    if any(k in t for k in ("才叫", "记住", "关键", "一句话", "说白了")):
        return "emphasis"
    if any(k in t for k in ("总之", "总结", "所以说")):
        return "summary"
    return "narrate"


# ----------------------------------------------------------------------------- timing
def norm(s):
    return "".join(ch for ch in s if CJK_RE.match(ch) or ch.isalnum()).lower()


def estimate_duration(text, rate=5.0):
    """Seconds to speak `text` in Mandarin at `rate` CJK chars/s (TTS-like), with punctuation pauses."""
    cjk = len(CJK_RE.findall(text))
    latin = LATIN_RE.findall(text)
    digits = len(DIGIT_RE.findall(text))
    d = cjk / rate + sum(0.18 + 0.07 * len(w) for w in latin) + 0.2 * digits
    d += 0.15 * sum(text.count(c) for c in "，、,") + 0.2 * sum(text.count(c) for c in "：:")
    d += 0.30 * sum(text.count(c) for c in "。！？!?；;")
    return d


def apply_estimate(beats, rate=5.0, lead=0.25):
    t = lead
    for b in beats:
        d = estimate_duration(b["text"], rate)
        b["start"], b["end"] = round(t, 3), round(t + d, 3)
        b["timing"] = "estimated"
        _kw_times(b)
        t = b["end"] + b["pause_after"]
    return round(t + 0.6, 3)


def apply_alignment(beats, align):
    """Map beats onto an alignment (sentence-level, optional keyword keys) via a global char→time map."""
    chars, times = [], []
    keys = {}
    for s in align["sentences"]:
        n = norm(s["text"])
        for j, ch in enumerate(n):
            chars.append(ch)
            times.append(s["start"] + (s["end"] - s["start"]) * (j + 0.5) / max(1, len(n)))
        for k, (a, e) in s.get("keys", {}).items():
            keys[norm(k)] = (a, e)
    g = "".join(chars)
    cur = 0
    for b in beats:
        n = norm(b["text"])
        i = g.find(n, cur)
        if i < 0:
            i = g.find(n[: max(2, len(n) // 2)], cur)
        if i < 0:
            raise ValueError(f"beat {b['id']} not found in alignment: {b['text']}")
        j = min(len(g) - 1, i + len(n) - 1)
        half = 0.5 * (times[1] - times[0]) if len(times) > 1 else 0.1
        b["start"], b["end"] = round(times[i] - half, 3), round(times[j] + half, 3)
        # snap to sentence bounds when the beat covers a whole sentence
        for s in align["sentences"]:
            if abs(s["start"] - b["start"]) < 0.25:
                b["start"] = s["start"]
            if abs(s["end"] - b["end"]) < 0.25:
                b["end"] = s["end"]
        b["timing"] = "aligned"
        b["kw_times"] = {}
        for kw in b["keywords"]:
            if norm(kw) in keys:
                b["kw_times"][kw] = list(keys[norm(kw)])
        _kw_times(b, fill_only=True)
        cur = j + 1
    return align.get("duration", beats[-1]["end"] + 0.5)


def _kw_times(b, fill_only=False):
    b.setdefault("kw_times", {})
    n = norm(b["text"])
    for kw in b["keywords"]:
        if fill_only and kw in b["kw_times"]:
            continue
        k = n.find(norm(kw))
        if k >= 0 and n:
            a = b["start"] + (b["end"] - b["start"]) * k / len(n)
            e = b["start"] + (b["end"] - b["start"]) * (k + len(norm(kw))) / len(n)
            b["kw_times"][kw] = [round(a, 3), round(e, 3)]


def speech_rate(b):
    d = max(0.1, b["end"] - b["start"])
    return len(CJK_RE.findall(b["text"])) / d


def load_script(path, align_path=None, rate=5.0):
    with open(path, encoding="utf-8") as f:
        meta, beats, warns = parse(f.read())
    if align_path:
        with open(align_path, encoding="utf-8") as f:
            align = json.load(f)
        dur = apply_alignment(beats, align)
        meta["vo"] = meta.get("vo") or align.get("audio")
    else:
        dur = apply_estimate(beats, rate=float(meta.get("rate", rate)))
    meta["duration"] = round(float(dur), 3)
    return meta, beats, warns
