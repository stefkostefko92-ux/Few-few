# Ivan/ — sklad (складов backend)

Inventory / warehouse (**склад**) management: a backend API + frontend, deployable
behind nginx at sklad.carbonstealth.eu. Root rules live in the repo-root `CLAUDE.md`.

_Stack: `backend/` — Node.js **plain JS** (CommonJS) · Express 4 · Prisma 6 + PostgreSQL ·
`jsonwebtoken` (session in an HttpOnly cookie) · `bcryptjs` (PINs) · `zod` (every input) ·
`pino` (logs); `frontend/` — one `index.html` (React UMD + in-browser Babel from unpkg,
pinned with SRI); `nginx/` + `nginx-host.conf`. Containerised via `docker-compose.yml`._

## Commands (run inside `Ivan/backend/`)

```bash
npm ci
npm test                 # node:test against real PostgreSQL: TEST_DATABASE_URL to a DB whose name ends in _test
npm run dev              # node --watch src/index.js (needs DATABASE_URL and JWT_SECRET ≥ 32 chars)
npm run db:push          # npx prisma db push
npm run db:seed          # node src/seed.js — roles, settings, hashes leftover plaintext PINs
```

## Layout

```
backend/src/index.js       boot: config → Prisma → app.listen
backend/src/app.js         createApp() — middleware order, routers, error handler (tests call it directly)
backend/src/config.js      env via zod; refuses to start without JWT_SECRET ≥ 32 chars
backend/src/security.js    PIN hash/verify, session cookie, requireUser (role read from the DB), same-origin guard
backend/src/limiter.js     login lockout: per account (5 fails → 15 min, doubling up to 24 h) and per IP
backend/src/validate.js    zod schemas for every request body
backend/src/access.js      requirePerm, isSuper, addAudit, HttpError
backend/src/routes/        auth · users · roles · stock (parts + orders) · admin (audit, notifications, settings)
backend/src/seed.js        idempotent seed run on every container start (exit 1 on failure)
backend/test/              harness + auth/access/stock/seed/units tests
backend/prisma/            schema.prisma
frontend/index.html        client app
nginx/ · nginx-host.conf   reverse proxy in the container · host vhost (TLS, HSTS, CSP)
deploy.sh                  idempotent deploy; creates/rotates the secrets in /var/www/sklad/.env
```

## Conventions (important)

- **Plain JavaScript** on the backend; validate every input with the schemas in `validate.js`.
- **Secrets only in `/var/www/sklad/.env` on the server (mode 600).** `docker-compose.yml` has no
  defaults (`${VAR:?…}`); `deploy.sh` generates `JWT_SECRET`/`DB_PASSWORD` when missing and rotates the
  values that were once public in this repo (it compares SHA-256 fingerprints, never the values).
- **Sessions:** JWT in the `sklad_session` cookie (HttpOnly, SameSite=Strict, Secure in production,
  12 h). The token carries only the user id and a fingerprint of the stored PIN hash: the role is read
  from the DB on every request, a new PIN ends every older session, a deleted user is out at once.
  No token in JavaScript or localStorage.
- **PINs:** bcrypt (cost 12), never returned by the API. New/changed PINs are 6–12 digits. An old 4-digit
  PIN still logs in, but that session (`wk` claim) reaches only `/api/auth/me` and `POST /api/auth/pin`
  until the person picks a new PIN (403 `PIN_CHANGE_REQUIRED` elsewhere; the UI shows the change screen).
  Plaintext PINs never authenticate — the seed hashes them.
- **Login:** email + PIN, one generic error for unknown email and wrong PIN, no public list of users.
  Emails are stored lowercase (zod on input, the seed for old rows) and looked up **exactly** — a
  case-insensitive Prisma filter is `ILIKE` in PostgreSQL, where `_`/`%` are wildcards. The lockout is keyed
  by the account (`u:<id>`), so no spelling of an email gets its own five tries; the PIN change shares it.
- **No CORS** (the frontend is same-origin). Every state-changing request must be JSON and, when the
  browser sends `Origin`, come from our host.
- **Authorization:** `requirePerm` on every mutating route. Only SUPER_ADMIN grants/edits/deletes
  SUPER_ADMIN; nobody changes their own role; at least one SUPER_ADMIN remains; a role can't be given a
  permission the granter lacks, and with „Потребители“ you neither give a role with a permission you lack
  nor touch (PIN, role, delete) someone whose role has one; only SUPER_ADMIN clears the audit log (and the
  clearing is audited).
- **Stock:** order quantities are positive integers; stock is decremented with a conditional update in the
  order transaction (no overselling, duplicate lines are summed); totals come from DB prices; without
  `canSeePrice` prices are hidden and an edit keeps the stored price.
- Errors: clients get a generic message; details go to the pino log without PII.
- CDN scripts carry `integrity` (SRI). When bumping React/Babel, recompute the sha384 hashes.
- Deploy via Docker Compose behind nginx (`deploy.sh`); the DB schema uses `prisma db push` at container
  start (no destructive changes are applied without `--accept-data-loss`).
