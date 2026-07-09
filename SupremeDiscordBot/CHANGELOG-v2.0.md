# BotPanel v2.0 Changelog — "Commercial Launch"

v2.0 marks the transition from internal beta to public commercial product. Two headline changes: a complete landing page redesign and a 14-day Premium trial system.

## New: Landing Page Redesign

The old landing page was a minimal sign-in screen. The new one is a full sales page.

### Structure

1. **Sticky header** with anchor links to Features, Pricing, Discord
2. **Hero** — headline + subhead + dual CTA (Sign in + See Pricing)
3. **Feature grid** — 9 cards covering every v1.0-1.9 capability:
   - Ticket System, Forms & Applications, Verification, Polls, Giveaways
   - Sticky Messages, Scheduled Messages, Webhooks, AI Auto-Replies
   - Each card shows "Free" badge where applicable
4. **"Replace these" comparison** — shows 6 competitor bots with strikethrough names + prices (TicketTool $5, Appy.bot $5, GiveawayBot $3, Stickyboard $4, Dyno Poll $2, Webhook.io $10 = $29/mo savings)
5. **Pricing** — 3 tiers side-by-side:
   - Free ($0 forever) — 1 panel, 2 forms, polls, giveaways
   - **Premium ($9/mo)** — highlighted with "Most Popular" ribbon, 14-day trial CTA, 12 feature bullets
   - Enterprise (Custom) — white-label, SSO, SLA, priority support
6. **Final CTA** with Discord sign-in
7. **Footer** with legal links

### Conversion optimization

- "No credit card required" messaging reduces trial friction
- "Replace these" section anchors value against known competitor pricing
- Most Popular badge on Premium creates default-choice bias
- Enterprise tier creates anchor effect making Premium feel mid-market

## New: 14-Day Premium Trial

### Schema
Three new columns on `servers`:
- `trialUsed` — boolean, prevents repeat trials
- `trialStartedAt` — timestamp
- `trialEndsAt` — timestamp (indexed for scheduler lookups)

Migration `20260420000000_v20_premium_trial` — idempotent, zero-downtime.

### Trial logic in `getServerTier()`

```js
const isTrial = server.trialEndsAt > now;
const isPremium = server.isPremium || isTrial;  // active trial counts as Premium
```

All existing premium gates (panels, automation, webhooks, verification, forms, tickets) automatically honor the trial — no changes required to those 50+ gated endpoints. **One change, 50 features unlocked.**

### New endpoints

- `GET /api/trial/:serverId` — returns `{ eligible, active, daysLeft, trialUsed, startedAt, endsAt }`
- `POST /api/trial/:serverId/start` — activates trial (idempotent, one-shot per server)
- `GET /api/servers/:serverId` — now returns `isTrial`, `trialDaysLeft`, `trialUsed`, `trialEndsAt` inline

### Frontend

- `TrialBanner` component at top of every dashboard page, with 3 states:
  - **Eligible**: amber banner with "Start Free Trial" button (dismissible)
  - **Active**: cyan banner with days-left countdown + "Subscribe" link
  - **Urgent** (≤3 days): amber banner with warning icon
  - **Expired**: red banner asking to subscribe
- `getTrialStatus()` + `startTrial()` API helpers
- Start button triggers one-click activation — no credit card, no payment flow

### Scheduler Job 7: Trial expiry monitoring

Runs daily at 9:00 UTC:
- Finds servers whose trial expires within 72h → writes `TRIAL_EXPIRING_SOON` audit logs
- Finds trials that expired in the last 24h → writes `TRIAL_EXPIRED` audit logs
- Does NOT hard-disable features; `getServerTier()` naturally returns `isPremium=false` once `trialEndsAt < now`

## Files

**Added (3)**:
- `backend/src/routes/trial.js`
- `backend/prisma/migrations/20260420000000_v20_premium_trial/migration.sql`
- `frontend/src/components/TrialBanner.jsx`

**Modified (7)**:
- `backend/prisma/schema.prisma` — 3 trial columns on Server
- `backend/src/lib/premium.js` — `getServerTier()` now honors trial
- `backend/src/routes/servers.js` — GET /:id includes computed trial state
- `backend/src/services/scheduler.js` — Job 7 for trial expiry notifications
- `backend/src/index.js` — mount trialRouter
- `frontend/src/api/index.js` — trial helpers
- `frontend/src/pages/Login.jsx` — complete redesign (800+ lines)
- `frontend/src/components/Layout.jsx` — mount TrialBanner

## Upgrade path

```bash
cd /opt/botpanel && docker compose down
cd /opt && mv botpanel botpanel.v1.9.bak
mkdir botpanel && cd botpanel
unzip -o /root/botpanel-deploy-ready-v2.0.zip
chmod +x deploy.sh update.sh backend/docker-entrypoint.sh
docker compose up -d --build
```

Expect: `Applying migration 20260420000000_v20_premium_trial`.

## Test checklist

### Landing page (public, not signed in)
1. Open https://botpanel.carbonstealth.eu without session
2. Verify hero + features + pricing all render
3. "See Pricing →" anchor scrolls smoothly to #pricing
4. Mobile: hamburger → all CTAs work
5. All 6 competitor cards visible
6. Premium card has "Most Popular" ribbon
7. Enterprise `Contact Sales` opens mailto:

### Trial activation (existing server, never trialed)
1. Sign in → pick server → see amber banner "Try Premium free for 14 days"
2. Click "Start Free Trial" → banner changes to cyan "14 days left"
3. Verify server.isPremium effectively true by:
   - Go to Automation → Sticky tab → full UI visible (not PremiumLockCard)
   - Try to save observer roles on a panel → no 403
   - Create a 2nd panel → no limit error
4. GET /api/trial/:serverId → returns `{ active: true, daysLeft: 14 }`
5. POST /api/trial/:serverId/start again → 400 "already used"

### Trial expiry (simulate)
1. In postgres: `UPDATE servers SET "trialEndsAt" = NOW() - INTERVAL '1 hour' WHERE id = '<serverId>'`
2. Refresh dashboard → red "trial ended" banner
3. Premium features locked again with PremiumLockCard

### Premium upgrade (Stripe)
1. Click "Subscribe" in red expired banner → `/dashboard/<serverId>/premium`
2. Complete Stripe checkout → webhook flips `isPremium=true`
3. Banner disappears

## Rollback

```bash
cd /opt && rm -rf botpanel && mv botpanel.v1.9.bak botpanel && cd botpanel && docker compose up -d
```

Trial columns stay in DB (harmless) but are ignored by v1.9 code.

---

## Commercial impact

v2.0 closes the commercial loop:

- **Discovery**: Landing page sells — Features + Pricing do the convincing before sign-in
- **Trial**: 14-day frictionless trial removes "is this worth paying for?" doubt
- **Conversion**: Trial auto-expires → forces explicit subscription decision at day 14
- **Retention**: Existing Premium subscribers are unaffected; no regression

### Next steps (v2.1+)

- Stripe annual plans with 20% discount
- Affiliate/referral program (20% recurring commission)
- Public status page with uptime SLA tracking
- Multi-language support (BG/EN/IT/DE/ES)
- Analytics 2.0 (peak-hour heatmaps, staff leaderboards, conversion funnel)
- Public API with API keys

BotPanel is now a real SaaS product. Ship it.
