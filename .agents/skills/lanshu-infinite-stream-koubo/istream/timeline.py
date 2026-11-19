"""Timeline-as-code: a VO-locked edit list plus composable edit ops.

The VO fixes record time, so editing never moves speech. Ops change *what* fills each slot and *how* it is shown:
  swap / order (shots trade slots) · scale / punch / crop / pip / hide / show (spatial) · reverse / speed (temporal)
  split (new jump cut) · transition · mg / broll overlays · lock (planner will not touch the clip on re-plan)

Fluent API:   tl.clip("c05").swap("K02_s1").punch(1.15)
String ops:   tl.apply(["swap c05 K02_s1", "punch c05 1.15", "hide c07 broll:factory", "order c02,c04,c06"])
"""
import copy
import json


class OpError(ValueError):
    pass


class ClipRef:
    def __init__(self, tl, cid):
        self.tl, self.cid = tl, cid

    def __getattr__(self, name):
        fn = getattr(self.tl, name)

        def call(*a, **k):
            fn(self.cid, *a, **k)
            return self
        return call


class Timeline:
    def __init__(self, data, catalog=None):
        self.d = data
        self.cat = catalog
        self.log = []

    @classmethod
    def load(cls, path, catalog=None):
        with open(path, encoding="utf-8") as f:
            return cls(json.load(f), catalog)

    def save(self, path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.d, f, ensure_ascii=False, indent=1)

    def copy(self):
        return Timeline(copy.deepcopy(self.d), self.cat)

    # ------------------------------------------------------------------ access
    @property
    def host(self):
        return self.d["host"]

    def clip(self, cid):
        return ClipRef(self, cid)

    def _c(self, cid):
        for c in self.host:
            if c["id"] == cid:
                return c
        raise OpError(f"no clip {cid}")

    def _shot(self, sid):
        if not self.cat or sid not in self.cat.shots:
            raise OpError(f"unknown shot {sid}")
        return self.cat.shots[sid]

    def _guard(self, c):
        if c.get("locked"):
            raise OpError(f"{c['id']} is locked")

    def _set_op(self, c, op):
        c["ops"] = [o for o in c.get("ops", []) if o["op"] != op["op"]] + [op]

    def _drop_op(self, c, name):
        c["ops"] = [o for o in c.get("ops", []) if o["op"] != name]

    def _note(self, s):
        self.log.append(s)

    # ------------------------------------------------------------------ ops
    def swap(self, cid, shot_id, offset=None):
        """Fill the clip's slot with another shot. offset: seconds into the shot (default: first cut point that fits)."""
        c = self._c(cid)
        self._guard(c)
        s = self._shot(shot_id)
        L = c["rec"]["out"] - c["rec"]["in"]
        if s.dur + 1e-6 < L:
            raise OpError(f"{shot_id} ({s.dur:.2f}s) shorter than slot {cid} ({L:.2f}s)")
        if offset is None:
            fits = [p for p in s["edit"].get("cut_points", []) if p + L <= s.dur + 1e-6]
            offset = fits[0] if fits else 0.0
        if offset + L > s.dur + 1e-6:
            raise OpError("offset + slot length exceeds shot")
        c.update(shot=shot_id, plate=s["plate"], src={"in": round(s["src"]["in"] + offset, 3), "out": round(s["src"]["in"] + offset + L, 3)})
        if c["layout"] == "hidden":
            c["layout"] = "full"
            self._drop_op(c, "hide")
        c["why"] = f"manual swap → {shot_id}"
        self._note(f"swap {cid} {shot_id}")

    def scale(self, cid, s, anchor="face"):
        c = self._c(cid)
        self._guard(c)
        if c.get("shot"):
            mx = self._shot(c["shot"])["edit"].get("scale_max", 1.0)
            if s > mx + 1e-6:
                raise OpError(f"scale {s} > scale_max {mx} for {c['shot']} (mouth resolution would suffer)")
        if abs(s - 1.0) < 1e-3:
            self._drop_op(c, "scale")
        else:
            self._set_op(c, {"op": "scale", "s": round(s, 3), "anchor": anchor})
        if s > 1.0 and c["layout"] == "full":
            c["layout"] = "punch"
        self._note(f"scale {cid} {s}")

    def punch(self, cid, s=1.15):
        self.scale(cid, s)

    def crop(self, cid, aspect="9:16", cx=None):
        c = self._c(cid)
        self._guard(c)
        frac = {"9:16": (9 / 16) / (16 / 9), "1:1": 9 / 16}[aspect]
        if cx is None:
            cx = self._shot(c["shot"]).face_center()[0] if c.get("shot") else 0.5
        cx = min(max(cx, frac / 2), 1 - frac / 2)
        self._set_op(c, {"op": "crop", "aspect": aspect, "cx": round(cx, 4), "frac": round(frac, 4)})
        self._note(f"crop {cid} {aspect} {cx:.3f}")

    def pip(self, cid, corner="br", size=0.3, shape="round"):
        c = self._c(cid)
        self._guard(c)
        if not c.get("shot"):
            raise OpError(f"{cid} has no host shot to shrink")
        self._set_op(c, {"op": "pip", "corner": corner, "size": size, "shape": shape})
        c["layout"] = "pip"
        self._note(f"pip {cid} {corner} {size}")

    def hide(self, cid, by="card"):
        c = self._c(cid)
        self._guard(c)
        c["ops"] = [{"op": "hide", "by": by}]
        c["layout"] = "hidden"
        c["shot"], c["plate"], c["src"] = None, None, None
        self._note(f"hide {cid} {by}")

    def show(self, cid, shot_id):
        c = self._c(cid)
        self._guard(c)
        c["ops"] = []
        c["layout"] = "full"
        self.swap(cid, shot_id)

    def reverse(self, cid, force=False):
        c = self._c(cid)
        self._guard(c)
        rv = self._shot(c["shot"])["edit"].get("reversible", "no")
        if rv == "no" and not force:
            raise OpError(f"{c['shot']} is tagged reversible=no")
        if any(o["op"] == "reverse" for o in c.get("ops", [])):
            self._drop_op(c, "reverse")
        else:
            c["ops"] = [{"op": "reverse"}] + c.get("ops", [])
        self._note(f"reverse {cid}")

    def speed(self, cid, rate):
        if not 0.85 <= rate <= 1.15:
            raise OpError("speed limited to 0.85–1.15 (beyond that motion looks unnatural)")
        c = self._c(cid)
        self._guard(c)
        L = c["rec"]["out"] - c["rec"]["in"]
        s = self._shot(c["shot"])
        need = L * rate
        if c["src"]["in"] + need > s["src"]["out"] + 1e-6:
            raise OpError("not enough source for this speed")
        c["src"]["out"] = round(c["src"]["in"] + need, 3)
        self._set_op(c, {"op": "speed", "rate": rate})
        self._note(f"speed {cid} {rate}")

    def split(self, cid, at, s2=None):
        """Split a host clip at record time `at` → a jump cut; the second half gets a scale change (default 1.10)."""
        c = self._c(cid)
        self._guard(c)
        if not c["rec"]["in"] + 0.8 <= at <= c["rec"]["out"] - 0.8:
            raise OpError("split point must leave ≥0.8 s on both sides")
        i = self.host.index(c)
        a, b = copy.deepcopy(c), copy.deepcopy(c)
        a["rec"]["out"] = b["rec"]["in"] = round(at, 3)
        if c.get("src"):
            d = at - c["rec"]["in"]
            a["src"]["out"] = b["src"]["in"] = round(c["src"]["in"] + d, 3)
        b["id"] = c["id"] + "b"
        b["transition_in"] = "zoomcut"
        self.host[i:i + 1] = [a, b]
        if c.get("shot"):
            cur = next((o["s"] for o in a.get("ops", []) if o["op"] == "scale"), 1.0)
            self.scale(b["id"], s2 or (1.0 if cur > 1.0 else min(1.10, self._shot(c["shot"])["edit"].get("scale_max", 1.0))))
        self._note(f"split {cid} {at}")

    def order(self, cids):
        """Permute shot assignments across slots: the shot of cids[0] moves to cids[1]'s slot, … (rotation)."""
        cl = [self._c(x) for x in cids]
        for c in cl:
            self._guard(c)
        payload = [(c.get("shot"), c.get("src"), [o for o in c.get("ops", []) if o["op"] in ("reverse", "speed", "crop")]) for c in cl]
        rot = payload[-1:] + payload[:-1]
        for c, (shot, src, tops) in zip(cl, rot):
            if shot is None:
                self.hide(c["id"], "card")
                continue
            L = c["rec"]["out"] - c["rec"]["in"]
            s = self._shot(shot)
            off = src["in"] - s["src"]["in"]
            off = max(0.0, min(off, s.dur - L))
            if s.dur + 1e-6 < L:
                raise OpError(f"order: {shot} too short for slot {c['id']}")
            c.update(shot=shot, plate=s["plate"], src={"in": round(s["src"]["in"] + off, 3), "out": round(s["src"]["in"] + off + L, 3)})
            c["ops"] = tops + [o for o in c.get("ops", []) if o["op"] in ("scale", "pip")]
            if c["layout"] == "hidden":
                c["layout"] = "full"
        self._note("order " + ",".join(cids))

    def transition(self, cid, kind):
        if kind not in ("cut", "zoomcut", "broll_fade", "mgwipe", "dip"):
            raise OpError(f"unknown transition {kind}")
        self._c(cid)["transition_in"] = kind
        self._note(f"transition {cid} {kind}")

    def mg(self, a, b, template, zone="lower_third", asset=None, text=""):
        self.d.setdefault("mg", []).append({"id": f"m{len(self.d['mg']) + 1:02d}", "template": template, "asset": asset,
                                            "rec": {"in": float(a), "out": float(b)}, "zone": zone, "text": text})
        self._note(f"mg {a}-{b} {template} {zone}")

    def broll(self, a, b, query):
        self.d.setdefault("broll", []).append({"id": f"r{len(self.d['broll']) + 1:02d}", "query": query, "rec": {"in": float(a), "out": float(b)}, "status": "to_source"})
        for c in self.host:
            if c["rec"]["in"] >= a - 0.05 and c["rec"]["out"] <= b + 0.05:
                self.hide(c["id"], "broll:" + query)
        self._note(f"broll {a}-{b} {query}")

    def lock(self, cid):
        self._c(cid)["locked"] = True
        self._note(f"lock {cid}")

    # ------------------------------------------------------------------ string ops
    def apply(self, ops):
        for line in ops:
            p = line.split()
            if not p or p[0].startswith("#"):
                continue
            cmd, args = p[0], p[1:]
            if cmd == "swap":
                self.swap(args[0], args[1], float(args[2]) if len(args) > 2 else None)
            elif cmd in ("scale", "punch"):
                self.scale(args[0], float(args[1]) if len(args) > 1 else 1.15)
            elif cmd == "crop":
                self.crop(args[0], args[1] if len(args) > 1 else "9:16", float(args[2]) if len(args) > 2 else None)
            elif cmd == "pip":
                self.pip(args[0], args[1] if len(args) > 1 else "br", float(args[2]) if len(args) > 2 else 0.3)
            elif cmd == "hide":
                self.hide(args[0], args[1] if len(args) > 1 else "card")
            elif cmd == "show":
                self.show(args[0], args[1])
            elif cmd == "reverse":
                self.reverse(args[0], force="force" in args)
            elif cmd == "speed":
                self.speed(args[0], float(args[1]))
            elif cmd == "split":
                self.split(args[0], float(args[1]))
            elif cmd == "order":
                self.order(args[0].split(","))
            elif cmd == "transition":
                self.transition(args[0], args[1])
            elif cmd == "mg":
                self.mg(float(args[0]), float(args[1]), args[2], args[3] if len(args) > 3 else "lower_third", text=" ".join(args[4:]))
            elif cmd == "broll":
                self.broll(float(args[0]), float(args[1]), " ".join(args[2:]))
            elif cmd == "lock":
                self.lock(args[0])
            else:
                raise OpError(f"unknown op '{cmd}'")
        return self

    # ------------------------------------------------------------------ review helpers
    def summary(self):
        rows = []
        for c in self.host:
            ops = ",".join(_fmt_op(o) for o in c.get("ops", []))
            src = f"{c['src']['in']:6.2f}-{c['src']['out']:6.2f}" if c.get("src") else "      —      "
            rows.append(f"{c['id']:>5} {c['rec']['in']:6.2f}-{c['rec']['out']:6.2f}  {c['layout']:<6} {str(c.get('shot') or '—'):<9} {src}  "
                        f"{c.get('transition_in', ''):<10} {ops}")
        return "\n".join(rows)


def _fmt_op(o):
    if o["op"] == "scale":
        return f"scale{o['s']}"
    if o["op"] == "crop":
        return f"crop{o['aspect']}@{o['cx']}"
    if o["op"] == "pip":
        return f"pip:{o['corner']}{o['size']}"
    if o["op"] == "hide":
        return f"hide:{o['by']}"
    if o["op"] == "speed":
        return f"speed{o['rate']}"
    return o["op"]


def diff(a, b):
    A = {c["id"]: c for c in a.host}
    B = {c["id"]: c for c in b.host}
    out = []
    for k in sorted(set(A) | set(B)):
        ca, cb = A.get(k), B.get(k)
        if ca is None:
            out.append(f"+ {k} {cb.get('shot')} {cb['layout']}")
        elif cb is None:
            out.append(f"- {k}")
        else:
            ch = []
            for f in ("shot", "layout", "transition_in"):
                if ca.get(f) != cb.get(f):
                    ch.append(f"{f}: {ca.get(f)} → {cb.get(f)}")
            oa = ",".join(_fmt_op(o) for o in ca.get("ops", []))
            ob = ",".join(_fmt_op(o) for o in cb.get("ops", []))
            if oa != ob:
                ch.append(f"ops: [{oa}] → [{ob}]")
            if ch:
                out.append(f"~ {k} " + "; ".join(ch))
    return out
