#!/usr/bin/env bash
# Inicia el Portal Canvia Market en segundo plano y espera a /api/salud.
# Variables: PORTAL_PUERTO (3000), PORTAL_ESPERA (30 s), PORTAL_DIR (carpeta del portal).
# En GitHub Actions publica la salida "url" y exporta PORTAL_URL para los pasos siguientes.
set -euo pipefail

PUERTO="${PORTAL_PUERTO:-3000}"
ESPERA="${PORTAL_ESPERA:-30}"
DIR="${PORTAL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/portal-canvia.log"
URL="http://localhost:${PUERTO}"

if ! command -v node >/dev/null 2>&1; then
  echo "::error::Node.js no está instalado. Agrega actions/setup-node antes de este paso."
  exit 1
fi
MAYOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAYOR" -lt 20 ]; then
  echo "::error::El portal requiere Node 20 o superior (encontrado $(node --version))."
  exit 1
fi

echo "Iniciando Portal Canvia Market en ${URL} (Node $(node --version))"
PORT="$PUERTO" nohup node "$DIR/server.js" >"$LOG" 2>&1 &
PID=$!
echo "$PID" >"${LOG%.log}.pid"

salud() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "${URL}/api/salud" >/dev/null 2>&1
  else
    node -e "fetch('${URL}/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  fi
}

for ((i = 1; i <= ESPERA; i++)); do
  if salud; then
    echo "Portal listo en ${URL} (PID ${PID}, ${i} s)"
    if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "url=${URL}" >>"$GITHUB_OUTPUT"; fi
    if [ -n "${GITHUB_ENV:-}" ]; then echo "PORTAL_URL=${URL}" >>"$GITHUB_ENV"; fi
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "::error::El portal se detuvo al iniciar. Log:"
    cat "$LOG"
    exit 1
  fi
  sleep 1
done

echo "::error::El portal no respondió en ${ESPERA} s. Log:"
cat "$LOG"
exit 1
