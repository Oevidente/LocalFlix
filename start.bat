@echo off
title CineLocal - Servidor de Midia Offline
chcp 65001 > nul
cd /d "%~dp0"

echo ======================================================
echo    CineLocal - Biblioteca de Midia 100%% Offline
echo ======================================================
echo.

:: 1. Verificar Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    if exist "bin\node.exe" (
        set PATH=%~dp0bin;%PATH%
    ) else (
        echo [AVISO] Node.js nao encontrado no sistema nem em bin\node.exe.
        echo Por favor instale o Node.js LTS ou coloque node.exe na pasta bin\
        pause
        exit /b 1
    )
)

:: 2. Verificar ffmpeg portatil
if exist "bin\ffmpeg.exe" (
    echo [OK] ffmpeg portatil detectado em bin\
    set PATH=%~dp0bin;%PATH%
) else (
    where ffmpeg >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [OK] ffmpeg detectado no sistema.
    ) else (
        echo [AVISO] ffmpeg nao encontrado!
        echo Para reproduzir MKV e transcodificar audios, baixe o ffmpeg.exe e ffprobe.exe e coloque na pasta 'bin\'.
    )
)

echo.
echo Iniciando servidor CineLocal na porta 3000...
echo.

:: Abrir navegador apos 2 segundos em segundo plano
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Executar servidor
if exist "dist\server.cjs" (
    node dist\server.cjs
) else (
    call npm start || call npx tsx server.ts
)

pause
