@echo off
title CineLocal - Servidor Offline
cd /d "%~dp0"

:: Porta alternativa para nao conflitar com a 3000
set PORT=3050

echo ======================================================
echo    CineLocal - Servidor Offline (Porta %PORT%)
echo ======================================================
echo.
echo Iniciando servidor em http://localhost:%PORT% ...
echo (Pressione Ctrl+C para encerrar)
echo.

:: Se houver pasta bin com ffmpeg, adiciona ao PATH
if exist "%~dp0bin" set "PATH=%~dp0bin;%PATH%"

:: Abre o navegador automaticamente apos 3 segundos
start "" cmd /c "timeout /t 3 >nul 2>&1 & start http://localhost:%PORT%"

:: Executa o CineLocal diretamente pelo npm run dev
call npm run dev

echo.
echo Servidor encerrado.
pause
