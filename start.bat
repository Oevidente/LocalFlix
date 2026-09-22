@echo off
setlocal EnableExtensions EnableDelayedExpansion
title CineLocal - Servidor de Midia Offline
chcp 65001 >nul 2>&1
cd /d "%~dp0"

:: Configuração da Porta (3050 por padrão para não conflitar com a porta 3000)
if "%PORT%"=="" set PORT=3050

echo ======================================================
echo    CineLocal - Biblioteca de Midia 100%% Offline
echo ======================================================
echo [INFO] Porta configurada: %PORT%
echo.

:: 1. Adicionar pasta 'bin' local ao PATH se existir
if exist "%~dp0bin" (
    set "PATH=%~dp0bin;%PATH%"
)

:: 2. Testar se o Node.js esta instalado e respondendo
node -v >nul 2>&1
if errorlevel 1 (
    goto :node_not_found
)

:: 3. Testar se o FFmpeg esta presente (informativo)
where ffmpeg >nul 2>&1
if errorlevel 1 (
    if not exist "%~dp0bin\ffmpeg.exe" (
        echo [AVISO] FFmpeg nao detectado (opcional).
        echo         - Videos MP4 e WebM funcionam normalmente.
        echo         - Para arquivos MKV com transcodificacao de audio, coloque
        echo           o ffmpeg.exe dentro da pasta 'bin\'.
        echo.
    ) else (
        echo [OK] FFmpeg portatil detectado em bin\
        echo.
    )
) else (
    echo [OK] FFmpeg detectado no sistema.
    echo.
)

:: 4. Verificar se a pasta node_modules existe
if not exist "%~dp0node_modules\" (
    echo [PRIMEIRA EXECUCAO] Instalando pacotes necessarios...
    echo Aguarde, esse processo ocorre apenas uma vez.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERRO] Falha ao executar 'npm install'.
        goto :error_exit
    )
    echo [OK] Pacotes instalados com sucesso!
    echo.
)

:: 5. Verificar se os arquivos de producao estao compilados
if not exist "%~dp0dist\server.cjs" (
    echo [INFO] Compilando CineLocal para modo offline...
    call npm run build
    if errorlevel 1 (
        echo [AVISO] Falha na compilacao de producao. Tentando iniciar em modo dev...
        goto :start_dev
    )
    echo [OK] Compilacao concluida com sucesso!
    echo.
)

:start_prod
echo ======================================================
echo    Iniciando servidor CineLocal na porta %PORT%...
echo    Acesse: http://localhost:%PORT%
echo ======================================================
echo (Mantenha esta janela aberta enquanto estiver assistindo)
echo.

start "" cmd /c "timeout /t 3 >nul 2>&1 || ping 127.0.0.1 -n 4 >nul & start http://localhost:%PORT%"

node dist\server.cjs
if errorlevel 1 (
    echo.
    echo [AVISO] Ocorreu uma interrupcao no servidor compilado.
    echo Tentando iniciar pelo modo de desenvolvimento (tsx)...
    goto :start_dev
)
goto :normal_exit

:start_dev
echo ======================================================
echo    Iniciando em modo Dev na porta %PORT%...
echo    Acesse: http://localhost:%PORT%
echo ======================================================
echo.

start "" cmd /c "timeout /t 3 >nul 2>&1 || ping 127.0.0.1 -n 4 >nul & start http://localhost:%PORT%"

call npx tsx server.ts
if errorlevel 1 (
    echo.
    echo [ERRO] O servidor encerrou com falha.
    goto :error_exit
)
goto :normal_exit

:node_not_found
echo ======================================================
echo    [ERRO CRITICO] NODE.JS NAO ENCONTRADO!
echo ======================================================
echo.
echo O CineLocal precisa do Node.js para rodar o servidor local.
echo Ele nao foi detectado no sistema nem na pasta 'bin\node.exe'.
echo.
echo Para resolver em 1 minuto:
echo 1. Baixe o instalador oficial gratuito (LTS) em:
echo    https://nodejs.org
echo 2. Instale com as opcoes padrao.
echo 3. Abra o start.bat novamente.
echo.
echo Pressione qualquer tecla para abrir o site do Node.js agora...
pause >nul
start https://nodejs.org
exit /b 1

:error_exit
echo.
echo ======================================================
echo   Ocorreu um erro durante a execucao.
echo   Verifique as mensagens exibidas acima.
echo ======================================================
echo.
pause
exit /b 1

:normal_exit
echo.
echo Servidor encerrado.
pause
exit /b 0
