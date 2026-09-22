@echo off
setlocal enabledelayedexpansion
title CineLocal - Servidor Offline
cd /d "%~dp0"

:: Porta configurada para o servidor local
set PORT=3050

echo ======================================================
echo    CineLocal - Servidor Offline (Porta %PORT%)
echo ======================================================
echo.

:: Se houver pasta bin local (com ffmpeg/node portatil), adiciona ao PATH
if exist "%~dp0bin" (
    set "PATH=%~dp0bin;%PATH%"
)

:: Verifica se o Node.js esta instalado ou acessivel
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema ou na pasta bin!
    echo Por favor, instale o Node.js em https://nodejs.org ou coloque o node.exe na pasta bin.
    echo.
    pause
    exit /b 1
)

:: Verifica se as dependencias precisam ser instaladas ou atualizadas
set "NEED_INSTALL=0"
if not exist "%~dp0node_modules" (
    set "NEED_INSTALL=1"
) else if not exist "%~dp0node_modules\hls.js" (
    set "NEED_INSTALL=1"
) else if not exist "%~dp0node_modules\tsx" (
    set "NEED_INSTALL=1"
)

if "!NEED_INSTALL!"=="1" (
    echo [INFO] Instalando/atualizando dependencias necessarias (npm install)...
    echo Isso ocorre apenas na primeira execucao ou apos atualizacoes.
    echo.
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERRO] Falha ao instalar as dependencias via npm.
        echo Verifique sua conexao com a internet ou permissoes de pasta.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencias instaladas com sucesso!
    echo.
) else (
    echo [OK] Dependencias verificadas e prontas.
)

echo Iniciando servidor em http://localhost:%PORT% ...
echo (Pressione Ctrl+C para encerrar)
echo.

:: Abre o navegador automaticamente apos 3 segundos
start "" cmd /c "timeout /t 3 >nul 2>&1 & start http://localhost:%PORT%"

:: Executa o CineLocal
call npm run dev

echo.
echo Servidor encerrado.
pause

