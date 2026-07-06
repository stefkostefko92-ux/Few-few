#!/bin/bash
# BotPanel — Update Script (run after code changes)
set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔄 Rebuilding BotPanel...${NC}"

# Stop services but keep volumes (data preserved)
docker compose down

# Rebuild images and start fresh
docker compose up -d --build

echo -e "${YELLOW}Waiting for backend (migrations run automatically)...${NC}"
TRIES=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' botpanel_backend 2>/dev/null)" = "healthy" ]; do
  TRIES=$((TRIES+1))
  if [ $TRIES -gt 60 ]; then
    echo "Backend unhealthy — check: docker compose logs backend"
    exit 1
  fi
  sleep 2
done

echo -e "${GREEN}✅ Update complete${NC}"
echo ""
echo "Status: docker compose ps"
echo "Logs:   docker compose logs -f"
