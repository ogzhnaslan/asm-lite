@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

cd /d "%ROOT%"

echo ========================================
echo ASM baslatiliyor...
echo ROOT: %ROOT%
echo ========================================

echo [1/4] Docker servisleri baslatiliyor (postgres + redis)...
docker compose up -d
if errorlevel 1 (
    echo HATA: Docker compose baslatma basarisiz. Docker Desktop calisiyor mu?
    pause
    exit /b 1
)

echo [2/4] API baslatiliyor...
start "ASM - API" /min cmd /k "cd /d "%ROOT%" && pnpm dev:api"

echo [3/4] Worker baslatiliyor...
start "ASM - Worker" cmd /k "cd /d "%ROOT%" && pnpm dev:worker"

echo [4/4] Web baslatiliyor...
start "ASM - Web" /min cmd /k "cd /d "%ROOT%" && pnpm dev:web"

echo API hazir olana kadar bekleniyor: http://localhost:3000/docs
:WAIT_API
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000/docs | findstr /r "^[23]" >nul 2>&1
if errorlevel 1 goto WAIT_API

echo Web hazir olana kadar bekleniyor: http://localhost:5173
:WAIT_WEB
timeout /t 1 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:5173 | findstr /r "^[23]" >nul 2>&1
if errorlevel 1 goto WAIT_WEB

echo ASM aciliyor...
start http://localhost:5173

endlocal