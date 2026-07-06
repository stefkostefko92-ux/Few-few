# CS Anticheat — Discord интеграция (дизайн)

> Продукт: **CS Anticheat** (Carbon Stealth) — нов FiveM античийт.
> Автор: Дискорджията · Дата: 2026-07-06 · Статус: **дизайн / за имплементация**
> Граница: тук не пускам реален бот срещу Discord (нужни са токен + мрежа). Долу са
> код-скелети, embed схеми, команди и чеклист. Реалното свързване/регистриране на
> команди става на машина с токена (VPS-аджията).
> Confidence етикети: **Сигурно** = потвърдено на живо от docs.discord.com тази сесия;
> **Вероятно** = стандартна практика; **Несигурно** = за проверка при имплементация.

---

## 0. TL;DR — какво строим

Три независими Discord повърхности, всяка с ясна отговорност:

1. **Alert pipeline (webhook execute)** — realtime detection/ban известия в staff канал,
   rich embed + action бутони (Ban/Kick/Ignore/Appeal). Праща се от панела/сървъра.
2. **Management bot (discord.js v14, Gateway)** — slash команди `/ac …`, permissions,
   audit log, multi-server. Живее в `bot/` пакет по образец на `SupremeDiscordBot/`.
3. **Live monitoring (sticky embed)** — auto-updating статус съобщение в канал:
   играчи онлайн, детекции днес, uptime.

Ключова разлика от конкурентите: **действие директно от Discord** (бутон Ban → реален
ban в мрежата за <3 s чрез defer), **HMAC-подписани alert-и** (не могат да се spoof-нат),
**multi-server от една инсталация** (една мрежа → много Discord guild-а), и **Ed25519
HTTP interactions** опция (без постоянен Gateway за малки клиенти).

---

## 1. Как конкурентите ползват Discord (и къде им липсва)

Важно уточнение: **echo.ac, detect.ac и Ocean (anticheat.ac) НЕ са in-game античийтове** —
те са **screenshare / forensic scan** инструменти (сканират машината на заподозрян за
следи от cheat-ове, cleaner-и, bypass-и). Разбираме конкуренцията, но CS Anticheat е
**server-side in-game античийт** — това е нашето предимство: ние имаме realtime детекции,
не само ръчни сканове.

### 1.1 echo.ac
- **Discord webhook след scan** — праща в staff канал embed с ключова инфо + линк към
  пълния scan резултат. Добро за „quick access log". (Сигурно — от echo.ac документация/landing.)
- **HWID ban-evasion linking** — свързва сканове на един и същ човек по hardware ID.
- **Detection sets** (HIPPO, RAPTOR) — сигнатури за известни cheat клиенти.
- **Липсва:** няма realtime in-game alert (по природа — то е scan tool); няма действие
  от Discord (ban/kick бутон); webhook-ът е еднопосочен лог.

### 1.2 detect.ac
- **Deep-dive forensic scan** (<60 s) — открива cleaner-и/bypass-и, които live скенери
  пропускат. Резултат-центричен, отново ръчно иницииран.
- **Липсва:** management bot със slash команди, multi-server оркестрация, realtime feed.

### 1.3 Ocean (anticheat.ac) — най-близо до „bot" концепцията
- **Discord bot с addon-и** — staff могат да trigger-ват сканове, преглеждат резултати,
  банват заподозрени и си сътрудничат по case-ове **без да напускат Discord**. (Вероятно —
  от search агрегат; потвърди точния addon списък при нужда.)
- **5-нива роля hierarchy** (OWNER, MANAGER, ADMIN, STAFF, USER) + tamper-evident audit log.
- **Custom detection rules** — общността пише свои сигнатури в browser JS editor.
- **AES-256** за scan резултати in transit/at rest.
- **Липсва:** пак scan-центрично; slash команди за in-game ban management на цяла мрежа
  не са публично документирани; няма sticky live-feed концепция.

### 1.4 Общи слаби места на всички → нашите възможности
| Пропуск у конкурентите | CS Anticheat отговор |
|---|---|
| Еднопосочен webhook лог | Двупосочно: **action бутони** (Ban/Kick/Ignore/Appeal) от embed-а |
| Ръчно иницииран scan | **Realtime in-game detection** push в реално време |
| Няма spoof защита на alert-и | **HMAC подпис** на всеки alert от сървъра |
| Един сървър / ръчна настройка | **Multi-server**: една мрежа → много guild-а, OAuth2 link |
| Няма live overview | **Sticky auto-updating** статус embed (онлайн/детекции/uptime) |
| Alert буря при масов чийт | **Rate-limit + agregация** (batching, dedup по HWID/детекция) |

---

## 2. Detection / Ban alert pipeline

### 2.1 Поток (source → Discord)

```
FiveM сървър (resource)          CS панел (Express API)            Discord
   |  detection event  ──HMAC──►   /api/v1/detections               |
   |                               ├─ validate + persist             |
   |                               ├─ severity policy                |
   |                               ├─ rate-limit / batch / dedup     |
   |                               └─ webhook.execute ──────────────►│ staff канал
   |                                                                 │  (embed + бутони)
   |  ◄──── ban/kick RCON/txAdmin ──── бутон Ban (interaction) ──────┤
```

**Кой праща alert-а:** панелът (не самият FiveM resource) държи webhook URL-а като тайна
и подписва. FiveM resource-ът праща към нашето API с HMAC; API-то реши дали да алармира.
Така **webhook URL-ът никога не живее на game сървъра** (който е по-лесна цел).

### 2.2 Rich embed схема (detection alert)

Лимити (Сигурно — Discord docs): title ≤256, description ≤4096, ≤25 полета
(name ≤256 / value ≤1024), footer ≤2048, **сумарно ≤6000** знака/embed, **≤10 embed-а**
и **≤5 action row-а** на съобщение; row = **до 5 бутона** ИЛИ 1 select menu.

```jsonc
{
  "username": "CS Anticheat",
  "avatar_url": "https://cdn.carbonstealth.eu/cs-ac/icon.png",
  "allowed_mentions": { "parse": [] },          // никога случаен @everyone (виж §4)
  "embeds": [{
    "title": "🚨 Detection — Aimbot (High)",
    "color": 15158332,                           // червено; цвят по severity (§2.3)
    "description": "Играч **John_Doe** засечен от **CS-AIM-07** (snap-angle).",
    "fields": [
      { "name": "Играч",     "value": "John_Doe `#42`", "inline": true },
      { "name": "Identifier","value": "`license:3f9a…`", "inline": true },
      { "name": "HWID",      "value": "`H:7c1e…9b`",    "inline": true },
      { "name": "Detection", "value": "Aimbot / snap-angle", "inline": true },
      { "name": "Severity",  "value": "🔴 High (8/10)",  "inline": true },
      { "name": "Confidence","value": "94%",            "inline": true },
      { "name": "Сървър",    "value": "EU-RP #1 (fivem:xxxx)", "inline": true },
      { "name": "Позиция",   "value": "`-412.3, 1180.7`","inline": true },
      { "name": "Session",   "value": "42 min",          "inline": true }
    ],
    "image": { "url": "attachment://evidence.jpg" }, // screenshot/clip кадър
    "footer": { "text": "CS Anticheat • detection #d_01J…" },
    "timestamp": "2026-07-06T14:22:00.000Z"
  }],
  "components": [{
    "type": 1,                                   // action row
    "components": [
      { "type": 2, "style": 4, "label": "Ban",    "custom_id": "ac:ban:d_01J…",   "emoji": {"name":"🔨"} },
      { "type": 2, "style": 1, "label": "Kick",   "custom_id": "ac:kick:d_01J…" },
      { "type": 2, "style": 2, "label": "Ignore", "custom_id": "ac:ignore:d_01J…" },
      { "type": 2, "style": 2, "label": "Appeal", "custom_id": "ac:appeal:d_01J…" },
      { "type": 2, "style": 5, "label": "Панел",  "url": "https://ac.carbonstealth.eu/d/d_01J…" }
    ]
  }]
}
```

**Style код-ове (Сигурно):** 1=Primary, 2=Secondary, 3=Success, 4=Danger, 5=Link.
Link бутон (5) няма `custom_id` — не праща interaction. `custom_id` ≤100 знака —
затова носим само `action:detectionId` (кратък ULID), не целия payload. Реалните данни
се четат server-side по `detectionId` (никога не се доверяваме на client payload — §4).

**Screenshot като attachment:** използваме `attachment://` + multipart upload (файл по
boost ниво), а не hotlink към наш CDN — за да не изтича вътрешен URL и да остане в Discord.

### 2.3 Severity policy → цвят + routing
| Severity | Цвят (decimal) | Auto-action | Канал |
|---|---|---|---|
| Critical (cheat exec, mem inject) | 10038562 (тъмно червено) | опц. auto-ban | `#ac-critical` (@here по политика) |
| High (aimbot, esp) | 15158332 (червено) | staff review | `#ac-alerts` |
| Medium (suspicious, teleport) | 15844367 (жълто) | log + бутони | `#ac-alerts` |
| Low / info (heuristic flag) | 3447003 (синьо) | само log | `#ac-logs` (без бутони) |

### 2.4 Rate limiting и anti-spam (при масов чийт / detection буря)

Discord лимити (Сигурно): per-route **bucket**-и + **глобален ~50 req/s**; при **429**
чакаш `retry_after`; **>10000 невалидни (401/403/429) за 10 min → Cloudflare бан на IP за 1 час**.

Нашите слоеве (над Discord лимитите):
1. **Webhook има собствен bucket** (per webhook id/token) — един канал = един bucket.
   Не разчитай на глобалния лимит; чети `X-RateLimit-*` и `X-RateLimit-Scope`.
2. **Batching / агрегация:** при >N детекции за същия играч в прозорец (напр. 10 s) →
   **един** embed „John_Doe: 14 detections (aimbot ×9, esp ×5)" вместо 14 съобщения.
3. **Dedup по (HWID, detection type)** в кратък TTL (Redis, напр. 30 s) — spam guard.
4. **Queue + drain при 429** (BullMQ/Redis): не изхвърляй alert-и, забавяй ги; никога
   плътен цикъл от execute-и.
5. **Circuit breaker:** ако каналът връща 429 постоянно → превключи на дайджест на всеки
   60 s + предупреди в `#ac-logs`.
6. **≤10 embed-а/съобщение** — при масова вълна групирай до 10 детекции в едно съобщение.

> discord.js `WebhookClient` управлява bucket-ите вътрешно — **не** пишем raw fetch loop.

---

## 3. Management bot — slash команди

### 3.1 Команден набор (`/ac` с subcommands)

Едно top-level command `ac` с subcommands (по-чисто от 5 отделни команди; лимит ~100
глобални команди/приложение — Сигурно). Имена lowercase 1–32, описание ≤100.

| Subcommand | Опции | Права | Defer? |
|---|---|---|---|
| `/ac lookup` | `player` (string/identifier), `[server]` | STAFF+ | да (DB + панел заявка) |
| `/ac ban` | `player`, `reason`, `[duration]`, `[server]` | ADMIN+ | да (RCON/txAdmin call) |
| `/ac unban` | `ban_id` \| `player`, `reason` | ADMIN+ | да |
| `/ac stats` | `[server]`, `[period]` | STAFF+ | да |
| `/ac status` | `[server]` | STAFF+ | опц. |
| `/ac history` | `player` | STAFF+ | да |
| `/ac note` | `player`, `text` | STAFF+ | не |

**Регистрация (Сигурно):** per-guild команди се разпространяват **мигновено** → използвай
за dev и за onboarding на нов клиент. Глобални команди — до ~1 час кеш. За SaaS с много
guild-а: регистрирай **per-guild при onboarding** (мигновено + позволява per-tenant вариации).

### 3.2 Пример: `/ac lookup` (discord.js v14, ESM — стил на SupremeDiscordBot)

```js
// bot/src/commands/ac.js  — ESM, discord.js v14
import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ac')
  .setDescription('CS Anticheat management')
  .addSubcommand(s => s.setName('lookup')
    .setDescription('Профил и detection история на играч')
    .addStringOption(o => o.setName('player').setDescription('име / identifier').setRequired(true))
    .addStringOption(o => o.setName('server').setDescription('таргет сървър').setAutocomplete(true)));

export async function execute(interaction, ctx) {
  const sub = interaction.options.getSubcommand();
  // 1) authz server-side (никога не се доверявай на client — §4)
  if (!await ctx.authz(interaction, 'STAFF')) {
    return interaction.reply({ content: 'Нямаш права за тази команда.', flags: MessageFlags.Ephemeral });
  }
  if (sub === 'lookup') {
    // 2) defer < 3 s, защото четем от панела (мрежова заявка) — §4
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const player = interaction.options.getString('player');
    const guildCfg = await ctx.tenantFor(interaction.guildId);      // multi-server scoping
    const profile = await ctx.panel.lookup(guildCfg.networkId, player);
    await ctx.audit(interaction, 'lookup', { player });             // audit log
    const embed = new EmbedBuilder()
      .setTitle(`Профил — ${profile.name}`)
      .addFields(
        { name: 'Detections', value: String(profile.detections), inline: true },
        { name: 'Bans',       value: String(profile.bans),       inline: true },
        { name: 'HWID',       value: `\`${profile.hwidShort}\``,  inline: true },
      );
    await interaction.editReply({ embeds: [embed] });               // follow-up през токена
  }
}
```

### 3.3 Permissions (кой staff какво може)

**Двупластова authz** — Discord ниво + панел ниво, и двете server-side:
1. **Discord command permissions** (`default_member_permissions`, per-guild override) —
   груб филтър кой изобщо вижда командата.
2. **Панел роля** (истинската истина): mapping `discord_role_id → CS роля`
   (OWNER > MANAGER > ADMIN > STAFF > VIEWER). `/ac ban` изисква ADMIN+.
   **Проверката е винаги на нашия сървър** — Discord permission-ите са само UX слой,
   не security граница (клиентът може да лъже — §4).
3. **Ephemeral** отговори за чувствителни данни (identifier, HWID, ban reasons) —
   `MessageFlags.Ephemeral` (flag 64, 1<<6 — Сигурно).

### 3.4 Audit log
Всяко действие (slash или бутон) → ред в таблица `audit_log`:
`{ actorDiscordId, actorName, action, targetPlayer, detectionId, guildId, networkId, ts, ip? }`.
Tamper-evident: append-only + hash chain (`prevHash`) по образец на Ocean. Копие в
`#ac-audit` канал (read-only за staff) чрез webhook.

### 3.5 Multi-server (една мрежа → много Discord-и)
- Модел: `Network 1─* GuildLink 1─1 DiscordGuild`. Един FiveM network може да е свързан
  към няколко guild-а (напр. main + admin-only). Всеки `GuildLink` носи own webhook-ове,
  role-mapping, channel-mapping.
- **Tenant isolation:** всяка команда/interaction се scope-ва по `interaction.guildId →
  GuildLink → networkId`; никога не приемай client-подаден `networkId`/`serverId`
  (защита от cross-tenant IDOR — по образец на SupremeDiscordBot multi-tenant правилото).
- **OAuth2 за връзка на сървър към панела:**
  `/oauth2/authorize?client_id=…&scope=bot+applications.commands&permissions=<bitwise>`.
  Owner добавя бота → callback запазва `guildId` → в панела owner map-ва канали/роли.
  Scopes: `bot` + `applications.commands` (slash в guild-а); за web login към панела —
  `identify` + `guilds` (да покажем кои негови guild-и може да свърже).
- **Права в канал ≠ права в guild** (Сигурно): проверявай реалните права на бота в
  конкретния алърт канал (base ∪/∩ overwrites), не само guild-ниво, преди да пишеш.

---

## 4. Сигурност (неприкосновено)

### 4.1 Bot token — тайна винаги
- Токенът дава **пълен контрол** над бота. **Никога** в кода, git, клиента, лог.
- Живее в `.env` на сървъра, **mode 600** (по монорепо правилото „secrets never enter repo").
- Fail-fast на placeholder (`DISCORD_TOKEN=changeme` → crash при boot, като Supreme).
- Изтичане → **ротирай веднага** в Dev Portal (спри-и-питай преди ротация — необратимо за
  текущите сесии). CI/deploy архивът **не** носи токена (виж deploy/README).

### 4.2 Webhook URL = тайна (сам по себе си)
- Който има webhook URL-а може да пише в канала — **няма друга авторизация** (Сигурно).
- Съхранявай криптиран в DB (като Supreme криптира OAuth токени), не в game resource.
- **HMAC на нашия alert канал:** FiveM resource → CS API подписва payload-а с per-network
  секрет (`X-CS-Signature: sha256=…` над raw body + timestamp; отхвърли при skew >5 min).
  Така **никой не може да spoof-не detection alert** дори да знае нашия API URL. (Идемпотентен
  по `detectionId` — replay guard.)

### 4.3 HTTP interactions → Ed25519 (ако ползваме webhook endpoint вместо Gateway)
- Ако регистрираме **Interactions Endpoint URL**, Discord подписва всеки request. **ЗАДЪЛЖИТЕЛНО**
  верифицирай `X-Signature-Ed25519` + `X-Signature-Timestamp` срещу public key, иначе Discord
  отхвърля самата регистрация на endpoint-а. (Сигурно — потвърдено docs.discord.com тази сесия.)
- **Отговори на PING (type 1) с PONG (type 1)** (Сигурно).
- Верификацията е **на raw body** (като Stripe при Supreme) — преди JSON parse; route извън
  rate limiter/body-parser transformer.

```js
// bot/src/http/verify.js — Ed25519 за HTTP interactions
import nacl from 'tweetnacl';
export function verifyDiscord(req, PUBLIC_KEY) {
  const sig = req.get('X-Signature-Ed25519');
  const ts  = req.get('X-Signature-Timestamp');
  const raw = req.rawBody;                        // Buffer, НЕ parsed JSON
  if (!sig || !ts || !raw) return false;
  return nacl.sign.detached.verify(
    Buffer.concat([Buffer.from(ts), raw]),
    Buffer.from(sig, 'hex'),
    Buffer.from(PUBLIC_KEY, 'hex'),
  );
}
// interaction handler: ако type===1 → отговори { type: 1 } (PONG)
```

> **Избор Gateway vs HTTP (§6.2):** препоръка е **Gateway** (discord.js) за management бота
> (нужни са и live събития), а HTTP endpoint е опция само ако искаме stateless за малки
> клиенти. Ако е HTTP — Ed25519 е задължителен.

### 4.4 Least-privilege intents
Gateway intents филтрират кои събития получаваш (Сигурно). Искай **само нужното**:
- `Guilds` (1<<0) — задължителен baseline (guild/channel кеш, командите).
- **НЕ** ни трябва `MESSAGE_CONTENT` (1<<15, привилегирован), `GUILD_MEMBERS` (1<<1,
  привилегирован), `GUILD_PRESENCES` (1<<8, привилегирован) — работим със slash команди и
  бутони, не четем свободен текст. Това ни спестява review.
- **Праг (Verified памет, 2026):** привилегировани intents изискват review при **10000+
  уникални потребители** (НЕ 100 servers — това е отделният verification процес).
  App Directory listing иска verification + публични Privacy Policy + ToS.

### 4.5 Само оторизиран staff действа (бутони)
- Бутон `custom_id` носи само `action:detectionId` (≤100 — Сигурно). При click:
  1. **Re-authz** актьора server-side (`interaction.user.id → role`) — не се доверявай, че
     „щом вижда бутона има право".
  2. Провери, че `detectionId` принадлежи на **същия guild/tenant** (anti-IDOR).
  3. Провери, че detection-ът не е вече обработен (idempotency — двоен click / race).
  4. `deferUpdate` < 3 s, извърши ban чрез RCON/txAdmin, `editReply` с резултат + disable
     бутоните (замени embed-а: „Banned by @admin at …").
- **Валидирай всеки вход:** `custom_id` формат (regex whitelist), опции по schema (Zod),
  никакъв raw client payload като истина.

### 4.6 Anti-abuse
- `allowed_mentions: { parse: [] }` по подразбиране на всеки webhook/съобщение → **никакъв
  случаен @everyone/@here** (guard срещу mention injection през player име!). Player имена в
  embed се третират като недоверен вход — escape/sanitize.
- Rate-limit safe (§2.4) — под 10000 invalid/10min праг, за да няма Cloudflare IP бан (Сигурно).
- Логвай **без** токени/лични данни (identifier/HWID маскирани в логовете).

---

## 5. Live monitoring — sticky статус embed

### 5.1 Концепция
Един **закачен** (pinned) embed в `#ac-status`, който ботът **редактира** периодично
(не праща ново съобщение) → каналът не се спами, а винаги показва текущо състояние.

```jsonc
{
  "embeds": [{
    "title": "🛡️ CS Anticheat — EU-RP Network",
    "color": 3066993,
    "fields": [
      { "name": "Статус",        "value": "🟢 Online",  "inline": true },
      { "name": "Играчи онлайн", "value": "412 / 512",  "inline": true },
      { "name": "Сървъри",       "value": "3 / 3 up",   "inline": true },
      { "name": "Детекции днес", "value": "27",          "inline": true },
      { "name": "Бана днес",     "value": "4",           "inline": true },
      { "name": "Uptime",        "value": "99.98%",     "inline": true }
    ],
    "footer": { "text": "Обновено" },
    "timestamp": "2026-07-06T14:25:00.000Z"
  }]
}
```

### 5.2 Auto-update механика (rate-limit aware)
- **Интервал ≥ 60 s** (не по-често) — редакция на съобщение също харчи от bucket-а. При
  много tenant-и разпредели update-ите (jitter), не всички в една секунда.
- Пази `messageId` на sticky-то в DB (`GuildLink.statusMessageId`); при рестарт → `editMessage`,
  не ново. Ако е изтрито → пресъздай веднъж и запази новото id.
- При detection буря sticky-то е **отделен** bucket от alert-ите — не се влияят взаимно.
- Данните идват от панела (cache в Redis, TTL ~30 s) — бот-ът не polls-ва FiveM директно.

---

## 6. Технически stack

### 6.1 Разположение (по образец на `SupremeDiscordBot/`)
Нов пакет в CS Anticheat монорепо, ESM plain JS + discord.js v14:
```
CS Anticheat/
├─ panel/            # Express API + Prisma (detections, bans, tenants, audit)
├─ bot/              # discord.js v14 Gateway worker (slash + бутони)
│  ├─ src/commands/  # ac.js (lookup/ban/unban/stats/status/history/note)
│  ├─ src/buttons/   # ac:ban / ac:kick / ac:ignore / ac:appeal рутинг по custom_id
│  ├─ src/http/      # (опц.) Ed25519 interactions endpoint
│  └─ src/alerts/    # WebhookClient wrapper: batching/dedup/queue (§2.4)
└─ frontend/         # (по-късно) панел UI
```
- `Events.ClientReady` за ready; `MessageFlags` за ephemeral; defer за дълги interactions —
  1:1 с наложените Supreme конвенции.
- **BullMQ + Redis** за alert queue (drain при 429), dedup TTL, sticky scheduler.

### 6.2 HTTP interactions vs Gateway — решение
| | Gateway (discord.js) | HTTP endpoint |
|---|---|---|
| Live събития | ✅ | ❌ (само interactions) |
| Sticky updates / presence | ✅ лесно | по-трудно |
| Stateless / нула persistent conn | ❌ | ✅ |
| Ed25519 задължителен | не | **да** |
| Sharding при мащаб | 2500+ guild-а → задължителен (Сигурно) | N/A |
**Решение:** **Gateway** за management бота (нужни са live status + бутони + бъдещи събития).
HTTP endpoint само ако отделим „interactions-only" lightweight режим. При **2500+ guild-а**
включи sharding (`shard:[id,total]`, формула `shard_id=(guild_id>>22)%num_shards` — Verified памет).

### 6.3 Alert транспорт
- **Webhook execute** за detection/ban alert-и (§2) — **без** Bot токен, идеално за push от
  панела; собствен bucket per канал.
- **Bot (Gateway)** за интерактивните бутони и slash — защото webhook сам не получава
  interaction callback-и (нужен е app с interactions).
- Двете се връзват: webhook праща embed-а с бутони, чийто `custom_id` рутира към **бота**.

---

## 7. Definition of Done (чеклист преди „готово")

- [ ] Bot token в `.env` (mode 600), **не** в git; fail-fast на placeholder.
- [ ] Webhook URL-и криптирани в DB; **не** живеят на FiveM game сървъра.
- [ ] HMAC (`X-CS-Signature`) верификация на detection payload-ите (raw body, timestamp skew, idempotent).
- [ ] Ако HTTP interactions: Ed25519 верификация (raw body) + PING→PONG (type 1).
- [ ] Intents минимални (`Guilds`), **без** привилегировани; документирано защо.
- [ ] Всяко действие: server-side authz (роля) + tenant scope (anti-IDOR) + idempotency.
- [ ] Всяко >3 s действие е `defer`-нато (type 5); follow-up през interaction токена (15 min).
- [ ] `allowed_mentions:{parse:[]}` навсякъде; player имена sanitize-нати (no @everyone injection).
- [ ] Rate-limit safe: `WebhookClient`/discord.js bucket мениджмънт, queue+drain при 429,
      batching/dedup; **никакъв** плътен цикъл от заявки; под 10000 invalid/10 min.
- [ ] Audit log append-only (+ `#ac-audit` огледало); логове без токени/лични данни.
- [ ] Sticky status: пазен `messageId`, edit (не ново), интервал ≥60 s, jitter при много tenant-и.
- [ ] Тествано в **тестов guild** (per-guild команди мигновено); следени `X-RateLimit-*`;
      доказано: подписът се верифицира и команда се регистрира (Reflexion срещу discord-lint).

---

## 8. Отворени въпроси / за проверка при имплементация
1. **Auto-ban на Critical** — политика per-tenant (owner избира) или винаги ръчно? (правен/UX въпрос).
2. **Appeal flow** — бутон Appeal отваря **modal** (текстово поле, до 5 полета/modal) → тикет в
   панела? Или праща в отделен `#ac-appeals`? (Несигурно — уточни продуктово.)
3. **GDPR:** HWID/identifier са лични данни → retention + право на изтриване. → съгласувай с
   **Правния Разбирач** (ToS на Discord + EU hosting изискване на монорепо).
4. **Screenshot доказателства** — съхранение (Discord attachment vs наш криптиран bucket) и
   retention. Backend/сигурност → **Кодаджията**; VPS/секрети → **VPS-аджията**.
5. Точен addon списък на Ocean bot-а — да потвърдим фийчър-парити таргет (Несигурно).

---

### Източници
- Echo — https://echo.ac/ , https://dash.echo.ac/changelog (webhook след scan, HWID linking, detection sets)
- Detect.ac — https://detect.ac/ (deep-dive forensic scan <60 s)
- Ocean / anticheat.ac — https://anticheat.ac/ (bot addon-и, 5-нива роля, audit, AES-256, custom rules)
- Discord interactions (defer type 5, Ed25519 headers, PING→PONG, ephemeral 64, 3 s / 15 min,
  follow-up webhook) — https://docs.discord.com/developers/interactions/receiving-and-responding (потвърдено 2026-07-06)
- Discord gateway (intents, sharding, compression) — https://docs.discord.com/developers/topics/gateway
- Verification vs privileged intents (10000 users праг) — https://support-dev.discord.com/hc/en-us/articles/23926564536471
- Стил/конвенции — `/home/user/Few-few/SupremeDiscordBot/CLAUDE.md`
