# SEO / GEO / AEO — Operations Guide

What is implemented in code, and the manual steps only the site owner can do.
Target: maximum Google visibility across Europe.

## Implemented in this repository

| Area | Where | Notes |
|---|---|---|
| Localized landing pages | `/bg /de /es /fr /it /nl /pl` (`LandingLocalized.jsx`) | EN at `/`; translated hero, features, FAQ, pricing |
| hreflang | `components/Seo.jsx` (rendered DOM) + `public/sitemap.xml` (`xhtml:link`) | Bidirectional cluster incl. `x-default` |
| Per-route canonical/title/description | `components/Seo.jsx` on every public page | 404 page emits `noindex` |
| Localized FAQPage JSON-LD | `LandingLocalized.jsx` | Visible FAQ keeps content parity (Google requirement) |
| Org/Software/FAQ/LocalBusiness JSON-LD | `index.html` `@graph` | Geo coordinates for Bobov Dol / Sofia |
| og-image.png 1200×630 + PNG favicons | `public/` | Social scrapers don't render SVG |
| robots.txt with AI-crawler policy | `public/robots.txt` | GPTBot/ClaudeBot/PerplexityBot allowed; CCBot/Bytespider blocked |
| llms.txt (AEO) | `public/llms.txt` | Per llmstxt.org |
| Performance (CWV) | `App.jsx` lazy routes, `vite.config.js` manualChunks | Landing chunk small; vendor cached |
| Security headers + CSP | `frontend/nginx.conf` | HSTS, CSP, gzip, immutable asset caching |

When adding a locale: update `LANDING_LOCALES` in `components/Seo.jsx`,
`LANDING_TRANSLATIONS` in `i18n/landing.js`, the routes in `App.jsx`,
the hreflang blocks in `public/sitemap.xml`, and the footer links in
`Login.jsx` / `LandingLocalized.jsx`.

## Manual steps for the owner (cannot be done from code)

1. **Google Search Console** — <https://search.google.com/search-console>
   - Add property `supreme.carbonstealth.eu` (domain property via DNS TXT record).
   - Submit `https://supreme.carbonstealth.eu/sitemap.xml`.
   - Use *URL Inspection → Request Indexing* on `/` and each language landing once live.
   - Watch *Indexing → Pages* and the *International Targeting / hreflang* reports for errors.
2. **Bing Webmaster Tools** — <https://www.bing.com/webmasters> (import from GSC takes one click; Bing also feeds DuckDuckGo and ChatGPT search).
3. **Backlinks** (the strongest ranking factor — nothing in code substitutes for this):
   - Link from `carbonstealth.eu` to `supreme.carbonstealth.eu` with descriptive anchor text ("Discord ticket bot", not "click here").
   - List the bot on **top.gg**, **discordbotlist.com**, **discords.com** — these are high-authority directories that rank for "discord bot" queries and pass referral traffic.
   - The Discord server invite (`discord.gg/wpCRpy8B`) should mention the site URL in the server description.
4. **Validate structured data** after each deploy: <https://search.google.com/test/rich-results> on `/`, `/de`, `/fr`.
5. **Core Web Vitals**: check <https://pagespeed.web.dev/> for `/` after deploy; target LCP < 2.5 s on mobile.
6. **Keep `lastmod` honest** in `sitemap.xml` when landing content changes.

## Verification checklist after deploy

```
curl -s https://supreme.carbonstealth.eu/robots.txt | head
curl -s https://supreme.carbonstealth.eu/sitemap.xml | xmllint --noout -   # validates XML
curl -sI https://supreme.carbonstealth.eu/og-image.png                     # 200 + image/png
curl -sI https://supreme.carbonstealth.eu/de                               # 200 (SPA fallback)
```
