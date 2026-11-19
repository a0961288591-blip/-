"""Render docs/HUMAN_PREMIUM.md from tools/HUMAN_PREMIUM.template.md + prompts/overlays/human_premium.json.

The overlay JSON is the single source of truth for every copy-paste snippet, so the doc can never drift from
what `istream prompts overlay` and GENERATE_PACK.md actually apply.
Run from the package root:  python3 tools/build_human_premium_doc.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tpl = open(os.path.join(ROOT, "tools", "HUMAN_PREMIUM.template.md"), encoding="utf-8").read()
ov = json.load(open(os.path.join(ROOT, "prompts", "overlays", "human_premium.json"), encoding="utf-8"))

rows = ["| 原句 | 改为 | 为什么 |", "|---|---|---|"]
for r in ov["replace"]:
    rows.append(f"| {r['zh'][0]}<br>*{r['en'][0]}* | {r['zh'][1]}<br>*{r['en'][1]}* | {r.get('why_zh', r['why'])} |")
score = ["| # | 检查（是 / 否） | Check (yes / no) |", "|---|---|---|"]
for it in ov["scorecard"]:
    score.append(f"| {it['id']} | {it['zh']} | {it['en']} |")

values = {
    "REPLACE_TABLE": "\n".join(rows),
    "SCORECARD_TABLE": "\n".join(score),
    "negative.en": ", ".join(ov["negative_extra"]["en"]),
    "negative.zh": "，".join(ov["negative_extra"]["zh"]),
    "negative.short_en": ", ".join(ov["negative_extra"]["short_en"]),
}
for key in ("setting_append", "setting_compact", "performance_append", "performance_compact", "first_frame_append", "style_line", "scorecard_rule"):
    for lang in ("en", "zh"):
        values[f"{key}.{lang}"] = ov[key][lang]


def sub(m):
    k = m.group(1)
    if k not in values:
        sys.exit(f"unknown placeholder {k}")
    return values[k]


out = re.sub(r"\{\{([A-Za-z_.]+)\}\}", sub, tpl)
assert "{{" not in out
path = os.path.join(ROOT, "docs", "HUMAN_PREMIUM.md")
open(path, "w", encoding="utf-8").write(out)
print("wrote", path, len(out), "chars")
