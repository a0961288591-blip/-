# Rebecca 高雄房產短影音自動剪輯系統

第一階段：本機（Claude Code）剪輯管線。不含 n8n、不含社群自動發布。

## 系統組成

| 元件 | 位置 | 用途 |
|------|------|------|
| video-use | `~/Developer/video-use`（symlink 至 `~/.claude/skills/video-use`） | 轉錄、切點、調色、字幕、渲染的核心管線 |
| Remotion skills | `~/.claude/skills/remotion-*` | 資訊圖卡與動畫（React 合成） |
| rebecca-real-estate-video | 本 repo `skills/rebecca-real-estate-video/`（symlink 至 `~/.claude/skills/rebecca-real-estate-video`） | Rebecca 品牌與房產正確性規則 |

## 環境需求與重建步驟

前置工具：Git、FFmpeg（含 ffprobe）、Node.js 22+ 與 npm、Python 3.11+、uv。

```bash
# 1. 系統工具（Ubuntu/Debian）
sudo apt-get update && sudo apt-get install -y ffmpeg git

# 2. video-use
git clone https://github.com/browser-use/video-use ~/Developer/video-use
cd ~/Developer/video-use && uv sync
mkdir -p ~/.claude/skills
ln -sfn ~/Developer/video-use ~/.claude/skills/video-use

# 3. Remotion 官方 skills
npx --yes skills add remotion-dev/skills --global --yes

# 4. 本 repo 的專屬 skill
ln -sfn "$(pwd)/skills/rebecca-real-estate-video" ~/.claude/skills/rebecca-real-estate-video
```

## API Key

轉錄使用 ElevenLabs Scribe，需要 `ELEVENLABS_API_KEY`：

```bash
# 寫入 video-use 的 .env（勿 commit、勿在畫面顯示 key）
printf 'ELEVENLABS_API_KEY=%s\n' "<你的key>" > ~/Developer/video-use/.env
chmod 600 ~/Developer/video-use/.env
```

## 使用方式

1. 將原始影片放入一個資料夾，例如 `~/videos/河堤三房/`（原始檔永不被修改）。
2. 在該資料夾啟動 Claude Code，說：
   「用 rebecca-real-estate-video 把這些素材剪成一支短影音」。
3. 流程：轉錄 → 剪輯策略提案（等你確認）→ `edit/preview.mp4` →
   你確認後才輸出 `edit/final.mp4`。

品牌規格與房產數據硬性規則見 `skills/rebecca-real-estate-video/SKILL.md`。
