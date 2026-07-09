# Minyor/ — ФК „Миньор“ Бобов дол (клубен сайт)

Official website of the football club **ФК „Миньор“ Бобов дол**: news, fixtures &
results, standings, squad, history, gallery, contacts, with a self-service admin
panel. A donation by Carbon Stealth VCC. **User-facing language: Bulgarian.** Root
rules live in the repo-root `CLAUDE.md`.

_Stack: Next.js (App Router) · React · TypeScript · Prisma · Tailwind; auth via
`jose` JWT + `bcryptjs`; `zod` validation._

## Commands (run inside `Minyor/`)

```bash
npm run dev                     # next dev
npm run typecheck               # tsc --noEmit
npm run lint                    # eslint .
npm run db:seed                 # tsx prisma/seed.ts
npm run build                   # prisma generate && next build
```

Docker deploy: `Dockerfile` + `docker-compose.yml`; see `DEPLOY.md` and
`SECURITY.md`.

## Layout

```
src/app/          App Router — public pages + /admin + /api
src/components/    shared React components
src/lib/           auth, prisma, data, seo, sync (bgclubs standings), audit, ratelimit
prisma/            schema.prisma + seed.ts
public/            static assets + /.well-known
```

## Conventions (important)

- **Strict TypeScript**, `zod` for external/user input; escape user-generated content.
- **Auth:** signed JWT (`jose`) in an `HttpOnly` cookie; passwords `bcryptjs`;
  middleware guards `/admin/*`. Keep secrets out of the repo.
- **Prisma** client is a singleton (`src/lib/prisma.ts`); `build` runs
  `prisma generate` first.
- Content (news, fixtures, squad, standings) is admin-managed; some standings sync
  from an external source (`src/lib/sync/bgclubs.ts`) — treat fetched data as
  untrusted, validate before persist.
- SEO/JSON-LD, `robots`, `sitemap`, `manifest`, PWA `sw.js`, cookie consent +
  accessibility bar are first-class (civic/public audience).
