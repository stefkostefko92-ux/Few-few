# Gaming/ — АСО (premium browser gaming portal)

Premium browser portal for 21 card / table / cue-sport games: realtime
multiplayer, a **server-authoritative** game engine, ELO/MMR matchmaking,
progression, VIP subscriptions (Stripe) and a virtual **chips + gems** economy
(**no real-money gambling**). Root rules live in the repo-root `CLAUDE.md`.

_Stack: Node 22 · **TypeScript (strict)** · Express 5 · Prisma + PostgreSQL ·
Redis · BullMQ · React 18 + Vite + Tailwind · Socket.IO · Next.js (marketing).
Turborepo + pnpm workspaces._

## Layout

```
apps/api/         Express 5 REST API (auth, economy, shop, progression, webhooks)
apps/web/         React + Vite game client (game scenes, deterministic 2D physics)
apps/realtime/    Socket.IO realtime server
apps/worker/      BullMQ background jobs
apps/marketing/   Next.js marketing site (multi-language, prerender, SEO/AEO)
packages/db/      Prisma schema + client (@aso/db)
packages/game-core/  shared deterministic engine (client + server)
packages/shared/, packages/config/   shared types + config
infra/nginx/      reverse proxy
```

## Commands (run at `Gaming/` root — turbo fans out)

```bash
pnpm dev                 # turbo run dev
pnpm build               # turbo run build
pnpm lint                # turbo run lint
pnpm typecheck           # turbo run typecheck
pnpm test                # turbo run test
pnpm db:generate         # pnpm --filter @aso/db generate
pnpm db:migrate          # pnpm --filter @aso/db migrate:deploy
```

## Conventions (important)

- **Strict TypeScript** across all apps/packages; shared code lives in `packages/`.
- **Server-authoritative:** never trust the client for game state, economy, or
  matchmaking outcomes; the deterministic engine in `game-core` runs on both sides
  but the **server is the source of truth**.
- **Money-critical Stripe:** verified idempotent webhooks provision entitlements;
  the virtual economy is **not** real-money gambling — keep that boundary explicit.
- **Realtime:** Socket.IO for live play; heavy/async work goes through BullMQ
  (`apps/worker`), not the request path.
- CI: `.github/workflows/ci.yml` (lint + typecheck + test); see `SECURITY.md`,
  `LAUNCH.md`, `CONTRIBUTING.md`.
