# 房產短影音自動剪輯系統

以對話驅動的短影音剪輯環境:用 [video-use](https://github.com/browser-use/video-use) 做剪輯決策(轉錄、剪點、調色、字幕),用 FFmpeg 做實際處理,用 [Remotion](https://remotion.dev) 做動畫與版式,ElevenLabs Scribe 提供逐字級轉錄。

## 一鍵安裝

```bash
bash setup.sh
```

支援 Ubuntu/Debian 與 macOS。腳本會:偵測作業系統 → 安裝 Git/FFmpeg/Node.js/Python/uv → clone video-use 到 `~/Developer/video-use` → `uv sync` 安裝相依 → symlink 註冊到 `~/.claude/skills/video-use` → 安裝 Remotion 官方 Skills → 用合成訊號驗證整條管線(不接觸任何素材)。

## 已安裝項目

| 項目 | 用途 | 位置 |
|---|---|---|
| Git、FFmpeg/ffprobe、Node.js、npm、Python 3、uv | 基礎工具鏈 | 系統 PATH |
| video-use(完整專案含 SKILL.md、helpers) | 對話式剪輯 skill | `~/Developer/video-use`,symlink 至 `~/.claude/skills/video-use` |
| video-use helpers | 轉錄、調色、渲染、時間軸預覽 | `helpers/{transcribe,grade,render,timeline_view,pack_transcripts,transcribe_batch}.py` |
| Remotion 官方 Skills(8 個) | 動畫、字幕、渲染最佳實務 | `~/.agents/skills/remotion-*`、`mediabunny` |

## 付費項目

- **ElevenLabs Scribe**(轉錄 API)— 唯一必要的付費服務,依轉錄分鐘數計費,有免費額度。API Key 設定方式(自行在終端機執行,**不要**貼進對話、**不要**提交到 git):

  ```bash
  printf 'ELEVENLABS_API_KEY=%s\n' "你的KEY" > ~/Developer/video-use/.env
  chmod 600 ~/Developer/video-use/.env
  ```

- FFmpeg、Remotion Skills、video-use 本身皆免費開源(Remotion 授權:個人/小團隊免費,公司規模達門檻需公司授權)。

## 第一支影片怎麼做

1. 把房產素材(空拍、室內走拍、口播)放進一個資料夾,例如 `~/videos/property-001/`。
   系統**只讀取**原始素材,所有輸出都寫到 `~/videos/property-001/edit/`,不會覆蓋原始檔。
2. 確認已設定 ElevenLabs API Key(見上方)。
3. 在素材資料夾啟動 Claude Code,直接說需求,例如:

   > 把這些素材剪成 60 秒的房產短影音:開場空拍 3 秒鉤子、
   > 亮點快剪(客廳/主臥/景觀)、口播上繁中字幕、結尾帶聯絡資訊卡。

4. 系統會先轉錄與分析素材 → 用白話文跟你確認剪輯策略 → 你同意後才動手 → 產出成品到 `edit/`,再依你的回饋迭代。

## 注意事項

- 轉錄結果會依來源檔快取,同一素材不會重複扣 Scribe 額度。
- 剪輯一律逐段無損切割再合併,不會重複轉檔劣化畫質。
- 原始素材永遠不被修改或覆蓋。

## 數位人口播（lanshu-infinite-stream-koubo）

已安裝 [lanshu-infinite-stream-koubo](https://github.com/cclank/lanshu-infinite-stream-koubo) skill（`.agents/skills/`，symlink 到 `.claude/skills/`）：先做一套本人數位人「母片」，之後每支新物件只換文案、配音，只為主播露臉的片段付口型費。範例與「換成本人」步驟見 [`films/huafeng-land-koubo/`](films/huafeng-land-koubo/README.md)。

- 需要：Python 3.10+、FFmpeg、中文字型（找不到時設 `ISTREAM_FONT`）；切片需要 numpy。
- 自檢：`cd .agents/skills/lanshu-infinite-stream-koubo && python3 tools/check_environment.py --render`

## 大頭拼貼故事片（bighead-collage）：台灣土地傳奇

已安裝 [bighead-collage](https://github.com/HeyChengC/bighead-collage) skill（`.agents/skills/`，symlink 到 `.claude/skills/`）：大頭照片剪紙＋道具＋音效的 9:16 故事短片。系列「台灣土地傳奇」第 1 集在 [`films/taiwan-land-legend-01/`](films/taiwan-land-legend-01/director.md)（文案 `script.json`、導演表 `director.md`）。

- 生圖需要 OpenAI API Key（或 `image.provider manual`：只產提示詞，自己拿去 ChatGPT 生圖再放回 `gen/`）。
- 依賴：`pip install -r .agents/skills/bighead-collage/requirements.txt`、`npm install`（在 skill 目錄）；自檢 `python scripts/doctor.py`。
