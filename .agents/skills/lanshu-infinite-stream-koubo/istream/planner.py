"""Script-driven assembly planner: beats → layouts → slots → shots (+ ops, transitions, MG, captions).

Deterministic for a given (script, catalog, ledger, seed). Every decision carries a human-readable `why`.
"""
import math
import random

from .script import speech_rate
from .vocab import GESTURE_KIN

PROFILES = {
    # short-form koubo (≤ ~2 min): jump-cut rhythm, ASL 2.2–3.8 s, 15–35 % coverage by B-roll/MG
    "short": dict(slot_min=1.6, slot_max=4.2, coverage=(0.15, 0.35), no_repeat_s=45.0, punch=1.15, alt_scale=1.10, chapter_card=0.0),
    # long-form (3–10 min): calmer ASL 3.5–7 s, chapter cards, 25–40 % coverage
    "long": dict(slot_min=3.0, slot_max=7.5, coverage=(0.25, 0.40), no_repeat_s=100.0, punch=1.12, alt_scale=1.08, chapter_card=1.6),
}

ENERGY_FOR = {"open": 3, "hook": 4, "narrate": 3, "explain": 3, "story": 2, "list": 3, "data": 3, "question": 3, "emphasis": 4,
              "summary": 3, "pause": 1, "listen": 1, "transition": 2, "close": 2, "cta": 3,
              "agree": 3, "contrast": 3, "caveat": 2, "think": 2, "empathy": 2}
EMOTION_FOR = {"open": ("warm",), "hook": ("curious", "warm", "confident"), "narrate": ("neutral", "warm"), "explain": ("neutral", "serious"),
               "story": ("neutral", "warm"), "list": ("neutral", "confident"), "data": ("serious", "neutral"), "question": ("curious",),
               "emphasis": ("confident", "serious"), "summary": ("confident",), "pause": ("neutral", "warm"), "close": ("warm",), "cta": ("warm",),
               "agree": ("confident", "warm"), "contrast": ("curious", "neutral", "confident"), "caveat": ("serious", "empathetic"),
               "think": ("curious", "neutral"), "empathy": ("empathetic", "warm")}
# v1.3 intent → preferred gesture / expression tags (docs/GESTURE_EXPRESSION.md §E). Only the new roles use it, so plans for
# scripts without the new markup stay identical; explicit [手势: …] / [表情: …] requests weigh more.
INTENT_PREF = {"agree": ("nod", "nod_multi", "knowing_look", "hands_together"), "contrast": ("contrast_hands", "brow_raise", "head_tilt"),
               "caveat": ("brow_furrow", "shrug", "soft_eyes", "hand_on_chest"), "think": ("think_glance", "steeple"),
               "empathy": ("soft_eyes", "hand_on_chest", "head_tilt")}
AUTO_MG = {"list": "list_chips", "data": "counter_card", "question": "question_pop", "emphasis": "keyword_pop", "cta": "follow_pill"}
DEFAULT_ZONE = {"16:9": {"list_chips": "right_half", "counter_card": "right_half", "question_pop": "right_half", "keyword_pop": "lower_third",
                         "follow_pill": "lower_third", "title_badge": "upper_band", "chapter_card": "full", "card": "full"},
                "9:16": {"list_chips": "lower_third", "counter_card": "upper_band", "question_pop": "upper_band", "keyword_pop": "lower_third",
                         "follow_pill": "lower_third", "title_badge": "upper_band", "chapter_card": "full", "card": "full"}}
ROLE_RANK = {"emphasis": 5, "hook": 5, "open": 5, "cta": 4, "question": 4, "data": 3, "list": 3, "summary": 3, "explain": 2, "story": 2,
             "close": 2, "transition": 1, "narrate": 0, "pause": 0, "listen": 0, "contrast": 3, "caveat": 3, "agree": 2, "think": 2, "empathy": 2}
SIZES = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}
CROP_FRAC = {("16:9", "9:16"): (9 / 16) / (16 / 9), ("16:9", "1:1"): 9 / 16, ("9:16", "1:1"): 1.0}


def _kin(want):
    """Requested tags plus near-equivalents (a greeting smile satisfies a soft smile, single vs multiple nods)."""
    return tuple(dict.fromkeys(g for w in (want or ()) for g in (w,) + GESTURE_KIN.get(w, ()))) if want else ()


class Planner:
    def __init__(self, catalog, aspect="16:9", profile="short", seed=7, ledger=None, mg_library=None, auto_mg=True, size=None, fps=30):
        self.cat = catalog
        self.aspect = aspect
        self.P = dict(PROFILES[profile])
        self.profile = profile
        self.rng = random.Random(seed)
        self.seed = seed
        self.ledger = ledger
        self.mglib = mg_library or {}
        self.auto_mg = auto_mg
        self.size = size or SIZES[aspect]
        self.fps = fps
        self.warnings = []

    # ------------------------------------------------------------------ layouts
    def beat_layout(self, b, i, n):
        if b.get("layout_hint"):
            return b["layout_hint"], "script hint"
        r = b["roles"][0]
        if i == 0:
            return "full", "opening: the host must appear naturally in the first frames"
        if b.get("broll"):
            return "hidden", f"B-roll '{b['broll']}' covers the sentence"
        if r in ("list", "data"):
            return "split", f"{r}: host + side content zone"
        if r in ("emphasis", "question"):
            return "punch", f"{r}: punch-in lands on the line"
        return "full", r

    def balance_coverage(self, beats, lays, total):
        lo, hi = self.P["coverage"]
        cov = lambda: sum(b["end"] - b["start"] for b, (l, _) in zip(beats, lays) if l in ("hidden", "pip")) / total
        cands = sorted([i for i, b in enumerate(beats) if lays[i][0] == "full" and i not in (0, len(beats) - 1)
                        and b["roles"][0] in ("story", "explain", "narrate", "data") and (b["end"] - b["start"]) >= 2.0],
                       key=lambda i: -(beats[i]["end"] - beats[i]["start"]))
        for i in cands:
            if cov() >= lo:
                break
            prev_cov = i > 0 and lays[i - 1][0] in ("hidden", "pip")
            if prev_cov:
                continue
            lays[i] = ("pip", f"coverage balance: content-led beat with host PiP (target {lo:.0%}–{hi:.0%})")
        return cov()

    # ------------------------------------------------------------------ slots
    def make_slots(self, beats, lays, total):
        segs = []
        for i, b in enumerate(beats):
            lay, why = lays[i]
            a = 0.0 if i == 0 else round(b["start"] - 0.06, 3)          # cut ~2 frames before speech onset (J-cut feel)
            e = total if i == len(beats) - 1 else round(beats[i + 1]["start"] - 0.06, 3)
            # emphasis: cut into the punch exactly on the keyword
            kws = list(b.get("kw_times", {}).values())
            if lay == "punch" and kws and kws[0][0] - a > self.P["slot_min"]:
                k = round(kws[0][0] - 0.07, 3)
                segs.append(dict(a=a, e=k, layout="full", beats=[b["id"]], role=b["roles"][0], why="lead-in before the keyword", chapter_start=b.get("chapter_start"), force_cut=b.get("force_cut")))
                segs.append(dict(a=k, e=e, layout="punch", beats=[b["id"]], role=b["roles"][0], why=f"punch-in on keyword at {kws[0][0]:.2f}s", kw=kws[0][0],
                                 **({"want": list(b["want"])} if b.get("want") else {})))
                continue
            segs.append(dict(a=a, e=e, layout=lay, beats=[b["id"]], role=b["roles"][0], why=why, chapter_start=b.get("chapter_start"),
                             force_cut=b.get("force_cut"), kw=kws[0][0] if kws else None, broll=b.get("broll"),
                             **({"want": list(b["want"])} if b.get("want") else {})))
        # merge short neighbours with the same layout (never across chapter starts / forced cuts / hidden B-roll changes)
        out = []
        for s in segs:
            keyed = s.get("kw") is not None and s["role"] in ("emphasis", "hook", "data", "summary")
            if out and s["layout"] == out[-1]["layout"] and not s.get("chapter_start") and not s.get("force_cut") and not keyed \
                    and s["layout"] != "hidden" and (s["e"] - out[-1]["a"]) <= self.P["slot_max"] and (s["e"] - s["a"]) < self.P["slot_min"] * 1.6:
                out[-1]["e"] = s["e"]
                out[-1]["beats"] += s["beats"]
                if out[-1].get("kw") is None and s.get("kw") is not None:
                    out[-1]["kw"] = s["kw"]                     # keep the keyword so gestures / punches can land on it
                if ROLE_RANK.get(s["role"], 0) > ROLE_RANK.get(out[-1]["role"], 0):
                    out[-1]["role"], out[-1]["why"] = s["role"], s["why"]
                if s.get("want"):
                    out[-1]["want"] = out[-1].get("want", []) + [g for g in s["want"] if g not in out[-1].get("want", [])]
                continue
            out.append(dict(s))
        # split long host slots into jump-cut halves
        final = []
        for s in out:
            L = s["e"] - s["a"]
            if s["layout"] in ("full", "split", "punch") and L > self.P["slot_max"]:
                n = math.ceil(L / self.P["slot_max"])
                step = L / n
                for k in range(n):
                    t = dict(s)
                    t["a"], t["e"] = round(s["a"] + k * step, 3), round(s["a"] + (k + 1) * step, 3)
                    if k:
                        t["why"] = s["why"] + f" · jump-cut part {k + 1}/{n}"
                        t["chapter_start"] = False
                        t.pop("want", None)                 # a requested gesture lands once per sentence (first part)
                    final.append(t)
            else:
                final.append(s)
        return final

    # ------------------------------------------------------------------ shot selection
    def _crop_ok(self, shot):
        sa = shot["camera"]["aspect"]
        if sa == self.aspect:
            return True, None
        frac = CROP_FRAC.get((sa, self.aspect))
        if frac is None:
            return False, None
        fx, _ = shot.face_center()
        fw = shot["camera"].get("face_box", [0, 0, 0.12, 0.2])[2]
        if fw > frac * 0.8:
            return False, None
        cx = min(max(fx, frac / 2), 1 - frac / 2)
        return True, {"op": "crop", "aspect": self.aspect, "cx": round(cx, 4), "frac": round(frac, 4)}

    def _window(self, shot, L, slot):
        dur = shot.dur
        if dur + 1e-6 < L:
            return None
        cuts = shot["edit"].get("cut_points", [])
        cands = set([0.0, round(dur - L, 3)] + [round(c, 3) for c in cuts if c + L <= dur + 1e-6])
        k = 0.0
        while k + L <= dur + 1e-6:
            cands.add(round(k, 3))
            k += 0.25
        best, bs = None, -1e9
        for a in sorted(cands):
            b = a + L
            sc = 0.0
            if any(abs(a - c) < 0.12 for c in cuts):
                sc += 0.8                                   # enter on a hold / home pose
            if slot.get("idx") == 0 and a < 0.15 and shot.get("home_in", True):
                sc += 1.0                                   # openings start where the plate starts: the host "arrives"
            for ko in shot["edit"].get("keep_out", []):
                if ko[0] < a < ko[1] or ko[0] < b < ko[1]:
                    sc -= 2.0                               # never cut mid-gesture
            if slot.get("kw") is not None:
                for g in shot["performance"].get("gestures", []):
                    if "t" in g and g["g"] != "none":
                        d = abs((a + slot["kw"] - slot["a"]) - g["t"])
                        sc += max(0.0, 2.0 - 2.0 * d)      # gesture peak lands on the keyword
            bad = shot.defects_in(a, b)
            if bad:
                ok, crop = self._crop_ok(shot)
                if not all(d.get("zone") in ("right_half", "left_half") and crop and _crop_excludes(crop, d["zone"]) for d in bad):
                    continue
                sc -= 0.3
            near = False
            for (sid, ua, ub, t) in self.used:
                if sid == shot["id"] and ua < b and ub > a:
                    if abs(slot["a"] - t) < 12.0:
                        near = True                         # never show the same moment twice within 12 s
                    sc -= 3.0                               # far-apart reuse is allowed as a visual variant
            if near:
                continue
            if sc > bs:
                best, bs = a, sc
        return None if best is None else (best, bs)

    def score(self, shot, slot, nbrs):
        role = slot["role"]
        s = 0.0
        why = []
        if shot.has_role(role):
            s += 3.0
            why.append(f"role {role}")
        s -= 0.8 * abs(shot["performance"]["energy"] - ENERGY_FOR.get(role, 3))
        if shot["performance"]["emotion"] in EMOTION_FOR.get(role, ()):
            s += 1.5
            why.append(f"emotion {shot['performance']['emotion']}")
        want = _kin(slot.get("want")) or INTENT_PREF.get(role)
        if want:
            hit = [g["g"] for g in shot["performance"].get("gestures", []) if g["g"] in want]
            if hit:
                s += 2.0 if slot.get("want") else 0.8
                why.append("gesture " + "+".join(dict.fromkeys(hit)))
        for nb in nbrs:
            ns = self.cat.shots[nb["shot"]["id"]]
            if ns["camera"]["framing"] != shot["camera"]["framing"] or ns["camera"].get("subject_pos") != shot["camera"].get("subject_pos"):
                s += 0.5
            if nb["shot"]["id"] == shot["id"]:
                s -= 5.0
        uses = [t for (sid, ua, ub, t) in self.used if sid == shot["id"]]
        s -= 1.0 * len(uses)
        if any(abs(slot["a"] - t) < self.P["no_repeat_s"] for t in uses):
            s -= 1.5
        if self.ledger:
            f = self.ledger.fatigue(shot["id"])
            s -= f
            if f > 0.5:
                why.append(f"fatigue -{f:.1f}")
        if slot["layout"] == "punch" and shot["edit"].get("scale_max", 1.0) < self.P["punch"]:
            s -= 3.0
        # resolution: prefer shots that do not have to be blown up (native aspect / enough pixels)
        pw, ph = self.cat.plates[shot["plate"]].get("size", [1920, 1080])
        k = self.size[1] / ph if shot["camera"]["aspect"] != self.aspect or pw / ph >= self.size[0] / self.size[1] else self.size[1] / (pw * self.size[1] / self.size[0])
        if k > 1.6:
            s -= min(2.0, 1.2 * (k - 1.6) + 0.6)
            why.append(f"upscale {k:.1f}×")
        s += self.rng.uniform(-0.3, 0.3)
        return s, why

    def candidates(self, slot, first):
        need_zone = slot.get("need_zone")
        out = []
        for shot in self.cat.shots.values():
            e = shot["edit"]
            pos = e.get("position", "any")
            if pos == "first_only" and not first:
                continue
            if shot["performance"].get("hands") == "near_face":
                continue
            if not shot["lipsync"].get("ready") and slot.get("speech", True):
                continue
            if not shot.speaking() and slot.get("speech", True):
                continue
            lay = slot["layout"]
            if lay in ("full", "split", "punch", "pip") and not shot.allows_layout("full" if lay == "punch" else lay):
                continue
            ok, crop = self._crop_ok(shot)
            if not ok:
                continue
            if need_zone and need_zone not in shot.get("mg", {}).get("safe_zones", []) and lay in ("full", "split", "punch"):
                continue
            if shot["quality"]["qc"] < 3:
                continue
            out.append((shot, crop))
        if first:
            # opening-only shots (host arrives on camera) win; the VO was already delayed for them in opening_offset()
            firsts = [c for c in out if c[0]["edit"].get("position") == "first_only"] or [c for c in out if c[0].has_role("open")]
            if firsts:
                out = firsts
        return out

    # ------------------------------------------------------------------ main
    def opening_offset(self, beats):
        """Openings: if opening-only shots exist, delay the VO so the host is visibly *present* before the first word."""
        offs = []
        for s in self.cat.shots.values():
            if s["edit"].get("position") == "first_only" and self._crop_ok(s)[0]:
                offs.append(s["edit"].get("speech_offset", 0.0))
        if not offs or not beats:
            return 0.0
        return round(max(0.0, max(offs) + 0.05 - beats[0]["start"]), 3)

    def plan(self, meta, beats):
        delta = self.opening_offset(beats)
        if delta > 0:
            for b in beats:
                b["start"], b["end"] = round(b["start"] + delta, 3), round(b["end"] + delta, 3)
                b["kw_times"] = {k: [round(v[0] + delta, 3), round(v[1] + delta, 3)] for k, v in b.get("kw_times", {}).items()}
            meta = dict(meta, duration=round(meta["duration"] + delta, 3))
        self.vo_offset = delta
        total = meta["duration"]
        n = len(beats)
        lays = [self.beat_layout(b, i, n) for i, b in enumerate(beats)]
        cov = self.balance_coverage(beats, lays, total)
        slots = self.make_slots(beats, lays, total)
        bmap = {b["id"]: b for b in beats}
        # which MG each slot must host (to constrain shot choice)
        mg_items = self.plan_mg(beats, slots)
        for s in slots:
            s["speech"] = any(bmap[bid]["text"] for bid in s["beats"])
            zones = [m["zone"] for m in mg_items if m["rec"]["in"] < s["e"] - 0.2 and m["rec"]["out"] > s["a"] + 0.2 and m["zone"] not in ("full",)]
            s["zones"] = zones
            s["need_zone"] = next((z for z in zones if z in ("right_half", "left_half")), None) if s["layout"] in ("split", "full", "punch") else None
        slots = self._fit_slots(slots)
        for i, sl in enumerate(slots):
            sl["idx"] = i
            sl["cands"] = self.candidates(sl, first=(i == 0)) if sl["layout"] != "hidden" else []
        # most-constrained slot first (fewest candidates), keyword slots before plain ones, then time order
        order = [0] + sorted(range(1, len(slots)), key=lambda i: (1e9 if slots[i]["layout"] == "hidden" else len(slots[i]["cands"]),
                                                                  0 if slots[i].get("kw") is not None else 1, slots[i]["a"]))
        self.used, self.pick = [], {}
        for i in order:
            sl = slots[i]
            if sl["layout"] == "hidden":
                continue
            nbrs = [self.pick[j] for j in (i - 1, i + 1) if j in self.pick]
            pk = self.select(sl, nbrs)
            if pk is None and sl["layout"] in ("full", "split", "punch") and sl.get("zones"):
                # supply relaxation: no fresh footage fits the zone → let the content lead, host shrinks to a PiP window
                sl["layout"], sl["need_zone"] = "pip", None
                sl["why"] += " · relaxed to PiP: library has no fresh shot with this MG zone free"
                sl["cands"] = self.candidates(sl, first=(i == 0))
                pk = self.select(sl, nbrs)
                if pk is not None:
                    self.warnings.append(f"slot {sl['a']:.2f}-{sl['e']:.2f}: relaxed to PiP (zone supply exhausted) — add plates with that side free")
            if pk is None:
                self.warnings.append(f"slot {sl['a']:.2f}-{sl['e']:.2f}: no shot fits; hidden as fallback card")
                sl["layout"], sl["why"] = "hidden", sl["why"] + " · FALLBACK (no shot fits)"
                continue
            self.pick[i] = pk
            self.used.append((pk["shot"]["id"], pk["a"], pk["a"] + (sl["e"] - sl["a"]), sl["a"]))
        host = self.build_clips(slots)
        self.finish_transitions(host, slots)
        caps = self.captions(beats)
        tl = {
            "version": "istream.timeline/1",
            "meta": {"title": meta.get("title", ""), "fps": self.fps, "aspect": self.aspect, "size": list(self.size), "duration": total,
                     "profile": self.profile, "seed": self.seed, "vo": meta.get("vo"), "vo_offset": self.vo_offset, "coverage_planned": round(cov, 3),
                     "generator": "istream 1.0", "warnings": self.warnings},
            "beats": [{k: b[k] for k in ("id", "text", "chapter", "roles", "start", "end", "pause_after", "kw_times", "broll", "mg", "timing") if k in b} for b in beats],
            "host": host, "mg": mg_items, "broll": self.broll(slots), "captions": caps,
        }
        for b in tl["beats"]:
            b["rate_cps"] = round(speech_rate(bmap[b["id"]]), 2)
        return tl

    def _fit_slots(self, slots):
        """split host slots longer than the longest shot in the catalog (keeps every slot fillable)"""
        maxd = max((x.dur for x in self.cat.shots.values()), default=8.0) - 0.2
        out = []
        for sl in slots:
            L = sl["e"] - sl["a"]
            if sl["layout"] != "hidden" and L > maxd:
                n = math.ceil(L / maxd)
                for k in range(n):
                    t = dict(sl)
                    t["a"], t["e"] = round(sl["a"] + k * L / n, 3), round(sl["a"] + (k + 1) * L / n, 3)
                    out.append(t)
            else:
                out.append(sl)
        return out

    def select(self, sl, nbrs):
        L = round(sl["e"] - sl["a"], 3)
        best = None
        for shot, crop in sl["cands"]:
            w = self._window(shot, L, sl)
            if w is None:
                continue
            sc, why = self.score(shot, sl, nbrs)
            tot = sc + 0.4 * w[1]
            if best is None or tot > best["score"]:
                best = {"shot": shot, "crop": crop, "a": w[0], "score": tot, "why": why}
        return best

    def build_clips(self, slots):
        """chronological pass: ops, visual variants for reuse, scale changes for same-plate jump cuts"""
        host, hist, prev = [], [], None
        for i, sl in enumerate(slots):
            base = dict(id=f"c{len(host) + 1:02d}", rec={"in": sl["a"], "out": sl["e"]}, layout=sl["layout"], beats=sl["beats"], why=sl["why"], role=sl["role"])
            if sl["layout"] == "hidden" or i not in self.pick:
                base.update(layout="hidden", shot=None, plate=None, src=None, ops=[{"op": "hide", "by": ("broll:" + sl["broll"]) if sl.get("broll") else "card"}])
                host.append(base)
                continue
            pk = self.pick[i]
            shot = pk["shot"]
            L = sl["e"] - sl["a"]
            a, b = pk["a"], pk["a"] + L
            smax = shot["edit"].get("scale_max", 1.0)
            alt = min(self.P["alt_scale"], smax) if smax >= 1.06 else 1.0
            scale = min(self.P["punch"], smax) if sl["layout"] == "punch" else 1.0
            rev = False
            pip = sl["layout"] == "pip"
            prior = [s0 for (sid, ua, ub, s0) in hist if sid == shot["id"] and ua < b and ub > a]
            pscale = None
            if prev is not None and prev["plate"] == shot["plate"] and not pip and prev["layout"] != "pip" \
                    and abs(prev["src"]["out"] - (shot["src"]["in"] + a)) >= 0.05:
                pscale = next((o["s"] for o in prev["ops"] if o["op"] == "scale"), 1.0)
            if sl["layout"] != "punch" and not pip:
                opts = [1.0] + ([alt] if alt > 1.0 else []) + ([round(smax, 3)] if smax >= alt + 0.04 else [])
                # 1) a reused moment must be a new variant (scaled / reversed counts as different); 2) a same-plate cut needs a ≥8 % scale change
                ok = [x for x in opts if (round(x, 2), False, False) not in prior and (pscale is None or abs(x - pscale) >= 0.08)]
                ok = ok or [x for x in opts if (round(x, 2), False, False) not in prior]
                if ok:
                    scale = ok[0]
                elif shot["edit"].get("reversible", "no") != "no":
                    rev = True
            sig = (round(scale, 2), rev, pip)
            ops = []
            if rev:
                ops.append({"op": "reverse"})
            if pk["crop"]:
                ops.append(pk["crop"])
            if scale > 1.001:
                ops.append({"op": "scale", "s": round(scale, 3), "anchor": "face"})
            if pip:
                corner = "bl" if self.aspect == "9:16" else "br"
                if "right_half" in sl.get("zones", []) or "right_strip" in sl.get("zones", []):
                    corner = "bl"          # keep the host window opposite the content
                elif "left_half" in sl.get("zones", []):
                    corner = "br"
                ops.append({"op": "pip", "corner": corner, "size": 0.34 if self.aspect == "9:16" else 0.30, "shape": "round"})
            src_in = round(shot["src"]["in"] + a, 3)
            base.update(shot=shot["id"], plate=shot["plate"], src={"in": src_in, "out": round(src_in + L, 3)}, ops=ops,
                        why=f"{sl['why']} | pick {shot['id']} score {pk['score']:.2f}: " + ", ".join(pk["why"]))
            if sl.get("want") and not any(g["g"] in _kin(sl["want"]) for g in shot["performance"].get("gestures", [])):
                self.warnings.append(f"slot {sl['a']:.2f}-{sl['e']:.2f}: requested {'+'.join(sl['want'])} not in the picked shot — "
                                     "generate a plate that has it (docs/GESTURE_EXPRESSION.md K04/K05) or drop the request")
            hist.append((shot["id"], a, b, sig))
            host.append(base)
            prev = base
        return host

    def finish_transitions(self, host, slots):
        starts = {s["a"]: s for s in slots}
        for i, c in enumerate(host):
            if i == 0:
                c["transition_in"] = "cut"
                continue
            p = host[i - 1]
            s = starts.get(c["rec"]["in"], {})
            if c["layout"] == "hidden" or p["layout"] == "hidden":
                c["transition_in"] = "broll_fade"
            elif s.get("chapter_start") and self.profile == "long":
                c["transition_in"] = "mgwipe"
            elif p.get("plate") == c.get("plate") or self._framing(p) == self._framing(c):
                c["transition_in"] = "zoomcut"
            else:
                c["transition_in"] = "cut"

    def _framing(self, c):
        return self.cat.shots[c["shot"]]["camera"]["framing"] if c.get("shot") else None

    # ------------------------------------------------------------------ overlays
    def _zone(self, template):
        ent = self.mglib.get(template, {})
        z = ent.get("zone", {}).get(self.aspect) if isinstance(ent.get("zone"), dict) else ent.get("zone")
        return z or DEFAULT_ZONE[self.aspect if self.aspect in DEFAULT_ZONE else "16:9"].get(template, "lower_third")

    def plan_mg(self, beats, slots):
        items = []
        for b in beats:
            temps = list(b.get("mg", []))
            if self.auto_mg and not temps and b["roles"][0] in AUTO_MG:
                temps.append(AUTO_MG[b["roles"][0]])
            for t in temps:
                ent = self.mglib.get(t, {})
                a = b["start"] - 0.05
                if ent.get("at_keyword") and b.get("kw_times"):
                    a = list(b["kw_times"].values())[0][0] - 0.05
                e = b["end"] + ent.get("tail", 0.3)
                nxt = next((x for x in beats if x["start"] > b["start"] + 1e-6), None)
                if nxt is not None:
                    e = min(e, nxt["start"] - 0.1)
                items.append({"id": f"m{len(items) + 1:02d}", "template": t, "asset": ent.get("asset"), "rec": {"in": round(max(0, a), 3), "out": round(e, 3)},
                              "zone": self._zone(t), "beat": b["id"], "text": ent["text"] if "text" in ent else _mg_text(t, b)})
            if b.get("chapter_start") and self.profile == "long" and self.P["chapter_card"]:
                items.append({"id": f"m{len(items) + 1:02d}", "template": "chapter_card", "asset": None,
                              "rec": {"in": round(b["start"] - 0.06, 3), "out": round(b["start"] + self.P["chapter_card"], 3)},
                              "zone": "full", "beat": b["id"], "text": b.get("chapter") or ""})
        if beats and self.auto_mg and "title_badge" in self.mglib:
            items.insert(0, {"id": "m00", "template": "title_badge", "asset": self.mglib["title_badge"].get("asset"),
                             "rec": {"in": 0.2, "out": min(4.0, beats[0]["end"])}, "zone": self._zone("title_badge"), "beat": beats[0]["id"], "text": ""})
        return items

    def broll(self, slots):
        return [{"id": f"r{i + 1:02d}", "query": s["broll"], "rec": {"in": s["a"], "out": s["e"]}, "status": "to_source"}
                for i, s in enumerate([s for s in slots if s.get("broll")])]

    def captions(self, beats):
        maxc = 14 if self.aspect == "9:16" else 22
        caps = []
        for b in beats:
            parts = _split_caption(b["text"], maxc)
            tot = sum(len(p) for p in parts) or 1
            t = b["start"]
            for p in parts:
                d = (b["end"] - b["start"]) * len(p) / tot
                caps.append({"rec": {"in": round(t, 3), "out": round(t + d, 3)}, "text": p})
                t += d
        return caps


def _crop_excludes(crop, zone):
    cx, frac = crop["cx"], crop["frac"]
    lo, hi = cx - frac / 2, cx + frac / 2
    return hi <= 0.5 + 1e-6 if zone == "right_half" else lo >= 0.5 - 1e-6


def _split_caption(text, maxc):
    """Width-aware caption lines: CJK = 1, Latin/digits = 0.5; prefer punctuation; no leading punctuation; no orphan tails."""
    t = text.rstrip("。！？!?；;，,")
    w = lambda x: sum(0.5 if ord(ch) < 128 else 1.0 for ch in x)
    parts, cur = [], ""
    for ch in t:
        if not cur and ch in "，,、：:；;。！？!? ":
            continue
        cur += ch
        if (ch in "，,：:；;" and w(cur) >= 4) or (ch == "、" and w(cur) >= 0.6 * maxc):
            parts.append(cur.rstrip("，,、：:；;"))
            cur = ""
        elif w(cur) >= maxc and not (ch.isascii() and ch.isalnum()):
            parts.append(cur)
            cur = ""
    if cur:
        if parts and w(cur) < 3:
            parts[-1] += cur
        else:
            parts.append(cur)
    return [p for p in parts if p.strip()]


def _mg_text(template, b):
    if b.get("keywords"):
        return b["keywords"][0]
    return ""
