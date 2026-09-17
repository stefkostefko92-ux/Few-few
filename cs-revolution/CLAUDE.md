# CLAUDE.md — Carbon Stealth VCC

Guidance for any agent working on this repo. Read this first.

## What this is
Vite + React SPA (`src/App.jsx`, mostly `React.createElement`, no JSX build step for
most of it) plus Python-generated multilingual static pages (it/en/bg) under `public/`,
built to `dist/`. PHP-FPM backend in `api/`. Design system = "Tolerance" (carbon base
`#0A0C0E`, INK `#C9D1D6`, cyan `#00e5ff` as the accent, Space Mono / Space Grotesk),
re-tuned to the 2026 logo: brushed-chrome display type (`CHROME` in `App.jsx`), cyan
ring glow on primary CTAs (`CTA_GLOW`), faint carbon-weave page ground.

## Brand assets — `public/brand/` + root icons
All generated from the three logo renders (never hand-edit the PNGs):
`logo.png`/`logo.webp`/`logo-nav.webp` = horizontal lockup at the historical 2.35:1
ratio (387 static pages reference it with fixed width/height — keep that ratio);
`brand/cs-logo-*.webp` = square logo (footer, mobile menu); `brand/cs-scene*.webp` =
hero mark; `brand/cs-poster.webp` = about plate; `og-image*.png`, `icon-*.png`,
`apple-touch-icon.png`, `favicon.ico`/`.svg` = derived. Static-page nav/brand tweaks
live in `scripts/rebrand-static.py` (idempotent, also patches the generators).

## Build & regenerate
```bash
npm install
npx vite build                     # public/ + src/ → dist/
python3 scripts/generate-*.py      # regenerate a static content cluster
python3 scripts/inject-widgets.py  # re-inject WA float + a11y + SW after regenerating
```
Static generators use Python `.format()` — never inject brace-heavy JS into their
templates; post-process the OUTPUT (that's what `inject-widgets.py` is for).

## Production server — READ THE RUNBOOK
Deploy, live-patch, and troubleshooting are documented in
**`docs/OPERATIONS-RUNBOOK.md`**. Key facts you will need:
- Webroot `/var/www/carbonstealth.eu`; **PHP-FPM 8.5**, socket `/run/php/php8.5-fpm.sock`
  (NOT the generic `/run/php/php-fpm.sock` symlink — it points at another pool).
- The **`api/*.php` files must be deployed** alongside `dist/` — a static-only deploy
  leaves every `/api/*.php` returning `File not found.`
- Admin token = `CS_ADMIN_TOKEN` in the FPM pool env; also the admin-panel password
  and the `X-CS-Token` header.
- SMTP goes through Gmail via `api/smtp-local.php` (git-ignored) + the dependency-free
  `api/smtp-native.php`. Needs a Google **App Password**. Hetzner blocks port 25.
- Users often want **no-download live patches**: apply via pasted shell commands
  (`base64 | tar` extract, `sed` on nginx, idempotent `python3` on static HTML), then
  ALWAYS commit the same change to the repo so the next deploy keeps it.

## Prices — one source of truth
Public prices on this site mirror `portfolio/src/pricing.mjs` in the monorepo (branch
`claude/carbon-stealth-portfolio-tufnlp` until merged; research in
`portfolio/docs/PRICING-RESEARCH.md`). As of 2026-09-17: website/landing from €790,
e-commerce from €2 190, SEO €290/month, hosting €15/month, maintenance €69/month.
ERP (€5 000), custom software (€2 000), mobile apps (€3 000) and the ERP support
contract (€500/month with SLA) have no portfolio equivalent and stay as they are.
Prices live in ~140 static pages + the generators + `index.html` JSON-LD + the HowTo
schema in `App.jsx` — change them everywhere at once (regex over `public/**/index.html`,
`scripts/generate-*.py`, `index.html`, `src/App.jsx`) and bump the sitemap `lastmod`
of every touched page.

## Hard rules
- Secrets (SMTP password, admin token) **never** in the repo — env / `smtp-local.php` only.
- No fake reviews, stats, clients, or testimonials — only real, verifiable facts.
- Develop on the designated feature branch; commit messages end with the required
  `Co-Authored-By` + `Claude-Session` footer.
- Prefer real verification (curl the endpoint, screenshot the page) over assuming.
