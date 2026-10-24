# cs2dm — договорът между C# плъгина и приложението (сайт · панел · бот)

Една схема, един протокол, едни формули. Промяна тук = промяна и от двете страни в същия PR.

- Схема на базата: `app/prisma/schema.prisma` (единственият източник; миграциите — само през Prisma).
- C# плъгин: `plugins/CarbonStealth/` — пише с изричен SQL по имената от `@map/@@map`.
- Приложение: `app/` — Express 5 + EJS + Prisma + Redis + BullMQ + discord.js.

## 1. Роли (7 нива)

| Ниво | `Role` | В играта | В панела |
|---:|---|---|---|
| 1 | `PLAYER` | — | — |
| 2 | `VIP` | козметика (таг, цвят, слот без изритване) | — |
| 3 | `HELPER` | kick, mute, gag, warn | доклади (четене) |
| 4 | `MODERATOR` | + временен бан ≤ 7 дни, silence, обявления в центъра (`!csay`) | + банове ≤ 7 дни, доклади, обжалвания |
| 5 | `ADMIN` | + бан без ограничение, unban, slay, slap/freeze/respawn, bring/goto, DM режим, ботове, рестарт на играта, безкрайни патрони вкл./изкл. | + режими, cvars от allowlist, VIP |
| 6 | `HEADADMIN` | + всичко без управление на собственика (вкл. noclip, банери) | + админи до ниво 5, рестарт/ъпдейт |
| 7 | `OWNER` | всичко | всичко |

Действие върху цел с ниво ≥ своето е отказано (immunity) — и в играта, и в панела. В играта `!admin`
отваря WASD менюто в центъра на екрана (W/S избор · D/E потвърди · A назад · R затвори); всяко действие
от него минава през същите проверки и одит като чат командите (`!slap`, `!freeze`, `!bring`, `!goto`, `!noclip`,
`!csay`, `!asay` — чат само за екипа). VIP не е роля по
право: активният `VipGrant` дава VIP козметика; `Player.role = VIP` не се ползва за това.
Роля ≥ `HELPER` изисква TOTP в панела.

## 2. Наказания

- Активен бан: `type = BAN`, `revoked_at IS NULL`, `expires_at IS NULL OR expires_at > now()`.
- Плъгинът проверява при свързване (кеш в паметта, опресняван на 60 s + push през моста) и изрита с
  „Banned: <категория> · до <дата|permanent> · cs2.carbonstealth.eu/bans“.
- Mute (глас), Gag (чат), Silence (двете) — активни по същото правило; плъгинът ги прилага.
- **Публичен банлист**: само `steam_id`, `target_name`, `category`, `created_at`, `expires_at`.
  Никога `reason`, IP, чат, демо. Изтеклите/отменените не се показват. Линк „Обжалвай“.

## 3. Статистики, XP, нива, майсторство

Плъгинът пише на партиди (на 10 s и при изключване): UPSERT `player_season_stats` и
`weapon_season_stats` с `+=` за **два** реда — сезон `0` (за всички времена) и текущият сезон
(`max(id) WHERE id > 0 AND ends_at IS NULL`). Убийства с участие на бот **не дават XP и не се
записват** (против фарм на празен сървър).

XP за убийство (константи — еднакви в C# и TS):

| Събитие | XP |
|---|---:|
| убийство | 10 |
| + в главата | 5 |
| + с нож | 20 |
| + noscope (снайпер) | 10 |
| + през стена | 5 |
| + през дим | 5 |
| + отмъщение (немезис) | 5 |
| + прибрано баунти | размерът на баунтито |

**Ниво** от общото XP: нужно XP за ниво n е `100 · n · (n − 1) / 2` →
`level = floor((1 + sqrt(1 + 8 · xp / 100)) / 2)`.
Тестови стойности: `0→1 · 99→1 · 100→2 · 299→2 · 300→3 · 599→3 · 600→4 · 4500→10`.

**Баунти**: серия ≥ 5 → баунти `min(25 · (серия − 4), 250)` XP; обява в чата. Който убие носителя,
взема баунтито (`bounties_claimed += 1`).

**Немезис/отмъщение** (в рамките на сесията): ако X е убил Y ≥ 3 пъти подред и Y убие X → „REVENGE“,
+5 XP, `revenges += 1`.

**Майсторство по оръжие** (сезон 0, убийства с оръжието): Bronze 100 · Silver 500 · Gold 1500 ·
Platinum 4000 · Diamond 10000. Значката е текст до името — **никакви скинове** (правилата на Valve).

## 4. Heatmap (de_dust2)

От `resource/overviews/de_dust2.txt` на играта: `pos_x = -2476`, `pos_y = 3239`, `scale = 4.4`
(радар 1024×1024). Пиксел: `px = (x − pos_x) / scale`, `py = (pos_y − y) / scale`. Само агрегати и със
закъснение — никога позиции на живо (радар за читъри).

## 5. Мостът (Redis)

Redis слуша само на `127.0.0.1` с парола (ACL). Ключовете са с префикс `cs2dm:`.

### Команди: приложение → плъгин

`PUBLISH cs2dm:cmd <плик>`, където пликът е `{"p": "<payload>", "sig": "<hex>"}`, а payload е JSON низ:

```json
{ "id": "uuid", "ts": 1792828391000, "actor": "76561198000000001",
  "action": "kick", "args": { "steamId": "7656…", "reason": "…" } }
```

- `sig` = HMAC-SHA256 с `CS2DM_BRIDGE_KEY` върху **байтовете на низа `p` (UTF-8), точно както е
  изпратен** — без канонизация, затова C# и Node не могат да се разминат. Сравнението е с постоянно
  време. Приемникът парсва `p` чак след успешна проверка.
- Плъгинът отхвърля: невалиден подпис, `|now − ts| > 30 s`, повторен `id` (помни последните 1000).
- Действия: `kick {steamId, reason}` · `punish {punishmentId}` (бан/мют/гаг вече записан от сайта →
  плъгинът го зарежда и прилага) · `revoke {punishmentId}` · `say {text}` · `slay {steamId}` ·
  `reload {what: "roles"|"bans"|"vip"}` (едно презареждане на всички онлайн покрива и трите) ·
  `mode {modeId}` (custom режим на DM плъгина през неговото API; непознат → `ok: false`).
- Правата ги проверява **сайтът** (роля + одит) преди да подпише командата; плъгинът вярва само на
  подписа. Действие от сайта в чата е „от уеб панела“.
- Отговор: `PUBLISH cs2dm:ack {"id": "…", "ok": true}` или `{"id": "…", "ok": false, "error": "…"}`.

### Живо състояние: плъгин → приложение

- `SET cs2dm:live <json> EX 15` на всеки 5 s:
  `{ ts, map, mode, maxPlayers, players: [{ steamId, name, kills, deaths, ping, alive, isBot, vip, role, level }] }`
  (`steamId`/`level` са `null` за ботове).
- `XADD cs2dm:events MAXLEN ~ 2000 * type <t> data <json>`: `join`, `leave`, `kill`
  `{attacker, victim, weapon, hs}`, `chat` `{steamId, name, text}`, `admin` `{actor, action, target}`,
  `bounty`, `revenge`. Потокът е кратък по дизайн (чатът не се пази в базата).

## 6. Одит

Всяко админ действие (игра, сайт, бот) → ред в `audit_log` (`action` като `ban.create`,
`punishment.revoke`, `vip.grant`, `server.restart`…). Веригата (`prev_hash`, `hash`) се смята от
тригер в базата — писачите **не** пращат hash.

## 7. Срокове (GDPR)

`sessions` (с IP) — 30 дни · `kills` — 90 дни · обжалвания и доклади — 1 година след решение ·
заявки за VIP с данни за фактура — по ЗСч ⚠️ (да се потвърди от счетоводител). Чистенето е BullMQ
задача в приложението.

## 8. Банери в картата (`map_banners`)

Ред = един банер: `map`, `banner_key`, позиция `x/y/z` и ъгли `pitch/yaw/roll` (както ги ползва
`Teleport`), `created_by` (SteamID64). Пише ги плъгинът от `!banner add/remove` (HEADADMIN+) с одит
`banner.add` / `banner.remove`; сайтът може да ги показва и трие (плъгинът презарежда при смяна на
карта). Ключовете: текстови `carbonstealth`, `adblock` (в кода на плъгина) и модели от
`CS2DM_BANNER_MODELS` (виж `addon/README.md`). Непознат ключ се пропуска тихо — например при махнат addon.

## 9. Агентът на сървъра (`cs2-agent`, хост ↔ сайт)

Сайтът е в Docker и не може да пипа systemd. На хоста тича `cs2-agent` (zero-dep Node, потребител
`cs2agent`, polkit право само за `cs2.service` и `cs2-update.service`), вързан за същия Redis
(127.0.0.1:6392). Подписът е като на моста (§5), но с **отделен ключ** `CS2DM_AGENT_KEY` (≥ 32 знака).

- Команди: `PUBLISH cs2dm:agent:cmd <плик>`, payload `{id, ts, actor, action, args}`; отхвърля се
  невалиден подпис, `|now − ts| > 30 s`, повторен `id`.
- Действия (затворен списък):
  - `status` → `{active, since, gameVersion, modsLoaded, broken}`;
  - `restart` → `systemctl restart cs2.service`;
  - `update` → `systemctl start --no-block cs2-update.service`;
  - `logs {source: "css"|"journal", lines ≤ 200}` → редове след **редакция**: IP адреси → `x.x.x.x`,
    `sv_setsteamaccount <…>` и всякакви 32+ hex низове → `<redacted>`.
- `restart`/`update` са еднопоточни: докато едното тече, второ → `ok: false, error: "busy"`.
- Отговор: `PUBLISH cs2dm:agent:ack {"id", "ok", "error"?, "data"?}`.
- Статус без плъгина (празен сървър спи — §5 „живо“ липсва): агентът пише на 10 s
  `SET cs2dm:a2s <json> EX 30` = `{ts, online, name, map, players, bots, maxPlayers}` от A2S.
  Сайтът показва `cs2dm:live`, ако е пресен, иначе `cs2dm:a2s`, иначе „неизвестен“.

## 10. Панелът (сайт, `/admin`)

- Вход **само със Steam** (OpenID 2.0, проверка с `check_authentication` към steamcommunity.com;
  `claimed_id` → SteamID64). Достъп до панела: роля ≥ `HELPER` от `players.role`.
- **TOTP е задължителен** за панела (RFC 6238; тайната шифрована с `APP_ENC_KEY`, AES-256-GCM;
  резервни кодове — само хешове). Без активиран TOTP панелът показва само записването му.
- Сесии в базата (`web_sessions`, токенът — само хеш), бисквитка `__Host-cs2dm_sid` (HttpOnly, Secure,
  SameSite=Lax — връщането от Steam е cross-site GET), 12 часа, изход на всички устройства при смяна на
  роля. CSRF токен на всяка POST форма. Rate limit на входа и на POST.
- Права — таблицата в §1 + immunity; проверява ги **сайтът** преди да подпише команда към моста (§5)
  или агента (§9). Всяко действие → ред в `audit_log` със `source = WEB`.
