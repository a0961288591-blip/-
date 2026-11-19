"""Imported task boundaries and standalone authoring-source regressions."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from istream.lipsync import run_job
from istream.render import Renderer

ROOT = Path(__file__).resolve().parents[1]


class TestImportedJobs(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root / "build"
        self.work.mkdir()
        (self.work / "input.bin").write_bytes(b"MEDIA_MARKER")
        self.job = {"engine": "passthrough", "inputs": {"video": "input.bin", "audio": "unused.wav"}, "output": "out/result.bin"}

    def test_passthrough_keeps_regular_local_jobs_working(self):
        result = run_job(self.job, str(self.work))
        self.assertFalse(result["synced"])
        self.assertEqual((self.work / "out/result.bin").read_bytes(), b"MEDIA_MARKER")

    def test_parent_or_absolute_output_cannot_overwrite_outside_build(self):
        target = self.root / "outside.bin"
        target.write_bytes(b"ORIGINAL")
        for output in ("../outside.bin", str(target)):
            with self.subTest(output=output):
                job = copy.deepcopy(self.job)
                job["output"] = output
                with self.assertRaises(ValueError):
                    run_job(job, str(self.work))
                self.assertEqual(target.read_bytes(), b"ORIGINAL")

    def test_external_input_cannot_be_copied_into_build(self):
        (self.root / "private.bin").write_bytes(b"PRIVATE_MARKER")
        self.job["inputs"]["video"] = "../private.bin"
        with self.assertRaises(ValueError):
            run_job(self.job, str(self.work))
        self.assertFalse((self.work / "out").exists())

    def test_symlink_cannot_redirect_output_outside_build(self):
        outside = self.root / "external"
        outside.mkdir()
        (self.work / "link").symlink_to(outside, target_is_directory=True)
        self.job["output"] = "link/result.bin"
        with self.assertRaises(ValueError):
            run_job(self.job, str(self.work))
        self.assertFalse((outside / "result.bin").exists())


class TestImportedSpeed(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.renderer = Renderer.__new__(Renderer)
        self.renderer.wd = self.temp.name
        self.renderer.fps = 25
        self.clip = {"plate": "P1", "rec": {"in": 0, "out": 1}, "src": {"in": 0, "out": 1.05}, "ops": []}

    def test_filter_strings_and_invalid_rates_stop_before_media_or_ffmpeg(self):
        invalid = ["1,drawtext=textfile=private.txt", "1.0", True, None, float("nan"), float("inf"), 0, -1, 1.4]
        with patch.object(self.renderer, "plate_path") as source, patch("istream.render.ff") as ff:
            for rate in invalid:
                with self.subTest(rate=rate):
                    clip = copy.deepcopy(self.clip)
                    clip["ops"] = [{"op": "speed", "rate": rate}]
                    with self.assertRaises(ValueError):
                        self.renderer._temporal_seg(clip)
            source.assert_not_called()
            ff.assert_not_called()

    def test_valid_numeric_speed_reaches_ffmpeg_as_a_numeric_expression(self):
        self.clip["ops"] = [{"op": "speed", "rate": 1.05}]
        with patch.object(self.renderer, "plate_path", return_value="input.mp4"), patch("istream.render.ff") as ff:
            self.renderer._temporal_seg(self.clip)
        args = ff.call_args.args[0]
        self.assertIn("setpts=PTS/1.05", args[args.index("-vf") + 1])


class TestStandaloneLibrary(unittest.TestCase):
    def test_builder_uses_only_bundled_source_and_preserves_library(self):
        with tempfile.TemporaryDirectory() as td:
            project = Path(td) / "project"
            (project / "tools").mkdir(parents=True)
            (project / "prompts").mkdir()
            for rel in ("tools/build_library.py", "prompts/plates-source.md"):
                shutil.copy2(ROOT / rel, project / rel)
            result = subprocess.run([sys.executable, "tools/build_library.py"], cwd=project, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads((project / "prompts/library.json").read_text()), json.loads((ROOT / "prompts/library.json").read_text()))
