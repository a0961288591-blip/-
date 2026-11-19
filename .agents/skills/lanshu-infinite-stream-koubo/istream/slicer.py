"""Plate slicer + auto-tagger (needs numpy; OpenCV optional for the contact sheet and connected components).

Measures what a machine can measure honestly — cuts, dissolves, side overlays, motion holds, speech pauses, face box/size,
hands near the face, jaw activity — and proposes shot units. Semantic tags (emotion, gesture names, roles) are drafted
from heuristics and flagged `needs_review`; finish them with the VLM tagging prompt (prompts/PROMPT_LIBRARY.md §T) or by eye.
"""
import json
import re
import subprocess

import numpy as np

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None


def _probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration",
                          "-of", "json", path], capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    st = j["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return int(st["width"]), int(st["height"]), float(num) / float(den), float(j["format"]["duration"])


def _frames(path, w, h, pix="rgb24"):
    ch = 3 if pix == "rgb24" else 1
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={w}:{h}:flags=area", "-f", "rawvideo", "-pix_fmt", pix, "-"],
                       capture_output=True, check=True)
    a = np.frombuffer(p.stdout, np.uint8)
    return a.reshape(-1, h, w, ch) if ch == 3 else a.reshape(-1, h, w)


def _silences(path, noise_db=-32, min_d=0.18):
    p = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af", f"silencedetect=noise={noise_db}dB:d={min_d}", "-f", "null", "-"],
                       capture_output=True, text=True)
    st = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", p.stderr)]
    en = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", p.stderr)]
    if len(en) < len(st):
        en.append(1e9)
    return list(zip(st, en))


def _runs(mask, min_len):
    out, s = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and s is None:
            s = i
        elif not m and s is not None:
            if i - s >= min_len:
                out.append((s, i))
            s = None
    return out


def _skin(rgb):
    r, g, b = rgb[..., 0].astype(np.int16), rgb[..., 1].astype(np.int16), rgb[..., 2].astype(np.int16)
    return ((r - b) > 18) & (r > 95) & ((r - g) > 4)


def _face_box(rgb):
    """Face ≈ the skin component that reaches highest in the frame, clipped to a face-like aspect."""
    m = _skin(rgb).astype(np.uint8)
    H, W = m.shape
    if cv2 is not None:
        n, lab, stt, _ = cv2.connectedComponentsWithStats(m)
        best = None
        for j in range(1, n):
            x, y, w, h, a = stt[j]
            if a < 0.002 * W * H:
                continue
            if best is None or y < best[1]:
                best = (x, y, w, h, j)
        if best is None:
            return None, m, None
        x, y, w, h, j = best
        comp = lab == j
    else:
        ys, xs = np.nonzero(m)
        if len(ys) == 0:
            return None, m, None
        y = ys.min()
        comp = m.astype(bool)
        x, w = xs.min(), xs.max() - xs.min()
    rows = np.nonzero(comp.any(axis=1))[0]
    top = rows.min()
    # face width = median skin width over the first rows of the component
    widths = []
    for r in range(top, min(H, top + max(4, int(0.25 * H)))):
        xs_ = np.nonzero(comp[r])[0]
        if len(xs_):
            widths.append((xs_.min(), xs_.max()))
    if not widths:
        return None, m, comp
    xs0 = np.median([a for a, b in widths])
    xs1 = np.median([b for a, b in widths])
    fw = max(4.0, xs1 - xs0)
    fh = fw * 1.35
    return (float(xs0), float(top), float(fw), float(fh)), m, comp


def analyze(path, step_s=0.5):
    W, H, fps, dur = _probe(path)
    g = _frames(path, 160, 90, "gray").astype(np.float32)
    n = len(g)
    dl = np.r_[0, np.abs(np.diff(g[:, :, :80], axis=0)).mean(axis=(1, 2))]
    dr = np.r_[0, np.abs(np.diff(g[:, :, 80:], axis=0)).mean(axis=(1, 2))]
    d = (dl + dr) / 2
    dmin = np.minimum(dl, dr)
    gx = np.abs(np.diff(g, axis=2))
    el, er = gx[:, :, :79].mean(axis=(1, 2)), gx[:, :, 80:].mean(axis=(1, 2))
    med = float(np.median(d[1:])) or 0.5
    mmin = float(np.median(dmin[1:])) or 0.3
    w = int(0.4 * fps)

    def setup_change(i0, i1):
        """both halves' edge density differ before vs after → the camera setup changed (not an overlay, not a gesture)"""
        a0, a1 = max(0, i0 - w), max(1, i0)
        b0, b1 = min(n - 1, i1), min(n, i1 + w)
        if a1 <= a0 or b1 <= b0:
            return False
        def ch(e):
            x, y = float(e[a0:a1].mean()), float(e[b0:b1].mean())
            return abs(x - y) / (max(x, y) + 1e-6) > 0.25 and abs(x - y) > 1.0
        return ch(el) or ch(er) if (ch(el) and ch(er)) else False

    cuts, dissolves = [], []
    for i in range(1, n):
        if dmin[i] > max(20.0, 8 * mmin) and setup_change(i, i):
            cuts.append(i)
    for a, b in _runs(dmin > max(1.5, 3 * mmin), int(0.2 * fps)):
        if b - a <= 1.5 * fps and setup_change(a, b):
            dissolves.append((a / fps, b / fps))
            cuts = [c for c in cuts if not (a - 2 <= c <= b + 2)]
    # camera setups = intervals between cuts / dissolves
    bounds = sorted([0.0] + [c / fps for c in cuts] + [x for ab in dissolves for x in ab] + [dur])
    setups = [(bounds[k], bounds[k + 1]) for k in range(len(bounds) - 1) if bounds[k + 1] - bounds[k] > 0.5 and not any(abs(bounds[k] - a) < 1e-6 and abs(bounds[k + 1] - b) < 1e-6 for a, b in dissolves)]
    # overlays: one half's edge density departs from that setup's baseline while the other half stays put
    overlays = []
    for sa, sb in setups:
        i0, i1 = int(sa * fps) + 2, int(sb * fps) - 2
        if i1 - i0 < fps:
            continue
        for name, e, other in (("right_half", er, el), ("left_half", el, er)):
            base, obase = float(np.median(e[i0:i1])), float(np.median(other[i0:i1]))
            hot = np.zeros(n, bool)
            hot[i0:i1] = (e[i0:i1] > base * 1.6 + 0.6) & (np.abs(other[i0:i1] - obase) < 0.2 * obase + 0.5)
            for a, b in _runs(hot, int(0.3 * fps)):
                warm = lambda k: e[k] > base * 1.15 + 0.15
                while a > i0 and warm(a - 1):
                    a -= 1
                while b < i1 and warm(b):
                    b += 1
                overlays.append({"type": "baked_overlay", "in": round(max(sa, a / fps - 0.3), 2), "out": round(min(sb, b / fps + 0.1), 2), "zone": name})
    sm = np.convolve(d, np.ones(int(0.2 * fps)) / int(0.2 * fps), mode="same")
    thr = np.percentile(sm, 30)
    holds = [((a + b) / 2 / fps, (b - a) / fps) for a, b in _runs(sm < thr, int(0.2 * fps))]
    rgb = _frames(path, 320, 180, "rgb24")
    # an "overlay" that is mostly skin is the host's own hand entering that half → a gesture, not a defect
    sk = np.stack([_skin(f) for f in rgb[:, ::2, ::2]])
    skin_half = {"right_half": sk[:, :, 80:].mean(axis=(1, 2)), "left_half": sk[:, :, :80].mean(axis=(1, 2))}
    gestures_in_zone, kept = [], []
    for o in overlays:
        sh = skin_half[o["zone"]]
        i0, i1 = int(o["in"] * fps), max(int(o["in"] * fps) + 1, int(o["out"] * fps))
        sa, sb = next(((a, b) for a, b in setups if a - 0.01 <= o["in"] <= b), (0.0, dur))
        base = float(np.median(sh[int(sa * fps):max(int(sa * fps) + 1, int(sb * fps))]))
        if float((sh[i0:i1] > base + 0.008).mean()) > 0.5:
            gestures_in_zone.append({"in": o["in"], "out": o["out"], "zone": o["zone"]})
        else:
            kept.append(o)
    kept.sort(key=lambda o: (o["zone"], o["in"]))
    overlays = []
    for o in kept:
        if overlays and overlays[-1]["zone"] == o["zone"] and o["in"] <= overlays[-1]["out"] + 0.2:
            overlays[-1]["out"] = max(overlays[-1]["out"], o["out"])
        else:
            overlays.append(dict(o))
    faces, hands = [], []
    for i in range(0, len(rgb), max(1, int(step_s * fps))):
        fb, m, comp = _face_box(rgb[i])
        faces.append((i / fps, fb))
        if fb is not None:
            x, y, w_, h = fb
            X0, Y0, X1, Y1 = int(max(0, x - 0.3 * w_)), int(max(0, y)), int(min(320, x + 1.3 * w_)), int(min(180, y + 1.3 * h))
            other = m[Y0:Y1, X0:X1].astype(bool) & ~(comp[Y0:Y1, X0:X1] if comp is not None else False)
            hands.append((i / fps, float(other.mean())))
    sil = _silences(path)
    return {"file": path, "size": [W, H], "fps": fps, "duration": dur, "motion": d.tolist(), "motion_median": med, "cuts_s": [c / fps for c in cuts],
            "dissolves": dissolves, "setups": setups, "holds": holds, "overlays": overlays, "gestures_in_zone": gestures_in_zone,
            "faces": faces, "hands": hands, "silences": sil}


def _speech_frac(sil, a, b):
    s = sum(max(0.0, min(e, b) - max(st, a)) for st, e in sil)
    return 1 - s / max(1e-6, b - a)


def propose(an, plate_id, min_len=3.0, max_len=9.0, aspect="16:9"):
    """Cut each camera setup into shot units at the best hold/pause points (dynamic programming)."""
    shots = []
    for sa, sb in an["setups"]:
        a0, b0 = sa + 0.05, sb - 0.05
        if b0 - a0 < 2.0:
            continue
        cands = [(a0, 3.0), (b0, 3.0)]
        for t, L in an["holds"]:
            if a0 + 0.3 < t < b0 - 0.3:
                sc = min(1.0, L / 0.6) + (1.0 if any(st - 0.05 <= t <= e + 0.05 for st, e in an["silences"]) else 0.0)
                cands.append((t, sc))
        cands.sort()
        pts = [c[0] for c in cands]
        sc = [c[1] for c in cands]
        n = len(pts)
        best = [(-1e9, -1)] * n
        best[0] = (0.0, -1)
        for j in range(1, n):
            for i in range(j):
                L = pts[j] - pts[i]
                if best[i][0] < -1e8 or L < min(min_len, b0 - a0) - 1e-6 or L > max_len:
                    continue
                v = best[i][0] + sc[j] - 0.15 * abs(L - 6.0)
                if v > best[j][0]:
                    best[j] = (v, i)
        j = n - 1
        if best[j][0] < -1e8:          # setup shorter than min_len or no path: keep it whole
            segs = [(a0, b0)]
        else:
            segs = []
            while j > 0:
                segs.append((pts[best[j][1]], pts[j]))
                j = best[j][1]
            segs.reverse()
        for a, b in segs:
            shots.append(tag_shot(an, plate_id, len(shots) + 1, a, b, aspect))
    return shots


def tag_shot(an, plate_id, k, a, b, aspect):
    W, H = an["size"]
    fps = an["fps"]
    mot = np.array(an["motion"][int(a * fps):int(b * fps)])
    fb = [f for t, f in an["faces"] if a <= t <= b and f is not None]
    if fb:
        x, y, w, h = np.median(np.array(fb), axis=0)
        face_box = [round(x / 320, 4), round(y / 180, 4), round(w / 320, 4), round(h / 180, 4)]
        face_h_px = round(h / 180 * H)
        cx = (x + w / 2) / 320
        pos = "left" if cx < 0.38 else ("right" if cx > 0.62 else "center")
    else:
        face_box, face_h_px, pos = None, 0, "center"
    hn = [v for t, v in an["hands"] if a <= t <= b]
    hands_near = bool(hn and max(hn) > 0.12)
    m = float(mot.mean()) if len(mot) else 0.0
    rel = m / max(1e-6, an["motion_median"])
    energy = int(min(5, max(1, round(1 + 1.6 * rel))))
    speech = _speech_frac(an["silences"], a, b)
    defects = []
    for o in an["overlays"]:
        if o["in"] < b and o["out"] > a:
            defects.append({"type": "baked_overlay", "in": round(max(0, o["in"] - a), 2), "out": round(min(b, o["out"]) - a, 2), "zone": o["zone"]})
    gest = [{"g": "palm_present", "t": round(max(0.0, gz["in"] - a), 2), "zone": gz["zone"]} for gz in an.get("gestures_in_zone", []) if gz["in"] < b and gz["out"] > a]
    safe = {"left": ["right_half", "lower_third", "upper_band"], "right": ["left_half", "lower_third", "upper_band"], "center": ["upper_band", "left_strip", "right_strip"]}[pos]
    holds_in = [round(t - a, 2) for t, L in an["holds"] if a + 0.4 < t < b - 0.4]
    return {
        "id": f"{plate_id}_s{k}", "plate": plate_id, "src": {"in": round(a, 3), "out": round(b, 3)},
        "home_in": any(abs(t - a) < 0.15 for t, _ in an["holds"]), "home_out": any(abs(t - b) < 0.15 for t, _ in an["holds"]),
        "camera": {"framing": "ms" if face_box and face_box[3] < 0.22 else "mcu", "aspect": aspect, "angle": "front", "subject_pos": pos,
                   "face_box": face_box, "face_h_px": face_h_px},
        "performance": {"energy": energy, "emotion": "neutral", "gestures": gest, "gaze": "lens", "mouth": "talking" if speech > 0.5 else "closed",
                        "hands": "near_face" if hands_near else "low", "head_motion": "small" if rel < 1.4 else "medium", "speaking": speech > 0.5},
        "edit": {"roles": ["narrate"], "transitions_in": ["cut", "zoomcut", "broll_fade"], "layouts": ["full", "split", "pip"], "position": "any",
                 "scale_max": round(min(1.3, 1.0 + max(0.0, (face_h_px - 140) / 600)), 2), "reversible": "no", "mirror_ok": False,
                 "cut_points": [0.0] + holds_in, "keep_out": []},
        "mg": {"safe_zones": safe},
        "lipsync": {"ready": speech > 0.5 and not hands_near, "jaw": "mid"},
        "quality": {"qc": 3, "defects": defects},
        "usage": {"times_used": 0, "last_used": None},
        "provenance": "measured",
        "needs_review": ["emotion", "gestures", "roles", "gaze", "reversible"],
        "metrics": {"motion_rel": round(rel, 2), "speech_frac": round(speech, 2)},
    }


def contact_sheet(path, shots, out_jpg, cols=3):
    if cv2 is None:
        return None
    W, H, fps, dur = _probe(path)
    tiles = []
    for s in shots:
        row = []
        for t in (s["src"]["in"] + 0.15, (s["src"]["in"] + s["src"]["out"]) / 2, s["src"]["out"] - 0.15):
            p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1", "-vf", "scale=320:-2", "-f", "rawvideo",
                                "-pix_fmt", "bgr24", "-"], capture_output=True, check=True)
            h = len(p.stdout) // (320 * 3)
            im = np.frombuffer(p.stdout, np.uint8).reshape(h, 320, 3).copy()
            fb = s["camera"].get("face_box")
            if fb:
                cv2.rectangle(im, (int(fb[0] * 320), int(fb[1] * h)), (int((fb[0] + fb[2]) * 320), int((fb[1] + fb[3]) * h)), (255, 212, 95), 1)
            cv2.putText(im, f"{s['id']} {t:.2f}s", (5, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
            row.append(im)
        tiles.append(np.hstack(row))
    cv2.imwrite(out_jpg, np.vstack(tiles), [cv2.IMWRITE_JPEG_QUALITY, 82])
    return out_jpg
