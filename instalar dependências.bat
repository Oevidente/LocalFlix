@echo off
setlocal EnableExtensions
title CineLocal - Instalar dependencias
cd /d "%~dp0"

set "APP_DIR=%~dp0"
set "PATH=%APP_DIR%bin;%APP_DIR%ffmpeg\bin;%APP_DIR%ffmpeg;%PATH%"

:: Mantem o cache do npm no mesmo disco do app para uso portatil.
set "npm_config_cache=%APP_DIR%.cache\npm"
set "npm_config_update_notifier=false"
set "npm_config_fund=false"
set "npm_config_audit=false"

set "PORTABLE_NODE=%APP_DIR%bin\node.exe"
set "PORTABLE_NPM=%APP_DIR%bin\npm.cmd"
set "NPM_CMD=npm.cmd"

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

if exist "%PORTABLE_NODE%" (
    set "NODE_CMD=%PORTABLE_NODE%"
) else (
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
    set "NODE_CMD=node"
)

if exist "%PORTABLE_NPM%" (
    set "NPM_CMD=%PORTABLE_NPM%"
) else (
    where npm.cmd >nul 2>&1
    if errorlevel 1 (
        echo [ERRO] npm nao foi encontrado.
        echo O npm acompanha a instalacao normal do Node.js LTS.
        pause
        exit /b 1
    )
    set "NPM_CMD=npm.cmd"
)

for /f "delims=" %%V in ('"%NODE_CMD%" --version 2^>nul') do set "NODE_VERSION=%%V"
for /f "delims=" %%V in ('"%NPM_CMD%" --version 2^>nul') do set "NPM_VERSION=%%V"
echo Node.js: %NODE_VERSION%
echo npm:     %NPM_VERSION%
echo.
echo Instalando dependencias do CineLocal...
echo Cache do npm: %npm_config_cache%
echo.

call "%NPM_CMD%" install --include=dev
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel instalar as dependencias.
    echo Verifique a internet, o acesso ao npm e tente executar este arquivo novamente.
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
