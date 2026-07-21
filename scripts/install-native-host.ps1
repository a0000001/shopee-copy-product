<#
.SYNOPSIS
  Install Chrome Native Messaging Host for Shopee Catalog Server extension.

.DESCRIPTION
  Registers com.shopee.catalog_server in HKCU registry so the extension
  can manage local-catalog-server.py via chrome.runtime.connectNative.

  Usage:
    1. Enable developer mode in chrome://extensions
    2. Load extension/ directory (unpacked)
    3. Note the extension ID (32 lowercase letters)
    4. Run this script (no admin needed for HKCU)

  Parameters:
    -ExtensionId <string>  Your extension ID (optional if set in .env)

  Examples:
    .\install-native-host.ps1 -ExtensionId abcdefghijklmnop123456
    .\install-native-host.ps1   (reads EXTENSION_ID from .env)
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$HostName = "com.shopee.catalog_server"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\.."
$ManifestDir = "$ProjectRoot\extension\native-messaging-host"
$ManifestOutput = "$env:TEMP\$HostName.json"

# Read Extension ID from .env if not provided via parameter
if (-not $ExtensionId) {
    $envFile = "$ProjectRoot\.env"
    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile -Raw -Encoding UTF8
        if ($envContent -match 'EXTENSION_ID=(\S+)') {
            $ExtensionId = $Matches[1]
            Write-Host "Read EXTENSION_ID=$ExtensionId from .env" -ForegroundColor Cyan
        }
    }
    if (-not $ExtensionId) {
        Write-Error "Please provide -ExtensionId or set EXTENSION_ID in .env"
        exit 1
    }
}

# Validate extension ID format
if ($ExtensionId -notmatch '^[a-z]{32}$') {
    Write-Warning "Extension ID should be 32 lowercase letters"
    Write-Warning "Copy it from chrome://extensions"
}

$batchPath = "$ManifestDir\run_host.bat"

# Build manifest programmatically to ensure correct JSON escaping
$manifest = @{
    name             = "com.shopee.catalog_server"
    description      = "Shopee Catalog Server Manager"
    path             = $batchPath
    type             = "stdio"
    allowed_origins  = @("chrome-extension://$ExtensionId/")
}

$json = $manifest | ConvertTo-Json

# Validate JSON
try {
    $null = $json | ConvertFrom-Json
} catch {
    Write-Error "Generated JSON is invalid: $_"
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
Write-Host "SUCCESS: Native Messaging Host installed!" -ForegroundColor Green
Write-Host "  Host name: $HostName"
Write-Host "  Extension ID: $ExtensionId"
Write-Host "  Registry: $RegPath"
Write-Host "  Manifest: $ManifestOutput"
Write-Host ""
Write-Host "Please reload the extension (chrome://extensions -> refresh icon)" -ForegroundColor Yellow
Write-Host ""

# Verify
try {
    $installed = Get-ItemProperty -Path $RegPath -Name '(Default)' -ErrorAction Stop
    if ($installed.'(Default)' -eq $ManifestOutput) {
        Write-Host "Verification passed" -ForegroundColor Green
    }
} catch {
    Write-Warning "Verification failed: $_"
}