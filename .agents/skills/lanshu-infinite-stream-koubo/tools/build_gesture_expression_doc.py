"""Render docs/GESTURE_EXPRESSION.md from tools/GESTURE_EXPRESSION.template.md + prompts/overlays/gesture_expression.json.

The overlay JSON is the single source of truth for every lexicon entry, timeline, snippet, mapping and scorecard row,
so the doc can never drift from what `istream prompts overlay --gesture`, GENERATE_PACK.md and the planner use.
Run from the package root:  python3 tools/build_gesture_expression_doc.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from istream import prompts as pm  # noqa: E402
from istream.vocab import HAND_GESTURES, VOCAB  # noqa: E402

with open(os.path.join(ROOT, "tools", "GESTURE_EXPRESSION.template.md"), encoding="utf-8") as _f:
    tpl = _f.read()
ov = pm.load_overlay("gesture_expression")
hp = pm.load_overlay("human_premium")
lib = pm.load(os.path.join(ROOT, "prompts", "library.json"))

IDS = {}
for it in ov["expressions"] + ov["gestures"]:
    IDS.setdefault(it["key"], it["id"])
BY_ID = {it["id"]: it for it in ov["expressions"] + ov["gestures"]}
PLATE_KIND = {"mcu": "近景 MCU", "ms": "中景 MS"}


def lexicon_expr():
    out = []
    for e in ov["expressions"]:
        out += [f"#### {e['id']} {e['name_zh']} · {e['name_en']}（`{e['key']}`）", "",
                f"- **什么时候用：** {e['when_zh']}",
                f"- **表演提示 EN：** {e['cue']['en']}",
                f"- **表演提示 ZH：** {e['cue']['zh']}",
                f"- **不要：** {e['dont_zh']}",
                f"- **适用底板：** {' / '.join(PLATE_KIND[k] for k in e['plates'])} · 风险 {e['risk']}",
                f"- **切点 / 切片：** {e['cut_zh']}", ""]
    return "\n".join(out).rstrip()


def lexicon_gest():
    out = []
    for g in ov["gestures"]:
        out += [f"#### {g['id']} {g['name_zh']} · {g['name_en']}（`{g['key']}`）", "",
                f"- **路径：** {g['path_zh']}",
                f"- **幅度上限：** {g['limit_zh']}",
                f"- **时长 / 回位：** {g['duration']}，结束后回到腰前轻握；下一个切点前至少静 0.5 秒",
                f"- **表演提示 EN：** {g['cue']['en']}",
                f"- **表演提示 ZH：** {g['cue']['zh']}",
                f"- **不要：** {g['dont_zh']}",
                f"- **风险：** {g['risk']}" + ("（高风险 · 待验证，默认用 G05 + 字幕 ①②③ 代替）" if g["risk"] == "high" else ""), ""]
    return "\n".join(out).rstrip()


def tag_ids(tags):
    return " + ".join(f"{IDS.get(g['g'], '')} `{g['g']}`".strip() for g in tags.get("gestures", [])) or "—"


def timeline(pid):
    """Timeline table of a plate as generated WITH the gesture overlay (patched text + patched expected tags)."""
    lib2 = pm.overlay_catalog_lib(lib, ov)
    p = lib2["plates"][pid]
    rows = ["| 时间 | 动作（ZH） | Action (EN) | 词表 / 标签 | 角色 |", "|---|---|---|---|---|"]
    for s in p["timeline"]:
        t = f"{pm._num(s['t'][0])}–{pm._num(s['t'][1])} s"
        if s["kind"] == "section":
            rows.append(f"| {t} | {s['zh']} | {s['en']} | {tag_ids(s['tags'])} | {', '.join(s['tags']['roles'])} |")
        else:
            mark = {"start": "起始回位", "home": "**回位 ✂**", "end": "**回位 ✂（尾帧≈首帧）**"}[s["kind"]]
            rows.append(f"| {t} | {s['zh']} | {s['en']} | {mark} | — |")
    return "\n".join(rows)


def coverage():
    def stats(catalog_dir):
        with open(os.path.join(ROOT, "catalog", catalog_dir, "shots.json"), encoding="utf-8") as f:
            shots = json.load(f)["shots"]
        keys = {g["g"] for s in shots for g in s["performance"]["gestures"]}
        expr = {k for k in keys if k not in HAND_GESTURES and k != "none"}
        hand = {k for k in keys if k in HAND_GESTURES}
        ms_g = sum(1 for s in shots if s["camera"]["framing"] == "ms" and any(g["g"] in HAND_GESTURES for g in s["performance"]["gestures"]))
        new = {r: sum(1 for s in shots if r in s["edit"]["roles"]) for r in ("agree", "contrast", "caveat", "think", "empathy")}
        return len(shots), expr, hand, ms_g, new
    a, b = stats("spec"), stats("gesture")
    rows = ["| 指标 | v1.2 `catalog/spec` | v1.3 `catalog/gesture`（叠加层） |", "|---|---|---|",
            f"| 预期镜头数 | {a[0]} | {b[0]} |",
            f"| 不同的表情 / 头部标签 | {len(a[1])}：{', '.join(sorted(a[1]))} | {len(b[1])}：{', '.join(sorted(b[1]))} |",
            f"| 不同的手势标签 | {len(a[2])}：{', '.join(sorted(a[2]))} | {len(b[2])}：{', '.join(sorted(b[2]))} |",
            f"| 带手势的中景镜头 | {a[3]} | {b[3]} |"]
    for r in a[4]:
        rows.append(f"| 能接 `{r}` 意图的镜头 | {a[4][r]} | {b[4][r]} |")
    return "\n".join(rows)


def intents():
    rows = ["| 意图 role | 标记 | 触发词 | 中景：表情 + 手势 | 近景替代 | 备注 |", "|---|---|---|---|---|---|"]
    for it in ov["intents"]:
        ex = " / ".join(f"{i} {BY_ID[i]['name_zh']}" for i in it["expressions"]) or "—"
        ge = " / ".join(f"{i} {BY_ID[i]['name_zh']}" for i in it["gestures"]) or "—"
        tag = f"`{it['role']}`" + (" **新**" if it.get("new") else "")
        rows.append(f"| {tag} | {it['markup_zh']} | {it['triggers_zh']} | {ex} ＋ {ge} | {it['mcu_alt_zh']} | {it.get('note_zh', '')} |")
    return "\n".join(rows)


def replace_table():
    rows = ["| 底板 | 原句 | 改为 | 为什么 |", "|---|---|---|---|"]
    for r in ov["replace"]:
        rows.append(f"| {' / '.join(r['plates'])} | {r['zh'][0]}<br>*{r['en'][0]}* | {r['zh'][1]}<br>*{r['en'][1]}* | {r.get('why_zh', r['why'])} |")
    return "\n".join(rows)


def lengths():
    rows = ["| 底板 | 真人感 + 手势表情 | 同上 `--compact` | 只叠手势表情 | 只叠手势表情 `--compact` |", "|---|---|---|---|---|"]
    for pid in ("K01", "K02", "K04", "K05"):
        cells = []
        for ovs, compact in (([hp, ov], False), ([hp, ov], True), ([ov], False), ([ov], True)):
            cells.append(" / ".join(str(len(pm.compose_overlay(lib, pid, lang, ovs, compact=compact))) for lang in ("en", "zh")))
        rows.append(f"| {pid} | " + " | ".join(cells) + " |")
    return "\n".join(rows)


def scorecard():
    rows = ["| # | 检查（是 / 否） | Check (yes / no) |", "|---|---|---|"]
    rows += [f"| {it['id']} | {it['zh']} | {it['en']} |" for it in ov["scorecard"]]
    return "\n".join(rows)


values = {
    "status_zh": ov["status_zh"],
    "COVERAGE_TABLE": coverage(),
    "EXPR_LEXICON": lexicon_expr(),
    "GESTURE_LEXICON": lexicon_gest(),
    "TIMELINE_K02": timeline("K02"),
    "TIMELINE_K04": timeline("K04"),
    "TIMELINE_K05": timeline("K05"),
    "INTENT_TABLE": intents(),
    "REPLACE_TABLE": replace_table(),
    "LENGTH_TABLE": lengths(),
    "SCORECARD_TABLE": scorecard(),
    "negative.en": ", ".join(ov["negative_extra"]["en"]),
    "negative.zh": "，".join(ov["negative_extra"]["zh"]),
    "negative_ms.en": ", ".join(ov["negative_extra_ms"]["en"]),
    "negative_ms.zh": "，".join(ov["negative_extra_ms"]["zh"]),
    "negative_ms.short_en": ", ".join(ov["negative_extra"]["short_en"] + ov["negative_extra_ms"]["short_en"]),
    "negative_drop": "\n".join(f"- {' / '.join(d['plates'])}：去掉 `{', '.join(d['drop'])}` — {d['why_zh']}" for d in ov["negative_drop"]),
    "n_gesture_keys": str(len(VOCAB["gesture"])),
    "n_role_keys": str(len(VOCAB["role"])),
}
for lang in ("en", "zh"):
    values[f"mcu_rule.{lang}"] = ov["mcu_rule"][lang]
    values[f"scorecard_rule.{lang}"] = ov["scorecard_rule"][lang]
    for fr in ("ms", "mcu"):
        values[f"perf_{fr}.{lang}"] = ov["performance_append_by_framing"][fr][lang]
        values[f"perf_{fr}_compact.{lang}"] = ov["performance_compact_by_framing"][fr][lang]
        values[f"avoid_{fr}.{lang}"] = ov["avoid_append_by_framing"][fr][lang]


def sub(m):
    k = m.group(1)
    if k not in values:
        sys.exit(f"unknown placeholder {k}")
    return values[k]


def render():
    out = re.sub(r"\{\{([A-Za-z0-9_.]+)\}\}", sub, tpl)
    assert "{{" not in out
    return out


if __name__ == "__main__":
    path = os.path.join(ROOT, "docs", "GESTURE_EXPRESSION.md")
    text = render()
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print("wrote", path, len(text), "chars")
