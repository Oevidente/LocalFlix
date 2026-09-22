@echo off
title CineLocal - Servidor Offline
cd /d "%~dp0"

:: Porta alternativa para nao conflitar com a 3000
set PORT=3050
set /a CAST_MEDIA_PORT=%PORT%+1
set "HTTPS=true"
set "HTTPS_CERT_DIR=%~dp0certs"
set "HTTPS_PFX_PASSPHRASE=CineLocal-HTTPS-Local"
:: Cache HLS no mesmo disco da instalação, evitando ocupar a unidade C:
:: Para usar outro disco, troque por exemplo por: set "HLS_CACHE_DIR=D:\CineLocalCache\hls"
set "HLS_CACHE_DIR=%~dp0.cache\hls"
set "HLS_CACHE_MAX_MB=4096"

echo ======================================================
echo    CineLocal - Servidor Offline (Porta %PORT%)
echo ======================================================
echo.
echo Preparando certificado HTTPS local...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-https-cert.ps1" -OutputDirectory "%HTTPS_CERT_DIR%"
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Nao foi possivel criar o certificado HTTPS local.
    echo Verifique se o Windows PowerShell esta disponivel e tente novamente.
    pause
    exit /b 1
)
echo Iniciando servidor em https://localhost:%PORT% ...
echo Porta HTTP auxiliar para o Chromecast: %CAST_MEDIA_PORT%
echo Certificado para instalar no celular: %HTTPS_CERT_DIR%\cinelocal.crt
echo (Pressione Ctrl+C para encerrar)
echo.

:: Se houver pasta bin ou ffmpeg com os executaveis, adiciona ao PATH
if exist "%~dp0bin" set "PATH=%~dp0bin;%PATH%"
if exist "%~dp0ffmpeg\bin" set "PATH=%~dp0ffmpeg\bin;%PATH%"
if exist "%~dp0ffmpeg" set "PATH=%~dp0ffmpeg;%PATH%"

:: Verifica se o FFmpeg esta presente
where ffmpeg >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if not exist "%~dp0bin\ffmpeg.exe" (
        echo [AVISO] FFmpeg ainda nao detectado.
        echo Para reproduzir MKV, voce podera clicar em 'Instalar FFmpeg Automaticamente'
        echo diretamente na tela do aplicativo ou no icone de Status do CineLocal.
        echo.
    )
)

:: Abre o navegador automaticamente apos 3 segundos
start "" cmd /c "timeout /t 3 >nul 2>&1 & start https://localhost:%PORT%"

:: Executa o CineLocal diretamente pelo npm run dev
call npm run dev

echo.
echo Servidor encerrado.
pause
