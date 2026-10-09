#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Qui Bulgaria — deploy quasi automatico per VPS (Docker).
# Uso:  ./deploy.sh            (interattivo)
#       ADMIN_EMAIL=... ADMIN_PASSWORD=... SITE_URL=... ./deploy.sh   (non interattivo)
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[0;33m%s\033[0m\n" "$1"; }

# 1. Verifica Docker -------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker non è installato. Su Ubuntu/Debian:  apt update && apt install -y docker.io docker-compose-plugin"
  exit 1
fi
COMPOSE="docker compose"
$COMPOSE version >/dev/null 2>&1 || COMPOSE="docker-compose"

# 2. Prepara il file .env --------------------------------------------------
if [ ! -f .env ]; then
  green "→ Creo il file .env"
  ADMIN_EMAIL="${ADMIN_EMAIL:-}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
  SITE_URL="${SITE_URL:-https://www.scuolabulgaramilano.it}"

  if [ -z "$ADMIN_EMAIL" ]; then
    read -r -p "Email amministratore [admin@scuolabulgaramilano.it]: " ADMIN_EMAIL
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@scuolabulgaramilano.it}"
  fi
  if [ -z "$ADMIN_PASSWORD" ]; then
    while [ -z "$ADMIN_PASSWORD" ]; do
      read -r -s -p "Password amministratore: " ADMIN_PASSWORD; echo
    done
  fi

  # AUTH_SECRET: generato qui se possibile, altrimenti lo crea l'entrypoint.
  if command -v openssl >/dev/null 2>&1; then
    AUTH_SECRET="$(openssl rand -base64 32 | tr -d '\n=')"
  else
    AUTH_SECRET=""
  fi

  cat > .env <<EOF
DATABASE_URL="file:/app/data/app.db"
UPLOADS_DIR="/app/data/uploads"
ADMIN_EMAIL="${ADMIN_EMAIL}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
AUTH_SECRET="${AUTH_SECRET}"
SITE_URL="${SITE_URL}"
NODE_ENV="production"
EOF
  chmod 600 .env
  green "→ .env creato (permessi 600)."
else
  yellow "→ .env già presente: lo riuso."
fi

# 3. Build + avvio ---------------------------------------------------------
green "→ Build e avvio dei container (può richiedere qualche minuto la prima volta)…"
$COMPOSE up -d --build

echo
green "✓ Fatto! Il sito è attivo su http://localhost:3000"
echo   "  • Pannello admin:  http://localhost:3000/admin"
echo   "  • Metti nginx + HTTPS davanti (vedi DEPLOY.md) e attiva il GeoIP per la lingua."
echo   "  • Aggiornamenti futuri:  git pull && ./deploy.sh"
