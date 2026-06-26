# Supreme Bot — Discord SaaS Platform

Multi-tenant Discord bot management SaaS. Ticket systems, forms, applications,
AI auto-replies, round-robin assignment, white-label bots, Stripe subscriptions.

**Stack:** Node.js · React 18 · Discord.js v14 · PostgreSQL · Redis · Docker · nginx

---

## Port Map (chosen to avoid VPS conflicts)

| Service  | Host port | Container port | Notes |
|----------|-----------|----------------|-------|
| Frontend | `127.0.0.1:8080` | 8080    | Localhost-only — put host nginx/Caddy in front for SSL |
| Postgres | `5435`    | 5432           | localhost-only bind (127.0.0.1:5435) |
| Redis    | `6381`    | 6379           | localhost-only bind (127.0.0.1:6381) |
| Backend  | —         | 3000           | Internal only, reached via frontend nginx |
| Bot      | —         | 3001           | Internal only, called by backend |

These ports avoid conflicts with Stefko's VPS: `3002` (syndicate_backend), `3100/4100/4101` (ERP), `4000` (nexus), `4180` (sklad), `5000` (tretimart), `5432/5433/5434` (existing postgres), `5173` (syndicate_frontend), `6379/6380` (existing redis).

---

## Quick Deploy on VPS (178.104.77.242)

```bash
# 1. Upload from your local machine
scp -r discord-saas-bot/ root@178.104.77.242:/opt/botpanel
ssh root@178.104.77.242
cd /opt/botpanel

# 2. Create all .env files
cp .env.example               .env
cp backend/.env.example       backend/.env
cp bot/.env.example           bot/.env
cp frontend/.env.example      frontend/.env

# 3. Generate secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → paste into backend/.env → ENCRYPTION_KEY

openssl rand -base64 32
# → paste SAME VALUE into backend/.env → API_SECRET AND bot/.env → API_SECRET

openssl rand -base64 32
# → paste into backend/.env → SESSION_SECRET

openssl rand -base64 24 | tr -d '/+='
# → paste into .env → POSTGRES_PASSWORD (and update backend/.env DATABASE_URL to match)

# 4. Fill in Discord + Stripe credentials (see tables below)

# 5. Deploy
chmod +x deploy.sh
./deploy.sh
```

The deploy script will:
1. Verify all `.env` files exist and have no placeholder values
2. Build & start Docker services
3. Wait for backend to become healthy (migrations run automatically at container start)
4. Register Discord slash commands

---

## Environment Variables

### `.env` (docker-compose)

| Variable | Required | Default |
|---|---|---|
| `POSTGRES_DB` | ✅ | `discordbot` |
| `POSTGRES_USER` | ✅ | `bot` |
| `POSTGRES_PASSWORD` | ✅ | — (required, no safe default) |

### `backend/.env`

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://bot:PASS@postgres:5432/discordbot` — use `postgres` (service name), NOT `localhost` |
| `SESSION_SECRET` | ✅ | 32+ char random |
| `ENCRYPTION_KEY` | ✅ | **64 hex chars** — encrypts custom bot tokens in DB |
| `DISCORD_CLIENT_ID` | ✅ | From discord.com/developers → OAuth2 |
| `DISCORD_CLIENT_SECRET` | ✅ | From discord.com/developers → OAuth2 |
| `DISCORD_REDIRECT_URI` | ✅ | `https://yourdomain.com/api/auth/callback` |
| `MAIN_OWNER_ID` | ✅ | Your Discord user ID (grants platform admin) |
| `API_SECRET` | ✅ | Must match `bot/.env` exactly |
| `FRONTEND_URL` | ✅ | `https://yourdomain.com` (no trailing slash) |
| `BOT_API_URL` | ✅ | `http://bot:3001` |
| `STRIPE_SECRET_KEY` | ⚠️ | Required for payments |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ | From Stripe Dashboard → Webhooks |
| `STRIPE_PRICE_ID` | ⚠️ | Monthly Premium recurring price |
| `STRIPE_TRIAL_DAYS` | ➖ | Default `14`, set `0` to disable |
| `ANTHROPIC_API_KEY` | ➖ | Required only for the AI auto-reply feature (Claude) |
| `BOT_TOKEN` | ⚠️ | Same token as `bot/.env` — needed for round-robin role lookups |
| `REDIS_URL` | ➖ | `redis://redis:6379` — status page cache health check |
| `SENTRY_DSN` | ➖ | Error monitoring |

### `bot/.env`

| Variable | Required | Notes |
|---|---|---|
| `BOT_TOKEN` | ✅ | Discord bot token |
| `DISCORD_CLIENT_ID` | ✅ | Same as backend |
| `API_URL` | ✅ | `http://backend:3000/api` |
| `API_SECRET` | ✅ | Must match `backend/.env` |
| `BOT_API_PORT` | ✅ | `3001` |
| `FRONTEND_URL` | ✅ | `https://yourdomain.com` |
| `ARCHIVE_BASE_URL` | ✅ | `https://yourdomain.com` |
| `REDIS_URL` | ✅ | `redis://redis:6379` (Docker internal) |
| `SENTRY_DSN` | ➖ | Optional |

### `frontend/.env`

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | ✅ | `/api` (proxied by nginx) |
| `VITE_CLIENT_ID` | ✅ | Discord client ID |
| `VITE_COMPANY_NAME` | ✅ | Shown in legal pages |
| `VITE_COMPANY_COUNTRY` | ✅ | Shown in legal pages |
| `VITE_CONTACT_EMAIL` | ✅ | Legal contact |
| `VITE_SUPPORT_URL` | ✅ | Discord invite link |

---

## Host Nginx Reverse Proxy (for SSL)

Put this in front of the container's `:8080`. Example `/etc/nginx/sites-available/botpanel.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Stripe webhooks can be large — raise max body size
    client_max_body_size 2M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}
```

Then: `sudo ln -s ../sites-available/botpanel.conf /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`.

---

## Post-Deploy Configuration

### 1. Discord OAuth2 Redirect URI
```
discord.com/developers → Applications → Your App → OAuth2 → Redirects
Add: https://yourdomain.com/api/auth/callback
```

### 2. Discord Bot Privileged Intents
```
discord.com/developers → Your App → Bot
Enable:
  ✓ Server Members Intent
  ✓ Message Content Intent
```

Bot invite URL (replace `CLIENT_ID`):
```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=8
```

### 3. Stripe Webhook
```
Stripe Dashboard → Developers → Webhooks → Add endpoint
URL: https://yourdomain.com/api/stripe/webhook
Events:
  - checkout.session.completed
  - invoice.paid
  - invoice.payment_failed
  - customer.subscription.deleted
  - customer.subscription.updated
```

Copy the signing secret → `backend/.env` → `STRIPE_WEBHOOK_SECRET`, then restart backend.

---

## Architecture

```
Internet
    │
    ▼
Host nginx (SSL terminate)
    │
    ▼
Frontend container :8080 (nginx + built React SPA)
    │
    ├── /api/* ─────────► Backend container :3000 (Express + Prisma)
    │                          │
    │                          ├── Postgres :5432 (internal)
    │                          ├── Redis    :6379 (internal)
    │                          └── Bot      :3001 (internal, for panel spawns etc.)
    │
    └── /*      ─────────► React SPA (built at image build time)
```

Only `frontend:8080` is exposed to the host. Postgres & Redis are bound to `127.0.0.1:5435` / `127.0.0.1:6381` for direct admin access from the VPS itself but are not public.

---

## Management

```bash
# Status
docker compose ps

# Logs
docker compose logs -f          # all
docker compose logs -f backend  # specific

# Restart one service
docker compose restart backend

# Update after code change
./update.sh

# Stop everything (data preserved)
docker compose down

# Destroy everything including data (DESTRUCTIVE)
docker compose down -v

# DB shell
docker compose exec postgres psql -U bot -d discordbot

# Run migrations manually
docker compose exec backend npx prisma migrate deploy

# Re-register slash commands
docker compose exec bot node src/deploy-commands.js

# Run tests
docker compose exec backend npm test
docker compose exec bot     npm test
```

---

## Features

### Free Tier
- Up to 3 ticket panels, 2 forms, 10 questions/form
- HTML transcripts (30-day retention)
- Core slash commands

### Premium (€9.99/server/month · 14-day free trial)
- Unlimited panels, forms, questions
- HTML transcripts (forever) + real PDF export (pdfkit) + CSV export
- AI auto-replies (Anthropic Claude)
- Round-robin ticket assignment
- White-label bot (custom name, avatar, token — AES-256-GCM encrypted)

---

## Slash Commands

| Command | Description |
|---|---|
| `/ticket add/remove/claim/unclaim/close` | Manage tickets |
| `/apply <form>` | Start application form via DM |
| `/panel spawn <name>` | Post a ticket panel in a channel |
| `/form spawn <name>` | Post a form button in a channel |
| `/form review <id> <action>` | Approve/deny/interview an application |
| `/setup sync` | Re-sync panels from dashboard |
| `/premium status/custombot/export` | Premium commands |

---

## Legal Pages
Served by the frontend SPA at `/terms`, `/privacy`, `/cookies`, `/eula`. Content pulled from `VITE_COMPANY_*` env vars at build time.

---

## Security
- AES-256-GCM encryption for custom bot tokens in DB
- Session cookies: HttpOnly, Secure (production), SameSite=Lax, signed
- Rate limiting: 200/min global, 20/15min auth, 600/min bot-internal
- Helmet.js HTTP security headers (HSTS in production, 1-year max-age)
- Discord OAuth2 token auto-refresh on expiry
- Admin destructive actions require `?confirm=true`
- Postgres + Redis bound to localhost only — not exposed to public internet
- `.dockerignore` prevents `.env` and `node_modules` from leaking into images

---

## Production Fixes Applied

This build includes the following fixes over the original codebase:
1. Prisma initial migration regenerated with complete DDL (was empty — only enums)
2. `formSession.js` — fixed runtime crashes from undefined `activeSessions`
3. `auth.js` logout — now clears the correct cookie name (`sid`)
4. Added `/api/bot/application/:id/review` so Discord review buttons actually work (was 401)
5. Stripe `current_period_end` — handles new API (`items.data[0].current_period_end`)
6. Removed fake PDF endpoint in `tickets.js` (real one is in `export.js` via pdfkit)
7. `docker-entrypoint.sh` runs `prisma migrate deploy` on every container start
8. Ports remapped to avoid conflicts with other VPS services
9. Nginx reverse proxy built into frontend container
10. Postgres/Redis bound to localhost only
11. `.dockerignore` files added
12. Prisma CLI moved to dependencies (was devDependency but needed at runtime)
13. Helmet — HSTS added, body size limited to 1MB
