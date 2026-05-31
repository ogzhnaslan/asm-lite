@echo off
setlocal EnableExtensions

REM ===========================================================================
REM ASM Platform — Desktop Launcher
REM
REM Bu .bat dosyasi:
REM   1. Docker servislerini baslatir (postgres + redis)
REM   2. API'yi minimize cmd penceresinde baslatir
REM   3. Worker'i ayri cmd penceresinde baslatir
REM   4. Web (Vite) dev sunucusunu minimize baslatir
REM   5. Vite hazir olunca Electron masaustu uygulamasini acar
REM
REM Kullanim:
REM   - Cift tikla (E:\Projects\asm\start-desktop.bat)
REM   - veya Masaustune kisayol olustur (manuel veya make-desktop-shortcut.ps1)
REM
REM Kapatmak icin: Electron'u kapat, sonra cmd pencerelerini Ctrl+C ile durdur.
REM ===========================================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

cd /d "%ROOT%"

echo ============================================================
echo   ASM Platform - Desktop Launcher
echo   ROOT: %ROOT%
echo ============================================================
echo.

REM --- 1) Docker servisleri ------------------------------------------------
echo [1/5] Docker servisleri baslatiliyor (postgres + redis)...
docker compose up -d
if errorlevel 1 (
    echo.
    echo HATA: Docker compose baslatma basarisiz.
    echo - Docker Desktop calisiyor mu?
    echo - Mevcut konteynerlar conflict yapiyor olabilir.
    pause
    exit /b 1
)

REM --- 2) Ollama health check ---------------------------------------------
REM NOT: cmd.exe IF bloku icindeki echo satirlarinda parantez kullanma; ic
REM parantez IF blokunu erken kapatir ve ". was unexpected at this time." hatasi verir.
echo [2/5] Ollama servisi kontrol ediliyor...
curl -s -o nul -w "%%{http_code}" http://localhost:11434/api/version | findstr "200" >nul 2>&1
if errorlevel 1 (
    echo UYARI: Ollama erisilemez. URL: http://localhost:11434
    echo - AI Gorsel Analiz modulu calismaz. Once "ollama serve" calistirin.
    echo - Devam ediliyor...
    timeout /t 3 >nul
) else (
    echo Ollama: OK
)

REM --- 3) API ---------------------------------------------------------------
echo [3/5] API baslatiliyor (port 3000)...
start "ASM - API" /min cmd /k "cd /d "%ROOT%" && pnpm dev:api"

REM --- 4) Worker ------------------------------------------------------------
echo [4/5] Worker baslatiliyor...
start "ASM - Worker" /min cmd /k "cd /d "%ROOT%\apps\worker" && pnpm start"

REM --- 5) Web (Vite dev) ----------------------------------------------------
echo [5/5] Web (Vite) baslatiliyor (port 5173)...
start "ASM - Web" /min cmd /k "cd /d "%ROOT%" && pnpm dev:web"

REM --- API ve Web hazir olana kadar bekle ---------------------------------
echo.
echo API hazir olana kadar bekleniyor: http://localhost:3000/health
:WAIT_API
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000/health | findstr /r "^[23]" >nul 2>&1
if errorlevel 1 goto WAIT_API
echo API: OK

echo Web hazir olana kadar bekleniyor: http://localhost:5173
:WAIT_WEB
timeout /t 1 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:5173 | findstr /r "^[23]" >nul 2>&1
if errorlevel 1 goto WAIT_WEB
echo Web: OK

REM --- Electron'u ac ------------------------------------------------------
echo.
echo ============================================================
echo   Tum servisler hazir. ASM Platform aciliyor...
echo ============================================================
echo.

cd /d "%ROOT%"
REM pnpm desktop:dev: electron'u VITE_DEV_SERVER_URL=http://localhost:5173 ile baslatir.
REM Bu pencere Electron uygulamasi acik kaldigi surece acik kalir.
call pnpm desktop:dev

REM Electron kapandiginda buraya doneriz.
echo.
echo ASM Platform kapatildi.
echo Diger servisler hala calisiyor: API, Worker, Web, Docker
echo Manuel kapatma: cmd pencerelerinde Ctrl+C, Docker Desktop'tan durdurma.
echo.
pause

endlocal
