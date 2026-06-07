# KAGURA Backend — Deployment

> Status after the senior-review hardening pass: the operational scaffolding and
> the fail-fast/robustness blockers are in place. A short list of **pre-go-live
> requirements remains** (below) — most importantly a real IAP receipt validator.
> Treat this as "deployable to a staging/soft-launch environment", not yet
> "open to real-money traffic".

## Build & run

```bash
npm ci
npm run build          # prisma generate + tsc -> dist/  (compiled JS, no tests shipped)
npm run migrate:deploy # apply prisma/migrations to the target DB (run once per release)
npm run start:prod     # node dist/index.js
```

Or with the container image:

```bash
docker build -t kagura-backend ./backend
docker run --rm -p 3000:3000 --env-file backend/.env kagura-backend
# run migrations as a separate release step, not on every replica:
docker run --rm --env-file backend/.env kagura-backend npm run migrate:deploy
```

## Configuration (fail-fast)

In `NODE_ENV=production` the process **refuses to boot** (`src/config/env.ts`) if:
- `DATABASE_URL` is missing (won't silently run the non-durable in-memory store),
- `JWT_SECRET` / `IAP_RECEIPT_SECRET` / `IAP_WEBHOOK_SECRET` are missing or left at the in-source dev defaults,
- `JWT_SECRET` is shorter than 16 chars,
- `ENABLE_DEV_RECEIPTS=true`,
- no real IAP validator is configured and `ALLOW_STUB_RECEIPTS` is not explicitly set.

See `.env.example` for every variable. Set `TRUST_PROXY` to the LB hop count so
rate limiting keys on the real client IP.

## Operational endpoints

- `GET /healthz` (alias `/health`) — **liveness**: process is up. Cheap, no deps.
- `GET /readyz` — **readiness**: pings Postgres + Redis; returns `503` when a
  dependency is down or during shutdown. Wire this to the load balancer.

## Graceful shutdown

`SIGTERM`/`SIGINT` drains: stop new HTTP, close live WebSockets (`1001`), then
close the Postgres pool and Redis, with a 10s hard-exit fallback. Safe for
rolling redeploys.

## Security headers / TLS

Baseline headers (nosniff, frame-deny, HSTS, referrer, CORP) are set on every
response and `x-powered-by` is disabled. Terminate TLS at the LB; HSTS assumes
HTTPS. Auth cookies are `Secure` when `NODE_ENV=production`.

---

## Pre-go-live checklist (REQUIRED before real-money / public traffic)

These came out of the security + backend + DevOps reviews and are **not yet done**
— they need product/infra decisions or credentials this codebase can't supply:

1. **Real IAP receipt validation (BLOCKER).** The shipped `StubReceiptValidator`
   does only a local HMAC check — there is no Apple App Store Server API / Google
   Play Developer API / RevenueCat verification. Implement a real `ReceiptValidator`
   and remove `ALLOW_STUB_RECEIPTS`. Also harden the `/iap/webhook` trust model
   (verify the transaction out-of-band; don't trust `app_user_id` from the body).
2. **Distributed rate limiting.** The in-process limiter is per-replica and resets
   on restart. Move to a Redis-backed limiter with tight per-route budgets
   (especially `/auth/*`) and set `TRUST_PROXY` correctly.
3. **Money precision.** `coins` is `BigInt` in Postgres but narrowed to JS `number`
   in the repo/ledger; keep it `bigint` end-to-end through ledger aggregation to
   protect the audit-critical balance math past 2^53.
4. **Atomic registration.** `createPlayer` + credential write are two transactions;
   a crash between them orphans a minted player. Fold both into one unit of work.
   (The duplicate-device race is already mapped to a clean `409`.)
5. **WebSocket hardening.** Move the chat token out of the URL query (use a
   subprotocol/first-message), validate `Origin` on upgrade, and rate-limit
   inbound messages.
6. **Analytics consumer durability.** Add `XAUTOCLAIM` so a crashed consumer's
   pending entries are reclaimed, and back off (don't crash) on warehouse write
   failures.
7. **Observability.** Structured JSON logging with request IDs, a `/metrics`
   endpoint, and an error tracker. The app currently logs via `console.*`.
8. **Scaling note.** WS chat rooms/history are in-process — running >1 replica
   needs a Redis pub/sub backplane before chat fans out across nodes.
