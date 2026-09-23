@echo off
setlocal EnableExtensions
title CineLocal - Instalar dependencias
cd /d "%~dp0"

set "APP_DIR=%~dp0"
set "PATH=%APP_DIR%bin;%APP_DIR%ffmpeg\bin;%APP_DIR%ffmpeg;%PATH%"

:: Keep npm's download cache on the same drive as the portable app.
set "npm_config_cache=%APP_DIR%.cache\npm"
set "npm_config_update_notifier=false"
set "npm_config_fund=false"
set "npm_config_audit=false"

echo ======================================================
echo    CineLocal - Instalar dependencias
echo ======================================================
echo.
echo Este procedimento precisa de internet na primeira execucao.
echo Depois disso, a pasta node_modules pode ser levada no pendrive.
echo.

if not exist "%APP_DIR%package.json" (
    echo [ERRO] package.json nao foi encontrado em:
    echo        %APP_DIR%
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao foi encontrado.
    echo.
    echo Instale o Node.js LTS no computador ou coloque node.exe em:
    echo        %APP_DIR%bin\node.exe
    echo.
    echo O node.exe portatil pode acompanhar o CineLocal no pendrive.
    pause
    exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [ERRO] npm nao foi encontrado.
    echo O npm acompanha a instalacao normal do Node.js LTS.
    pause
    exit /b 1
)

for /f "delims=" %%V in ('node --version 2^>nul') do set "NODE_VERSION=%%V"
for /f "delims=" %%V in ('npm.cmd --version 2^>nul') do set "NPM_VERSION=%%V"
echo Node.js: %NODE_VERSION%
echo npm:     %NPM_VERSION%
echo.
echo Instalando dependencias do CineLocal...
echo A cache do npm sera mantida em:
echo %npm_config_cache%
echo.

call npm.cmd install --include=dev
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel instalar as dependencias.
    echo Verifique a internet e tente executar este arquivo novamente.
    pause
    exit /b 1
)

if not exist "%APP_DIR%node_modules\tsx" (
    echo [ERRO] A dependencia tsx nao foi instalada corretamente.
    pause
    exit /b 1
)
if not exist "%APP_DIR%node_modules\hls.js" (
    echo [ERRO] A dependencia hls.js nao foi instalada corretamente.
    pause
    exit /b 1
)
if not exist "%APP_DIR%node_modules\vite-plugin-pwa" (
    echo [ERRO] A dependencia vite-plugin-pwa nao foi instalada corretamente.
    pause
    exit /b 1
)

where ffmpeg >nul 2>&1
if errorlevel 1 if not exist "%APP_DIR%bin\ffmpeg.exe" (
    echo.
    echo [AVISO] FFmpeg nao foi encontrado.
    echo Arquivos MKV precisarao do botao de instalacao do FFmpeg no CineLocal,
    echo ou de ffmpeg.exe e ffprobe.exe dentro da pasta bin.
)

echo.
echo [OK] Dependencias instaladas com sucesso.
echo Agora voce pode executar o start.bat.
pause
exit /b 0
