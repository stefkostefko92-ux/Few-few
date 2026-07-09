# zabobovdol/ — граждански портал за Бобов дол

Digital assistant for an aging population: local services directory, 500+
step-by-step „Как да…“ (how-to) guides for e-government, listings, events, news,
mutual aid, spending transparency, and accessibility tooling.

_Stack: Next.js 15 (App Router) · React 19 · TypeScript · Prisma · PostgreSQL ·
Tailwind. Root rules (Bulgarian, one-project-per-change, GDPR-first) live in the
repo-root `CLAUDE.md`._

## Commands (run inside `zabobovdol/`)

```bash
npm install
cp .env.example .env            # fill DATABASE_URL + secrets
npx prisma migrate dev          # apply/create versioned migrations (schema changes need a migration file)
npm run db:seed:all             # seed content + admin user
npm run dev                     # http://localhost:3000

# Quality gates — must all pass; same as CI (.github/workflows/zabobovdol.yml):
npm run lint                    # ESLint (next/core-web-vitals + typescript)
npm run typecheck               # tsc --noEmit
npm test                        # unit tests: tsx --test src/lib/__tests__/*.test.ts
npm run build                   # prisma generate && next build
```

Admin login: `/admin/login` with `.env` creds (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## Layout

```
src/app/            App Router — public pages + /admin + /api + robots/sitemap/llms
src/components/      shared React components (UI + admin/)
src/lib/             non-UI logic: auth, prisma, seo, markdown, settings, search, chat, …
src/lib/admin/       config-driven CRUD: resources.ts + server actions
src/lib/__tests__/   unit tests (node:test via tsx, no external deps)
src/middleware.ts    guards /admin/* (JWT cookie check)
prisma/              schema.prisma + many seed-*.ts scripts
scripts/             deploy, HTTPS (Let's Encrypt), encrypted backup helpers
android/             Android TWA wrapper (Bubblewrap) — wraps the live site
print/, public/      print assets and static files
```

## Conventions (important)

- **TypeScript, avoid unjustified `any`.** Validate external/user input with **Zod**.
- **Path alias `@/*` → `src/*`** (`tsconfig.json`). Import db via `@/lib/prisma`,
  settings via `@/lib/settings`, JSON-LD via `@/lib/seo`.
- **Prisma client is a singleton** (`src/lib/prisma.ts`) — never `new PrismaClient()`
  elsewhere (dev hot-reload would exhaust connections).
- **Pages that read the DB must be `force-dynamic`** so the production build never
  touches a real DB (CI builds with a dummy `DATABASE_URL`).
- **Auth**: signed JWT sessions (`jose`, HS256) in an `HttpOnly`, `SameSite=strict`
  cookie `zbd_session`; passwords bcrypt. `auth.ts` is `server-only`. `AUTH_SECRET`
  must be ≥32 chars and not a placeholder (the code throws otherwise).
- **Admin panel is config-driven.** To add/change a managed content type, edit the
  `RESOURCES` array in `src/lib/admin/resources.ts` (each `Resource` declares its
  fields once; lists/forms/actions are generated). Roles: `ADMIN`, `EDITOR`;
  `adminOnly` and `moderated` flags gate behavior.
- **AI chat assistant** (`src/lib/ai-config.ts`, `chat.ts`): provider resolves
  admin-panel settings → `.env` → default. Providers: `rules` (no AI, answers from
  site content), `gemini`, `anthropic`. Falls back to `rules` if the selected
  provider has no API key. Default Anthropic model is `claude-opus-4-8`.
- **SEO/GEO/AEO** is first-class: structured JSON-LD graph in `@/lib/seo`, plus
  `robots.txt`, `sitemap.xml`, `llms.txt`, IndexNow.
- **Escape all user-generated content** (see `markdown.ts`, `linkify.ts`).

## Deployment

Docker Compose on a VPS behind Nginx; `scripts/setup-env.sh`, `scripts/deploy.sh`,
`scripts/init-letsencrypt.sh`. Scheduled data ingestion (news, transparency) via
authenticated `/api/ingest-*` endpoints. See `DEPLOY.md` and `ПРЕДИ-ПУСКАНЕ.md`.
