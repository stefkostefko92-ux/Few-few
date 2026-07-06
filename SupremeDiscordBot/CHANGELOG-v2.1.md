# BotPanel v2.1 Changelog — "Scale & Insights"

Four major additions that turn BotPanel from a product into a platform:
1. **Affiliate Program** — 20% recurring commission for 12 months
2. **Public REST API** — bearer-authed, scoped, rate-limited
3. **Analytics 2.0** — heatmap, leaderboard, funnel
4. **Public Status Page** — transparent uptime + service health

## New Models (4)

- `AffiliateCode` — one per user, tracks clicks, signups, conversions, earnings
- `AffiliateReferral` — links an affiliate to a referred server with payment history
- `ApiKey` — hashed bearer tokens with scopes + expiry
- `DailyMetric` — one row per server per day, pre-aggregated for fast charts

Migration `20260420100000_v21_affiliate_api_analytics` — idempotent.

## Affiliate Program (20% × 12 months)

### How it works

1. User visits `/dashboard/affiliate` → auto-generates an 8-char code + shareable link
2. Someone clicks the link: `GET /api/affiliate/track?code=ABCD1234`
   - Increments click counter
   - Sets 30-day tracking cookie `bp_ref`
   - Redirects to landing page
3. That user signs up, adds bot to their server, converts to Premium via Stripe
4. On `invoice.paid` webhook: 20% of the paid amount is credited to the affiliate's pending balance
5. Commissions accrue for 12 months from first payment
6. User sets PayPal email, requests payout when balance ≥ $25 → admin processes manually

### Endpoints
- `GET /api/affiliate/track?code=X` (public, no auth) — track click + redirect
- `GET /api/affiliate/me` — your code, link, stats, referrals list
- `PATCH /api/affiliate/me` — set PayPal email
- `POST /api/affiliate/payout` — request payout (audit-logged for admin processing)

### Commercial impact
Affiliate referrals drive cheap acquisition — users bring other Discord server owners they know. 20% × 12 months = $21.60 per referred Premium server (at $9/mo). High enough to motivate sharing.

## Public REST API (v1)

### Authentication
Bearer tokens in format `bpk_live_<24 base64url chars>`. Hashed with SHA-256 before storage — only shown once at creation.

### Endpoints (bearer-authed at `/public/v1/*`)
- `GET /me` — server info + key scopes
- `GET /tickets` — list (supports status filter, pagination)
- `GET /tickets/:id` — single ticket
- `GET /forms` — all forms + submission counts
- `GET /applications` — list (status filter)
- `GET /analytics/daily` — daily metrics time-series (from/to params)

### Scopes
`tickets:read|write`, `forms:read|write`, `applications:read|write`, `panels:read`, `polls:read`, `giveaways:read`, `analytics:read`

### Rate limiting
300 requests/min per key (separate from dashboard rate limits).

### Dashboard management
`/dashboard/:serverId/apikeys` — create/revoke keys, scope checkboxes, expiry picker, one-time key reveal with copy button, quick-start curl example.

## Analytics 2.0

`/dashboard/:serverId/analytics` shows:

- **KPI cards** — total tickets, open tickets, total applications, approval rate
- **Activity heatmap** — 7×24 grid (day-of-week × hour-of-day) of ticket creation times over last 90 days. Reveals peak support hours for staffing.
- **Staff leaderboard** — top 10 staff by tickets claimed + closed over 30 days, medal badges for top 3
- **Application funnel** — submitted → reviewed → approved → interview conversion % with progress bars

### Daily snapshot job (Scheduler Job 8)
Runs at 00:05 UTC. For each server with activity in the last 24h, aggregates counts into `daily_metrics`:
- Tickets opened/closed/escalated
- Forms submitted
- Applications approved/denied
- Verifications success/failure

Keeps charts fast — no scans over millions of rows on each query.

## Public Status Page

`/status` — no auth required. Shows:

- Overall status badge (operational / degraded / down)
- Per-service health:
  - Database (with latency ms)
  - Bot Gateway (with latency ms)
  - Cache Layer
- Platform stats (total servers, active in last 24h)
- SLA targets (99.9% Premium, 99.95% Enterprise)
- Auto-refresh every 30 seconds, 30s cache server-side

Link added to landing page footer and visible at `/status` for public reference.

## Files

**Added (8)**:
- `backend/src/routes/affiliate.js`
- `backend/src/routes/publicApi.js`
- `backend/src/routes/analytics.js`
- `backend/src/routes/status.js`
- `backend/prisma/migrations/20260420100000_v21_affiliate_api_analytics/migration.sql`
- `frontend/src/pages/AnalyticsPage.jsx`
- `frontend/src/pages/AffiliatePage.jsx`
- `frontend/src/pages/ApiKeysPage.jsx`
- `frontend/src/pages/StatusPage.jsx`

**Modified (7)**:
- `backend/prisma/schema.prisma` — 4 new models
- `backend/src/services/scheduler.js` — Job 8 daily snapshot
- `backend/src/routes/stripe.js` — affiliate commission hook in `invoice.paid`
- `backend/src/index.js` — mount 5 new routers
- `frontend/src/api/index.js` — 20+ new helpers
- `frontend/src/App.jsx` — routes for analytics/apikeys/affiliate/status
- `frontend/src/components/Layout.jsx` — sidebar links for analytics/apikeys/affiliate
- `frontend/src/pages/Login.jsx` — STATUS link in footer

## Upgrade

```bash
cd /opt/botpanel && docker compose down
cd /opt && mv botpanel botpanel.v2.0.bak
mkdir botpanel && cd botpanel
unzip -o /root/botpanel-deploy-ready-v2.1.zip
chmod +x deploy.sh update.sh backend/docker-entrypoint.sh
docker compose up -d --build
```

Expect: `Applying migration 20260420100000_v21_affiliate_api_analytics`.

## Test checklist

### Affiliate
1. `/dashboard/affiliate` → auto-generates code
2. Copy link → open incognito → paste → redirects to `/` with cookie set
3. Check referral in DB: `SELECT * FROM affiliate_codes WHERE clicks > 0;`
4. Simulate Stripe webhook with `invoice.paid` for a referred server → commission credited

### Public API
1. Sidebar → API Keys → Create key named "Test", scopes `[tickets:read]`
2. Copy the `bpk_live_...` key (only shown once)
3. `curl https://botpanel.carbonstealth.eu/public/v1/me -H "Authorization: Bearer bpk_live_..."` → server info + scopes
4. `curl .../public/v1/tickets -H "..."` → ticket list
5. Try `curl .../public/v1/forms` → 403 "Missing scope: forms:read" (correctly rejected)
6. Revoke key → subsequent requests → 401

### Analytics
1. Sidebar → Analytics → 4 KPI cards render
2. Heatmap: 7×24 grid, darker cells = more tickets (hover for counts)
3. Leaderboard: shows top 10 staff with claimed/closed counts
4. Funnel: 4 stages with percentage bars

### Status
1. Open `/status` (no login) → "All systems operational"
2. DB latency shown in ms
3. Bot gateway latency shown
4. Platform stats: total + active servers

## Rollback

```bash
cd /opt && rm -rf botpanel && mv botpanel.v2.0.bak botpanel && cd botpanel && docker compose up -d
```

v2.1 tables harmlessly stay in DB; v2.0 code ignores them.

---

## What's next (v2.2+)

- **Multi-language** — i18next with BG/EN/IT/DE/ES/FR locales (HUGE scope — every UI string)
- **Stripe annual plans** with 20% discount
- **SSO** — Google/Microsoft OAuth for dashboard login (currently Discord-only)
- **Mobile app** — iOS/Android staff companion
- **Customer portals** — public ticket status tracking for non-Discord users
- **AI FAQ generator** — auto-generate knowledge base from closed ticket patterns

BotPanel is now a full-stack SaaS with acquisition, retention, monetization, integration, and trust infrastructure. Ready to sell.
