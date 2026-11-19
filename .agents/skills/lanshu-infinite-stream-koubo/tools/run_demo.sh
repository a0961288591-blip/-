#!/usr/bin/env bash
# 高级无限流 · reproduce every artifact in this package (run from the package root).
#   bash tools/run_demo.sh            # full run (needs ffmpeg; stand-in demo also needs source/*.mp4)
#   PY_NUMPY=/path/to/python bash tools/run_demo.sh   # interpreter with numpy (+opencv) for the slicer step
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PY:-python3}
PY_NUMPY=${PY_NUMPY:-$PY}
CRF=${CRF:-24}
"$PY" tools/check_environment.py --render

echo "== 1. schema + prompt library + spec catalog (from one source of truth)"
$PY tools/build_library.py
$PY -m istream schema --write
$PY -m istream prompts verify
$PY -m istream prompts build
$PY -m istream prompts refresh --n 4 --framing mcu --seed 202611 --out prompts/refresh_example.json
$PY -m istream catalog build-spec --out catalog/spec
$PY -m istream catalog validate --cat catalog/spec/plates.json

echo "== 2. stand-in plates: slice + auto-tag (numpy) → merge human/VLM review"
if [ -f source/original-koubo.mp4 ] && [ -f source/ai-native-original.mp4 ] && $PY_NUMPY -c "import numpy" 2>/dev/null; then
  $PY_NUMPY -m istream slice source/original-koubo.mp4 --id P01 --out catalog/standin/drafts/P01.json --sheet catalog/standin/drafts/P01_sheet.jpg
  $PY_NUMPY -m istream slice source/ai-native-original.mp4 --id P02 --out catalog/standin/drafts/P02.json --sheet catalog/standin/drafts/P02_sheet.jpg
else
  echo "   (skipped: source videos or numpy missing — using the committed drafts)"
fi
$PY -m istream catalog merge-review --draft catalog/standin/drafts/P01.json catalog/standin/drafts/P02.json --review catalog/standin/review.json --out catalog/standin
$PY -m istream catalog validate --cat catalog/standin/plates.json

if [ -f source/original-koubo.mp4 ] && [ -f source/ai-native-original.mp4 ]; then
  echo "== 3. demo60: one script → 16:9 + 9:16 → QC → lip-sync jobs → cost → render (passthrough lip-sync)"
  for A in "16:9|recipes/demo60/out|build|demo60_preview_169.mp4|0.6667" "9:16|recipes/demo60/out/916|build916|demo60_preview_916.mp4|0.5"; do
    IFS='|' read -r asp out wd mp4 sc <<< "$A"
    mkdir -p "$out"
    $PY -m istream plan recipes/demo60/script.md --cat catalog/standin/plates.json --align recipes/demo60/align.json --aspect "$asp" --out "$out/timeline.json" | tee "$out/plan.txt"
    $PY -m istream qc "$out/timeline.json" --cat catalog/standin/plates.json --strict --out "$out/qc.txt" | head -2
    $PY -m istream lipsync plan "$out/timeline.json" --cat catalog/standin/plates.json --out "$out/lipsync_jobs.json" > "$out/lipsync.txt"
    $PY -m istream cost "$out/timeline.json" --cat catalog/standin/plates.json --jobs "$out/lipsync_jobs.json" --out "$out/cost.txt" > /dev/null
    $PY -m istream render "$out/timeline.json" --cat catalog/standin/plates.json --jobs "$out/lipsync_jobs.json" --workdir "recipes/demo60/$wd" --out "$out/$mp4" --scale "$sc" --crf "$CRF"
  done

  echo "== 4. edit like code: ops → QC catches problems → fix ops → QC pass → cached re-render"
  $PY -m istream edit recipes/demo60/out/timeline.json --cat catalog/standin/plates.json --ops-file recipes/demo60/edit/01_edit.ops --out recipes/demo60/edit/timeline_edit1.json | tee recipes/demo60/edit/01_diff.txt
  $PY -m istream qc recipes/demo60/edit/timeline_edit1.json --cat catalog/standin/plates.json --strict --out recipes/demo60/edit/01_qc.txt | head -1 || true
  $PY -m istream edit recipes/demo60/edit/timeline_edit1.json --cat catalog/standin/plates.json --ops-file recipes/demo60/edit/02_fix.ops --out recipes/demo60/edit/timeline_edit2.json | tee recipes/demo60/edit/02_diff.txt
  $PY -m istream qc recipes/demo60/edit/timeline_edit2.json --cat catalog/standin/plates.json --strict --out recipes/demo60/edit/02_qc.txt | head -1
  $PY -m istream lipsync plan recipes/demo60/edit/timeline_edit2.json --cat catalog/standin/plates.json --out recipes/demo60/edit/lipsync_jobs.json > recipes/demo60/edit/lipsync.txt
  $PY -m istream render recipes/demo60/edit/timeline_edit2.json --cat catalog/standin/plates.json --jobs recipes/demo60/edit/lipsync_jobs.json --workdir recipes/demo60/build --out recipes/demo60/edit/demo60_edited_169.mp4 --scale 0.6667 --crf "$CRF"
fi

echo "== 5. long-form (~4 min, 9:16) on the spec catalog → QC → lip-sync → cost → placeholder animatic"
mkdir -p recipes/longform/out
$PY -m istream plan recipes/longform/script.md --cat catalog/spec/plates.json --out recipes/longform/out/timeline.json > recipes/longform/out/plan.txt
head -1 recipes/longform/out/plan.txt
$PY -m istream qc recipes/longform/out/timeline.json --cat catalog/spec/plates.json --strict --out recipes/longform/out/qc.txt | head -2
$PY -m istream lipsync plan recipes/longform/out/timeline.json --cat catalog/spec/plates.json --out recipes/longform/out/lipsync_jobs.json > recipes/longform/out/lipsync.txt
$PY -m istream cost recipes/longform/out/timeline.json --cat catalog/spec/plates.json --jobs recipes/longform/out/lipsync_jobs.json --out recipes/longform/out/cost.txt > /dev/null
$PY -m istream render recipes/longform/out/timeline.json --cat catalog/spec/plates.json --jobs recipes/longform/out/lipsync_jobs.json --workdir recipes/longform/build --out recipes/longform/out/longform_animatic_916.mp4 --scale 0.3334 --crf 26

echo "== 6. tests"
$PY -m unittest discover -s tests
echo "done."
