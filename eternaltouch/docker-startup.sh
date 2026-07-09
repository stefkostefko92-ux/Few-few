#!/bin/sh
# =============================================================================
# Eternal Touch — Container startup script
#
# Handles three cases idempotently:
#   1. Fresh DB (no tables)        → prisma db push creates everything
#   2. Existing tables, valid       → skip push, start server
#   3. Existing tables, but stale   → reset + push (only if RESET_DB=1)
#
# This avoids the Prisma 5.22 bug where `db push --accept-data-loss` fails
# with "relation already exists" if tables exist without migration history.
# =============================================================================

set -e

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] [startup] $*"; }

log "checking database state..."

# Detect whether the schema already exists.
# - Tries to SELECT from AdminUser. If it works → TABLES_EXIST.
# - Common error codes for missing table: P2021 (Prisma), 42P01 (Postgres),
#   "no such table" (SQLite), "does not exist" (Postgres text).
TABLE_CHECK=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    await p.\$queryRaw\`SELECT 1 FROM \"AdminUser\" LIMIT 1\`;
    console.log('TABLES_EXIST');
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    if (
      e.code === 'P2021' ||
      msg.includes('does not exist') ||
      msg.includes('no such table') ||
      msg.includes('relation') ||
      (e.meta && e.meta.code === '42p01')
    ) {
      console.log('TABLES_MISSING');
    } else {
      console.log('UNKNOWN:' + (e.message || '').slice(0, 80));
    }
  } finally {
    await p.\$disconnect();
  }
})();
" 2>&1 | grep -E '^(TABLES_EXIST|TABLES_MISSING|UNKNOWN:)' | head -1)

log "database state: $TABLE_CHECK"

case "$TABLE_CHECK" in
  TABLES_EXIST)
    log "tables already exist, skipping prisma db push"
    log "(if you need to re-create the schema, set RESET_DB=1 and restart)"
    ;;
  TABLES_MISSING)
    log "fresh database detected, running prisma db push..."
    npx prisma db push --skip-generate --accept-data-loss
    log "schema created"
    ;;
  *)
    log "WARNING: could not determine database state. Attempting prisma db push anyway..."
    log "If this fails, run: docker compose down -v && docker compose up -d"
    # Try push but don't fail the container if it errors — server can still
    # start, and operator can investigate via /healthz
    npx prisma db push --skip-generate --accept-data-loss || \
      log "prisma db push failed — server starting anyway, check /healthz"
    ;;
esac

# Optional reset flag for development
if [ "${RESET_DB:-}" = "1" ]; then
  log "RESET_DB=1 set — forcing schema reset"
  npx prisma db push --skip-generate --accept-data-loss --force-reset
fi

log "starting node server..."
exec node src/server.js
