# 房產短影音自動剪輯系統

以對話驅動的短影音剪輯環境:用 [video-use](https://github.com/browser-use/video-use) 做剪輯決策(轉錄、剪點、調色、字幕),用 FFmpeg 做實際處理,用 [Remotion](https://remotion.dev) 做動畫與版式,ElevenLabs Scribe 提供逐字級轉錄。

## 一鍵安裝

**Linux / macOS**

```bash
bash setup.sh
```

**Windows**(PowerShell,需 Windows 10 1809+ 或 Windows 11)

```powershell
.\setup.ps1
# 若被執行原則擋下:
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

兩個腳本步驟一致,差別在平台細節:Windows 用 winget 裝工具鏈、用 junction 取代
symlink(免管理員權限)、用 ACL 取代 `chmod 600` 保護金鑰檔。
**WSL2 內請用 `setup.sh`**——那是 Ubuntu 環境,不是原生 Windows。

### 在 Claude Code 雲端 session 使用(重要)

雲端 session 的容器是**用完即回收**的:每次開新 session,系統層裝的東西(FFmpeg、
video-use、skills)都會消失,只有 git 倉庫會重新 clone 回來。與其每次手動重裝,
在環境設定裡掛一次就好——**標題列的雲端環境選單 → Edit**:

| 設定項 | 填什麼 | 解決什麼 |
|---|---|---|
| **Setup script** | `bash setup.sh`(可加 `SKIP_VERIFY=1` 加速) | 新 session 自動裝好整套,不必每次重跑 |
| **Network secrets** | 變數名 `ELEVENLABS_API_KEY` | 轉錄金鑰永久帶入,不必每次重設、全程不經過對話 |

設好之後,下一個 session 開起來就是可以直接剪片的狀態。`setup.sh` 會自動把
`ELEVENLABS_API_KEY` 環境變數轉寫成 video-use 需要的 `.env`。

腳本會:偵測作業系統 → 安裝 Git/FFmpeg/Node.js/Python/uv → clone video-use 到
`~/Developer/video-use`(Windows 為 `%USERPROFILE%\Developer\video-use`)→ `uv sync`
安裝相依 → 連結註冊到 `~/.claude/skills/video-use` → 安裝 Remotion 官方 Skills →
用合成訊號驗證整條管線(不接觸任何素材)。

| 平台 | 腳本 | 套件管理 | skill 註冊 |
|---|---|---|---|
| Ubuntu/Debian | `setup.sh` | apt | symlink |
| macOS | `setup.sh` | Homebrew | symlink |
| Windows 10/11 | `setup.ps1` | winget | junction |

Windows 常見狀況:winget 裝完工具後 PATH 不會套用到目前的 PowerShell 視窗,
腳本會自動從登錄檔重讀;若仍提示找不到指令,關掉視窗重開一個再跑一次即可。

## 已安裝項目

| 項目 | 用途 | 位置 |
|---|---|---|
| Git、FFmpeg/ffprobe、Node.js、npm、Python 3、uv | 基礎工具鏈 | 系統 PATH |
| video-use(完整專案含 SKILL.md、helpers) | 對話式剪輯 skill | `~/Developer/video-use`,symlink 至 `~/.claude/skills/video-use` |
| video-use helpers | 轉錄、調色、渲染、時間軸預覽 | `helpers/{transcribe,grade,render,timeline_view,pack_transcripts,transcribe_batch}.py` |
| Remotion 官方 Skills(8 個) | 動畫、字幕、渲染最佳實務 | `~/.agents/skills/remotion-*`、`mediabunny` |

## 付費項目

- **ElevenLabs Scribe**(轉錄 API)— 唯一必要的付費服務,依轉錄分鐘數計費,有免費額度。
  註冊帳號後還要到後台產生 API Key,兩者缺一不可。**Key 不要貼進對話、不要提交到 git**。

  - 雲端 session:環境設定 → Edit → **Network secrets**,變數名 `ELEVENLABS_API_KEY`(見上方表格)
  - 本機:
    ```bash
    printf 'ELEVENLABS_API_KEY=%s\n' "你的KEY" > ~/Developer/video-use/.env
    chmod 600 ~/Developer/video-use/.env
    ```

  本地免費替代方案(whisper.cpp / faster-whisper)在雲端環境**無法使用**——模型來源
  huggingface.co 與 openaipublic.azureedge.net 都被網路政策擋下(403),本機則不受此限。

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
