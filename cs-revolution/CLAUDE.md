# CLAUDE.md — Carbon Stealth VCC

Guidance for any agent working on this repo. Read this first.

## What this is
Vite + React SPA (`src/App.jsx`, mostly `React.createElement`, no JSX build step for
most of it) plus Python-generated multilingual static pages (it/en/bg) under `public/`,
built to `dist/`. PHP-FPM backend in `api/`. Design system = "Tolerance" (carbon base
`#0A0C0E`, INK `#C9D1D6`, cyan `#00e5ff` as the accent, Space Mono / Space Grotesk),
re-tuned to the 2026 logo: brushed-chrome display type (`CHROME` in `App.jsx`), cyan
ring glow on primary CTAs (`CTA_GLOW`), faint carbon-weave page ground.

## Motion system — `src/Instruments.jsx` (+ the same ideas in `scripts/static-theme.py`)
One metaphor, a measuring bench: a lamp glints across chrome type (`.cs-chrome`, `--sx/--sa`),
a caliper cursor measures the element you point at, sections calibrate (registration marks),
figures roll on drums, cards are traced by a probe, the About background is a touch probe
measuring a part. Rules: animate only `transform`/`opacity`/`background-position`/custom
properties — never `top`/`inset`/`width` of something that moves (a `top` sweep line and an
`inset` animation measured CLS 1.6); every effect has a reduced-motion static state; pointer
effects only on `(hover:hover) and (pointer:fine)`; nothing blinks forever (WCAG 2.2.2).

## Live scenes — `public/js/cs-live.js` + `public/brand/live/`
The band behind the title of the static pages (`.hero-s`, `scripts/static-theme.py`) and the service icons of
the homepage are photoreal Blender renders that move **without video**: the scene is rendered once, split
into light groups (`marketing/blender/*.py --live`, see its README), and `cs-live.js` blends the layers in
WebGL — the studio light glides over carbon and chrome, the laser line goes where the pointer is. Rules that
must survive any edit: the still frame (`bench-1600.webp` / `bench-800.webp`) is the LCP image and the whole
experience under `prefers-reduced-motion`, data-saver, a weak GPU, a phone or no JS (the engine is gated
**before** it loads); the static pages move on their own for under 5 s (`auto:"intro"`, WCAG 2.2.2), then
only with the pointer; icons light up on hover/focus and once when their row enters the viewport. A scene
that loops (`auto:"loop"`) needs a pause button on its page — none does today. Nothing blinks (WCAG 2.3.1 —
at most 3 flashes/s on a quarter of a 10° field), and two mechanisms in the engine keep it so whatever the
pointer does: `calm()` counts reversals of the **effective** target — always, also while there is no
pointer, because a pointer darting in and out over the scene edge flips the target too (an earlier version
reset the counter on "no pointer" and measured 4 flashes/s) — and makes the laser and the lamp follow
lazily; `hold()` is the hard bound by construction: the laser may reverse direction at most twice in any
second (three one-way passes = three flashes at most), the lamp once per second. Do not raise `CALM_AT`
(3 measured 4/s) and do not remove `hold()`. Any change to the motion code is re-measured with the
frame-by-frame flash test (pointer paths: sweep, circle, jumps, in/out, end-to-end; 0.5–8 Hz) before it
ships. The pointer target is the **median** of a small neighbourhood of the position map, so a hole or an
edge under the cursor does not flip it. The engine loads after `load`, in idle time.

**The logo is not to be changed (owner, 2026-11-13).** The homepage hero keeps the mark exactly as it is:
`HeroSignature.jsx` + the rendered logo scene (`/brand/cs-scene*.webp`, `.cs-hero-art`). A live scene that
re-modelled the CS monogram as a machined part was built, shown and **rejected** — do not re-render,
re-interpret, restyle or replace the logo anywhere (hero, nav, footer, icons, OG) unless the owner asks for
exactly that. Motion around it is fine; the mark itself is not material for effects.

**Cache version.** nginx serves every `.js/.webp/.png` with `immutable, max-age=1y` and the service worker is
cache-first for them, but the engine, the layers, the stills (`bench-1600/800.webp`) and the icons have fixed
names. So every URL to them carries `?v=<hash of their contents>`: computed in `vite.config.js`
(`liveVersion` → `__CS_LIVE_V__` in the SPA) and by the same algorithm in `scripts/static-theme.py`
(`live_version`). Never reference these files without it — a fix to the engine or a re-render would not
reach a returning visitor for a year. After changing any of them: `static-theme.py` → `self-host-fonts.py` →
`vite build` (the hash moves, ~400 static pages change — that is expected).

## Brand assets — `public/brand/` + root icons
All generated from the three logo renders (never hand-edit the PNGs):
`logo.png`/`logo.webp`/`logo-nav.webp` = horizontal lockup at the historical 2.35:1
ratio (387 static pages reference it with fixed width/height — keep that ratio);
`brand/cs-logo-*.webp` = square logo (footer, mobile menu); `brand/cs-scene*.webp` =
the mark in the homepage hero (`.cs-hero-art`, over `HeroSignature.jsx`) — the logo, not to be changed; `brand/cs-poster.webp` = about plate; `og-image*.png`, `icon-*.png`,
`apple-touch-icon.png`, `favicon.ico`/`.svg` = derived. Static-page nav/brand tweaks
live in `scripts/rebrand-static.py` (idempotent, also patches the generators).

## Navigation — one breakpoint for the whole site
At **900px and below** the nav is the menu button (SPA: `.cs-hamburger` + `.cs-mobile-menu` in `src/App.jsx`;
static pages: `.nav-toggle` from `NAV_JS` in `scripts/static-theme.py`, `NAV_MAX = 900`); above it, the links.
Measured on all three languages: the SPA's six links + "site analysis" + the language switch wrap and run into
the logo up to ~830px, and the static `/en/` and `/bg/` homepages (nine links) drop to a second row below
~820px. Keep the two values equal. Both menus scroll on a short screen (a phone on its side, 844×390) instead of
cutting items off; on screens where the menu fits nothing moved. The nav bar keeps its height (SPA 59px =
`#cs-boot .navpad`, static 66px) — the button does not push the logo. The logo itself is not touched.

## Build & regenerate
```bash
npm install
npx vite build                     # public/ + src/ → dist/
python3 scripts/generate-*.py      # regenerate a static content cluster
python3 scripts/inject-widgets.py  # re-inject WA float + a11y + SW after regenerating
python3 scripts/rebrand-static.py  # nav/footer tweaks (logo size, pricing link, footer link style)
python3 scripts/seo-footer-links.py # "Risorse" row in every static footer (hubs are otherwise orphans)
python3 scripts/seo-keywords.py    # <meta keywords> on every page that lacks one (≥5, "Carbon Stealth")
python3 scripts/adsense-inject.py  # Google AdSense loader in every <head> (CSP in nginx allows it; ads.txt in public/)
python3 scripts/it-accents.py      # Italian accents (perché, più, già…) on IT pages + generators, never inside URLs
python3 scripts/work-images.py     # real project screenshots (public/work/*.webp) on portfolio + case studies
python3 scripts/seo-index-policy.py # only cities with a real client/office stay indexed; the rest noindex,follow + out of the sitemaps (doorway policy)
python3 scripts/geo-cases.py       # real projects on the indexed city pages (Milano = Panev Ascensori, Dupnitsa, Kyustendil)
python3 scripts/service-depth.py   # web-development page: real sites + packages from src/pricing.json; FAQ schema = visible FAQ
python3 scripts/related-posts.py   # "Leggi anche / Read next / Прочети още": 3 closest posts (same language) under every blog post
python3 scripts/hreflang-xdefault.py # x-default → the EN version (Europe outside IT/BG gets English, not Italian)
python3 scripts/static-theme.py    # shared Carbon/Chrome theme, mobile nav toggle, legal footer — run LAST
python3 scripts/self-host-fonts.py # every Google Fonts link → /fonts/fonts.css (self-hosted woff2; GDPR) — after the theme
```
All post-processors are idempotent — run the whole chain after any regeneration.
City pages: do NOT add more indexed "<service> <city>" pages — a city is indexable only with a real,
verifiable project or office there (`KEEP_CITIES` in `seo-index-policy.py`, content in `geo-cases.py`). Never put
content in `<noscript>`: it is invisible to people and mostly to Google (30 pages used to).
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
`portfolio/docs/PRICING-RESEARCH.md`). **VAT convention (owner decision, 2026-09-17):** the
portfolio numbers are the Bulgarian GROSS prices (shown on `/bg/…` "с ДДС"); Italian and
English pages show NET prices = gross ÷ 1.20 rounded ("+ IVA" / "+ VAT", "IVA esclusa" /
"excl. VAT"). As of 2026-09-17 (gross → net): landing €790 → €658, business site
€1 890 → €1 575, e-commerce €2 190 → €1 825, SEO €290 → €242/month, hosting €15 → €13/month,
maintenance €69 → €58/month.
ERP (€5 000), custom software (€2 000), mobile apps (€3 000) and the ERP support
contract (€500/month with SLA) have no portfolio equivalent and stay as they are.
The full price list (4 packages, add-ons, VAT rules, terms, FAQ, market table) is
generated by `scripts/generate-pricing.py` → `/prezzi/`, `/en/pricing/`, `/bg/ceni/` +
`src/pricing.json` (the homepage `#pricing` section reads that JSON). Change numbers
there, then `python3 scripts/generate-pricing.py && python3 scripts/inject-widgets.py`.
"From €…" mentions also live in ~200 static pages + the generators + `index.html`
JSON-LD + the HowTo schema in `App.jsx` + `llms.txt` — change them everywhere at once
(regex over `public/**/index.html`, `scripts/generate-*.py`, `index.html`, `src/App.jsx`)
and bump the sitemap `lastmod` of every touched page.

## Hard rules
- Secrets (SMTP password, admin token) **never** in the repo — env / `smtp-local.php` only.
- No fake reviews, stats, clients, or testimonials — only real, verifiable facts.
- Develop on the designated feature branch; commit messages end with the required
  `Co-Authored-By` + `Claude-Session` footer.
- Prefer real verification (curl the endpoint, screenshot the page) over assuming.
