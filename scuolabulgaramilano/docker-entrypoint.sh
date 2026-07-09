#!/bin/sh
set -e

# Ensure the data directory exists (mounted volume on the VPS).
mkdir -p /app/data/uploads

# Auto-generate and persist a session secret if none was provided, so the
# deployment works out of the box and the secret stays stable across restarts.
if [ -z "$AUTH_SECRET" ]; then
  if [ -f /app/data/.auth_secret ]; then
    AUTH_SECRET="$(cat /app/data/.auth_secret)"
  else
    AUTH_SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n=' )"
    echo "$AUTH_SECRET" > /app/data/.auth_secret
    echo "→ Generated a new AUTH_SECRET (stored in the data volume)."
  fi
  export AUTH_SECRET
fi

# If only a plaintext admin password is provided, derive a bcrypt hash at boot
# so the running process never compares against the plaintext.
if [ -n "$ADMIN_PASSWORD" ] && [ -z "$ADMIN_PASSWORD_HASH" ]; then
  ADMIN_PASSWORD_HASH="$(node -e "console.log(require('bcryptjs').hashSync(process.env.ADMIN_PASSWORD,12))" 2>/dev/null || true)"
  [ -n "$ADMIN_PASSWORD_HASH" ] && export ADMIN_PASSWORD_HASH
fi

# Apply the schema to the SQLite database. Initial content is seeded
# automatically by the app on first request (idempotent), so no tsx needed.
echo "→ Applying database schema…"
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss || true

echo "→ Starting server…"
exec "$@"
