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

- **One idea: cross-stitch (кръстат бод), drawn by code.** `src/lib/stitch.ts` holds
  the motifs as charts — the rosette and the „вълчи зъби“ border of a 1930s Divotino (Shopluk) cloth,
  transcribed stitch by stitch from photos, never invented geometry — plus back-stitch contours and
  photo → thread colours, with unit tests;
  `components/Stitch.tsx` renders it as server SVG — one realistic stitch per colour (spindle legs pinched at
  the holes, two twisted strands, top-left light, the top leg's shadow, holes in the linen) placed with `<use>`;
  `lib/stitch-dom.ts` stamps the same thread from cached canvas sprites — `StitchedPhoto.tsx` (hero: embroidery in the
  photo's own colours rises from the bottom edge to knee height, `--stitch-depth`, sewn once on load) and `Alphabet.tsx`
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
- **Everything visible is editable** in `/admin` (sections, settings, SEO + share card, UI wording incl. 404
  and aria labels, legal pages, llms.txt and the manifest are built from them). Locked on purpose: the agency
  credit, the CC BY-SA photo credit and its rose bullet. Long texts: an empty line = a new paragraph.
- **Documents (PDF):** `file` fields accept uploads sniffed as `%PDF-` (≤14 MB, served without CSP sandbox so
  the browser viewer works) or https links; `scripts/import-docs.mjs` moves old-site links onto the server.
