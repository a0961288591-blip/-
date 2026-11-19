"""istream — 高级无限流 command line.

  python -m istream schema --write                      regenerate schema/*.json + schema/TAGS.md from vocab.py
  python -m istream identity set|show|restore            user photo → identity + GENERATE_PACK.md (meta plates first)
  python -m istream prompts build|verify|refresh|overlay        prompt library → PROMPT_LIBRARY.md / prompts-only.txt / new refresh plates
                                                                 overlay: --plate K02 --negative [--gesture] [--compact]
  python -m istream catalog build-spec|validate|stats|merge-review
  python -m istream slice VIDEO --id P01 --out draft.json [--sheet sheet.jpg]      (needs numpy; OpenCV optional)
  python -m istream plan SCRIPT.md --cat plates.json [--cat …] [--align a.json] [--aspect 16:9] [--profile auto] --out timeline.json
  python -m istream edit timeline.json --cat … --op "swap c05 K02_s1" --op "punch c07 1.15" --out edited.json
  python -m istream qc timeline.json --cat …
  python -m istream lipsync plan|run timeline.json --cat … --out jobs.json
  python -m istream render timeline.json --cat … --jobs jobs.json --workdir build/ --out final.mp4 [--scale 0.5]
  python -m istream cost timeline.json --cat … --jobs jobs.json
  python -m istream ledger record timeline.json --ledger ledger.json
"""
import argparse
import glob
import json
import os
import sys

from . import catalog as catm
from . import cost as costm
from . import lipsync as lsm
from . import identity as idm
from . import prompts as pm
from . import qc as qcm
from . import schema as schm
from .planner import Planner
from .script import load_script
from .timeline import Timeline, diff

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _cat(paths):
    pairs = []
    for p in paths:
        if ":" in p and not os.path.exists(p):
            a, b = p.split(":", 1)
        else:
            a, b = p, os.path.join(os.path.dirname(p), "shots.json")
        pairs.append((a, b))
    return catm.Catalog.load_many(pairs)


def _dump(obj, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def _write(text, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def cmd_schema(a):
    schm.write_all(ROOT)
    print("wrote schema/shot.schema.json, schema/timeline.schema.json, schema/TAGS.md")


def cmd_prompts(a):
    lib = pm.load(a.library)
    if a.action == "verify":
        bad = pm.verify_frozen(lib)
        print("frozen plates recompose byte-for-byte: " + ("OK (K01–K03 × EN/ZH)" if not bad else f"MISMATCH {bad}"))
        sys.exit(1 if bad else 0)
    if a.action == "build":
        _write(pm.build_md(lib), os.path.join(ROOT, "prompts", "PROMPT_LIBRARY.md"))
        _write(pm.build_txt(lib), os.path.join(ROOT, "prompts", "prompts-only.txt"))
        print("wrote prompts/PROMPT_LIBRARY.md, prompts/prompts-only.txt")
    if a.action == "overlay":
        # copy-time patches (docs/HUMAN_PREMIUM.md, docs/GESTURE_EXPRESSION.md) — library.json and frozen K01–K03 stay untouched.
        # --overlay takes a comma list applied in order; --gesture stacks gesture_expression on top (and unlocks K04/K05).
        names = [n.strip() for n in a.overlay.split(",") if n.strip()]
        if a.gesture and "gesture_expression" not in names:
            names.append("gesture_expression")
        try:
            ov = pm.load_overlays(names)
        except KeyError as e:
            sys.exit(f"overlay '{e.args[0]}' not found in prompts/overlays/")
        label = "+".join(names)
        if a.plate and a.plate not in pm.with_overlay_plates(lib, ov)["plates"]:
            sys.exit(f"plate {a.plate} not found (K04/K05 are overlay plates: add --gesture)")
        langs = ["en", "zh"] if a.lang == "both" else [a.lang]
        out = []
        for lang in langs:
            if a.first_frame:
                out.append(f"--- {a.first_frame} · {lang} · overlay {label}\n" + pm.first_frame_overlay(lib, a.first_frame, lang, ov))
            if a.plate:
                tag = f"{a.plate}{' part ' + a.part if a.part else ''} · {lang} · overlay {label}{' · compact' if a.compact else ''}{' · +style' if a.style else ''}"
                out.append(f"--- {tag}\n" + pm.compose_overlay(lib, a.plate, lang, ov, part=a.part, style=a.style, compact=a.compact))
                if a.negative:
                    out.append(f"--- Negative ({lang})\n" + ("Negative: " + pm.negative_overlay(lib, a.plate, ov, short=a.compact) if lang == "en"
                                                         else "负面：" + pm.negative_overlay(lib, a.plate, ov, short=a.compact, lang="zh")))
        if not out:
            sys.exit("give --plate K01 and/or --first-frame IMG-A")
        text = "\n\n".join(out) + "\n"
        if a.out_text:
            _write(text, a.out_text)
            print("wrote", a.out_text)
        else:
            print(text)
    if a.action == "refresh":
        new = pm.refresh(lib, n=a.n, seed=a.seed, framing=a.framing, start_index=a.start)
        lib2 = dict(lib, plates=dict(lib["plates"], **new))
        out = {"plates": {k: dict(v, prompt_en=pm.compose(lib2, k, "en"), prompt_zh=pm.compose(lib2, k, "zh")) for k, v in new.items()},
               "spec_shots": [s for k in new for s in pm.spec_shots(lib2, k)]}
        _dump(out, a.out)
        print(f"wrote {len(new)} refresh plates → {a.out}")


def cmd_catalog(a):
    if a.action == "build-spec":
        lib = pm.load(a.library)
        name, note = "spec", "expected tags from prompts/library.json — verify after generation (provenance=spec)"
        ids = list(lib["plates"])
        if a.overlay:
            # e.g. --overlay gesture_expression: K04/K05 added, patched K01–K03 tags; catalog/spec itself is never touched
            try:
                ovs = pm.load_overlays(a.overlay)
            except KeyError as e:
                sys.exit(f"overlay '{e.args[0]}' not found in prompts/overlays/")
            own = pm.overlay_plate_ids(ovs)
            lib = pm.overlay_catalog_lib(lib, ovs)
            ids = own if a.only_overlay else ids + own
            name = "spec+" + a.overlay.replace(",", "+")
            note = (f"expected tags for plates generated WITH overlay {a.overlay} (prompts overlay --gesture); "
                    "待验证 — re-tag after generation (provenance=spec)")
        plates = [pm.plate_record(lib, k) for k in ids]
        if a.overlay:
            for r in plates:
                if r["id"] in own:
                    r["prompt_ref"] = f"prompts/overlays/{a.overlay.split(',')[-1]}.json#plates.{r['id']}"
                r["prompt_ref"] += f" + overlay {a.overlay}"
        shots = [s for k in ids for s in pm.spec_shots(lib, k)]
        _dump({"catalog": name, "note": note, "plates": plates}, os.path.join(a.out, "plates.json"))
        _dump({"shots": shots}, os.path.join(a.out, "shots.json"))
        print(f"spec catalog: {len(plates)} plates, {len(shots)} shots → {a.out}")
        return
    if a.action == "merge-review":
        shots = []
        for d in a.draft:
            with open(d, encoding="utf-8") as f:
                shots += json.load(f)["shots"]
        with open(a.review, encoding="utf-8") as f:
            rv = json.load(f)
        by = {s["id"]: s for s in shots}
        for sid, patch in rv["shots"].items():
            _deep(by[sid], patch)
            by[sid]["provenance"] = "reviewed"
            by[sid].pop("needs_review", None)
        _dump({"catalog": rv.get("catalog", "reviewed"), "plates": rv["plates"]}, os.path.join(a.out, "plates.json"))
        _dump({"shots": [by[k] for k in sorted(by)]}, os.path.join(a.out, "shots.json"))
        print(f"merged {len(rv['shots'])} reviews into {len(by)} shots → {a.out}")
        return
    cat = _cat(a.cat)
    if a.action == "validate":
        errs = cat.validate()
        print("catalog OK" if not errs else "\n".join(errs))
        sys.exit(1 if errs else 0)
    if a.action == "stats":
        st = cat.stats()
        st["variants_after_ops"] = cat.variant_count()
        print(json.dumps(st, ensure_ascii=False, indent=1))


def _deep(dst, patch):
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep(dst[k], v)
        else:
            dst[k] = v


def cmd_slice(a):
    from . import slicer
    an = slicer.analyze(a.video)
    shots = slicer.propose(an, a.id, min_len=a.min_len, max_len=a.max_len, aspect=a.aspect)
    _dump({"analysis": {k: v for k, v in an.items() if k != "motion"}, "shots": shots}, a.out)
    print(f"{a.id}: {len(shots)} shots, cuts {an['cuts_s']}, dissolves {an['dissolves']}, overlays {an['overlays']}, gestures_in_zone {an['gestures_in_zone']}")
    if a.sheet:
        slicer.contact_sheet(a.video, shots, a.sheet)
        print("contact sheet:", a.sheet)


def cmd_plan(a):
    cat = _cat(a.cat)
    meta, beats, warns = load_script(a.script, a.align, rate=a.rate)
    for w in warns:
        print("script warning:", w)
    aspect = a.aspect or meta.get("aspect", "16:9")
    prof = a.profile if a.profile != "auto" else meta.get("profile") or ("short" if meta["duration"] <= 120 else "long")
    mglib = {}
    if a.mg_library or meta.get("mg_library"):
        p = a.mg_library or os.path.join(os.path.dirname(a.script), meta["mg_library"])
        with open(p, encoding="utf-8") as f:
            mglib = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    size = tuple(int(x) for x in a.size.split("x")) if a.size else None
    ledger = catm.Ledger(a.ledger) if a.ledger else None
    pl = Planner(cat, aspect=aspect, profile=prof, seed=a.seed, ledger=ledger, mg_library=mglib, size=size, auto_mg=not a.no_auto_mg)
    if meta.get("vo") and not os.path.isabs(meta["vo"]):
        meta["vo"] = os.path.relpath(os.path.join(os.path.dirname(os.path.abspath(a.script)), meta["vo"]), os.path.dirname(os.path.abspath(a.out)))
    tl = pl.plan(meta, beats)
    for m in tl["mg"]:
        if m.get("asset") and not os.path.isabs(m["asset"]):
            base = os.path.dirname(os.path.abspath(a.mg_library or os.path.join(os.path.dirname(a.script), meta.get("mg_library", "x"))))
            m["asset"] = os.path.relpath(os.path.join(base, m["asset"]), os.path.dirname(os.path.abspath(a.out)))
    _dump(tl, a.out)
    T = Timeline(tl, cat)
    print(f"planned {len(tl['host'])} clips, {len(tl['mg'])} MG, {len(tl['captions'])} captions · {tl['meta']['duration']}s · profile {prof} · {aspect}"
          + (f" · VO delayed {tl['meta']['vo_offset']}s for the opening" if tl['meta'].get('vo_offset') else ""))
    print(T.summary())
    for w in pl.warnings:
        print("planner warning:", w)


def cmd_edit(a):
    cat = _cat(a.cat)
    tl = Timeline.load(a.timeline, cat)
    before = tl.copy()
    ops = list(a.op or [])
    if a.ops_file:
        with open(a.ops_file, encoding="utf-8") as f:
            ops += [l.strip() for l in f if l.strip() and not l.startswith("#")]
    tl.apply(ops)
    tl.save(a.out)
    print("\n".join(diff(before, tl)) or "(no change)")


def cmd_qc(a):
    cat = _cat(a.cat)
    with open(a.timeline, encoding="utf-8") as f:
        tl = json.load(f)
    F, M = qcm.run(tl, cat)
    rep = qcm.report(F, M)
    print(rep)
    if a.out:
        _write(rep + "\n", a.out)
    sys.exit(1 if any(f["sev"] == "FAIL" for f in F) and a.strict else 0)


def cmd_lipsync(a):
    cat = _cat(a.cat)
    with open(a.timeline, encoding="utf-8") as f:
        tl = json.load(f)
    if a.action == "plan":
        policy = None
        if a.policy:
            with open(a.policy, encoding="utf-8") as f:
                policy = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
        jobs = lsm.make_jobs(tl, cat, policy, engine_override=a.engine)
        _dump(jobs, a.out)
        print(lsm.jobs_report(jobs))
    else:
        with open(a.jobs, encoding="utf-8") as f:
            jobs = json.load(f)
        for j in jobs["jobs"]:
            try:
                r = lsm.run_job(j, a.workdir, a.engine)
                print(j["id"], "→", r["output"], "(UNSYNCED passthrough)" if not r["synced"] else "")
            except lsm.NotConfigured as e:
                print(j["id"], "NOT RUN:", e)


def cmd_render(a):
    from .render import Renderer
    cat = _cat(a.cat)
    with open(a.timeline, encoding="utf-8") as f:
        tl = json.load(f)
    with open(a.jobs, encoding="utf-8") as f:
        jobs = json.load(f)
    r = Renderer(tl, cat, a.workdir, scale=a.scale, base_dir=os.path.dirname(os.path.abspath(a.timeline)), workers=a.workers, crf=a.crf)
    if a.stage in ("all", "inputs"):
        r.stage_lipsync_inputs(jobs)
        print("stage A: lip-sync inputs →", os.path.join(a.workdir, "lipsync/in"))
    if a.stage == "all":
        for j in jobs["jobs"]:
            try:
                lsm.run_job(j, a.workdir, a.engine)
            except lsm.NotConfigured as e:
                print(j["id"], "NOT RUN:", e)
        print(f"stage B: lip-sync via '{a.engine}'" + (" — UNSYNCED preview (mouths not corrected)" if a.engine == "passthrough" else ""))
    if a.stage in ("all", "composite"):
        r.stage_composite(jobs, a.out, captions=not a.no_captions, mg=not a.no_mg, grain=a.grain)
        print("stage C: composite →", a.out)


def cmd_cost(a):
    cat = _cat(a.cat)
    with open(a.jobs, encoding="utf-8") as f:
        jobs = json.load(f)
    secs, capex = costm.plate_capex(cat.plates.values())
    c = costm.video_cost(jobs, a.lifetime, capex)
    rep = costm.report(c, jobs, secs, capex, a.lifetime)
    print(rep)
    if a.out:
        _write(rep + "\n", a.out)


def cmd_ledger(a):
    with open(a.timeline, encoding="utf-8") as f:
        tl = json.load(f)
    L = catm.Ledger(a.ledger)
    L.record([c["shot"] for c in tl["host"] if c.get("shot")])
    L.save()
    print("ledger updated:", a.ledger, "· retire candidates:", L.retire_candidates(a.retire_at))


def cmd_identity(a):
    if a.action == "set":
        if not a.photo:
            raise SystemExit("identity set requires --photo PATH")
        r = idm.set_identity(
            ROOT,
            a.photo,
            slug=a.id or "user",
            name=a.name,
            outfit=a.outfit,
            describe=a.describe,
            out_dir=a.out_dir,
            library_path=a.library,
        )
        print("identity set →", r["meta"]["slug"])
        print("photo:", r["meta"]["photo_rel"])
        print("frozen_check:", r["meta"]["frozen_check"])
        for p in r["written"]:
            print("wrote", os.path.relpath(p, ROOT) if p.startswith(ROOT) else p)
        return
    if a.action == "show":
        print(idm.show_identity(ROOT, a.library), end="")
        return
    if a.action == "restore":
        r = idm.restore_identity(ROOT, a.library)
        print("identity restored to shipped default")
        print("prompts verify:", "OK" if r["verify_ok"] else f"MISMATCH {r['verify_frozen']}")
        for p in r["written"]:
            print("wrote", os.path.relpath(p, ROOT) if p.startswith(ROOT) else p)



def main(argv=None):
    ap = argparse.ArgumentParser(prog="istream", description="高级无限流 · Advanced Infinite Stream toolkit")
    sp = ap.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("schema")
    s.add_argument("--write", action="store_true")
    s.set_defaults(fn=cmd_schema)
    s = sp.add_parser("identity", help="user photo → digital-human identity + GENERATE_PACK (meta plates)")
    s.add_argument("action", choices=["set", "show", "restore"])
    s.add_argument("--photo", help="path to reference photo (required for set)")
    s.add_argument("--id", dest="id", default="user", help="identity slug (default: user)")
    s.add_argument("--name", default=None, help="optional display name — never invent gender/age")
    s.add_argument("--outfit", default=None, help="optional outfit lock text")
    s.add_argument("--describe", default=None, help="optional appearance lock (EN or ZH); no auto face analysis")
    s.add_argument("--out-dir", default=None, help="optional extra directory for GENERATE_PACK.md")
    s.add_argument("--library", default=os.path.join(ROOT, "prompts", "library.json"))
    s.set_defaults(fn=cmd_identity)
    s = sp.add_parser("prompts")
    s.add_argument("action", choices=["build", "verify", "refresh", "overlay"])
    s.add_argument("--library", default=os.path.join(ROOT, "prompts", "library.json"))
    s.add_argument("--overlay", default="human_premium", help="overlay name in prompts/overlays/ (overlay action)")
    s.add_argument("--plate", help="plate id for the overlay action, e.g. K01")
    s.add_argument("--first-frame", help="first-frame id for the overlay action, e.g. IMG-A")
    s.add_argument("--lang", default="both", choices=["en", "zh", "both"])
    s.add_argument("--part", choices=["A", "B"], help="60 s plates: chain part")
    s.add_argument("--style", action="store_true", help="also add the optional premium-natural style line")
    s.add_argument("--compact", action="store_true", help="short patches + short negative list (tight prompt limits)")
    s.add_argument("--negative", action="store_true", help="also print the plate negative + overlay extras")
    s.add_argument("--gesture", action="store_true", help="stack the gesture_expression overlay (docs/GESTURE_EXPRESSION.md); unlocks K04/K05")
    s.add_argument("--out-text", help="write overlay output to this file instead of stdout")
    s.add_argument("--n", type=int, default=4)
    s.add_argument("--seed", type=int, default=1)
    s.add_argument("--start", type=int, default=1)
    s.add_argument("--framing", default="mcu")
    s.add_argument("--out", default=os.path.join(ROOT, "prompts", "refresh.json"))
    s.set_defaults(fn=cmd_prompts)
    s = sp.add_parser("catalog")
    s.add_argument("action", choices=["build-spec", "validate", "stats", "merge-review"])
    s.add_argument("--library", default=os.path.join(ROOT, "prompts", "library.json"))
    s.add_argument("--overlay", default=None, help="build-spec: include overlay plates + patched tags, e.g. gesture_expression")
    s.add_argument("--only-overlay", action="store_true", help="build-spec: only the overlay-defined plates (K04/K05)")
    s.add_argument("--cat", action="append", default=[])
    s.add_argument("--draft", nargs="*", default=[])
    s.add_argument("--review")
    s.add_argument("--out")
    s.set_defaults(fn=cmd_catalog)
    s = sp.add_parser("slice")
    s.add_argument("video")
    s.add_argument("--id", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--sheet")
    s.add_argument("--aspect", default="16:9")
    s.add_argument("--min-len", type=float, default=3.0)
    s.add_argument("--max-len", type=float, default=9.0)
    s.set_defaults(fn=cmd_slice)
    s = sp.add_parser("plan")
    s.add_argument("script")
    s.add_argument("--cat", action="append", required=True)
    s.add_argument("--align")
    s.add_argument("--aspect")
    s.add_argument("--profile", default="auto", choices=["auto", "short", "long"])
    s.add_argument("--seed", type=int, default=7)
    s.add_argument("--rate", type=float, default=5.0, help="estimated Mandarin chars/s when no alignment is given")
    s.add_argument("--ledger")
    s.add_argument("--mg-library")
    s.add_argument("--size")
    s.add_argument("--no-auto-mg", action="store_true")
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_plan)
    s = sp.add_parser("edit")
    s.add_argument("timeline")
    s.add_argument("--cat", action="append", required=True)
    s.add_argument("--op", action="append")
    s.add_argument("--ops-file")
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_edit)
    s = sp.add_parser("qc")
    s.add_argument("timeline")
    s.add_argument("--cat", action="append", required=True)
    s.add_argument("--out")
    s.add_argument("--strict", action="store_true")
    s.set_defaults(fn=cmd_qc)
    s = sp.add_parser("lipsync")
    s.add_argument("action", choices=["plan", "run"])
    s.add_argument("timeline")
    s.add_argument("--cat", action="append", required=True)
    s.add_argument("--policy")
    s.add_argument("--engine")
    s.add_argument("--jobs")
    s.add_argument("--workdir", default="build")
    s.add_argument("--out")
    s.set_defaults(fn=cmd_lipsync)
    s = sp.add_parser("render")
    s.add_argument("timeline")
    s.add_argument("--cat", action="append", required=True)
    s.add_argument("--jobs", required=True)
    s.add_argument("--workdir", default="build")
    s.add_argument("--out", required=True)
    s.add_argument("--scale", type=float, default=1.0)
    s.add_argument("--stage", default="all", choices=["all", "inputs", "composite"])
    s.add_argument("--engine", default="passthrough")
    s.add_argument("--workers", type=int, default=4)
    s.add_argument("--crf", type=int, default=20)
    s.add_argument("--no-captions", action="store_true")
    s.add_argument("--no-mg", action="store_true")
    s.add_argument("--grain", type=int, default=0, help="uniform fine grain on the host layer after lip-sync (2–4 recommended; 0 = off)")
    s.set_defaults(fn=cmd_render)
    s = sp.add_parser("cost")
    s.add_argument("timeline")
    s.add_argument("--cat", action="append", required=True)
    s.add_argument("--jobs", required=True)
    s.add_argument("--lifetime", type=float, default=300.0, help="finished minutes the plate library will serve")
    s.add_argument("--out")
    s.set_defaults(fn=cmd_cost)
    s = sp.add_parser("ledger")
    s.add_argument("action", choices=["record"])
    s.add_argument("timeline")
    s.add_argument("--ledger", required=True)
    s.add_argument("--retire-at", type=int, default=40)
    s.set_defaults(fn=cmd_ledger)
    a = ap.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
