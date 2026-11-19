"""JSON Schemas (generated from vocab.py), the TAGS.md table, and a dependency-free validator."""
import json

from .vocab import VOCAB, ENERGY


def _enum(field, desc=None):
    d = {"type": "string", "enum": list(VOCAB[field])}
    if desc:
        d["description"] = desc
    return d


def shot_schema():
    t = {"type": "number", "minimum": 0}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "istream/shot.schema.json",
        "title": "Infinite Stream shot unit (镜头单元)",
        "description": "One reusable slice of a plate, normally between two home-pose holds. Times inside the shot are relative to src.in.",
        "type": "object",
        "required": ["id", "plate", "src", "camera", "performance", "edit", "lipsync", "quality", "provenance"],
        "properties": {
            "id": {"type": "string", "pattern": "^[A-Z][A-Za-z0-9]*_s[0-9]+[a-z]?$", "description": "PLATE_sN, e.g. K01_s3"},
            "plate": {"type": "string"},
            "src": {"type": "object", "required": ["in", "out"], "properties": {"in": t, "out": t}, "description": "seconds in the plate file"},
            "home_in": {"type": "boolean", "description": "starts on the home pose (seamless entry)"},
            "home_out": {"type": "boolean", "description": "ends on the home pose (seamless exit)"},
            "camera": {"type": "object", "required": ["framing", "aspect"], "properties": {
                "framing": _enum("framing"), "aspect": _enum("aspect"), "angle": _enum("angle"), "subject_pos": _enum("subject_pos"),
                "face_box": {"type": "array", "items": {"type": "number"}, "minItems": 4, "maxItems": 4, "description": "normalized x,y,w,h of the face"},
                "face_h_px": {"type": "number", "description": "face height in source pixels — drives lip-sync engine routing and max punch-in"}}},
            "performance": {"type": "object", "required": ["energy", "emotion", "mouth"], "properties": {
                "energy": {"type": "integer", "enum": list(ENERGY)}, "emotion": _enum("emotion"),
                "gestures": {"type": "array", "items": {"type": "object", "required": ["g"], "properties": {"g": _enum("gesture"), "t": t, "zone": _enum("zone")}}},
                "gaze": _enum("gaze"), "mouth": _enum("mouth"), "hands": _enum("hands"), "head_motion": _enum("head_motion"),
                "speaking": {"type": "boolean"}}},
            "edit": {"type": "object", "required": ["roles", "layouts"], "properties": {
                "roles": {"type": "array", "items": _enum("role")},
                "transitions_in": {"type": "array", "items": _enum("transition")},
                "layouts": {"type": "array", "items": _enum("layout")},
                "position": {"type": "string", "enum": ["any", "first_only", "last_only"]},
                "scale_max": {"type": "number", "minimum": 1.0, "maximum": 2.0},
                "reversible": _enum("reversible"), "mirror_ok": {"type": "boolean"},
                "cut_points": {"type": "array", "items": t, "description": "safe internal cut points (relative seconds)"},
                "keep_out": {"type": "array", "items": {"type": "array", "items": t, "minItems": 2, "maxItems": 2}, "description": "never cut inside these (gesture in progress)"},
                "speech_offset": {"type": "number", "minimum": 0, "description": "opening shots: seconds of silent presence before the mouth starts (planner delays the VO by this much)"}}},
            "mg": {"type": "object", "properties": {"safe_zones": {"type": "array", "items": _enum("zone")}}},
            "lipsync": {"type": "object", "required": ["ready"], "properties": {"ready": {"type": "boolean"}, "jaw": _enum("jaw"),
                "second_face": {"type": "boolean", "description": "a reflection / poster face is visible — pass a face-lock box to the engine"}}},
            "quality": {"type": "object", "required": ["qc"], "properties": {
                "qc": {"type": "integer", "minimum": 1, "maximum": 5},
                "defects": {"type": "array", "items": {"type": "object", "required": ["type", "in", "out"], "properties": {
                    "type": _enum("defect"), "in": t, "out": t, "zone": _enum("zone")}}}}},
            "usage": {"type": "object", "properties": {"times_used": {"type": "integer"}, "last_used": {"type": ["string", "null"]}}},
            "provenance": _enum("provenance"),
            "notes": {"type": "string"},
        },
    }


def timeline_schema():
    rec = {"type": "object", "required": ["in", "out"], "properties": {"in": {"type": "number"}, "out": {"type": "number"}}}
    op = {"type": "object", "required": ["op"], "properties": {"op": {"type": "string", "enum": [
        "reverse", "speed", "scale", "crop", "pip", "hide", "mirror"]}}}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "istream/timeline.schema.json",
        "title": "Infinite Stream timeline (时间轴即代码)",
        "description": "VO-locked edit decision list. rec = record time on the final video; src = time in the plate. "
                       "Temporal ops (reverse/speed) are applied before lip-sync; spatial ops (scale/crop/pip/hide) after.",
        "type": "object",
        "required": ["version", "meta", "host"],
        "properties": {
            "version": {"const": "istream.timeline/1"},
            "meta": {"type": "object", "required": ["fps", "aspect", "size", "duration"]},
            "beats": {"type": "array"},
            "host": {"type": "array", "items": {"type": "object", "required": ["id", "rec", "layout"], "properties": {
                "id": {"type": "string"}, "shot": {"type": ["string", "null"]}, "plate": {"type": ["string", "null"]},
                "src": rec, "rec": rec, "layout": _enum("layout"), "ops": {"type": "array", "items": op},
                "transition_in": _enum("transition"), "beats": {"type": "array"}, "locked": {"type": "boolean"},
                "why": {"type": "string"}}}},
            "mg": {"type": "array"}, "broll": {"type": "array"}, "captions": {"type": "array"},
        },
    }


def tags_md():
    out = ["# 标签词表 · Tag vocabulary", "",
           "> 本文件由 `python -m istream schema --write` 从 `istream/vocab.py` 生成，请勿手改。",
           "> Generated from istream/vocab.py — do not edit by hand.", ""]
    out += ["## energy（能量 1–5）", "", "| 值 | 中文 | English |", "|---|---|---|"]
    out += [f"| `{k}` | {zh} | {en} |" for k, (zh, en) in ENERGY.items()]
    for field, vals in VOCAB.items():
        out += ["", f"## {field}", "", "| 值 | 中文 | English |", "|---|---|---|"]
        out += [f"| `{k}` | {zh} | {en} |" for k, (zh, en) in vals.items()]
    return "\n".join(out) + "\n"


# ----------------------------------------------------------------------------- tiny validator (no jsonschema dependency)
def _walk(schema, obj, path, errs):
    if "enum" in schema and obj not in schema["enum"]:
        errs.append(f"{path}: {obj!r} not in {schema['enum']}")
        return
    ty = schema.get("type")
    if ty == "object":
        if not isinstance(obj, dict):
            errs.append(f"{path}: expected object")
            return
        for r in schema.get("required", []):
            if r not in obj:
                errs.append(f"{path}: missing '{r}'")
        for k, sub in schema.get("properties", {}).items():
            if k in obj and obj[k] is not None:
                _walk(sub, obj[k], f"{path}.{k}", errs)
    elif ty == "array":
        if not isinstance(obj, list):
            errs.append(f"{path}: expected array")
            return
        if "minItems" in schema and len(obj) < schema["minItems"]:
            errs.append(f"{path}: too few items")
        for i, it in enumerate(obj):
            if "items" in schema:
                _walk(schema["items"], it, f"{path}[{i}]", errs)
    elif ty == "number" and not isinstance(obj, (int, float)):
        errs.append(f"{path}: expected number")
    elif ty == "integer" and not isinstance(obj, int):
        errs.append(f"{path}: expected integer")
    elif ty == "boolean" and not isinstance(obj, bool):
        errs.append(f"{path}: expected boolean")


def validate_shot(shot):
    errs = []
    _walk(shot_schema(), shot, shot.get("id", "?"), errs)
    s = shot.get("src", {})
    if s and s.get("out", 0) <= s.get("in", 0):
        errs.append(f"{shot.get('id')}: src.out must be > src.in")
    return errs


def write_all(root):
    import os
    os.makedirs(os.path.join(root, "schema"), exist_ok=True)
    with open(os.path.join(root, "schema", "shot.schema.json"), "w", encoding="utf-8") as f:
        json.dump(shot_schema(), f, ensure_ascii=False, indent=2)
    with open(os.path.join(root, "schema", "timeline.schema.json"), "w", encoding="utf-8") as f:
        json.dump(timeline_schema(), f, ensure_ascii=False, indent=2)
    with open(os.path.join(root, "schema", "TAGS.md"), "w", encoding="utf-8") as f:
        f.write(tags_md())
