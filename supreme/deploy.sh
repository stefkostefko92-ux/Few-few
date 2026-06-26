#!/bin/bash
# BotPanel — Production Deploy Script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  BotPanel — Production Deploy${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"

# ─── 1. Verify .env files exist and are filled in ────────────────────────────
echo -e "\n${YELLOW}[1/4] Checking .env files...${NC}"
MISSING=0
for f in backend/.env bot/.env frontend/.env .env; do
  if [ ! -f "$f" ]; then
    echo -e "${RED}  ✗ Missing: $f${NC}"
    MISSING=1
  else
    echo -e "${GREEN}  ✓ Found: $f${NC}"
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo -e "${RED}Create all missing .env files from .env.example before deploying.${NC}"
  echo "  cp backend/.env.example backend/.env"
  echo "  cp bot/.env.example     bot/.env"
  echo "  cp frontend/.env.example frontend/.env"
  echo "  cp .env.example          .env"
  exit 1
fi

# Critical value checks
if grep -q "PASTE_64_HEX_CHARS_HERE\|CHANGE_THIS" backend/.env 2>/dev/null; then
  echo -e "${RED}ERROR: Placeholder values still present in backend/.env${NC}"
  echo "       Fill in ENCRYPTION_KEY, SESSION_SECRET, API_SECRET, Discord OAuth keys"
  exit 1
fi
if grep -q "YOUR_DISCORD_BOT_TOKEN\|CHANGE_THIS" bot/.env 2>/dev/null; then
  echo -e "${RED}ERROR: Placeholder values still present in bot/.env${NC}"
  exit 1
fi
# frontend/.env is baked into the production bundle at build time — a leftover
# placeholder ships silently as broken invite links
if grep -q "YOUR_DISCORD_CLIENT_ID\|YOUR_DOMAIN" frontend/.env 2>/dev/null; then
  echo -e "${RED}ERROR: Placeholder values still present in frontend/.env${NC}"
  exit 1
fi
if grep -q "CHANGE_THIS" .env 2>/dev/null; then
  echo -e "${RED}ERROR: Placeholder database password still present in .env${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ No placeholder values found${NC}"

# ─── 2. Build and start ──────────────────────────────────────────────────────
echo -e "\n${YELLOW}[2/4] Building and starting Docker services...${NC}"
docker compose up -d --build
echo -e "${GREEN}  ✓ Services starting${NC}"

# ─── 3. Wait for backend health (migrations run automatically in entrypoint)
echo -e "\n${YELLOW}[3/4] Waiting for backend to become healthy (migrations run automatically)...${NC}"
TRIES=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' botpanel_backend 2>/dev/null)" = "healthy" ]; do
  TRIES=$((TRIES+1))
  if [ $TRIES -gt 60 ]; then
    echo -e "${RED}Backend unhealthy after 2 min. Check: docker compose logs backend${NC}"
    docker compose logs --tail=30 backend
    exit 1
  fi
  echo "  Waiting... ($TRIES/60)"
  sleep 2
done
echo -e "${GREEN}  ✓ Backend healthy (schema migrated)${NC}"

# ─── 4. Register Discord slash commands ──────────────────────────────────────
echo -e "\n${YELLOW}[4/4] Registering Discord slash commands...${NC}"
docker compose exec -T bot node src/deploy-commands.js && \
  echo -e "${GREEN}  ✓ Slash commands registered${NC}" || \
  echo -e "${YELLOW}  ⚠ Slash commands failed (check BOT_TOKEN and DISCORD_CLIENT_ID)${NC}"

echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ BotPanel is live!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Frontend available on: http://localhost:8080"
echo "  Put host nginx/Caddy in front with SSL for production"
echo ""
echo "  Next steps:"
echo "    1. Configure Stripe webhook → https://yourdomain.com/api/stripe/webhook"
echo "    2. Configure Discord OAuth redirect → https://yourdomain.com/api/auth/callback"
echo ""
echo "  Status: docker compose ps"
echo "  Logs:   docker compose logs -f"
