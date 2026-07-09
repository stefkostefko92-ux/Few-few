#!/bin/bash
# ============================================================
# SETUP EMAIL — SMTP Aruba configuration
# Run this on VPS: bash scripts/setup-email.sh
# ============================================================

set -e

cd /var/www/panevascensori || { echo "ERR: /var/www/panevascensori not found"; exit 1; }

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERR: $ENV_FILE not found. Copy from .env.example first."
  exit 1
fi

echo ""
echo "=============================================="
echo "  PANEV — Setup email SMTP (Aruba)"
echo "=============================================="
echo ""
echo "Inserisci la password della casella info@panevascensori.it"
echo "(quella che usi per accedere alla webmail Aruba)"
echo ""
read -rsp "SMTP password: " SMTP_PASS
echo ""

if [ -z "$SMTP_PASS" ]; then
  echo "ERR: password vuota"
  exit 1
fi

# Remove existing SMTP_* lines
sed -i '/^SMTP_/d; /^MAIL_/d' "$ENV_FILE"

# Append new config
cat >> "$ENV_FILE" <<EOF

# ── Email SMTP (aggiunto da setup-email.sh) ──
SMTP_HOST=smtps.aruba.it
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@panevascensori.it
SMTP_PASS=$SMTP_PASS
MAIL_FROM="Panev Ascensori <info@panevascensori.it>"
MAIL_TO_ADMIN=info@panevascensori.it
EOF

echo ""
echo "✓ Configurazione SMTP scritta in .env"
echo ""
echo "Riavvio PM2..."
pm2 reload panev-web
echo ""
echo "✓ Fatto. Controlla i log con:"
echo "   pm2 logs panev-web --lines 30"
echo ""
echo "Poi vai su https://www.panevascensori.it/contatti.html e prova il form."
echo "Dovrebbe arrivare email sia all'admin che al mittente."
