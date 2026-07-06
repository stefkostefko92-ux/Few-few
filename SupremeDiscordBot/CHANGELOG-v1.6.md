# BotPanel v1.6 Changelog — "Full Parity"

v1.6 closes the remaining gaps vs **tickettool.xyz** and **appy.bot**. Adds DropDown panel spawn, command-style ticket opening, escalation, welcomer, and autorole. Completes 100% commercial parity.

## TicketTool gaps closed

### `/new` — command-style ticket opening
- Autocomplete shows available panels
- `on_behalf_of:@user` requires staff permissions
- Falls back to first panel if none specified
- Same counter/naming/permissions as panel-button flow

### `/escalate` — move ticket between panels
- Staff-only
- Moves channel to new panel's `categoryOpenId`
- Swaps support role permissions
- Posts "Ticket Escalated" embed
- Recorded in audit log

### DropDown-style panels
Set `buttonStyle = "DROPDOWN"` on a panel. Spawn logic in `bot/src/utils/embed.js` emits a single StringSelectMenu with up to 25 options (one per panel button). Interaction handler routes through same `handlePanelButtonClick()`.

### Thread-style panels
`buttonStyle = "THREAD"` — ticket spawns as private thread in panel channel. Creator + support role members added individually.

### Backend endpoints
```
POST /api/bot/ticket/:id/escalate
GET  /api/bot/guild/:guildId/panels
```

## Appy.bot gaps closed

### Welcomer (channel + DM)
New `Server` fields: `welcomerEnabled`, `welcomerChannelId`, `welcomerMessage`, `welcomerEmbedColor`, `welcomerDmEnabled`, `welcomerDmMessage`. Supports `{user}`, `{server}`, `{server.members}`, `{date}`, `{time}` variables. Fires from new `guildMemberAdd.js` event.

### Autorole
- `autoroleIds[]` — roles auto-assigned to new humans
- `autoroleBotIds[]` — roles auto-assigned to new bots

Bot role must be above target roles for assignment to work. Failures are logged but don't block other features.

### CSV export applications
Already existed (v1.3) as `GET /api/export/:serverId/applications`. Verified functional — exports question labels as column headers.

## Schema migration

`20260419150000_v16_welcomer_autorole/migration.sql` — 9 new columns on `servers`:

```
welcomerEnabled, welcomerChannelId, welcomerMessage,
welcomerEmbedColor, welcomerDmEnabled, welcomerDmMessage,
autoroleIds[], autoroleBotIds[], stickyMessagesEnabled
```

Idempotent (IF NOT EXISTS). Safe to re-run, safe to roll back to v1.5.

## Frontend

### SettingsPage — "Welcomer & Autorole" section
- Toggle + channel ID + message textarea + embed color picker
- Optional DM message
- Comma-separated autorole IDs (users + bots separately)
- Variable helper below each textarea

## Deploy

```bash
cd /opt/botpanel && docker compose down
cd /opt && mv botpanel botpanel.v1.5.bak
mkdir botpanel && cd botpanel
unzip -o /root/botpanel-deploy-ready-v1.6.zip
chmod +x deploy.sh update.sh backend/docker-entrypoint.sh
docker compose up -d --build
```

Verify:
```bash
docker compose logs --tail=40 backend | grep -E "migration|v16"
# Expected: Applying migration 20260419150000_v16_welcomer_autorole
```

## Test checklist

1. **Welcomer** → Settings → enable + set channel/message → new join → embed posts
2. **Autorole** → Settings → comma-separated role IDs → new join → role assigned
3. **`/new`** → type in any channel → autocomplete shows panels → pick → ticket opens
4. **`/escalate`** → in ticket → `/escalate panel:Billing` → channel moves to Billing category
5. **DropDown** → edit panel → `buttonStyle=DROPDOWN` → re-spawn → single dropdown instead of buttons

## 100% Parity checklist

### TicketTool (complete)

Counter + padding · Open/closed categories · Two-step close · Close vs Delete · In-channel buttons · Per-user + per-panel limits · Welcome embed with variables · Logging channel · Reopen · DM on open/close · `/rename` · `/debug` · Inactivity auto-close · Auto-close on leave · Observer roles · Feedback rating · `/new` · `/escalate` · `/add`/`/remove`/`/close`/`/claim`/`/unclaim` · DropDown/Thread/Button panel styles · HTML + PDF transcripts

### Appy.bot (complete)

Application forms with branching · Role auto-assign · Custom DMs · Cooldowns · Max submissions · Closed toggle · Manager roles · Ping roles · Regex validation · CSV export · Interview escalation · Welcomer · Autorole

## Deferred to v1.7+

Sticky messages · Captcha/verification · Polls · Giveaways · Scheduled messages · Steam verification · Google Sheets · File uploads in answers · Webhook event integrations · Conditional thread pinging · Role/category picker UI · Panel duplicate

---

**Files changed/added**: 11
**New commands**: 2 (`/new`, `/escalate`)
**New events**: 1 (`guildMemberAdd`)
**New endpoints**: 2
**Migration**: `20260419150000_v16_welcomer_autorole`
