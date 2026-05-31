# ASM Platform — Masaustu kisayolu olusturucu (tek seferlik)
#
# Cift tikla → masaustune "ASM Platform.lnk" eklenir, start-desktop.bat'i baslatir.
# WindowsApps korumalari nedeniyle PowerShell'i sag-tik "Run with PowerShell"
# secenegiyle calistirmaniz gerekebilir.
#
# Calistirma:
#   - Bu .ps1 dosyasina sag tikla → "Run with PowerShell"
#   - veya: powershell -ExecutionPolicy Bypass -File .\make-desktop-shortcut.ps1

$ErrorActionPreference = 'Stop'

$root         = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath      = Join-Path $root 'start-desktop.bat'
$desktop      = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'ASM Platform.lnk'

if (-not (Test-Path $batPath)) {
    Write-Host "HATA: start-desktop.bat bulunamadi: $batPath" -ForegroundColor Red
    exit 1
}

# Icon path: paketlenmis .exe ile gelen icon varsa onu kullan
$iconCandidate = Join-Path $root 'apps\desktop\assets\icon.ico'
$iconArg = ''
if (Test-Path $iconCandidate) {
    $iconArg = $iconCandidate
}

$wsh = New-Object -ComObject WScript.Shell

# --- Ana baslatma kisayolu ---
$lnk = $wsh.CreateShortcut($shortcutPath)
$lnk.TargetPath = $batPath
$lnk.WorkingDirectory = $root
$lnk.Description = 'ASM Platform - Attack Surface Monitor (Desktop)'
$lnk.WindowStyle = 7   # 7 = Minimized (launcher .bat penceresi gozukmesin)
if ($iconArg) { $lnk.IconLocation = $iconArg }
$lnk.Save()

# --- Kapatma kisayolu ---
$lnk2 = $wsh.CreateShortcut($stopShortcut)
$lnk2.TargetPath = $stopBatPath
$lnk2.WorkingDirectory = $root
$lnk2.Description = 'ASM Platform - Tum servisleri kapat'
$lnk2.WindowStyle = 7
if ($iconArg) { $lnk2.IconLocation = $iconArg }
$lnk2.Save()

Write-Host ""
Write-Host "[OK] Masaustu kisayollari olusturuldu:" -ForegroundColor Green
Write-Host "  Baslatma: $shortcutPath" -ForegroundColor Cyan
Write-Host "  Kapatma:  $stopShortcut" -ForegroundColor Cyan
Write-Host ""
Write-Host "Kullanim:" -ForegroundColor Yellow
Write-Host "  - 'ASM Platform' kisayoluna cift tikla → tum servisler ve masaustu uygulama acilir"
Write-Host "  - 'ASM Platform - Kapat' kisayoluna cift tikla → her sey kapanir"
Write-Host ""

if (-not (Test-Path $iconCandidate)) {
    Write-Host "Not: assets\icon.ico yok. Default Windows icon kullanildi." -ForegroundColor DarkGray
    Write-Host "Ozel ikon icin: apps\desktop\assets\icon.ico ekleyin, scripti tekrar calistirin." -ForegroundColor DarkGray
}
