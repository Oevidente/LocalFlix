#!/usr/bin/env bash
# CineLocal - Inicializador Portátil Linux / Mac
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "======================================================"
echo "   CineLocal - Biblioteca de Mídia 100% Offline"
echo "======================================================"
echo ""

# Adiciona pasta bin local ao PATH se existir
if [ -d "$DIR/bin" ]; then
  export PATH="$DIR/bin:$PATH"
fi

# Abre o navegador padrão após 2 segundos
(sleep 2 && (xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null || true)) &

if [ -f "$DIR/dist/server.cjs" ]; then
  node "$DIR/dist/server.cjs"
else
  npm start || npx tsx server.ts
fi
