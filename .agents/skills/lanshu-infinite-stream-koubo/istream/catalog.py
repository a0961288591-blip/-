"""Plate + shot catalog: loading, validation, derived properties, usage ledger."""
import datetime as _dt
import json
import math
import os

from .schema import validate_shot


class Shot(dict):
    """A shot record (plain dict) with helpers."""

    @property
    def dur(self):
        return self["src"]["out"] - self["src"]["in"]

    def has_role(self, r):
        return r in self["edit"].get("roles", [])

    def allows_layout(self, lay):
        return lay in self["edit"].get("layouts", [])

    def speaking(self):
        p = self["performance"]
        return p.get("speaking", p.get("mouth") == "talking")

    def defects_in(self, a, b):
        """defects overlapping the relative window [a, b] (seconds from src.in)."""
        out = []
        for d in self["quality"].get("defects", []):
            if d["in"] < b and d["out"] > a:
                out.append(d)
        return out

    def face_center(self):
        fb = self["camera"].get("face_box")
        if not fb:
            return (0.5, 0.3)
        return (fb[0] + fb[2] / 2, fb[1] + fb[3] / 2)


class Catalog:
    def __init__(self, plates, shots, root):
        self.root = root
        self.plates = {p["id"]: p for p in plates}
        self.shots = {s["id"]: Shot(s) for s in shots}

    @classmethod
    def load(cls, plates_path, shots_path=None):
        root = os.path.dirname(os.path.abspath(plates_path))
        with open(plates_path, encoding="utf-8") as f:
            plates = json.load(f)["plates"]
        shots = []
        for sp in ([shots_path] if shots_path else [os.path.join(root, "shots.json")]):
            with open(sp, encoding="utf-8") as f:
                shots += json.load(f)["shots"]
        return cls(plates, shots, root)

    @classmethod
    def load_many(cls, pairs):
        plates, shots, root = [], [], None
        for pp, sp in pairs:
            c = cls.load(pp, sp)
            root = root or c.root
            for p in c.plates.values():
                p = dict(p)
                if p.get("file") and not os.path.isabs(p["file"]):
                    p["file"] = os.path.normpath(os.path.join(c.root, p["file"]))
                plates.append(p)
            shots += list(c.shots.values())
        cat = cls(plates, shots, root)
        cat._abs = True
        return cat

    def plate_file(self, plate_id):
        p = self.plates[plate_id]
        f = p.get("file")
        if not f:
            return None
        return f if os.path.isabs(f) else os.path.normpath(os.path.join(self.root, f))

    def validate(self):
        errs = []
        for s in self.shots.values():
            errs += validate_shot(s)
            if s["plate"] not in self.plates:
                errs.append(f"{s['id']}: unknown plate {s['plate']}")
            else:
                d = self.plates[s["plate"]].get("duration")
                if d and s["src"]["out"] > d + 1e-6:
                    errs.append(f"{s['id']}: src.out {s['src']['out']} beyond plate duration {d}")
        return errs

    def stats(self):
        n = len(self.shots)
        tot = sum(s.dur for s in self.shots.values())
        by_role = {}
        for s in self.shots.values():
            for r in s["edit"]["roles"]:
                by_role[r] = by_role.get(r, 0) + 1
        return {"plates": len(self.plates), "shots": n, "shot_seconds": round(tot, 2), "by_role": dict(sorted(by_role.items()))}

    def variant_count(self):
        """How many distinct visual units the catalog yields once ops are applied (reverse x scales x layouts)."""
        n = 0
        for s in self.shots.values():
            rev = 2 if s["edit"].get("reversible", "no") != "no" else 1
            scales = 1 + (1 if s["edit"].get("scale_max", 1.0) >= 1.12 else 0) + (1 if s["edit"].get("scale_max", 1.0) >= 1.25 else 0)
            lays = max(1, len([l for l in s["edit"]["layouts"] if l in ("full", "split", "pip")]))
            n += rev * scales * lays
        return n


# ----------------------------------------------------------------------------- cross-video usage ledger (fatigue control)
class Ledger:
    def __init__(self, path=None):
        self.path = path
        self.data = {"uses": {}}
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.data = json.load(f)

    def fatigue(self, shot_id, today=None):
        u = self.data["uses"].get(shot_id)
        if not u:
            return 0.0
        today = today or _dt.date.today()
        last = _dt.date.fromisoformat(u["last"])
        days = (today - last).days
        recency = 1.5 if days <= 2 else (0.7 if days <= 7 else 0.0)
        return 0.5 * math.log1p(u["n"]) + recency

    def record(self, shot_ids, day=None):
        day = (day or _dt.date.today()).isoformat()
        for sid in shot_ids:
            u = self.data["uses"].setdefault(sid, {"n": 0, "last": day})
            u["n"] += 1
            u["last"] = day

    def save(self):
        if self.path:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)

    def retire_candidates(self, threshold=40):
        return sorted([(k, v["n"]) for k, v in self.data["uses"].items() if v["n"] >= threshold], key=lambda x: -x[1])
