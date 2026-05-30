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
  realtime/   Socket.IO game server (matchmaking + room authority + bots)
  worker/     BullMQ jobs                     (S6)
  web/        React + Vite shell              (S1)
packages/
  game-core/  6 engine cores, not 18 (chess, backgammon, santase, belote)
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
- [x] **S2 — game-core kernel + first 2 engines**: deterministic FSM contract
      (`init/legalActions/reduce/isTerminal/score/redact`), seeded PRNG +
      commit-reveal fairness (SHA-256), chess (via chess.js) and backgammon
      (full rules: bar/hits/bearing-off/gammon) engines, random-bot playout
      driver. Vitest: Fool's-mate → checkmate, full backgammon game to a winner,
      deterministic replay (13 tests).
- [x] **S3 — realtime server + chess end-to-end**: `apps/realtime` Socket.IO
      server with JWT-cookie handshake auth, Redis adapter (multi-instance),
      `/health`; MMR matchmaking on Redis ZSETs with widening window + bot
      fallback; authoritative `GameRoom` (validates every action vs
      `legalActions`, `redact` per seat, drives bot turns); per-game Elo +
      chips/xp persisted in a transaction; React chess board (interactive,
      legal-move highlights, orientation) wired over the socket. E2E: two
      players + player-vs-bot play full games via matchmaking, ratings update.
- [x] **S4 — trick-taking engine + Белот & Сантасе**: shared `trick` core,
      Сантасе/66 (trump, marriages, exchange, stock closing) and Белот (2v2
      bidding, suit contract, last-trick bonus, team scoring); N-seat
      matchmaking with bot-fill; web card layer (CardFace, useMatch, per-game
      views). Both playable online vs bots.
- [x] **S5 — economy + Stripe**: product catalog + DB mirror, Stripe Checkout
      (gems/chips) + VIP Subscriptions + Billing Portal; webhook with signature
      verification + idempotency (ProcessedEvent) — credit applied ONLY from
      the signed webhook, transactionally. No pay-to-win; chips never cashed
      out. Web shop view. E2E: signed event credits once, replay deduped, bad
      signature rejected.
- [x] **S6 — progression & retention**: daily-login streak rewards, quests
      (daily/weekly, advanced via an internal realtime→api hook), per-game
      leaderboards (Redis ZSET), level/XP curve; `apps/worker` (BullMQ) for
      season rollover + quest cleanup. Web shop + leaderboard + daily-reward UI.
      E2E: daily claim idempotent per day, quests complete, leaderboard + level
      update.
- [ ] S7 — remaining engines + games (betting, draw-discard, grid-guess, …)
- [ ] S8 — public SEO/AEO/GEO layer (Next.js 15)
- [ ] S9 — polish, anti-cheat signals, observability

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
