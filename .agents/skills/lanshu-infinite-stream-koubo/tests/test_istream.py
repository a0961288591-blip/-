"""Smoke + contract tests (stdlib unittest). Run from the package root:  python3 -m unittest discover -s tests -v

Render tests need ffmpeg; the stand-in render test also needs the project's source/ videos and is skipped without them.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from istream import catalog as catm, lipsync as lsm, prompts as pm, qc as qcm, schema as schm  # noqa: E402
from istream.planner import Planner, _split_caption  # noqa: E402
from istream.script import load_script, parse  # noqa: E402
from istream.timeline import Timeline, OpError, diff  # noqa: E402

SPEC = os.path.join(ROOT, "catalog", "spec", "plates.json")
STANDIN = os.path.join(ROOT, "catalog", "standin", "plates.json")
DEMO = os.path.join(ROOT, "recipes", "demo60")
LONG = os.path.join(ROOT, "recipes", "longform")


def cat(p):
    return catm.Catalog.load_many([(p, os.path.join(os.path.dirname(p), "shots.json"))])


def plan(script, catalog, align=None, aspect=None, seed=7, mg=None):
    meta, beats, _ = load_script(script, align)
    mglib = {}
    if mg:
        with open(mg, encoding="utf-8") as f:
            mglib = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    prof = meta.get("profile") or ("short" if meta["duration"] <= 120 else "long")
    return Planner(catalog, aspect=aspect or meta.get("aspect", "16:9"), profile=prof, seed=seed, mg_library=mglib).plan(meta, beats)


class TestSchemaAndCatalogs(unittest.TestCase):
    def test_catalogs_validate(self):
        for p in (SPEC, STANDIN):
            self.assertEqual(cat(p).validate(), [], p)

    def test_schema_files_match_generator(self):
        with open(os.path.join(ROOT, "schema", "shot.schema.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f), json.loads(json.dumps(schm.shot_schema())))
        with open(os.path.join(ROOT, "schema", "TAGS.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), schm.tags_md())

    def test_spec_catalog_matches_library(self):
        lib = pm.load(os.path.join(ROOT, "prompts", "library.json"))
        want = [s for k in lib["plates"] for s in pm.spec_shots(lib, k)]
        with open(os.path.join(ROOT, "catalog", "spec", "shots.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["shots"], json.loads(json.dumps(want)))


class TestPrompts(unittest.TestCase):
    def test_frozen_plates_recompose_byte_for_byte(self):
        lib = pm.load(os.path.join(ROOT, "prompts", "library.json"))
        self.assertEqual(pm.verify_frozen(lib), [])

    def test_identity_is_one_block(self):
        lib = pm.load(os.path.join(ROOT, "prompts", "library.json"))
        ident = lib["blocks"]["identity"]["en"]
        for pid in lib["plates"]:
            self.assertEqual(pm.compose(lib, pid, "en").count(ident), 1, pid)

    def test_60s_chain_parts(self):
        lib = pm.load(os.path.join(ROOT, "prompts", "library.json"))
        a, b = pm.compose(lib, "L01", "en", "A"), pm.compose(lib, "L01", "en", "B")
        self.assertIn("30-second", a.splitlines()[0])
        self.assertIn("Continue seamlessly", b.splitlines()[1])
        self.assertIn("0–1s:", b)

    def test_refresh_is_lock_compatible(self):
        lib = pm.load(os.path.join(ROOT, "prompts", "library.json"))
        new = pm.refresh(lib, n=3, seed=5)
        self.assertEqual(len(new), 3)
        for p in new.values():
            self.assertEqual(p["lock"], "lock.mcu.916.30")


class TestScript(unittest.TestCase):
    def test_markup(self):
        meta, beats, warns = parse("---\ntitle: t\n---\n# 一\n[开场][钩子][MG: x] 你好，世界。[停顿 0.5]\n因为这样。[重音: 关键] 关键在这里！\n")
        self.assertEqual(meta["title"], "t")
        self.assertEqual(beats[0]["roles"], ["open", "hook"])
        self.assertEqual(beats[0]["mg"], ["x"])
        self.assertAlmostEqual(beats[0]["pause_after"], 0.5)
        self.assertEqual(beats[1]["roles"], ["explain"])
        self.assertEqual(beats[2]["keywords"], ["关键"])
        self.assertEqual(warns, [])

    def test_alignment_maps_all_beats(self):
        meta, beats, _ = load_script(os.path.join(DEMO, "script.md"), os.path.join(DEMO, "align.json"))
        self.assertEqual(len(beats), 17)
        self.assertTrue(all(b["timing"] == "aligned" for b in beats))
        self.assertAlmostEqual(meta["duration"], 56.07, places=2)

    def test_captions_no_leading_punctuation_or_orphans(self):
        for t in ("直到有人给每台机器配上小电机，按流程重排整个车间，效率才真正起飞。", "关注我，明天讲Agent到底怎么用工具。"):
            for part in _split_caption(t, 14):
                self.assertFalse(part[0] in "，、。")
                self.assertGreaterEqual(len(part), 3)


class TestPlannerAndQC(unittest.TestCase):
    def test_demo60_passes_qc_in_both_aspects(self):
        c = cat(STANDIN)
        for aspect in ("16:9", "9:16"):
            tl = plan(os.path.join(DEMO, "script.md"), c, os.path.join(DEMO, "align.json"), aspect, mg=os.path.join(DEMO, "mg_library.json"))
            F, M = qcm.run(tl, c)
            self.assertEqual([f for f in F if f["sev"] == "FAIL"], [], aspect)
            self.assertAlmostEqual(sum(x["rec"]["out"] - x["rec"]["in"] for x in tl["host"]), tl["meta"]["duration"], places=2)

    def test_gesture_lands_on_keyword(self):
        """'MCP就是AI的USB-C' → the palm-present shot P01_s2 is chosen and its palm rises within 0.3 s of 'USB-C'."""
        c = cat(STANDIN)
        tl = plan(os.path.join(DEMO, "script.md"), c, os.path.join(DEMO, "align.json"), "16:9", mg=os.path.join(DEMO, "mg_library.json"))
        kw = 26.05 + 9.6
        clip = next(x for x in tl["host"] if x["rec"]["in"] <= kw < x["rec"]["out"])
        self.assertEqual(clip["shot"], "P01_s2")
        shot = c.shots["P01_s2"]
        g = next(g for g in shot["performance"]["gestures"] if g["g"] == "palm_present")
        t_palm = clip["rec"]["in"] + (shot["src"]["in"] + g["t"] - clip["src"]["in"])
        self.assertLess(abs(t_palm - kw), 0.3)

    def test_9x16_crop_unlocks_defect_shots(self):
        c = cat(STANDIN)
        h = plan(os.path.join(DEMO, "script.md"), c, os.path.join(DEMO, "align.json"), "16:9", mg=os.path.join(DEMO, "mg_library.json"))
        v = plan(os.path.join(DEMO, "script.md"), c, os.path.join(DEMO, "align.json"), "9:16", mg=os.path.join(DEMO, "mg_library.json"))
        used = lambda tl: {x["shot"] for x in tl["host"] if x.get("shot")}
        self.assertFalse({"P02_s4", "P02_s5"} & used(h))
        self.assertTrue({"P02_s4", "P02_s5"} & used(v))

    def test_seed_changes_cut_but_stays_valid(self):
        c = cat(STANDIN)
        a = plan(os.path.join(DEMO, "script.md"), c, os.path.join(DEMO, "align.json"), seed=7, mg=os.path.join(DEMO, "mg_library.json"))
        b = plan(os.path.join(DEMO, "script.md"), c, os.path.join(DEMO, "align.json"), seed=11, mg=os.path.join(DEMO, "mg_library.json"))
        self.assertNotEqual([x.get("shot") for x in a["host"]], [x.get("shot") for x in b["host"]])
        self.assertFalse([f for f in qcm.run(b, c)[0] if f["sev"] == "FAIL"])

    def test_longform_opening_presence(self):
        c = cat(SPEC)
        tl = plan(os.path.join(LONG, "script.md"), c)
        self.assertEqual(tl["meta"]["profile"], "long")
        self.assertGreater(tl["meta"]["duration"], 180)
        self.assertEqual(c.shots[tl["host"][0]["shot"]]["edit"]["position"], "first_only")
        self.assertGreater(tl["meta"]["vo_offset"], 1.0)
        self.assertFalse([f for f in qcm.run(tl, c)[0] if f["sev"] == "FAIL"])

    def test_qc_catches_bad_edits(self):
        c = cat(STANDIN)
        tl = Timeline(plan(os.path.join(DEMO, "script.md"), c, os.path.join(DEMO, "align.json"), mg=os.path.join(DEMO, "mg_library.json")), c)
        first = tl.host[1]["shot"]
        tl.swap(tl.host[2]["id"], first, offset=tl.host[1]["src"]["in"] - c.shots[first]["src"]["in"])
        codes = {f["code"] for f in qcm.run(tl.d, c)[0] if f["sev"] == "FAIL"}
        self.assertIn("repeat", codes)


class TestTimelineOps(unittest.TestCase):
    def setUp(self):
        self.c = cat(STANDIN)
        self.tl = Timeline(plan(os.path.join(DEMO, "script.md"), self.c, os.path.join(DEMO, "align.json"), mg=os.path.join(DEMO, "mg_library.json")), self.c)

    def test_ops_and_diff(self):
        before = self.tl.copy()
        self.tl.apply(["punch c09 1.15", "hide c13 card", "lock c01", "mg 26.1 28.7 keyword_pop lower_third 会写代码 ≠ 会用工具"])
        d = diff(before, self.tl)
        self.assertTrue(any(x.startswith("~ c09") for x in d))
        self.assertTrue(any(x.startswith("~ c13") for x in d))
        with self.assertRaises(OpError):
            self.tl.apply(["swap c01 P02_s2"])          # locked

    def test_guards(self):
        with self.assertRaises(OpError):
            self.tl.apply(["scale c02 1.6"])           # beyond scale_max
        with self.assertRaises(OpError):
            self.tl.apply(["reverse c02"])             # tagged reversible=no
        with self.assertRaises(OpError):
            self.tl.apply(["speed c02 1.4"])           # outside natural range

    def test_split_and_order_keep_vo_lock(self):
        dur = sum(x["rec"]["out"] - x["rec"]["in"] for x in self.tl.host)
        c = next(x for x in self.tl.host if x.get("shot") and x["rec"]["out"] - x["rec"]["in"] > 2.5)
        self.tl.split(c["id"], round(c["rec"]["in"] + 1.2, 2))
        vis = [x["id"] for x in self.tl.host if x.get("shot")][:3]
        self.tl.order(vis)
        self.assertAlmostEqual(sum(x["rec"]["out"] - x["rec"]["in"] for x in self.tl.host), dur, places=6)


class TestLipsyncAndCost(unittest.TestCase):
    def test_hidden_spans_are_not_sent(self):
        c = cat(STANDIN)
        tl = plan(os.path.join(DEMO, "script.md"), c, os.path.join(DEMO, "align.json"), mg=os.path.join(DEMO, "mg_library.json"))
        jobs = lsm.make_jobs(tl, c)
        hidden = sum(x["rec"]["out"] - x["rec"]["in"] for x in tl["host"] if x["layout"] == "hidden")
        self.assertAlmostEqual(jobs["seconds_skipped_hidden"], round(hidden, 2), places=1)
        self.assertTrue(any(j["tier"] == "small" and j["engine"] == "musetalk" for j in jobs["jobs"]))   # PiP → fast engine

    def test_zh_risk(self):
        r = lsm.zh_mouth_risk("八百标兵奔北坡，炮兵并排北边跑", 2.0)
        self.assertGreaterEqual(r["bilabial"], 8)
        self.assertEqual(r["level"], "high")


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
class TestRender(unittest.TestCase):
    def test_spec_placeholder_render(self):
        """Plan a tiny script on the spec catalog and render a proxy (placeholders) end to end."""
        c = cat(SPEC)
        d = tempfile.mkdtemp()
        sp = os.path.join(d, "s.md")
        with open(sp, "w", encoding="utf-8") as f:
            f.write("---\naspect: 9:16\n---\n[开场] 大家好，今天聊一件小事。\n[强调][重音: 关键] 关键只有一句话。\n[关注] 关注我。\n")
        meta, beats, _ = load_script(sp)
        tl = Planner(c, aspect="9:16", profile="short").plan(meta, beats)
        tp = os.path.join(d, "tl.json")
        with open(tp, "w", encoding="utf-8") as f:
            json.dump(tl, f, ensure_ascii=False)
        jobs = lsm.make_jobs(tl, c)
        jp = os.path.join(d, "jobs.json")
        with open(jp, "w", encoding="utf-8") as f:
            json.dump(jobs, f)
        out = os.path.join(d, "o.mp4")
        r = subprocess.run([sys.executable, "-m", "istream", "render", tp, "--cat", SPEC, "--jobs", jp, "--workdir", os.path.join(d, "b"), "--out", out, "--scale", "0.25"],
                           cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[-800:])
        p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], capture_output=True, text=True)
        self.assertAlmostEqual(float(p.stdout), tl["meta"]["duration"], delta=0.1)



class TestIdentityFromPhoto(unittest.TestCase):
    """identity set/restore must update library + GENERATE_PACK and leave frozen verify intact after restore."""

    def setUp(self):
        self.lib_path = os.path.join(ROOT, "prompts", "library.json")
        with open(self.lib_path, encoding="utf-8") as f:
            self._lib_backup = f.read()
        self.pack_path = os.path.join(ROOT, "prompts", "GENERATE_PACK.md")
        self._pack_backup = None
        if os.path.isfile(self.pack_path):
            with open(self.pack_path, encoding="utf-8") as f:
                self._pack_backup = f.read()
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        with open(self.lib_path, "w", encoding="utf-8") as f:
            f.write(self._lib_backup)
        from istream import identity as idm
        lib = pm.load(self.lib_path)
        with open(os.path.join(ROOT, "prompts", "PROMPT_LIBRARY.md"), "w", encoding="utf-8") as f:
            f.write(pm.build_md(lib))
        with open(os.path.join(ROOT, "prompts", "prompts-only.txt"), "w", encoding="utf-8") as f:
            f.write(pm.build_txt(lib))
        # put the shipped pack back byte-for-byte (fall back to a rebuild only if there was none)
        with open(self.pack_path, "w", encoding="utf-8") as f:
            if self._pack_backup is not None:
                f.write(self._pack_backup)
            else:
                f.write(idm.build_generate_pack_md(lib, {"slug": "default", "name": "default", "photo": "(run identity set)", "created": "test-teardown"}))
        st = idm.state_path(ROOT)
        if os.path.isfile(st):
            os.remove(st)
        # remove test slug dirs created under the package
        for d in (
            os.path.join(ROOT, "prompts", "identity", "testuser"),
            os.path.join(ROOT, "dh-library", "00_identity", "testuser"),
        ):
            shutil.rmtree(d, ignore_errors=True)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _tiny_jpeg(self, path):
        # Minimal JPEG via ffmpeg (available for render tests) or raw PPM→PIL-free ffmpeg
        r = subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=0x886644:s=64x64", "-frames:v", "1", path],
            capture_output=True, text=True,
        )
        if r.returncode != 0 or not os.path.isfile(path):
            # Fallback: write a tiny valid JPEG by bytes (1x1 pixel)
            # JFIF minimal
            jpeg = bytes([
                0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
                0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
                0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
                0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
                0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
                0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
                0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xFF, 0xC4, 0x00, 0x14,
                0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0xFF, 0xD9,
            ])
            with open(path, "wb") as f:
                f.write(jpeg)

    def test_identity_set_and_restore(self):
        from istream import identity as idm
        photo = os.path.join(self.tmp, "me.jpg")
        self._tiny_jpeg(photo)
        out_extra = os.path.join(self.tmp, "pack_out")
        r = idm.set_identity(
            ROOT, photo, slug="testuser", name="Test User",
            outfit="black turtleneck", describe="short dark hair",
            out_dir=out_extra,
        )
        lib = pm.load(self.lib_path)
        self.assertIn("attached reference image", lib["blocks"]["identity"]["en"])
        self.assertIn("black turtleneck", lib["blocks"]["identity"]["en"])
        self.assertIn("short dark hair", lib["blocks"]["identity"]["en"])
        self.assertIn("同一人", lib["blocks"]["identity"]["zh"])
        # first frames updated
        self.assertIn("attached reference image", lib["first_frames"]["IMG-A"]["en"])
        self.assertNotIn("East Asian woman in her early thirties", lib["first_frames"]["IMG-A"]["en"])
        pack = os.path.join(ROOT, "prompts", "GENERATE_PACK.md")
        self.assertTrue(os.path.isfile(pack))
        with open(pack, encoding="utf-8") as _pf:
            body = _pf.read()
        self.assertIn("K01", body)
        self.assertIn(pm.compose(lib, "K01", "en").splitlines()[0], body)
        self.assertIn("无遮挡", body)
        self.assertTrue(os.path.isfile(os.path.join(out_extra, "GENERATE_PACK.md")))
        # frozen verify should fail while custom identity is active
        self.assertTrue(pm.verify_frozen(lib))
        # restore
        rr = idm.restore_identity(ROOT)
        self.assertTrue(rr["verify_ok"], rr)
        lib2 = pm.load(self.lib_path)
        self.assertEqual(pm.verify_frozen(lib2), [])
        self.assertIn("East Asian woman", lib2["blocks"]["identity"]["en"])

class TestHumanPremiumOverlay(unittest.TestCase):
    """docs/HUMAN_PREMIUM.md overlay: applied at copy time, never breaks frozen K01–K03, always rendered into GENERATE_PACK."""

    def setUp(self):
        self.lib = pm.load(os.path.join(ROOT, "prompts", "library.json"))
        self.ov = pm.load_overlay("human_premium")

    def test_overlay_applies_without_touching_frozen(self):
        self.assertIsNotNone(self.ov)
        base = pm.compose(self.lib, "K01", "en")
        over = pm.compose_overlay(self.lib, "K01", "en", self.ov, style=True)
        self.assertEqual(pm.compose(self.lib, "K01", "en"), base)          # compose() unchanged
        self.assertIn(self.ov["setting_append"]["en"], over)
        self.assertIn(self.ov["performance_append"]["en"], over)
        self.assertIn(self.ov["style_line"]["en"], over)
        self.assertNotIn("holds it still for one second", over)           # freeze-frame holds replaced
        self.assertNotIn("evenly lit", over)
        self.assertTrue(over.splitlines()[-1].startswith("Avoid:") and over.endswith("."))
        zh = pm.compose_overlay(self.lib, "K02", "zh", self.ov, compact=True)
        self.assertIn(self.ov["setting_compact"]["zh"], zh)
        self.assertNotIn("静止保持一秒", zh)
        if "East Asian woman" in self.lib["blocks"]["identity"]["en"]:     # default persona active
            self.assertEqual(pm.verify_frozen(self.lib), [])

    def test_overlay_keeps_plate_discipline(self):
        """the patches must never ask for hands near the face or for camera movement"""
        for lang in ("en", "zh"):
            for key in ("setting_append", "performance_append", "first_frame_append", "style_line"):
                t = self.ov[key][lang].lower()
                for bad in ("touches her face", "hand to her face", "camera moves", "dolly", "handheld", "手摸脸", "托腮", "运镜"):
                    self.assertNotIn(bad, t, (key, lang))
        self.assertIn("nothing ever touches or covers the face", self.ov["performance_append"]["en"])

    def test_first_frame_and_negative(self):
        ff = pm.first_frame_overlay(self.lib, "IMG-A", "en", self.ov)
        self.assertTrue(ff.endswith("No text, no logo."))
        self.assertIn(self.ov["first_frame_append"]["en"], ff)
        neg = pm.negative_overlay(self.lib, "K01", self.ov)
        self.assertIn("dead eyes", neg)
        self.assertEqual(len(neg.split(", ")), len({x.lower() for x in neg.split(", ")}))   # deduplicated
        self.assertEqual(len(self.ov["scorecard"]), 10)

    def test_generate_pack_has_p0_section(self):
        from istream import identity as idm
        md = idm.build_generate_pack_md(self.lib, {"slug": "t", "name": "t", "photo": "x", "created": "x"})
        self.assertEqual(md.count("## 真人感 / 去 AI 味（P0）"), 1)
        self.assertIn(self.ov["scorecard_rule"]["zh"], md)
        self.assertIn(self.ov["setting_append"]["zh"], md)
        with open(os.path.join(ROOT, "prompts", "GENERATE_PACK.md"), encoding="utf-8") as f:
            self.assertIn("## 真人感 / 去 AI 味（P0）", f.read())

    def test_doc_matches_overlay(self):
        with open(os.path.join(ROOT, "docs", "HUMAN_PREMIUM.md"), encoding="utf-8") as f:
            doc = f.read()
        for key in ("setting_append", "performance_append", "first_frame_append", "style_line"):
            for lang in ("en", "zh"):
                self.assertIn(self.ov[key][lang], doc, (key, lang))


class TestGestureExpressionOverlay(unittest.TestCase):
    """docs/GESTURE_EXPRESSION.md (v1.3): plate-scoped patches, MCU stays hands-out, K04/K05 live only in the overlay."""

    def setUp(self):
        self.lib_path = os.path.join(ROOT, "prompts", "library.json")
        self.lib = pm.load(self.lib_path)
        self.hp = pm.load_overlay("human_premium")
        self.ov = pm.load_overlay("gesture_expression")

    @staticmethod
    def timeline_lines(text, lang):
        lines = text.splitlines()
        a = lines.index("Timeline:" if lang == "en" else "时间线：")
        return [l for l in lines[a + 1:] if not l.startswith(("Avoid:", "避免："))]

    def test_stacked_overlays_keep_library_and_frozen(self):
        with open(self.lib_path, "rb") as f:
            before = f.read()
        for pid in ("K01", "K02", "K03", "K04", "K05", "O01", "K01H", "L02"):
            for lang in ("en", "zh"):
                for compact in (False, True):
                    t = pm.compose_overlay(self.lib, pid, lang, [self.hp, self.ov], compact=compact)
                    self.assertTrue(t.splitlines()[-1].startswith(("Avoid:", "避免：")), (pid, lang))
        with open(self.lib_path, "rb") as f:
            self.assertEqual(f.read(), before)
        self.assertNotIn("K04", self.lib["plates"])
        if "East Asian woman" in self.lib["blocks"]["identity"]["en"]:
            self.assertEqual(pm.verify_frozen(self.lib), [])

    def test_replacements_are_scoped_and_hit_frozen_text(self):
        for r in self.ov["replace"]:
            for pid in r["plates"]:
                for lang in ("en", "zh"):
                    self.assertIn(r[lang][0], pm.compose(self.lib, pid, lang), (pid, lang))
                    for ovs in ([self.ov], [self.hp, self.ov]):            # still matches after human_premium
                        t = pm.compose_overlay(self.lib, pid, lang, ovs)
                        self.assertIn(r[lang][1], t)
                        self.assertNotIn(r[lang][0], t)
            for other in ("L01", "L02", "O01"):
                self.assertNotIn(r["en"][1], pm.compose_overlay(self.lib, other, "en", self.ov))

    def test_k02_gets_no_counting_pointing_or_waving(self):
        for lang, bad in (("en", ("count", "pointing", "points", "waving", "thumbs")), ("zh", ("数手指", "数一", "指向", "挥手", "点赞"))):
            tl = " ".join(self.timeline_lines(pm.compose_overlay(self.lib, "K02", lang, [self.hp, self.ov]), lang)).lower()
            for b in bad:
                self.assertNotIn(b, tl, (lang, b))
            self.assertIn(self.ov["performance_append_by_framing"]["ms"][lang], pm.compose_overlay(self.lib, "K02", lang, self.ov))

    def test_mcu_plates_stay_hands_out(self):
        lib2 = pm.with_overlay_plates(self.lib, self.ov)
        for pid in ("K01", "K01H", "K03", "K05", "O01"):
            self.assertEqual(lib2["plates"][pid]["framing"], "mcu")
            for lang, bad in (("en", ("hand", "palm", "finger")), ("zh", ("手", "掌"))):
                t = pm.compose_overlay(self.lib, pid, lang, [self.hp, self.ov])
                self.assertIn(self.ov["performance_append_by_framing"]["mcu"][lang], t)
                self.assertNotIn(self.ov["performance_append_by_framing"]["ms"][lang], t)
                for l in self.timeline_lines(t, lang):
                    for b in bad:
                        self.assertNotIn(b, l.lower(), (pid, lang, l))
        from istream.vocab import HAND_GESTURES
        for s in pm.spec_shots(lib2, "K05"):
            self.assertEqual(s["performance"]["hands"], "out_of_frame")
            self.assertFalse([g for g in s["performance"]["gestures"] if g["g"] in HAND_GESTURES], s["id"])

    def test_negatives_framing_aware_and_drop_conflicts(self):
        ms = pm.negative_overlay(self.lib, "K02", [self.hp, self.ov])
        mcu = pm.negative_overlay(self.lib, "K01", [self.hp, self.ov])
        self.assertIn("OK sign", ms)
        self.assertNotIn("OK sign", mcu)                                 # hand tells only on MS plates
        self.assertIn("frozen grin", mcu)
        self.assertNotIn("looking away", mcu.split(", "))                 # K01 now has a thinking glance
        self.assertIn("looking away", pm.negative_overlay(self.lib, "K03", self.ov).split(", "))
        k05 = pm.negative_overlay(self.lib, "K05", self.ov).split(", ")
        self.assertNotIn("laughing", k05)                                  # K05 has a soft nasal laugh
        for n in (ms, mcu):
            self.assertEqual(len(n.split(", ")), len({x.lower() for x in n.split(", ")}))
        self.assertIn("比耶", pm.negative_overlay(self.lib, "K04", self.ov, lang="zh"))

    def test_lexicon_vocab_aliases_and_intents(self):
        from istream.vocab import GESTURE_ALIASES, HAND_GESTURES, VOCAB
        self.assertTrue(8 <= len(self.ov["expressions"]) <= 12 and 8 <= len(self.ov["gestures"]) <= 12)
        for it in self.ov["expressions"] + self.ov["gestures"]:
            self.assertIn(it["key"], VOCAB["gesture"], it["id"])
            self.assertEqual(GESTURE_ALIASES[it["id"].lower()], it["key"], it["id"])
            name = it["name_zh"].split("（")[0]
            if name in GESTURE_ALIASES:                                    # the doc's Chinese name works in [手势:] / [表情:]
                self.assertEqual(GESTURE_ALIASES[name], it["key"], name)
        for g in self.ov["gestures"]:
            self.assertIn(g["key"], HAND_GESTURES, g["id"])
        for e in self.ov["expressions"]:
            self.assertNotIn(e["key"], HAND_GESTURES, e["id"])
        ids = {it["id"] for it in self.ov["expressions"] + self.ov["gestures"]}
        for it in self.ov["intents"]:
            self.assertIn(it["role"], VOCAB["role"])
            self.assertTrue(set(it["expressions"] + it["gestures"]) <= ids, it["role"])
        self.assertTrue(5 <= len(self.ov["scorecard"]) <= 8)

    def test_gesture_catalog_matches_overlay(self):
        lib2 = pm.overlay_catalog_lib(self.lib, self.ov)
        ids = list(self.lib["plates"]) + pm.overlay_plate_ids(self.ov)
        want = [s for k in ids for s in pm.spec_shots(lib2, k)]
        with open(os.path.join(ROOT, "catalog", "gesture", "shots.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["shots"], json.loads(json.dumps(want)))
        self.assertEqual(cat(os.path.join(ROOT, "catalog", "gesture", "plates.json")).validate(), [])
        k02 = {s["id"]: s for s in want}["K02_s3"]
        self.assertIn("shrug", [g["g"] for g in k02["performance"]["gestures"]])
        with open(os.path.join(ROOT, "catalog", "spec", "shots.json"), encoding="utf-8") as f:   # spec untouched
            self.assertNotIn("shrug", json.dumps(json.load(f)))

    def test_markup_and_planner_requests(self):
        meta, beats, warns = parse("[对比][手势: 对比] 一方面要快，另一方面要稳。[表情: E04+浅笑] 这才是关键。[手势: 乱挥] 不行。")
        self.assertEqual(beats[0]["roles"], ["contrast"])
        self.assertEqual(beats[0]["want"], ["contrast_hands"])
        self.assertEqual(beats[1]["want"], ["brow_raise", "soft_smile"])
        self.assertNotIn("want", beats[2])
        self.assertTrue(any("乱挥" in w for w in warns))
        c = cat(os.path.join(ROOT, "catalog", "gesture", "plates.json"))
        meta, beats, _ = load_script(os.path.join(ROOT, "recipes", "gesture", "script.md"))
        pl = Planner(c, aspect="9:16", profile="short", seed=7)
        tl = pl.plan(meta, beats)
        self.assertFalse([w for w in pl.warnings if "requested" in w], pl.warnings)
        picked = {h["shot"] for h in tl["host"] if h.get("shot")}
        self.assertTrue({"K04_s2", "K04_s3", "K05_s1"} <= picked, picked)
        self.assertFalse([f for f in qcm.run(tl, c)[0] if f["sev"] == "FAIL"])

    def test_generate_pack_and_doc(self):
        from istream import identity as idm
        md = idm.build_generate_pack_md(self.lib, {"slug": "t", "name": "t", "photo": "x", "created": "x"})
        self.assertEqual(md.count("## 手势与表情（P0）"), 1)
        self.assertGreater(md.index("## 手势与表情（P0）"), md.index("## 真人感 / 去 AI 味（P0）"))
        self.assertIn(pm.compose_overlay(self.lib, "K04", "zh", self.ov), md)
        with open(os.path.join(ROOT, "prompts", "GENERATE_PACK.md"), encoding="utf-8") as f:
            self.assertIn("## 手势与表情（P0）", f.read())
        import importlib.util
        spec = importlib.util.spec_from_file_location("ge_doc", os.path.join(ROOT, "tools", "build_gesture_expression_doc.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        with open(os.path.join(ROOT, "docs", "GESTURE_EXPRESSION.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), mod.render())


if __name__ == "__main__":
    unittest.main()
