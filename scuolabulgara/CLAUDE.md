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

## Design system — „Платно“ (the cloth)

- **One idea: cross-stitch (кръстат бод), drawn by code.** `src/lib/stitch.ts` holds the
  pure geometry (8-pointed star, border tile, photo → thread colours) with unit tests;
  `components/Stitch.tsx` renders it as server SVG, `StitchedPhoto.tsx` (hero: the photo's
  edge unravels into stitches in its own colours, sewn once on load) and `Alphabet.tsx`
  (the chosen letter embroidered on Aida) draw it on canvas. Reduced motion → drawn at
  once; no JS → plain photo / plain letter.
- **Type: Sofia Sans** (Bulgarian designer) — text + Extra Condensed display, self-hosted
  via `next/font`. Every Cyrillic string carries `lang="bg"` so the **Bulgarian
  letterforms** switch on (also on IT/EN pages). The admin turns them off (`locl` 0).
- **Palette:** linen `#fdfcf9`/`#f2ede4`, thread red `#b3171d`, black `#1c1917`; the
  dance section is the one red field. Tokens at the top of `src/app/site.css`.
- **Avoid template tells:** no labels above headings (no `eyebrow` fields), no pill
  badges, no big-number stats, no rounded card kit, no fade-in on every section, no
  arrows appended to buttons.
- **Content upgrades:** stored rows beat defaults, so a redesign must ship an upgrade in
  `src/lib/content-upgrade.ts` (untouched old defaults → new ones; edited text kept in the
  new shape). Runs once per process from `ensureSeeded`.
- Empty list items (added in one language, not yet translated) are not rendered.
