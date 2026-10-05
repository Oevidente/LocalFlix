@echo off
title CineLocal - Servidor Offline
cd /d "%~dp0"

:: Valida se o arquivo de fato esta sendo executado de dentro da pasta raiz do projeto
if not exist "%~dp0package.json" (
    echo ======================================================================
    echo                     [ERRO DE EXECUCAO - CINELOCAL]
    echo ======================================================================
    echo.
    echo O arquivo "start.bat" foi executado fora de sua pasta original!
    echo.
    echo Caminho de execucao atual: %~dp0
    echo.
    echo CAUSA PROVAVEL:
    echo Voce provavelmente COPIOU o arquivo "start.bat" diretamente para a
    echo Area de Trabalho (ou outra pasta) em vez de criar um ATALHO.
    echo.
    echo COMO CORRIGIR:
    echo 1. Va ate a pasta original onde voce extraiu o CineLocal.
    echo 2. Clique com o BOTAO DIREITO no arquivo "start.bat" original.
    echo 3. Selecione "Mostrar mais opcoes" (no Windows 11) ou diretamente
    echo    "Enviar para" -^> "Area de Trabalho (criar atalho)".
    echo 4. Delete este arquivo "start.bat" que voce copiou na Area de Trabalho,
    echo    e use apenas o ATALHO criado para abrir o programa.
    echo.
    echo ======================================================================
    pause
    exit /b 1
)

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
echo.
echo Para o navegador liberar a instalacao do PWA pelo endereco IP,
echo o certificado HTTPS precisa ser confiavel neste perfil do Windows.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { Import-Certificate -FilePath '%HTTPS_CERT_DIR%\cinelocal.crt' -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null; exit 0 } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
    echo [AVISO] Nao foi possivel confiar automaticamente no certificado.
) else (
    echo [OK] Certificado confiavel automaticamente para o usuario atual do Windows.
)
:: Tenta liberar a porta no Firewall do Windows para redes locais e Tailscale
netsh advfirewall firewall add rule name="CineLocal" dir=in action=allow protocol=TCP localport=%PORT%,%CAST_MEDIA_PORT% profile=any >nul 2>&1

:: Obtem o endereco IP local da rede para acesso no celular
set "LOCAL_IP="
for /f "usebackq tokens=*" %%i in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike '*Tailscale*' } | Select-Object -ExpandProperty IPAddress -First 1)"`) do set "LOCAL_IP=%%i"

:: Obtem o endereco IP especifico do Tailscale (se ativo)
set "TAILSCALE_IP="
for /f "usebackq tokens=*" %%i in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object { $_.IPAddress -like '100.*' -or $_.InterfaceAlias -like '*Tailscale*' } | Select-Object -ExpandProperty IPAddress -First 1)"`) do set "TAILSCALE_IP=%%i"

if defined LOCAL_IP (
    set "BROWSER_URL=https://%LOCAL_IP%:%PORT%"
    echo Iniciando servidor em https://%LOCAL_IP%:%PORT% ...
    echo Endereco HTTPS para acessar no celular: https://%LOCAL_IP%:%PORT%
) else (
    set "BROWSER_URL=https://localhost:%PORT%"
    echo [AVISO] Nao foi possivel detectar o IP local; abrindo localhost.
    echo Iniciando servidor em https://localhost:%PORT% ...
)
if defined TAILSCALE_IP (
    echo Endereco Nuvem Multi-PC (Tailscale): https://%TAILSCALE_IP%:%PORT%
)
echo Porta HTTP auxiliar para o Chromecast: %CAST_MEDIA_PORT%
echo Certificado para instalar no celular: %HTTPS_CERT_DIR%\cinelocal.crt
echo (Pressione Ctrl+C para encerrar)
echo.

:: Se houver pasta bin ou ffmpeg com os executaveis, adiciona ao PATH
if exist "%~dp0bin" set "PATH=%~dp0bin;%PATH%"
if exist "%~dp0ffmpeg\bin" set "PATH=%~dp0ffmpeg\bin;%PATH%"
if exist "%~dp0ffmpeg" set "PATH=%~dp0ffmpeg;%PATH%"

:: Verifica o runtime e as dependencias JavaScript antes de iniciar
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao foi encontrado.
    echo Execute "instalar dependências.bat" ou coloque node.exe na pasta bin.
    pause
    exit /b 1
)
where npm.cmd >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] npm nao foi encontrado.
    echo Instale o Node.js LTS ou use uma distribuicao portatil completa.
    pause
    exit /b 1
)
if not exist "%~dp0node_modules\tsx" (
    echo [ERRO] Dependencias do CineLocal nao foram instaladas.
    echo Execute primeiro "instalar dependências.bat".
    pause
    exit /b 1
)
if not exist "%~dp0node_modules\vite-plugin-pwa" (
    echo [AVISO] O modulo vite-plugin-pwa ainda nao esta instalado na pasta node_modules.
    echo Tentando atualizar dependencias automaticamente...
    call npm.cmd install vite-plugin-pwa --save
    if errorlevel 1 (
        echo [AVISO] Nao foi possivel baixar o modulo vite-plugin-pwa agora.
        echo O CineLocal prosseguira com o servidor offline padrao.
    )
)

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

:: Abre o PWA instalado ou, se nao existir, o endereco no navegador
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-cinelocal.ps1" -Url "%BROWSER_URL%"

:: Define modo de producao para usar a interface compilada de forma rapida, leve e estavel
set "NODE_ENV=production"

:: Executa o CineLocal (preferindo dist/server.cjs compilado ou tsx server.ts)
if exist "%~dp0dist\server.cjs" if exist "%~dp0dist\index.html" (
    node "%~dp0dist\server.cjs"
) else (
    call npm run dev
)

echo.
echo Servidor encerrado.
pause
