#!/bin/bash
set -e
[ -z "$1" ] && echo "Uso: ./scripts/restore.sh <file.sql.gz>" && exit 1
gunzip -c "$1" | docker compose exec -T postgres psql -U erp_admin -d erp_ascensori
echo "Ripristinato: $1"
