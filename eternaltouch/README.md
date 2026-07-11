# Eternal Touch

> Atelier di decorazioni in gesso fatte a mano — vetrina trilingue (IT/BG/EN)

**Carbon Stealth VCC product** · `eternaltouch.it`

---

## Stack

- **Backend:** Node.js 20 + Express + EJS (Server-Side Rendered for perfect SEO)
- **Database:** PostgreSQL 16 + Prisma ORM
- **Image processing:** Sharp (auto WebP conversion + thumbnail generation)
- **i18n:** geoip-lite (offline IP→country) + URL prefix + cookie override
- **Auth:** JWT (cookie-based) + bcrypt
- **Deployment:** Docker Compose + Nginx + Let's Encrypt

## Architecture

| Component        | Port (host)         | Notes                          |
|------------------|---------------------|--------------------------------|
| Node.js app      | `127.0.0.1:4300`    | Reverse-proxied via Nginx      |
| PostgreSQL       | `127.0.0.1:5437`    | Bound to localhost only        |
| Nginx + SSL      | `:80`, `:443`       | Public                         |

## Three languages

Detection priority: **URL prefix** (`/it`, `/bg`, `/en`) → **cookie override** → **IP geolocation** (IT→IT, BG→BG, others→EN) → Accept-Language → default `en`.

Visitors from Italy land on Italian by default. Visitors from Bulgaria land on Bulgarian. Everyone else gets English. They can switch at any time via the language switcher in the header — choice is stored as a cookie.

## SEO

- ✅ Server-side rendered HTML (every page indexable)
- ✅ Dynamic `sitemap.xml` with `hreflang` for all 3 languages + `x-default`
- ✅ `robots.txt` with sitemap reference, disallow `/admin` + `/api`
- ✅ JSON-LD structured data: `Organization`, `LocalBusiness` (3 phone numbers, BG address, geo coords), `WebSite`
- ✅ Open Graph + Twitter Card on every page (with locale alternates)
- ✅ Canonical URLs + hreflang on every page

## Admin panel

Path: `/admin`

Login with the credentials from `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

Features:
- Dashboard with stats + recent messages
- Edit collections (3 languages each + cover image)
- Create / edit / delete products (multi-language + multi-image upload, auto-WebP)
- Manage gallery (bulk upload + per-item caption)
- Edit all site content (hero, about, process, contact — 3 languages)
- Read & reply to contact form messages
- Change admin password

## Local development

```bash
npm install
cp .env.example .env
# edit .env with your local DATABASE_URL etc.
npx prisma generate
npx prisma migrate dev
node prisma/seed.js
npm run dev
```

App runs on `http://localhost:4300`.

---

## Deployment to VPS (178.104.77.242)

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the complete one-shot deployment script.

## Project structure

```
eternaltouch/
├── prisma/
│   ├── schema.prisma          # DB models
│   └── seed.js                # Initial data (admin + 3 collections + content)
├── src/
│   ├── server.js              # Express app entry
│   ├── locales/               # IT / BG / EN translation files
│   ├── middleware/
│   │   ├── language.js        # i18n + IP detection
│   │   └── auth.js            # JWT cookie auth
│   ├── routes/
│   │   ├── public.js          # Public pages
│   │   ├── admin.js           # Admin panel
│   │   ├── api.js             # JSON API (contact form)
│   │   └── seo.js             # robots, sitemap, security.txt
│   ├── views/                 # EJS templates
│   │   ├── layouts/main.ejs
│   │   ├── partials/          # header, footer
│   │   ├── pages/             # home, collection, product, 404, 500
│   │   └── admin/             # admin UI
│   └── public/
│       ├── css/               # style.css, admin.css
│       ├── js/main.js
│       ├── images/            # logo, og, favicon
│       └── uploads/           # User-uploaded media (mounted as volume)
├── nginx/eternaltouch.conf   # Nginx reverse proxy config
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## License

Proprietary — Carbon Stealth VCC. All rights reserved.

---

## GDPR & Legal Compliance

The site ships with full GDPR compliance:

- **Cookie consent banner** with granular control (necessary / analytics / marketing) — opt-in, re-openable from footer
- **Privacy Policy** (`/privacy`) — Art. 13–22 GDPR, in IT/BG/EN with rights, retention, processors, complaint authorities (КЗЛД + Garante)
- **Cookie Policy** (`/cookies`) — full cookie inventory with types, purposes, durations
- **Terms & Conditions** (`/terms`) — IT/BG/EN, governed by Bulgarian law, ODR platform reference
- **Legal Notice** (`/legal`) — full company identification per Directive 2000/31/EC
- **Contact form** — explicit GDPR consent checkbox required, audit trail (timestamp + UA + IP country) stored with each message

All legal pages auto-detect language and adapt content. Footer links are present site-wide.

**Important:** Update the dates in `legal.updateDate` keys in each locale file (`src/locales/*.json`) before deploying any major content changes. Update `prisma/seed.js` field if changing controller details.
