@echo off
title CineLocal - Servidor Offline
cd /d "%~dp0"

:: Configuração de Porta
set PORT=3050

:: Se houver pasta bin local (com ffmpeg/node portátil), adiciona ao PATH
if exist "%~dp0bin" set "PATH=%~dp0bin;%PATH%"

echo ======================================================
echo    CineLocal - Servidor Offline (Porta %PORT%)
echo ======================================================
echo.

:: Se a pasta node_modules não existir, ou faltar o novo pacote hls.js, instala
if not exist "%~dp0node_modules" (
    echo [INFO] Primeira execucao detectada. Instalando dependencias...
    call npm install
    echo.
) else if not exist "%~dp0node_modules\hls.js" (
    echo [INFO] Atualizando novas dependencias (hls.js)...
    call npm install
    echo.
)

echo Iniciando o CineLocal em http://localhost:%PORT% ...
echo (Pressione Ctrl+C para encerrar)
echo.

:: Abre o navegador automaticamente apos 3 segundos
start "" cmd /c "timeout /t 3 /nobreak >nul 2>&1 & start http://localhost:%PORT%"

:: Inicia o CineLocal
call npm run dev

echo.
echo ======================================================
echo Servidor encerrado.
echo ======================================================
pause
