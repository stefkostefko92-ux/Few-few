# scuolabulgara/ — Qui Bulgaria (scuola bulgara di Milano)

Multilingual site + CMS (🇮🇹 Italiano · 🇧🇬 Български · 🇬🇧 English) with an admin
panel, for the Qui Bulgaria association (Bulgarian language & culture centre in
Milan). **Primary user-facing language: Italian** (source), plus BG/EN. Root
rules live in the repo-root `CLAUDE.md`.

_Stack: Next.js (App Router) · React · **TypeScript** · Prisma + **SQLite** (file
DB, images on disk — no mandatory external service); auth via `jose` + `bcryptjs`;
`nodemailer`, `sharp`. VPS/Docker._

## Commands (run inside `scuolabulgara/`)

```bash
npm run dev                     # next dev
npm run db:push                 # prisma db push
npm run db:seed                 # tsx prisma/seed.ts
npm run setup                   # db:push + seed (fresh env)
npm run hash                    # tsx scripts/hash-password.ts (admin password)
npm run build                   # prisma generate && next build
```

Docker deploy on a VPS: `Dockerfile` + `docker-compose.yml` + `nginx/`; see
`DEPLOY.md`.

## Layout

```
src/app/          App Router — multilingual public pages + admin + api
src/components/, src/lib/
prisma/           schema.prisma (SQLite) + seed.ts
public/assets/    images (served from disk)
scripts/          hash-password + helpers
```

## Conventions (important)

- **Strict TypeScript.** Multilingual content: keep IT (source) · BG · EN in sync;
  never machine-translate blindly.
- **Auth:** `jose` JWT + `bcryptjs`; generate the admin hash via `npm run hash`;
  secrets stay out of the repo.
- **SQLite via Prisma** — file DB; images stored on disk (optimize with `sharp`).
- `nodemailer` for contact/enquiry email; validate + rate-limit form input.
- Escape all user-generated content; SEO/JSON-LD per locale (`hreflang`).
