#!/bin/sh
set -e

# Ensure the data directory exists (mounted volume on the VPS).
mkdir -p /app/data/uploads

# Apply the schema to the SQLite database. Initial content is seeded
# automatically by the app on first request (idempotent), so no tsx needed.
echo "→ Applying database schema…"
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss || true

echo "→ Starting server…"
exec "$@"
