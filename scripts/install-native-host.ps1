<#
.SYNOPSIS
  安裝 Chrome Native Messaging Host，讓 extension 能自動啟動/停止目錄伺服器。

.DESCRIPTION
  此腳本將 com.shopee.catalog_server 註冊到 HKCU 登錄檔，
  讓 extension 可透過 chrome.runtime.connectNative 管理 local-catalog-server.py。

  使用方式：
    1. 在 chrome://extensions 啟用開發者模式
    2. 載入 extension/ 目錄（已解壓縮）
    3. 記下 extension ID（如 abcdefghijklmnop123456）
    4. 以系統管理員身分執行此腳本，或一般身分（HKCU）

  參數：
    -ExtensionId <字串>  你的 extension ID（必填）

  範例：
    .\install-native-host.ps1 -ExtensionId abcdefghijklmnop123456
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$HostName = "com.shopee.catalog_server"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\.."
$ManifestDir = "$ProjectRoot\extension\native-messaging-host"
$ManifestTemplate = "$ManifestDir\$HostName.json"
$ManifestOutput = "$env:TEMP\$HostName.json"

# Validate extension ID format
if ($ExtensionId -notmatch '^[a-z]{32}$') {
    Write-Warning "Extension ID 格式看起來不太對，應為 32 個小寫字母"
    Write-Warning "從 chrome://extensions 複製貼上即可"
}

# Read template and fill placeholders
$json = Get-Content -Path $ManifestTemplate -Raw -Encoding UTF8
$batchPath = "$ManifestDir\run_host.bat"
$json = $json -replace 'REPLACE_WITH_ABSOLUTE_PATH\\.*?run_host\.bat', ($batchPath -replace '\\', '\\')
$json = $json -replace 'REPLACE_WITH_YOUR_EXTENSION_ID', $ExtensionId

# Validate JSON
try {
    $null = $json | ConvertFrom-Json
} catch {
    Write-Error "填完後 JSON 格式不正確：$_"
    exit 1
}

# Write temp manifest
Set-Content -Path $ManifestOutput -Value $json -Encoding UTF8 -Force

# Install to HKCU (user-wide, no admin required)
$RegPath = "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\$HostName"
if (-not (Test-Path $RegPath)) {
    $null = New-Item -Path $RegPath -Force
}
Set-ItemProperty -Path $RegPath -Name '(Default)' -Value $ManifestOutput

Write-Host ""
Write-Host "✅ Native Messaging Host 安裝成功！" -ForegroundColor Green
Write-Host "   Host 名稱：$HostName"
Write-Host "   Extension ID：$ExtensionId"
Write-Host "   登錄位置：$RegPath"
Write-Host "   Manifest：$ManifestOutput"
Write-Host ""
Write-Host "請重新載入 extension（chrome://extensions → 重新整理圖示）" -ForegroundColor Yellow
Write-Host ""

# Verify
try {
    $installed = Get-ItemProperty -Path $RegPath -Name '(Default)' -ErrorAction Stop
    if ($installed.'(Default)' -eq $ManifestOutput) {
        Write-Host "✓ 驗證通過" -ForegroundColor Green
    }
} catch {
    Write-Warning "驗證失敗：$_"
}
