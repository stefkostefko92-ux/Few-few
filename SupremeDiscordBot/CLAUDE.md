# SupremeDiscordBot/ — Supreme Bot (Discord SaaS)

Multi-tenant Discord bot management SaaS: ticket systems, forms, applications, AI
auto-replies, round-robin assignment, white-label custom bots, Stripe
subscriptions. Root rules live in the repo-root `CLAUDE.md`.

_Stack: Node.js **plain JS (ESM)** · Express · discord.js v14 · React 18 + Vite ·
Prisma + PostgreSQL · Redis · Docker · nginx. Three packages under `SupremeDiscordBot/`:
`backend/` (API), `bot/` (Discord gateway), `frontend/` (React SPA)._

## Commands (each package has its own; `cd` into it)

```bash
# backend/ — Express API + Prisma
npm run dev            # nodemon src/index.js
npm run db:migrate     # prisma migrate dev   (db:deploy in prod)
npm test               # vitest run

# bot/ — discord.js gateway worker
npm run dev

# frontend/ — React + Vite  (serves 127.0.0.1:8080, host nginx/Caddy in front for TLS)
npm run dev
```

Full stack + Postgres + Redis come up via `docker-compose.yml`. See `README.md`
(port map) and `SECURITY.md`.

## Conventions (important)

- **Plain JavaScript, ESM** everywhere; validate input with **Zod**.
- **Stripe is money-critical.** Webhooks are **signature-verified on the raw body**
  and **idempotent by `event.id``**; grants (e.g. `isPremium`) are provisioned only
  through a verified webhook, never from a client redirect or client-supplied amount.
  The webhook route sits **outside** the rate limiter.
- **Multi-tenant isolation.** Every query/mutation is scoped by `serverId` — never
  trust a client-supplied id (guard against cross-tenant IDOR on forms, verification,
  schedules, spawn).
- **Discord (discord.js v14):** least-privilege gateway intents; ready via
  `Events.ClientReady`; ephemeral replies via `MessageFlags`; `defer` long
  interactions; authorize privileged commands (`/ticket`, `/premium`, custom-bot).
  Harden any user-supplied regex (length cap + nested-quantifier guard) against ReDoS.
- **Secrets at rest:** Discord OAuth tokens are encrypted; fail-fast on placeholder
  secrets (never ship `POSTGRES_PASSWORD=changeme`). Init Sentry before instrumented
  libs (`instrument.js`).
- Legal/compliance artifacts live in `SupremeDiscordBot/legal/` (DPA, RoPA, breach procedure).
- Deployment: Docker Compose; ports bind to `127.0.0.1` only, TLS terminated by a
  host reverse proxy.
