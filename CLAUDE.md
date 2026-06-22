# CLAUDE.md

Civic digital portal for the town of **Bobov Dol** (Bulgaria) — local services,
"how-to" guides for e-services, listings, events, mutual aid and budget
transparency. UI language is Bulgarian; the audience skews elderly, so
accessibility matters.

## Work economically (applies to every session)

The point of this file is to keep sessions short and cheap. Follow it before exploring.

- The app lives in `zabobovdol/`, **not** the repo root. `cd zabobovdol` first; don't search the root for app code.
- Trust this file's map and commands instead of re-discovering them. Read a file only when you're about to change it or need its exact contents — don't read to "verify" an edit the tools already confirmed.
- Prefer Grep/Glob with a tight pattern over reading whole directories or large files. Read with `offset`/`limit` for big files.
- Don't re-run lint/typecheck/test/build "just to be sure" — run a gate once when relevant, and only the gate that's relevant.
- Answers and summaries: prose, minimal formatting, lead with the outcome. No headers/bullets for simple replies. Skip preamble and postamble.
- Don't read the seed scripts (`prisma/seed-*.ts`, ~70 of them) unless the task is about seed data specifically; they're large and repetitive.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Prisma · PostgreSQL · Tailwind · Docker · Nginx. Node ≥ 20.

## Layout (under `zabobovdol/`)

- `src/app/` — public pages (Bulgarian-slug routes), `admin/` panel, `api/`, plus `robots`/`sitemap`/`llms.txt`.
- `src/components/` — UI components; `src/components/admin/` admin UI.
- `src/lib/` — non-UI logic (auth, prisma, seo, markdown, settings). `src/lib/admin/` = resource config + server actions. `src/lib/__tests__/` = unit tests.
- `prisma/` — `schema.prisma` + many seed scripts.
- `scripts/` — deploy, HTTPS, encrypted backups.

## Commands (run inside `zabobovdol/`)

```bash
npm run lint        # ESLint (next/core-web-vitals + typescript)
npm run typecheck   # tsc --noEmit
npm test            # node:test unit tests in src/lib/__tests__
npm run build       # prisma generate && next build
npm run dev         # local dev on :3000
```

Local setup: `npm install` → `cp .env.example .env` → `npx prisma db push` → `npm run db:seed:all` → `npm run dev`.

CI runs lint + typecheck + test + build (`.github/workflows/zabobovdol.yml`). Match those gates before pushing; run only the ones your change can affect.

## Conventions

- Tests cover pure logic only (slug, SEO graph, Markdown/XSS escaping, SIGMA data parser) — no DB or network. Keep new tests in that style under `src/lib/__tests__`.
- Security is load-bearing: signed JWT sessions (HttpOnly, SameSite=strict), bcrypt, strict CSP, rate-limiting + honeypots, escaping of user content. Don't weaken these. See `zabobovdol/SECURITY.md`.
- Admin content is config-driven CRUD with roles + audit log; add resources via `src/lib/admin/` config rather than bespoke pages where possible.
- Keep user-facing strings in Bulgarian.

More detail: `zabobovdol/README.md`, `DEPLOY.md`, `ПРЕДИ-ПУСКАНЕ.md`.
