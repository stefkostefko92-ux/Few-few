# KAGURA SPIN — Backend (prototype)

Server-authoritative game backend for the KAGURA SPIN core loop, implementing
the **Prototype** phase of the GDD roadmap (§13.1): `spin → build → attack →
raid → summon`, with a double-entry economy ledger and published gacha rates.

> See the full design in [`../docs/KAGURA_SPIN_GDD.md`](../docs/KAGURA_SPIN_GDD.md).

## Design principles realised here

| GDD principle | Where |
|---|---|
| Server-authoritative outcomes — client only animates | `services/gameService.ts`, `domain/spin.ts` |
| CSPRNG, never `Math.random` (§5.1, §11.3) | `domain/rng.ts` |
| Double-entry ledger for every value movement (§6.1) | `data/ledger.ts` |
| Tunable LiveOps config, zod-validated (§6.2) | `config/liveops.ts` |
| Predetermined raid spots — no client probing (§5.4) | `services/gameService.ts` `prepareRaid` |
| Published gacha drop rates + dual pity (§5.6, §12.2) | `domain/gacha.ts`, `GET /gacha/rates` |
| Single-use action grants (attack/raid) | `domain/types.ts` `PendingAttack`/`PendingRaid` |
| Postgres persistence + Redis leaderboards (§11.2, §7.2) | `data/prisma*.ts`, `services/leaderboard.ts` |

## Stack

Node 22 · TypeScript · Express 5 · zod · Prisma 7 (Postgres) · Redis (ioredis).

The data layer sits behind a `PlayerRepository` interface and an async `Ledger`
interface, with **two interchangeable backends**:

| Backend | When | Implementation |
|---|---|---|
| In-memory | default (no env) — tests & zero-infra dev | `data/memoryRepository.ts`, `MemoryLedger` |
| Postgres + Redis | `DATABASE_URL` / `REDIS_URL` set | `data/prismaRepository.ts`, `data/prismaLedger.ts`, `services/leaderboard.ts` |

`index.ts` picks the backend from the environment; the `GameService` and HTTP
routes are identical either way. The Postgres schema is
[`prisma/schema.prisma`](prisma/schema.prisma) (Player save-state as scalar
columns + JSONB; the double-entry ledger is relational so balances come from SQL
`SUM` aggregation). The global leaderboard uses Redis sorted sets (§7.2).

## Run

```bash
npm install              # also runs `prisma generate` (postinstall)

# A) Zero-infra (in-memory) — nothing else needed
npm run dev              # listens on :3000 (PORT to override)

# B) With Postgres + Redis
docker compose up -d                    # brings up PG + Redis
cp .env.example .env                    # DATABASE_URL + REDIS_URL
npm run db:push                         # create the schema
npm run dev

npm test                 # vitest — 38 in-memory tests (no infra)
npm run test:integration # 3 tests against a live PG (+ Redis); needs DATABASE_URL
npm run typecheck        # tsc --noEmit
```

Integration tests are skipped automatically when `DATABASE_URL` is unset, so the
default `npm test` never needs infra.

## API

| Method & path | Body | Purpose |
|---|---|---|
| `GET /health` | — | liveness |
| `GET /gacha/rates` | — | published drop rates + pity (regulatory, §12.2) |
| `POST /players` | `{ name }` | create a player (grants starting spins) |
| `GET /me` | — | current player (reconciles spin regen) |
| `POST /spin` | `{ betMultiplier }` | spin the Spirit Wheel |
| `POST /build` | `{ buildingIndex }` | upgrade a building; may unlock next island |
| `GET /attack/candidates` | — | matchmaking pool for an open attack |
| `POST /attack` | `{ targetId, buildingIndex }` | resolve a granted attack |
| `POST /raid` | `{ picks }` | dig a granted raid |
| `POST /gacha/pull` | — | summon a companion |

Auth is a placeholder `x-player-id` header for the prototype; production uses JWT
+ device binding (§11.2). Pass it on every authenticated request.

```bash
# Example
PID=$(curl -s -XPOST localhost:3000/players -H 'content-type: application/json' \
      -d '{"name":"Hana"}' | jq -r .player.id)
curl -s -XPOST localhost:3000/spin -H "x-player-id: $PID" \
     -H 'content-type: application/json' -d '{"betMultiplier":1}'
```

## What this prototype proves

- The economy can't be cheated off-book: every test asserts **ledger
  conservation** (`netForCurrency === 0`) and that each player's balance equals
  the sum of their ledger legs.
- Gacha pity guarantees hold under the worst possible rolls (★5 by 50, ★6 by 90).
- The reel weight distribution matches LiveOps config within tolerance over
  200k samples.

## Not yet built (next slices)

Real auth/JWT + device binding, clans + WebSocket chat, IAP receipt validation
(RevenueCat/StoreKit/Play Billing), LiveOps admin dashboard, analytics pipeline,
and the Unity client (§11.1). Cross-aggregate atomicity (player save + ledger in
one DB transaction) is also a follow-up — the current Prisma backend writes them
in separate transactions, fine for the prototype.
