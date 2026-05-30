# АСО — Premium Browser Gaming Portal

Premium browser portal for 18 card/table games with realtime multiplayer, a
server-authoritative game engine, ELO/MMR matchmaking, deep progression, VIP
subscriptions (Stripe) and a virtual **chips + gems** economy (no real-money
gambling). Visual identity: _Premium Nocturnal Tabletop_.

> Brand: **АСО** · Built by **Carbon Stealth VCC** · `https://carbonstealth.eu`

## Stack

Node 22 · TypeScript (strict) · Express 5 · Prisma + PostgreSQL · Redis ·
BullMQ · React 18 + Vite + Tailwind · PixiJS v8 + GSAP (game canvas) ·
Socket.IO (realtime). pnpm + Turborepo monorepo.

## Monorepo layout

```
apps/
  api/        Express 5 REST (auth, profile, shop, stripe, leaderboard)
  realtime/   Socket.IO game server          (S3)
  worker/     BullMQ jobs                     (S6)
  web/        React + Vite shell              (S1)
packages/
  game-core/  6 engine cores, not 18          (S2)
  db/         Prisma schema + client
  shared/     zod schemas, types, constants
  config/     eslint / tsconfig presets
infra/        Dockerfiles, docker-compose, nginx
```

## Roadmap status

- [x] **S0 — Scaffold + infra**: pnpm/Turborepo monorepo, Prisma schema,
      Express 5 API with `/health`, pino, zod env validation, argon2id auth
      (register/login/refresh/logout/me) with httpOnly JWT cookies, rate
      limiting, CORS whitelist, Docker compose (postgres + redis + api), nginx.
- [x] **S1 — Design system + shell**: `tokens.css` (§3.2) + Tailwind preset,
      self-hosted Playfair Display + Manrope (BG Cyrillic validated), UI kit
      (Button/Panel/Badge/Modal/Field), React 18 + Vite shell with auth screens
      (login/register), session restore via cookie, lobby with the 18-game
      catalog, i18n (bg/it/en), Carbon Stealth footer.
- [ ] S2 — game-core kernel + first 2 engines
- [ ] S3 — realtime server + first end-to-end game (chess)
- [ ] S4–S9 — see concept doc

## Develop

```bash
pnpm install
cp .env.example .env            # fill JWT secrets: openssl rand -hex 32

# bring up postgres + redis via Docker
docker compose -f infra/docker-compose.yml up -d postgres redis

pnpm --filter @aso/db generate
pnpm --filter @aso/db migrate:deploy   # or migrate:dev in development
pnpm --filter @aso/api dev      # API on :4500
pnpm --filter @aso/web dev      # web shell on :4502 (proxies /api -> :4500)

curl http://localhost:4500/health        # -> {"status":"ok",...}
# open http://localhost:4502 for the login flow
```

### Commands

| Command          | What                       |
| ---------------- | -------------------------- |
| `pnpm build`     | build all packages (turbo) |
| `pnpm typecheck` | strict typecheck           |
| `pnpm lint`      | eslint (no `any`)          |
| `pnpm test`      | vitest                     |

## Ports (S18 — verify with `ss -tlnp` before deploy)

| Service  | Port |
| -------- | ---- |
| api      | 4500 |
| realtime | 4501 |
| web      | 4502 |
| postgres | 5437 |
| redis    | 6383 |

## Principles

- TS strict, never `any` → `unknown` + zod. Every external input crosses zod.
- Server-authoritative game state; client only renders + optimistic UI.
- Never pay-to-win. Money buys cosmetics + comfort. Chips are never cashed out.
- Stripe credit only from signed, idempotent webhooks.
- JWT in httpOnly cookies; argon2id; rate limit; CORS whitelist; pino without PII.
