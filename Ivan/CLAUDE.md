# Ivan/ — sklad (складов backend)

Inventory / warehouse (**склад**) management: a backend API + frontend, deployable
behind nginx. Root rules live in the repo-root `CLAUDE.md`.

_Stack: `backend/` — Node.js **plain JS** · Express · Prisma · JWT (`jsonwebtoken`)
· CORS; plus `frontend/` and `nginx/`. Containerised via `docker-compose.yml`._

## Commands (run inside `Ivan/backend/`)

```bash
npm run dev              # node --watch src/index.js
npm start                # node src/index.js
npm run db:push          # npx prisma db push
npm run db:seed          # node src/seed.js
```

## Layout

```
backend/src/       Express API (routes, auth, business logic)
backend/prisma/    schema.prisma
frontend/          client app
nginx/             reverse-proxy config
docker-compose.yml full stack
```

## Conventions (important)

- **Plain JavaScript** on the backend; validate input; scope every query to the
  authenticated user/tenant (no IDOR).
- **Auth:** JWT (`jsonwebtoken`); keep the signing secret out of the repo (`.env`).
- **Prisma:** singleton client; `db:push` for schema, `db:seed` for initial data
  (keep seeds idempotent).
- CORS configured deliberately — don't widen to `*` in production.
- Deploy via Docker Compose behind nginx.
