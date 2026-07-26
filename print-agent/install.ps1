# Kasirku Print Agent - installer.
#
# Jalankan ini SEKALI di setiap komputer kasir yang punya printer dapur/bar
# LAN. Setelah ini, agent otomatis nyala tiap komputer dinyalakan/login -
# tidak perlu buka terminal lagi.
#
# Cara pakai: klik kanan file ini -> "Run with PowerShell".
# (Kalau muncul peringatan warna biru "Windows protected your PC", klik
# "More info" lalu "Run anyway" - ini normal untuk aplikasi internal yang
# belum didaftarkan ke Microsoft.)

$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "KasirkuPrintAgent"
$exeName = "kasirku-print-agent.exe"
$sourceExe = Join-Path $PSScriptRoot "dist\$exeName"
$targetExe = Join-Path $installDir $exeName
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = Join-Path $startupDir "Kasirku Print Agent.lnk"

if (-not (Test-Path $sourceExe)) {
    Write-Host "Tidak ketemu $sourceExe" -ForegroundColor Red
    Write-Host "Pastikan file kasirku-print-agent.exe ada di folder dist/ sebelah install.ps1 ini." -ForegroundColor Red
    exit 1
}

Write-Host "Memasang Kasirku Print Agent di $installDir ..."
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

# Hentikan instance lama dulu supaya file bisa ditimpa.
Get-Process -Name "kasirku-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Copy-Item -Path $sourceExe -Destination $targetExe -Force

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetExe
$shortcut.WorkingDirectory = $installDir
$shortcut.WindowStyle = 7  # minimized
$shortcut.Description = "Kasirku Print Agent - jembatan cetak dapur/bar LAN"
$shortcut.Save()

Write-Host "Menjalankan agent..."
Start-Process -FilePath $targetExe -WindowStyle Minimized

Start-Sleep -Seconds 1
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:9123/health" -TimeoutSec 3
    if ($health.ok) {
        Write-Host ""
        Write-Host "Selesai! Kasirku Print Agent sudah aktif dan akan otomatis nyala tiap komputer ini dinyalakan." -ForegroundColor Green
        Write-Host "Silakan lanjut ke pengaturan printer di Kasirku seperti biasa."
    }
} catch {
    Write-Host ""
    Write-Host "Terpasang, tapi belum bisa dipastikan aktif (cek jendela agent yang baru terbuka)." -ForegroundColor Yellow
}
