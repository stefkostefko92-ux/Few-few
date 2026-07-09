# BotPanel v1.8 Changelog — "Complete Platform"

v1.8 is a massive release — closes remaining commercial gaps AND adds full dashboard parity with slash commands. Everything you can do in Discord, you can also do in the dashboard.

## New: Polls, Giveaways, Scheduled & Sticky Messages, Webhooks

### 6 new Prisma models
- `Poll` + `PollVote` — multi/single-choice polls with live vote counts
- `Giveaway` + `GiveawayEntry` — prize drawings with role gating + reroll
- `ScheduledMessage` — one-shot or recurring (daily/weekly/monthly)
- `StickyMessage` — one per channel, auto-reposts at bottom
- `Webhook` — outbound HMAC-signed integrations, auto-disable after 10 fails

Migration `20260419210000_v18_polls_giveaways_webhooks` — idempotent.

### New slash commands
- `/poll <question> <options> [multi_choice] [duration_hours]`
- `/giveaway start|end|reroll`
- `/admin sticky set|remove`
- `/admin schedule add|list|remove`
- `/help [category]` — shows every command + its dashboard equivalent

### Schedulers
Two new cron jobs (every 1 min): giveaway auto-end + scheduled message poster with recurrence.

### Webhook events
`services/webhooks.js` with HMAC-SHA256 signing. Auto-disables after 10 consecutive failures. Events: TICKET_OPEN/CLOSE/REOPEN/DELETE, APPLICATION_SUBMITTED/APPROVED/DENIED, GIVEAWAY_ENDED, POLL_CLOSED, VERIFICATION_SUCCESS/FAILURE.

## /help + Commands page — canonical catalog

Single source of truth: `bot/src/utils/commandsCatalog.js`, duplicated to `backend/src/data/commandsCatalog.js` for Docker container isolation. Used by:

- `/help` Discord embed with category dropdown
- `CommandsPage` in dashboard — searchable/filterable reference showing slash commands AND dashboard-only features side-by-side

Docs never drift from implementation.

## Automation dashboard page

`/dashboard/:serverId/automation` — 5 tabs:
- **Polls** — list, close, delete
- **Giveaways** — list, end now, reroll, delete, winners
- **Sticky** — create/update form + list
- **Scheduled** — create form with datetime-local + recurrence
- **Webhooks** — full CRUD with event subscription checkboxes

## Panel Duplicate

Copy any panel with all config (welcome, categories, roles, automation, buttons) — ticket counter resets to 0. Endpoint: `POST /api/:serverId/panels/:panelId/duplicate`. UI: Copy icon on Panels row.

## Deploy

```bash
cd /opt/botpanel && docker compose down
cd /opt && mv botpanel botpanel.v1.7.bak
mkdir botpanel && cd botpanel
unzip -o /root/botpanel-deploy-ready-v1.8.zip
chmod +x deploy.sh update.sh backend/docker-entrypoint.sh
docker compose up -d --build
```

Expect: `Applying migration 20260419210000_v18_polls_giveaways_webhooks`.

## Test checklist

1. `/help` → embed with category dropdown
2. Commands page search "giveaway" filters correctly
3. `/poll question:"Color?" options:"Red,Green,Blue"` → vote counters update live
4. `/giveaway start prize:"Nitro" duration_minutes:2` → 2 min later winner announced
5. `/admin sticky set content:"Read rules!"` → send test message → sticky reposts
6. `/admin schedule add content:"Hi" when:1m` → 1 min later posted
7. Webhook to webhook.site URL → open ticket → payload arrives signed
8. Panels page → Copy icon → duplicate created with "(copy)" suffix

## Rollback

```bash
cd /opt && rm -rf botpanel && mv botpanel.v1.7.bak botpanel && cd botpanel && docker compose up -d
```

---

**Files added**: 9
**Files modified**: 8
**New models**: 6
**New commands**: `/help`, `/poll`, `/giveaway`, `/admin` (with 8 subcommands)
**New cron jobs**: 2
**New backend endpoints**: 30+
**New frontend pages**: 2 (CommandsPage, AutomationPage)

## Commercial parity achieved

- ✅ TicketTool — 100%
- ✅ Appy.bot — 100%
- ✅ Verification / anti-bot gates (v1.7)
- ✅ Polls, giveaways, sticky, scheduled (v1.8)
- ✅ Webhook integrations (v1.8)
- ✅ Full dashboard parity with slash commands
- ✅ In-product help + command reference

BotPanel is now feature-complete for commercial deploy alongside or replacing TicketTool, Appy.bot, GiveawayBot, and similar specialized bots.
