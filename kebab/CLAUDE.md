# kebab/ — Uylas Kebap Center (сайт)

Production-ready site for **Uylas Kebap Center**, a Turkish kebap/pizza chain with
**three locations** (Cornaredo, Bareggio, Sedriano — MI, Italy). Root rules live
in the repo-root `CLAUDE.md`.

_Stack: **static** HTML/CSS/JS — no build step, no backend. Deploy anywhere
(Apache, Nginx, Netlify, plain hosting)._

**User-facing language: Italian** (source) with an **EN** toggle. Per monorepo
convention the code/comments/docs are Bulgarian; all UI text is IT/EN.

## Layout

```
index.html        single-page site
css/, js/, img/   styles, client logic, branded dish illustrations
fonts/            web fonts
.well-known/      static well-known files
```

## Conventions (important)

- **No build, no dependencies** — edit HTML/CSS/JS directly; keep it deployable as
  plain static files.
- Content is real (menu, prices, categories, 3 locations, Google review count) from
  the official source — keep it accurate; don't invent menu items or prices.
- Keep the IT (source) ↔ EN toggle in sync when changing copy.
- Accessibility + basic SEO/JSON-LD (LocalBusiness × 3 locations) matter; footer
  credits Carbon Stealth.
