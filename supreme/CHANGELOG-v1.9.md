# BotPanel v1.9 Changelog — "Premium Monetization"

Comprehensive Premium gating. Non-premium servers retain full core functionality; advanced features are locked behind subscription to drive upgrade conversions.

## Central Feature Matrix

`backend/src/lib/premium.js` is the single source of truth for:
- 29 premium features in 7 categories
- Base vs Premium quantitative limits
- Enforcement helpers: `requirePremium()` middleware, `validatePremiumFields()` bulk check, `getServerTier()`

## Limits

| Resource | Base | Premium |
|---|---|---|
| Ticket panels | 1 | 50 |
| Forms | 2 | 50 |
| Questions per form | 5 | 50 |
| Verification panels | 1 | 10 |
| Webhooks | 0 | 20 |
| Sticky messages | 0 | 100 |
| Scheduled messages | 0 | 100 |
| Recurring scheduled | Off | ✅ |
| Transcript retention | 30 days | Forever |

## Premium-only features

**Tickets**: Observer roles, DM on open/close, close confirmation message, feedback ratings, inactivity auto-close, auto-close on leave, separate open/closed categories, ticket claiming, panel escalation, rename.

**Forms**: Conditional branching, regex validation, submission cooldowns, auto-role on accept/deny, custom DM messages.

**Verification**: Math captcha, account age requirement.

**Automation**: Sticky messages (all), scheduled messages (all), recurring scheduled.

**Integrations**: Webhooks (all), round-robin assignment, AI replies, white-label bot.

**Data**: CSV export, unlimited retention, duplicate panels.

## Enforcement — 3 layers

### 1. Backend (bypass-proof)
Every premium feature gated at API route level. Two styles:
- `requirePremium("key")` middleware — entire feature
- `validatePremiumFields(serverId, body, fieldMap)` — mixed routes where base has some functionality

Direct API calls bypassing UI still get 403 PREMIUM_REQUIRED.

### 2. Frontend UX
- `PremiumBadge` — small star badge on premium fields
- `PremiumGate` — overlay disabled inputs with upgrade CTA
- `PremiumLockCard` — full-tab lock with button
- `usePremium()` hook — `isPremium` + tier limits
- Global axios interceptor — catches 403 PREMIUM_REQUIRED + LIMIT_REACHED, emits `window` events
- `PremiumToast` — auto-dismissing toast with "Upgrade Now" link

### 3. Bot UX
Slash commands hitting premium-gated endpoints return the 403 as ephemeral reply showing the feature label.

## Error response format

```json
{
  "error": "Premium required for: Observer Roles",
  "code": "PREMIUM_REQUIRED",
  "feature": "panel.observerRoles",
  "featureLabel": "Observer Roles",
  "category": "Tickets",
  "violations": [{ "field": "observerRoleIds", "feature": "panel.observerRoles", "label": "Observer Roles" }]
}
```

## New endpoint

`GET /api/automation/premium-catalog` — exposes `{ features, baseLimits, premiumLimits }` so dashboard renders correct badges without hardcoding.

## Files

**Added** (4): `backend/src/lib/premium.js`, `frontend/src/components/PremiumBadge.jsx`, `frontend/src/components/PremiumToast.jsx`, `frontend/src/hooks/usePremium.js`

**Modified** (10): automation/webhooks/panels/tickets/verification/forms routes, api/index.js, Layout.jsx, PanelsPage/AutomationPage/VerificationPage/FormsPage.

## Upgrade

```bash
cd /opt/botpanel && docker compose down
cd /opt && mv botpanel botpanel.v1.8.bak
mkdir botpanel && cd botpanel
unzip -o /root/botpanel-deploy-ready-v1.9.zip
chmod +x deploy.sh update.sh backend/docker-entrypoint.sh
docker compose up -d --build
```

**No migrations** — pure code. Data preserved.

## Test (non-premium server)

1. `curl http://localhost:8080/api/automation/premium-catalog` → returns matrix
2. Try saving panel with `observerRoleIds` → 403 + toast
3. Automation tabs Sticky/Scheduled/Webhooks → locked with upgrade CTA
4. Verification MATH → badge + 403 on save
5. Forms advanced fields → 403 + toast
6. `/ticket claim` → ephemeral reply "Premium required"
7. Panel duplicate → amber icon → click triggers toast

## Test (premium server)

1. All fields save OK, no 403
2. All tabs show full CRUD
3. Math verification + 50-question forms work
4. Panel duplicate works
5. Badges gone, descriptive labels only

## Rollback

```bash
cd /opt && rm -rf botpanel && mv botpanel.v1.8.bak botpanel && cd botpanel && docker compose up -d
```

## Commercial impact

Before v1.9, 100% feature parity with TicketTool + Appy.bot but **all free**. v1.9 restructures as freemium SaaS:

- **Base**: 1 panel, 2 forms, polls, giveaways — enough for small servers
- **Premium**: everything else — what competitors charge $5-20/mo for

Stripe checkout already wired → `server.isPremium` flips → gates unlock instantly.

Final piece before commercial launch.
