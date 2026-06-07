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

## Stack

Node 22 · TypeScript · Express 5 · zod. The data layer sits behind a
`PlayerRepository` interface with an **in-memory** implementation so the entire
game logic runs and is tested with zero external infra. Production swaps in a
Prisma/Postgres adapter — the reference model is in
[`prisma/schema.prisma`](prisma/schema.prisma) — plus Redis for matchmaking and
leaderboards, per GDD §11.

## Run

```bash
npm install
npm run dev          # tsx watch, listens on :3000 (PORT to override)
npm test             # vitest — 38 tests
npm run typecheck    # tsc --noEmit
```

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

Real auth/JWT, Postgres/Redis adapters, clans + WebSocket chat, leaderboards,
IAP receipt validation (RevenueCat/StoreKit/Play Billing), LiveOps admin
dashboard, analytics pipeline, and the Unity client (§11.1).
