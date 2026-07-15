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
