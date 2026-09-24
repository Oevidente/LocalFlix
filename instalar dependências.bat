@echo off
setlocal EnableExtensions EnableDelayedExpansion
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

:: Verifica se o Node.js esta presente (portatil ou no sistema)
if not exist "%PORTABLE_NODE%" (
    where node >nul 2>&1
    if errorlevel 1 (
        echo [AVISO] Node.js nao foi detectado no sistema nem na pasta bin\.
        echo.
        echo O CineLocal pode baixar e configurar o Node.js LTS portatil automaticamente
        echo diretamente na pasta bin\, tornando o aplicativo 100%% portatil para pendrive
        echo sem necessidade de instalador do Windows ou permissoes de administrador.
        echo.
        set "AUTO_NODE="
        set /p "AUTO_NODE=Deseja baixar o Node.js portatil automaticamente agora? [S/N] (Padrao: S): "
        if "!AUTO_NODE!"=="" set "AUTO_NODE=S"
        if /i "!AUTO_NODE!"=="S" (
            echo.
            powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%scripts\install-portable-node.ps1" -TargetDir "%APP_DIR%bin"
            echo.
        )
    )
)

if exist "%PORTABLE_NODE%" (
    set "NODE_CMD=%PORTABLE_NODE%"
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo [ERRO] Node.js nao foi encontrado.
        echo.
        echo Para resolver, utilize uma das opcoes abaixo:
        echo  1. Execute este arquivo novamente e aceite o download automatico do Node portatil.
        echo  2. Baixe o instalador oficial LTS em: https://nodejs.org/
        echo  3. Ou instale via terminal Windows: winget install OpenJS.NodeJS.LTS
        echo  4. Ou coloque os executaveis node.exe e npm na pasta:
        echo     %APP_DIR%bin\
        echo.
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
        echo O npm acompanha a distribuicao oficial do Node.js LTS.
        echo Execute este arquivo e aceite o download automatico para obter o npm na pasta bin\.
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

:: ======================================================
:: Verificacao e extracao automatica de EXTRAIA.rar / EXTRAIR.rar
:: ======================================================
set "FOUND_RAR="
set "RAR_TARGET="

:: 1. Primeiro verifica se existe dentro da pasta bin (preferencial)
if exist "%APP_DIR%bin\EXTRAIA.rar" (
    set "FOUND_RAR=%APP_DIR%bin\EXTRAIA.rar"
    set "RAR_TARGET=%APP_DIR%bin"
) else if exist "%APP_DIR%bin\EXTRAIR.rar" (
    set "FOUND_RAR=%APP_DIR%bin\EXTRAIR.rar"
    set "RAR_TARGET=%APP_DIR%bin"
) else if exist "%APP_DIR%EXTRAIA.rar" (
    set "FOUND_RAR=%APP_DIR%EXTRAIA.rar"
    set "RAR_TARGET=%APP_DIR%"
) else if exist "%APP_DIR%EXTRAIR.rar" (
    set "FOUND_RAR=%APP_DIR%EXTRAIR.rar"
    set "RAR_TARGET=%APP_DIR%"
)

if defined FOUND_RAR (
    echo.
    echo ======================================================
    echo Localizado: !FOUND_RAR!
    echo Extraindo diretamente em: !RAR_TARGET! (sem gerar nova pasta)...
    echo ======================================================
    set "RAR_EXTRACTED=0"

    set "CLEAN_TARGET=!RAR_TARGET!"
    if "!CLEAN_TARGET:~-1!"=="\" set "CLEAN_TARGET=!CLEAN_TARGET:~0,-1!"

    pushd "!CLEAN_TARGET!"

    :: 1. Tenta 7-Zip na pasta bin do app
    if exist "%APP_DIR%bin\7z.exe" (
        "%APP_DIR%bin\7z.exe" x -y "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )

    :: 2. Tenta UnRAR na pasta bin do app
    if "!RAR_EXTRACTED!"=="0" if exist "%APP_DIR%bin\unrar.exe" (
        "%APP_DIR%bin\unrar.exe" x -y -o+ "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )

    :: 3. Tenta WinRAR na pasta bin do app
    if "!RAR_EXTRACTED!"=="0" if exist "%APP_DIR%bin\WinRAR.exe" (
        "%APP_DIR%bin\WinRAR.exe" x -ibck -y -o+ "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )

    :: 4. Tenta 7-Zip no PATH do sistema
    if "!RAR_EXTRACTED!"=="0" (
        where 7z >nul 2>&1
        if not errorlevel 1 (
            7z x -y "!FOUND_RAR!" >nul 2>&1
            if not errorlevel 1 set "RAR_EXTRACTED=1"
        )
    )

    :: 5. Tenta 7-Zip nas pastas padrao de instalacao do Windows
    if "!RAR_EXTRACTED!"=="0" if exist "%ProgramFiles%\7-Zip\7z.exe" (
        "%ProgramFiles%\7-Zip\7z.exe" x -y "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )
    if "!RAR_EXTRACTED!"=="0" if exist "%ProgramFiles(x86)%\7-Zip\7z.exe" (
        "%ProgramFiles(x86)%\7-Zip\7z.exe" x -y "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )
    if "!RAR_EXTRACTED!"=="0" if exist "%LOCALAPPDATA%\Programs\7-Zip\7z.exe" (
        "%LOCALAPPDATA%\Programs\7-Zip\7z.exe" x -y "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )

    :: 6. Tenta WinRAR / UnRAR no PATH ou em Program Files
    if "!RAR_EXTRACTED!"=="0" (
        where winrar >nul 2>&1
        if not errorlevel 1 (
            winrar x -ibck -y -o+ "!FOUND_RAR!" >nul 2>&1
            if not errorlevel 1 set "RAR_EXTRACTED=1"
        )
    )
    if "!RAR_EXTRACTED!"=="0" (
        where unrar >nul 2>&1
        if not errorlevel 1 (
            unrar x -y -o+ "!FOUND_RAR!" >nul 2>&1
            if not errorlevel 1 set "RAR_EXTRACTED=1"
        )
    )
    if "!RAR_EXTRACTED!"=="0" if exist "%ProgramFiles%\WinRAR\WinRAR.exe" (
        "%ProgramFiles%\WinRAR\WinRAR.exe" x -ibck -y -o+ "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )
    if "!RAR_EXTRACTED!"=="0" if exist "%ProgramFiles(x86)%\WinRAR\WinRAR.exe" (
        "%ProgramFiles(x86)%\WinRAR\WinRAR.exe" x -ibck -y -o+ "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )
    if "!RAR_EXTRACTED!"=="0" if exist "%ProgramFiles%\WinRAR\UnRAR.exe" (
        "%ProgramFiles%\WinRAR\UnRAR.exe" x -y -o+ "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )
    if "!RAR_EXTRACTED!"=="0" if exist "%ProgramFiles(x86)%\WinRAR\UnRAR.exe" (
        "%ProgramFiles(x86)%\WinRAR\UnRAR.exe" x -y -o+ "!FOUND_RAR!" >nul 2>&1
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )

    :: 7. Tenta tar.exe nativo
    if "!RAR_EXTRACTED!"=="0" (
        where tar >nul 2>&1
        if not errorlevel 1 (
            tar -xf "!FOUND_RAR!" >nul 2>&1
            if not errorlevel 1 set "RAR_EXTRACTED=1"
        )
    )

    :: 8. Script auxiliar PowerShell com suporte a caminhos longos
    if "!RAR_EXTRACTED!"=="0" (
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%scripts\extract-rar.ps1" -RarPath "!FOUND_RAR!" -TargetDir "!CLEAN_TARGET!"
        if not errorlevel 1 set "RAR_EXTRACTED=1"
    )

    popd

    if "!RAR_EXTRACTED!"=="1" (
        echo [OK] !FOUND_RAR! extraido com sucesso em !CLEAN_TARGET!\ sem criar nova pasta.
        if exist "%APP_DIR%bin\ffmpeg.exe" (
            echo [OK] FFmpeg detectado em: %APP_DIR%bin\ffmpeg.exe
        )
    ) else (
        echo [AVISO] O arquivo !FOUND_RAR! foi encontrado, mas nao foi possivel extrai-lo automaticamente.
        echo Por favor, instale o WinRAR/7-Zip ou extraia o conteudo de !FOUND_RAR!
        echo diretamente para a pasta: !CLEAN_TARGET!\
        echo sem criar uma subpasta.
    )
)

echo Agora voce pode executar o start.bat.
pause
exit /b 0
