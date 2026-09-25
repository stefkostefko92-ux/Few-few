# Discord App Verification + Privileged Intents — готовите отговори (v3.4)

Един документ за трите формуляра в Developer Portal, които собственикът попълва
**сам**: App Verification, Privileged Intent review (при 10 000+ потребители и
после **всяка година**) и Premium Apps onboarding. Отговорите са на английски
(езикът на формулярите) и са **сверени с кода** — гейтът
`backend/src/__tests__/discordCompliance.test.js` пада, ако intents/правата в
кода се разминат с този документ. Промениш ли intent или право — първо кода,
после тук, после гейта.

**Източници (сверени 18.09.2026):**
- „How Do I Get My App Verified?" — help-center статия 23926564536471 (edited 2024-08-30)
- „What are Privileged Intents?" — 6207308062871 (2026-06-10); „How do I get Privileged
  Intents for my bot?" — 6205754771351 (2026-06-11); „Changes to Privileged Intent Access
  for Discord Apps" — 40281523410967 (2026-06-11)
- Guides: `docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review`
  и `…/you-might-not-need-a-privileged-intent`
- „Premium Apps Onboarding" — 17708927296663 (2024-12-12); „App Directory Inclusion
  Guidelines" — 8852009977879 (2025-10-09); „App Discovery: Content Requirements Policy" —
  9489299950487 (2026-09-09)
- Кодът: `bot/src/index.js` (intents), `bot/src/utils/permissionCheck.js` (покана),
  `backend/src/jobs/dataRetention.js` (ретенция), `legal/ROPA.md`, `legal/DPA.md`,
  `legal/breach-procedure.md`, `docs/DISCORD_COMPLIANCE.md`

Правните изводи тук не са правен съвет.

## 0. Какво важи днес (правилата от 10.06.2026)

| Факт | Стойност | Следствие за нас |
|---|---|---|
| Заверката е задължителна над | **100 сървъра** | Прави се веднъж; чеклист в Portal → App Verification; Stripe Identity на собственика на Team-а |
| Привилегированите intents под | **10 000 уникални потребители** (сбор по сървърите) | Просто се включват от Bot → Privileged Gateway Intents; **без** заявка |
| Над 10 000 | известие по имейл/DM + в портала; **90 дни** за въпросник | Отговорите са в §3–§4; ботът продължава да работи и да влиза в сървъри по време на ревюто |
| Годишно | повторна заявка за всеки одобрен intent | Обновяваш §3 ако употребите са се променили, и подаваш пак |
| Заверка и intent review | **отделни** процеси | Едното не чака другото |

Ползваме **два** от трите привилегировани intent-а: **Message Content** и **Server
Members**. **Presence НЕ се иска** и не се включва — нямаме употреба.

## 1. App Verification — чеклистът в портала

Портал → App → **App Verification**. Стъпките, които зависят от нас:

| Стъпка | Стойност / къде |
|---|---|
| Team-owned app | приложението в Team; собственикът 18+; 2FA и потвърдени имейли на всички членове |
| Privacy Policy URL | `https://supremebot.carbonstealth.eu/privacy` (General Information) |
| Terms of Service URL | `https://supremebot.carbonstealth.eu/terms` (General Information) |
| App description | §2 по-долу |
| Identity | Stripe Identity на собственика на Team-а (може да поиска повторно) |
| Slash команди | да — всички команди са application commands (`/commands` на сайта) |
| Съдържание | без възрастово/насилствено/IP-нарушаващо съдържание в име, описание, команди |

## 2. App description (копирай)

> Supreme Bot is a server management app for Discord communities: a ticket system
> (private support channels or threads with an HTML transcript for the server
> owner), application forms, member verification (captcha / account-age gate),
> reaction roles, autoroles and welcome messages, scheduled messages, an optional
> server activity log, and an optional automatic AI first reply (labelled as AI)
> for support tickets. Server administrators configure everything from a web dashboard
> (Discord OAuth2 login). Premium features are sold only through Discord Premium
> Apps (monthly guild subscriptions). Operated by Carbon Stealth VCC (Bulgaria, EU);
> data is hosted in the EU. Privacy Policy: https://supremebot.carbonstealth.eu/privacy —
> Terms: https://supremebot.carbonstealth.eu/terms — data deletion for any user:
> `/privacy delete` in Discord.

## 3. Privileged Intents — use case per intent (копирай)

Ревюто сравнява декларираното с реалното поведение. Всяка употреба по-долу сочи
файл; няма употреба, която да не е в кода, и няма код, който да ползва intent-а
извън изброеното.

### 3.1 Message Content (`GatewayIntentBits.MessageContent`, `bot/src/index.js`)

**Which features require it (four, nothing else):**

> 1. **Ticket transcripts.** When a member opens a support ticket, the bot creates
>    a private channel or thread. Messages written *inside that ticket channel*
>    are recorded (author id, author tag, text, attachment URLs, message id) so the
>    server owner receives an HTML transcript when the ticket closes — the audit
>    record of the support case. The bot resolves whether a channel is a ticket
>    before reading anything; messages in all other channels are never processed
>    or stored (`bot/src/events/messageCreate.js`, `ticketChannelCache`).
> 2. **Automatic AI first reply (opt-in, Premium).** If — and only if — the server
>    administrator enables it in the dashboard, the *first* message of a new
>    ticket is sent to an LLM provider and its answer is posted in the ticket
>    automatically, labelled as an AI reply (EU AI Act Art. 50); staff take over
>    after it. The feature is disabled platform-wide unless the operator attests a paid provider
>    tier that does not train on the content (`AI_REPLY_TRAINING_ATTESTED`,
>    `backend/src/services/aiReply.js`) — Developer Policy §21.
> 3. **Server activity log, "messages" category (opt-in).** When an administrator
>    with Manage Server enables the "messages" category, edits and deletions of
>    messages are forwarded as a summary to a log channel *in the same server*.
>    Content is not stored in our database and never shown in the dashboard
>    (`bot/src/events/messageUpdate.js`, `messageDelete.js`, `messageDeleteBulk.js`).
> 4. **Counting mini-game channel (opt-in, Server Season).** If an administrator
>    designates one channel as the counting channel in the dashboard, the bot
>    reads messages *in that channel only* to check whether they are the next
>    number in the chain (`bot/src/utils/minigames.js`, `onCounting` — the channel
>    id is compared before `message.content` is touched). Nothing is stored: the
>    backend keeps only the current number, the server record and the id of the
>    last member who counted (`backend/src/lib/game/counting.js`). Everything else
>    in the game (levels, XP) counts message *events* with a cooldown, never text
>    (`bot/src/utils/game.js`).

**Why interactions cannot replace it:**

> A ticket is a free-form conversation between a member and staff inside a
> channel; it is not a command. Slash commands, modals and context menus capture
> a single explicit input, not an ongoing multi-party exchange, and the transcript
> must reflect exactly what was said (including edits and deletions). The
> "mentions the bot" / "replies to the bot" exceptions do not apply: members talk
> to staff, not to the bot. Prefix commands are not used anywhere — every command
> is a slash command.

**Data handling:**

> Stored only for ticket channels. Transcripts (`archiveHtml`) are encrypted at
> rest at application level (AES-256-GCM, `backend/src/lib/transcriptAtRest.js`).
> Retention: Free-tier tickets are anonymized 30 days after close; Premium
> retention is controlled by the server operator; all data of a server is purged
> 30 days after the bot is removed (`backend/src/jobs/dataRetention.js`). Any user
> can delete their data with `/privacy delete` (no dashboard needed); the
> transcript is regenerated without them (`backend/src/lib/dsr.js`). Message
> content is never used to train models, never sold, never shared for advertising.

### 3.2 Server Members (`GatewayIntentBits.GuildMembers`, `bot/src/index.js`)

**Which features require it:**

> Real-time member events (`GUILD_MEMBER_ADD` / `UPDATE` / `REMOVE`) power:
> 1. **Autorole and welcome messages** on join (`bot/src/events/guildMemberAdd.js`).
> 2. **Sticky roles** (opt-in per server): the member's role ids are snapshotted
>    when they leave and restored when they rejoin; not stored on kick/ban
>    (`bot/src/events/guildMemberRemove.js`, `backend/src/routes/bot.js`).
> 3. **Server activity log, "members" category (opt-in):** join/leave, role and
>    nickname changes, timeouts, forwarded to a log channel in the same server
>    (`bot/src/events/guildMemberUpdate.js`).
> 4. **Removal cause and cleanup:** leave vs kick vs ban decides whether roles
>    are kept and whether a member's open tickets are closed.

**Why the REST alternatives are not enough:**

> The features are event-driven: a welcome message, an autorole or a role
> restore must happen *at the moment* a member joins or leaves — there is no
> interaction to hook into and no user id to look up in advance. On-demand
> lookups (Get Guild Member, interaction member payloads) are already used
> wherever they suffice (permission checks, verification, forms) and do not
> require the intent. The full member list is never requested and never cached
> (`members.fetch` is used only for a single id).

**Data handling:**

> Only what the enabled feature needs: role ids for sticky roles (180-day
> retention, deleted on restore, ban or erasure request), the event summary in
> the operator's own log channel. No presence data, no member enumeration, no
> profile scraping. Everything is scoped to the server that installed the bot.

### 3.3 Presence — not requested

> Not enabled in the Developer Portal and not requested by the gateway client.
> No feature reads status or activity.

## 4. Data security and privacy questions (копирай)

**Where and how is the data stored?**

> PostgreSQL on a dedicated VPS at Hetzner Online GmbH (Germany, EU); Redis for
> short-lived counters and form sessions. All services listen on localhost behind
> a TLS-terminating reverse proxy (TLS 1.2+, HSTS preload). Containers run with
> all Linux capabilities dropped. Secrets live only on the server (mode 600),
> never in the repository or deploy archive.

**Encryption:**

> In transit: HTTPS everywhere. At rest, at application level with AES-256-GCM:
> Discord OAuth tokens, white-label bot tokens, webhook secrets, staff TOTP
> secrets and ticket transcripts (`backend/src/lib/crypto.js`,
> `backend/src/lib/transcriptAtRest.js`). Database volume encryption is the
> hosting layer's responsibility (confirmed by the operator).

**Who has access?**

> Staff access to the admin console requires Discord OAuth2 login **plus** a
> TOTP second factor (mandatory for staff roles), with a fresh re-verification
> for destructive actions and an optional admin IP allowlist. Sessions are
> server-side, httpOnly/secure/sameSite cookies, 7 days. All admin actions are
> written to an audit log (2-year retention). Brute-force protection escalates
> from per-IP to per-subnet blocks and alerts the owner.

**Retention and deletion:**

> Ticket transcripts: 30 days after close on Free tier, operator-controlled on
> Premium; a server's data is purged 30 days after the bot leaves; sticky-role
> snapshots 180 days; verification attempts 90 days; sessions 7 days; error
> monitoring 90 days. Deletion on request: `/privacy delete` in Discord for any
> user (identity anonymized, transcripts regenerated), dashboard self-service
> (GDPR Art. 15 export / Art. 17 deletion), admin console for requests received
> by e-mail at privacy@carbonstealth.eu (target ≤72 h).

**Sharing with third parties:**

> No sale, no advertising, no data brokers. Sub-processors under DPA/SCC only:
> Hetzner (hosting, EU), Discord (delivery and seller of record for Premium Apps),
> Google Gemini (only when the server administrator enables AI replies and only
> after the training attestation), Sentry (error monitoring, no message content).
> Message content is never used to train machine-learning models.

**Incident response:**

> Documented breach procedure (`legal/breach-procedure.md`): containment,
> assessment, notification of the supervisory authority within 72 h, of affected
> users, **and of Discord** (Developer Terms §5(c)). Security alerts (blocks, MFA
> changes, denied admin access) are delivered to the owner in real time.

**Screenshots to attach (reviewers value them):** ticket channel + closing
transcript e-mail/embed; dashboard toggle for AI replies with the attestation
notice; Server Activity Logging settings with categories off by default;
`/privacy delete` flow; Sticky Roles toggle.

## 5. Bot invite — правата, които искаме (без Administrator)

Поканата (`bot/src/utils/permissionCheck.js`, `frontend/src/pages/Login.jsx`)
иска `permissions=361045814416`, тоест точно:

| Право | За какво |
|---|---|
| View Channels, Send Messages, Embed Links, Attach Files, Read Message History | тикети, панели, приветствия, транскрипти |
| Manage Channels | създаване/затваряне на тикет канали |
| Manage Threads, Create Private Threads, Send Messages in Threads | тикети в нишки |
| Manage Messages | лепкави съобщения, чистене на панели |
| Manage Roles | верификация, autorole, reaction roles, sticky roles |
| View Audit Log | актьорът в Server Activity Logging |

Промяна на правата = промяна на числото на двете места + тук; гейтът го сверява.

## 6. Premium Apps onboarding — след заверката

Портал → Monetization. Чеклистът на Discord (статия 17708927296663): заверено
приложение · Team · собственик 18+ · 2FA + имейли · slash команди · Terms +
Privacy линкове · без вредно съдържание · payout с валиден метод · приети
Monetization Terms и Policy. После: две месечни **guild** SKU-та
(`docs/DISCORD_MONETIZATION.md` §3) → `DISCORD_SKU_PREMIUM` и
`DISCORD_SKU_WHITELABEL` в `backend/.env` и `bot/.env` → деплой →
`GET /api/billing/config` връща `"configured":true` и smoke минава 10/10.

## 7. Годишното подновяване — какво се обновява

1. Сравни §3 с `bot/src/index.js` и с `bot/src/events/` (гейтът пада при нов/махнат
   intent, но не при нова УПОТРЕБА на същия intent — това го четеш ти).
2. Обнови ретенцията в §4, ако `dataRetention.js` или `legal/ROPA.md` са сменени.
3. Свери датите на източниците горе през help-center API-то
   (`…/api/v2/help_center/en-us/articles/<id>.json`, поле `edited_at`).
4. Подай в 90-дневния прозорец — достъпът се пази по време на ревюто.
