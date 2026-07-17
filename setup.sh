#!/usr/bin/env bash
# 房產短影音自動剪輯系統 — 一鍵安裝腳本
# 支援:Ubuntu/Debian(apt)、macOS(Homebrew)
# 用法:bash setup.sh
set -euo pipefail

VIDEO_USE_DIR="$HOME/Developer/video-use"
SKILLS_DIR="$HOME/.claude/skills"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------
step "1. 偵測作業系統"
OS="$(uname -s)"
case "$OS" in
  Linux)  PKG="apt";  echo "偵測到 Linux ($(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"))" ;;
  Darwin) PKG="brew"; echo "偵測到 macOS $(sw_vers -productVersion 2>/dev/null || true)" ;;
  *) echo "不支援的作業系統:$OS" >&2; exit 1 ;;
esac

# ---------------------------------------------------------------
step "2. 安裝基礎工具(Git / FFmpeg / Node.js / Python / uv)"
need() { ! command -v "$1" >/dev/null 2>&1; }

if [ "$PKG" = "apt" ]; then
  MISSING=()
  need git    && MISSING+=(git)
  need ffmpeg && MISSING+=(ffmpeg)
  need node   && MISSING+=(nodejs npm)
  need python3 && MISSING+=(python3)
  if [ "${#MISSING[@]}" -gt 0 ]; then
    sudo apt-get update -qq || true
    sudo apt-get install -y "${MISSING[@]}"
  fi
else
  need git    && brew install git
  need ffmpeg && brew install ffmpeg
  need node   && brew install node
  need python3 && brew install python
fi

if need uv; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

for c in git ffmpeg ffprobe node npm python3 uv; do
  # head -1 會提早關閉管線,多行輸出的指令(如 ffmpeg)可能吃到 SIGPIPE,
  # 在 pipefail 下會讓整個腳本靜默中止 — 先取完整輸出再截第一行
  v="$("$c" --version 2>&1)"
  printf '  %-8s %s\n' "$c" "${v%%$'\n'*}"
done

# ---------------------------------------------------------------
step "3. Clone video-use 到穩定目錄 $VIDEO_USE_DIR"
if [ -d "$VIDEO_USE_DIR/.git" ]; then
  echo "已存在,更新中…"; git -C "$VIDEO_USE_DIR" pull --ff-only
else
  mkdir -p "$(dirname "$VIDEO_USE_DIR")"
  git clone https://github.com/browser-use/video-use "$VIDEO_USE_DIR"
fi

step "3b. 安裝 video-use Python 相依套件(uv sync)"
(cd "$VIDEO_USE_DIR" && uv sync)

# ---------------------------------------------------------------
step "4. 註冊 skill 到 $SKILLS_DIR/video-use(symlink,保留完整專案)"
mkdir -p "$SKILLS_DIR"
ln -sfn "$VIDEO_USE_DIR" "$SKILLS_DIR/video-use"
ls -l "$SKILLS_DIR/video-use"

# ---------------------------------------------------------------
step "5. 安裝 Remotion 官方 Skills"
npx -y skills add remotion-dev/skills

# ---------------------------------------------------------------
step "6. 檢查 ElevenLabs Scribe 設定(轉錄字幕用)"
if [ -f "$VIDEO_USE_DIR/.env" ] && grep -q '^ELEVENLABS_API_KEY=' "$VIDEO_USE_DIR/.env"; then
  echo "✓ 已設定 ELEVENLABS_API_KEY($VIDEO_USE_DIR/.env)"
else
  cat <<'EOF'
✗ 尚未設定 ElevenLabs API Key(轉錄功能需要)。
  設定方式(請自行執行,不要把 Key 貼進對話或提交到 git):
    printf 'ELEVENLABS_API_KEY=%s\n' "你的KEY" > ~/Developer/video-use/.env
    chmod 600 ~/Developer/video-use/.env
EOF
fi

# ---------------------------------------------------------------
step "7. 驗證(不接觸、不轉錄任何素材)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "-- FFmpeg 編碼測試(合成訊號)"
ffmpeg -v error -y -f lavfi -i testsrc=duration=1:size=640x360:rate=30 \
  -f lavfi -i sine=frequency=440:duration=1 \
  -c:v libx264 -c:a aac -shortest "$TMP/test.mp4"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 "$TMP/test.mp4"

echo "-- video-use helpers"
for h in transcribe.py grade.py render.py timeline_view.py pack_transcripts.py transcribe_batch.py; do
  (cd "$VIDEO_USE_DIR" && uv run python "helpers/$h" --help >/dev/null) && echo "  ✓ $h"
done

echo "-- Remotion CLI"
(cd "$TMP" && npm init -y >/dev/null 2>&1 \
  && npm install --no-audit --no-fund --silent remotion @remotion/cli react react-dom >/dev/null \
  && npx remotion versions | tail -2)

step "完成!請閱讀 README.md 的「第一支影片」章節開始剪輯。"
