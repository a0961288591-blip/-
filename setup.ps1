#!/usr/bin/env pwsh
# 房產短影音自動剪輯系統 — Windows 一鍵安裝腳本
# 支援:Windows 10 1809+ / Windows 11(需 winget)
# 用法:在 PowerShell 執行  .\setup.ps1
#       若被執行原則擋下:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Linux/macOS 請改用 setup.sh;WSL2 內也請用 setup.sh(那是 Ubuntu 環境)。

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$VideoUseDir = Join-Path $HOME 'Developer\video-use'
$SkillsDir   = Join-Path $HOME '.claude\skills'

function Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Cmd([string]$Name) {
  [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# winget 安裝後 PATH 只寫進登錄檔,不會套用到目前這個 session,需手動重讀
function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

# ---------------------------------------------------------------
Step '1. 偵測作業系統'
$onWindows = $env:OS -eq 'Windows_NT' -or $PSVersionTable.PSVersion.Major -le 5 -or $IsWindows
if (-not $onWindows) {
  Write-Error '這個腳本只支援 Windows。Linux/macOS/WSL 請改用 setup.sh'
  exit 1
}
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
Write-Host "偵測到 $($os.Caption) ($($os.Version))"
Write-Host "PowerShell $($PSVersionTable.PSVersion)"

# ---------------------------------------------------------------
Step '2. 安裝基礎工具(Git / FFmpeg / Node.js / Python / uv)'

if (-not (Test-Cmd winget)) {
  Write-Error @'
找不到 winget(Windows 套件管理員)。
  Windows 11 內建;Windows 10 請到 Microsoft Store 安裝「應用程式安裝程式」
  (App Installer),或從 https://aka.ms/getwinget 取得,裝完重開 PowerShell 再跑一次。
'@
  exit 1
}

# winget 套件 ID → 對應的指令名稱
$packages = @(
  @{ Id = 'Git.Git';            Cmd = 'git' },
  @{ Id = 'Gyan.FFmpeg';        Cmd = 'ffmpeg' },
  @{ Id = 'OpenJS.NodeJS.LTS';  Cmd = 'node' },
  @{ Id = 'Python.Python.3.12'; Cmd = 'python' }
)

foreach ($p in $packages) {
  if (Test-Cmd $p.Cmd) {
    Write-Host "  $($p.Cmd) 已安裝,跳過"
    continue
  }
  Write-Host "  安裝 $($p.Id) …"
  winget install --id $p.Id --exact --silent `
    --accept-package-agreements --accept-source-agreements
  # winget 在「已安裝」時會回非零碼,不視為失敗;真正缺不缺之後統一驗收
  Update-PathFromRegistry
}

if (-not (Test-Cmd uv)) {
  Write-Host '  安裝 uv …'
  Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  $env:Path = (Join-Path $HOME '.local\bin') + ';' + $env:Path
}

Update-PathFromRegistry
if (Test-Path (Join-Path $HOME '.local\bin')) {
  $env:Path = (Join-Path $HOME '.local\bin') + ';' + $env:Path
}

$missing = @()
foreach ($c in 'git', 'ffmpeg', 'ffprobe', 'node', 'npm', 'python', 'uv') {
  if (-not (Test-Cmd $c)) {
    Write-Host ('  {0,-8} ✗ 未找到' -f $c) -ForegroundColor Yellow
    $missing += $c
    continue
  }
  # ffmpeg/ffprobe 只認單橫線 -version:--version 仍會印出版本但以退出碼 8 結束,
  # 這裡不理會退出碼。先完整收完輸出再取第一行 — 用 Select-Object -First 1 會提早
  # 中斷管線,對多行輸出的指令等同 SIGPIPE,正是當初讓 setup.sh 靜默中止的同一個坑。
  $v = @(& $c --version 2>&1)[0]
  Write-Host ('  {0,-8} {1}' -f $c, $v)
}

if ($missing.Count -gt 0) {
  Write-Error @"
以下工具安裝後仍找不到:$($missing -join ', ')
  多半是 PATH 尚未生效 — 請關掉這個 PowerShell 視窗,重新開一個再跑一次。
"@
  exit 1
}

# ---------------------------------------------------------------
Step "3. Clone video-use 到穩定目錄 $VideoUseDir"
if (Test-Path (Join-Path $VideoUseDir '.git')) {
  Write-Host '已存在,更新中…'
  git -C $VideoUseDir pull --ff-only
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $VideoUseDir -Parent) | Out-Null
  git clone https://github.com/browser-use/video-use $VideoUseDir
}
if ($LASTEXITCODE -ne 0) { throw "git 操作失敗(退出碼 $LASTEXITCODE)" }

Step '3b. 安裝 video-use Python 相依套件(uv sync)'
Push-Location $VideoUseDir
try {
  uv sync
  if ($LASTEXITCODE -ne 0) { throw "uv sync 失敗(退出碼 $LASTEXITCODE)" }
} finally {
  Pop-Location
}

# ---------------------------------------------------------------
Step "4. 註冊 skill 到 $SkillsDir\video-use(junction,保留完整專案)"
# Windows 的 symlink 需要管理員或開發人員模式,改用 junction:目錄連結、一般權限即可建立
New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null
$link = Join-Path $SkillsDir 'video-use'

if (Test-Path $link) {
  $item = Get-Item $link -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    # 只刪連結本身。不可用 Remove-Item -Recurse:舊版 PowerShell 會跟進連結刪掉目標內容
    [System.IO.Directory]::Delete($link, $false)
  } else {
    Remove-Item $link -Recurse -Force
  }
}
New-Item -ItemType Junction -Path $link -Target $VideoUseDir | Out-Null
Write-Host "  $link → $VideoUseDir"

# ---------------------------------------------------------------
Step '5. 安裝 Remotion 官方 Skills'
npx -y skills add remotion-dev/skills
if ($LASTEXITCODE -ne 0) { throw "Remotion skills 安裝失敗(退出碼 $LASTEXITCODE)" }

# ---------------------------------------------------------------
Step '6. 檢查 ElevenLabs Scribe 設定(轉錄字幕用)'
$envFile = Join-Path $VideoUseDir '.env'

function Protect-EnvFile([string]$Path) {
  # Windows 沒有 chmod 600:改用 ACL 關閉繼承,只留目前使用者可存取
  $acl = Get-Acl $Path
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($r in @($acl.Access)) { [void]$acl.RemoveAccessRule($r) }
  # 網域機器用 DOMAIN\user,本機帳號 USERDOMAIN 會是電腦名稱;兩者皆空時退回純帳號名
  $account = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $account, 'FullControl', 'Allow')
  $acl.SetAccessRule($rule)
  Set-Acl -Path $Path -AclObject $acl
}

if ($env:ELEVENLABS_API_KEY) {
  "ELEVENLABS_API_KEY=$($env:ELEVENLABS_API_KEY)" |
    Set-Content -Path $envFile -Encoding ascii
  Protect-EnvFile $envFile
  Write-Host "✓ 已從環境變數寫入 ELEVENLABS_API_KEY($envFile)"
} elseif ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^ELEVENLABS_API_KEY=' -Quiet)) {
  Write-Host "✓ 已設定 ELEVENLABS_API_KEY($envFile)"
} else {
  Write-Host @"
✗ 尚未設定 ElevenLabs API Key(轉錄功能需要)。
  設定方式(擇一,都不要把 Key 貼進對話或提交到 git):

  A. 存成使用者環境變數,之後重跑本腳本就會自動寫入 .env:
       [Environment]::SetEnvironmentVariable('ELEVENLABS_API_KEY', '你的KEY', 'User')
     設完要重開 PowerShell 才會生效。

  B. 直接寫檔:
       'ELEVENLABS_API_KEY=你的KEY' | Set-Content '$envFile' -Encoding ascii
"@ -ForegroundColor Yellow
}

# ---------------------------------------------------------------
Step '7. 驗證(不接觸、不轉錄任何素材)'
if ($env:SKIP_VERIFY) {
  Write-Host '已設 SKIP_VERIFY,略過驗證。'
  Step '完成!請閱讀 README.md 的「第一支影片」章節開始剪輯。'
  exit 0
}

$tmp = Join-Path $env:TEMP ("rek-verify-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  Write-Host '-- FFmpeg 編碼測試(合成訊號)'
  $testMp4 = Join-Path $tmp 'test.mp4'
  ffmpeg -v error -y -f lavfi -i testsrc=duration=1:size=640x360:rate=30 `
    -f lavfi -i sine=frequency=440:duration=1 `
    -c:v libx264 -c:a aac -shortest $testMp4
  if ($LASTEXITCODE -ne 0) { throw "FFmpeg 編碼測試失敗(退出碼 $LASTEXITCODE)" }
  ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 $testMp4

  Write-Host '-- video-use helpers'
  Push-Location $VideoUseDir
  try {
    foreach ($h in 'transcribe.py', 'grade.py', 'render.py',
                   'timeline_view.py', 'pack_transcripts.py', 'transcribe_batch.py') {
      uv run python (Join-Path 'helpers' $h) --help | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "$h 執行失敗(退出碼 $LASTEXITCODE)" }
      Write-Host "  ✓ $h"
    }
  } finally {
    Pop-Location
  }

  Write-Host '-- Remotion CLI'
  Push-Location $tmp
  try {
    npm init -y | Out-Null
    npm install --no-audit --no-fund --silent remotion '@remotion/cli' react react-dom | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Remotion 安裝失敗(退出碼 $LASTEXITCODE)" }
    npx remotion versions | Select-Object -Last 2
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Step '完成!請閱讀 README.md 的「第一支影片」章節開始剪輯。'
