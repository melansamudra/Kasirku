# Kasirku Print Agent — uninstaller. Klik kanan -> "Run with PowerShell".

$installDir = Join-Path $env:LOCALAPPDATA "KasirkuPrintAgent"
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = Join-Path $startupDir "Kasirku Print Agent.lnk"

Get-Process -Name "kasirku-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
}
if (Test-Path $installDir) {
    Remove-Item $installDir -Recurse -Force
}

Write-Host "Kasirku Print Agent sudah dihapus." -ForegroundColor Green
