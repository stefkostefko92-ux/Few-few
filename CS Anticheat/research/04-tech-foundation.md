# CS Anticheat — Техническа основа и инфраструктура (04)

> Изследване за проектиране на нов FiveM античийт „CS Anticheat" (Carbon Stealth, EU/Hetzner).
> Цел: да разберем реалната платформена основа под echo.ac / detect.ac, за да построим нещо
> по-добро — **честно за какво е възможно, а какво е маркетинг**.
>
> **Дата:** 2026-07-06 · **Автор:** VPS-аджията
> **Етикети на увереност:** Сигурно / Вероятно / Несигурно. Твърдения без жив източник са
> маркирани „(за проверка)". Всичко от `docs.fivem.net` е потвърдено на живо (виж бележките).

---

## 0. Управляващо резюме (какво определя дизайна)

1. **FiveM = GTA:O кодова база + custom sync (OneSync).** Играта е клиент-authoritative по
   рождение; сървърът „вижда" само това, което клиентите репликират през мрежата. OneSync
   Infinity добавя **server-side state awareness** — сървърът парсва sync-нодове и излага
   server natives (`GetEntityCoords`, `GetEntityHealth`…). Това е нашата най-силна законна
   основа. **(Сигурно — виж §1, §2.)**
2. **Няма официален external-process anti-cheat API.** CitizenFX ползва вграден **Easy
   Anti-Cheat (EAC)** + собствени защити (`sv_pureLevel`, policy). Трети страни (echo/detect)
   работят **в сивата зона** — kernel driver + game-memory анализ, без благословия на CFX.
   **(Вероятно — §1.5, §4.)**
3. **Двата истински слоя, които контролираме напълно:** (a) **server-authoritative
   детекция** от sync данни и rate-limiting на събития; (b) **backend** за телеметрия,
   споделена HWID-мрежа и панел. Клиентският слой е спомагателен и principled-limited (чийтът
   е в същия процес). **(Сигурно.)**
4. **Kernel-mode е висок риск/висока цена** (EV cert, MS attestation, BSOD отговорност, вечна
   поддръжка при всеки Windows ъпдейт). Реалистично: **фаза 2**, не MVP. **(Вероятно — §4.)**

---

## 1. CitizenFX / FiveM вградени защити

### 1.1 OneSync — server-side state awareness (нашата основа)
Източник: `https://docs.fivem.net/docs/scripting-reference/onesync/` (потвърдено на живо).

- OneSync е custom sync система над GTA:O кода; безплатна до **48 слота**, платена нагоре
  (Element Club). Режим **Infinity** → до **2048** играча.
- **Server-determined entity routing:** при `onesync on` сървърът е авторитет за routing на
  ентитита. Синхро данните текат през резервиран „player `31`"; сървърът парсва **sync nodes**
  (напр. `CSectorPositionDataNode` → x/y/z) и така **server natives** като `GET_ENTITY_COORDS`
  четат позицията директно от sync tree-то. → Сървърът има независим поглед върху позиция,
  здраве, скорост на всяко networked ентитy. **(Сигурно.)**
- **Culling:** ентититата се създават на клиента само в ~**424 units** „focus zone"; извън
  него — culled/migrated. Culling natives (`SET_ENTITY_DISTANCE_CULLING_RADIUS`,
  `SET_PLAYER_CULLING_RADIUS`) са **deprecated с неизправими бъгове** — не разчитай на тях за
  сигурност. **(Сигурно — docs warning.)**

### 1.2 Entity lockdown + routing buckets (силна анти-spawn защита)
- **Routing buckets** (pipeline ≥3245): изолирани „dimensions"; играч/ентити вижда само своя
  bucket. Всеки bucket има **lockdown mode**:
  | Mode | Значение |
  |------|----------|
  | `strict` | Клиентите **не могат** да създават никакви ентитита. |
  | `relaxed` | Блокира само script-owned client ентитита. |
  | `inactive` | Клиентът може всичко. |
- Natives: `SET_ROUTING_BUCKET_ENTITY_LOCKDOWN_MODE`, `SET_PLAYER_ROUTING_BUCKET`,
  `SET_ENTITY_ROUTING_BUCKET`, `SET_ROUTING_BUCKET_POPULATION_ENABLED`. **(Сигурно.)**
- **Извод за нас:** препоръчаме на клиентите strict lockdown за gameplay bucket-и —
  убива цял клас „spawn vehicle/ped/object" чийтове **на ниво платформа**, без детекция.

### 1.3 Server-authoritative срещу RPC natives (важна тънкост)
- Част от natives са **RPC** — извикват се на клиента-собственик, **fallible**, без гаранция
  (напр. `CreateVehicle`, `SetEntityVelocity`). Не им вярвай като на sink за истина.
- `CreateVehicleServerSetter` / `CreatePed` (server) + `SetEntityOrphanMode(...,'KeepEntity')`
  дават **server-owned персистентни** ентитита. **(Сигурно.)**

### 1.4 Ключови security convars (потвърдени — `docs.fivem.net/docs/server-manual/server-commands/`)
| ConVar | Ефект / употреба за античийт |
|--------|------------------------------|
| `sv_authMaxVariance` (1–5, default 5) | Колко **вероятно** е id-то на провайдър (steam/ip/license) да се смени. По-ниско = стриктно. |
| `sv_authMinTrust` (1–5, default 1) | Колко **невероятно** е identity да се spoof-не. 5 = external 3-way auth. Вдигане → отхвърля слабо-доверени identity методи. |
| `sv_filterRequestControl` (−1…4) | Блокира `REQUEST_CONTROL_EVENT` (кражба на контрол над чужди коли/ентитита). Mode 4 = никога не route-ва. Убива цял клас „control theft". |
| `sv_pureLevel` (1/2) | Блокира модифицирани клиентски файлове. 1 = без audio/известни graphics mod-ове; 2 = всичко. |
| `sv_enforceGameBuild` | Фиксира game build/DLC — премахва build-mismatch вектори. |
| `sv_enableNetworkedSounds` | Блокира route на `NETWORK_PLAY_SOUND_EVENT` (често малициозно). |
| `sv_enableNetworkedPhoneExplosions` (default **false**) | Дръж изключено — иначе `REQUEST_PHONE_EXPLOSION_EVENT` е оръжие. |
| `sv_enableNetworkedScriptEntityStates` | Route на `SCRIPT_ENTITY_STATE_CHANGE_EVENT` — често малициозно. |
| `sv_stateBagStrictMode` (state-bags doc) | `true` → само сървърът пише state bags. Затваря state-bag инжекции. |
| `sv_endpointPrivacy` | Скрива играчки IP в публичните репорти. |
| `sv_requestParanoia` (0–3) | Contra proxy-базиран HTTP flood към info/dynamic/players.json. |

**Извод:** голяма част от „чийт защитата" е **правилна конфигурация на server.cfg** — това е
първата ни доставка (baseline hardening профил), преди какъвто и да е агент.

### 1.5 EAC и escrow — какво реално дава платформата
- FiveM клиентът вгражда **Easy Anti-Cheat (EAC)** — kernel-level, но **непрозрачен и извън
  наш контрол**; CFX не публикува API/сигнали от него към ресурси. Не можем да строим отгоре
  му програмно. **(Вероятно — няма публична server-facing документация; за проверка.)**
- **Asset escrow** (Element Club / Tebex) криптира *ресурси*, не е anti-cheat; защитава
  интелектуална собственост, не gameplay. **(Вероятно.)**
- **`sv_scriptHookAllowed`** — исторически convar за ScriptHookV; днес ScriptHook в мрежов
  режим се блокира от EAC. **(Несигурно / за проверка — не присъства в текущата
  server-commands страница, която прегледах.)**

### 1.6 Ограничения на платформата за external античийтове
- **Няма legitimate hook API** към клиентския процес; всеки external agent, който чете game
  memory, е technically ToS-сива зона и се конкурира с EAC за същите ring-0 ресурси.
- Клиентският Lua/JS runtime е **sandbox-нат** — няма raw memory/process API, няма стабилен
  начин да четеш чужди модули → затова echo/detect слагат **отделен kernel driver** извън
  ресурсния модел (§4).

---

## 2. Server-side detection API — какво „вижда" сървърът (без клиентски agent)

Това е **сърцето на честен, устойчив античийт**. Всичко е server-authoritative и не може да
бъде изключено от клиента.

### 2.1 Идентичност и мрежа (на connect / runtime)
- Събитие **`playerConnecting`** (`playerName, setKickReason, deferrals`) — deferrals позволяват
  async проверка (DB/web API) преди допускане; `presentCard` за Adaptive Card challenge.
  **(Сигурно — docs.)** Идеална точка за HWID/ban-list gate.
- `GetPlayerIdentifiers(src)` → `license:`, `discord:`, `steam:`, `xbl:`, `live:`, `fivem:`,
  `ip:` (steam само ако е стартиран Steam). `GetPlayerEndpoint(src)` → IP. `GetPlayerToken` →
  hardware-обвързан token (по-стабилен от IP). **(Вероятно — стандартни natives; версии за
  проверка.)** → Основа за multi-account/ban-evasion корелация.
- **`sv_authMinTrust`/`MaxVariance`** (§1.4) настройват колко „сигурни" identity методи
  приемаме — вграден anti-spoof лост.

### 2.2 Пространствена/статусна телеметрия (от OneSync sync tree)
Server natives четат директно от sync nodes (§1.1):
- `GetEntityCoords`, `GetEntityRotation`, `GetEntityHeading`, `GetEntityVelocity`,
  `GetEntitySpeed` — **позиция/скорост server-side**.
- `GetEntityHealth` / `GetPedArmour` — здраве/броня.
- `GetVehicleEngineHealth`, `GetPedInVehicleSeat`, `GetPlayerPing(src)`.

**Аномалии, засичани чисто server-side (независим модел):**
- **Speed/teleport hack:** Δposition / Δt > физически максимум за модела (с толеранс за ping и
  culling дупки). Пази per-tick история; смятай в буферен bucket.
- **Godmode/health desync:** здраве расте без source, или damage event не сваля health.
- **Fly/noclip:** вертикална скорост/височина без съответно превозно средство; позиция извън
  colmesh (нужна геометрия — по-скъпо).
- **Super jump/run:** скорост на пеша над праг.
> Забележка за точност: culling (424u) и ping внасят **legitimate дупки** в server view →
> модели трябва да са толерантни (hysteresis, N-от-M прозорци), иначе false positives.
> **(Сигурно за наличието на данните; праговете са инженерна работа.)**

### 2.3 Game events на сървъра (rate-limit + валидиране)
Сървърът получава gameEvents (през player `31`) и може да ги отхвърля/логва:
- **`explosionEvent`** (server) — `(sender, data{ posX,posY,posZ, explosionType, damageScale…})`.
  Детекция: невъзможен explosionType, spam rate, експлозия далеч от sender.
- **`weaponDamageEvent`** — damage без line-of-sight, невъзможен weapon hash, damage-modifier,
  hitGlobalId към играч, когото sender не „вижда".
- **`giveWeaponEvent` / `removeAllWeaponsEvent`** — раздаване на оръжия client-side.
- **`entityCreating` / `entityCreated`** — vето върху client-created ентитита (комплемент на
  strict lockdown); `CancelEvent()` в `entityCreating` спира spawn.
- **`clientConnect`, `playerEnteredScope`/`playerLeftScope`** (виж §1.1 — скъпи, ползвай
  предпазливо; state bags са по-евтини).
> **(Вероятно — имената/полетата са стандартни FiveM server gameEvents; точните полета на
> всяко събитие: за проверка по native docs при имплементация.)**

### 2.4 Event rate-limiting (anti-flood / anti-crash)
- Всеки `RegisterNetEvent` handler трябва да е **rate-limited per source** (token bucket) —
  netevent flood е класически crash/exploit вектор.
- `sv_filterRequestControl`, `sv_enableNetworkedSounds`, `…PhoneExplosions`,
  `…ScriptEntityStates` (§1.4) са вградени rate/route филтри — включи ги в baseline.
- Наблюдавай **необичайна честота** на конкретни net events per player → сигнал.

### 2.5 Какво сървърът **НЕ** вижда (честно)
- Клиентски **aimbot/triggerbot** логика (изчисленията са в клиентския процес); server вижда
  само *резултата* (impossibly perfect hits) → извод по статистика, не директно.
- **ESP/wallhack** (само визуален overlay, четене на памет) — **невидим за сървъра**, защото
  не поражда мрежов трафик. Тук **само** client/kernel слой помага.
- Инжектиран код, който **не** променя репликирано състояние.
> Затова „100% server-side" продукт **не може** да лови ESP/aimbot надеждно — това е границата,
> която маркетингът на конкурентите замъглява. **(Сигурно.)**

---

## 3. Client-side detection resource — възможности и граници

Клиентски Lua/JS ресурс работи **в същия процес като чийта** → всяка проверка е надхитрима
от достатъчно привилегирован (kernel) чийт. Полезен срещу lua-executor/скрипт-kiddie ниво,
не срещу сериозни paid чийтове.

### 3.1 Какво може клиентският ресурс
- **Инвентар на ресурси:** `GetNumResources()` / `GetResourceByFindIndex()` /
  `GetResourceState()` — засичане на непознати/инжектирани ресурси. Лесно за заобикаляне, но
  хваща лениви чийтове. **(Вероятно.)**
- **Screenshot доказателство:** `screenshot-basic` — **сървърът** може да поиска клиентска
  снимка (`requestClientScreenshot`, изисква client ≥1129160, server pipeline ≥1011) и да я
  качи на server HTTP handler. За модератор review на ESP overlay (визуален). Внимание:
  тежко/privacy → само при подозрение, с consent политика (GDPR!). **(Сигурно — README на
  citizenfx/screenshot-basic.)**
- **Integrity/heartbeat:** периодичен подписан heartbeat client→server; липса/аномалия =
  подозрение (agent убит/замразен).
- **Native-hook детекция:** сравнение на адреси/checksum на критични natives — **крехко**,
  версийно зависимо, лесно се spoof-ва от kernel чийт.
- **Focus/резолюция/overlay сигнали** — слаби евристики.

### 3.2 Фундаментални граници
- Всичко client-side е **untrusted input** → сървърът трябва да третира client-репортите като
  *хипотези*, не факти; решения се вземат сървърно (корелация + server-authoritative signals).
- Kernel чийт може да **симулира** валиден agent (feed фалшив heartbeat) → client слой сам по
  себе си не е доказателство. **(Сигурно.)**

### 3.3 Извод
Client resource = **евтин, лесен слой №2** (лови масовия lua-executor сегмент), но **никога**
единствен. Дизайн: client събира сигнали → сървър корелира с §2 → решение.

---

## 4. Kernel-mode дизайн — как echo/detect вероятно работят и реалната цена

> **(Целият раздел: Вероятно/Несигурно — базиран на общи познания за античийт архитектури
> (EAC/BattlEye/Vanguard клас) и публични driver-security материали, НЕ на вътрешни данни за
> echo.ac/detect.ac. Конкретните им имплементации са closed-source.)**

### 4.1 Вероятна архитектура
- **Windows kernel driver (WDM/KMDF)**, зареден като service, комуникиращ с user-mode agent
  през IOCTL/shared section.
- **`ObRegisterCallbacks`** (ObjectPreCallback) за **handle stripping** — сваля
  `PROCESS_VM_READ`/`WRITE` от handle-и към game процеса → блокира user-mode чийтове/DMA
  drivers, които искат handle. Класически BE/EAC подход.
- **`PsSetCreateProcessNotifyRoutine` / `…LoadImageNotifyRoutine`** — следене на нови процеси
  и заредени модули (известни cheat/injector сигнатури, unsigned drivers).
- **Memory integrity:** периодичен hash на game code sections / import табла срещу known-good.
- **Anti-DMA / hardware cheat:** търсене на съмнителни PCIe устройства (fake NIC/capture
  cards), IOMMU/ACS проверки, timing анализ — **много трудно и ненадеждно**; DMA чийтовете
  четат RAM без CPU-видима следа. Реалистично: частично покритие. **(Несигурно.)**
- **HWID генериране:** комбинация SMBIOS UUID, disk serial, MAC, TPM EK, CPU features →
  хеширан fingerprint за ban мрежа. **Spoofer detection:** засичане на HWID-spoofer драйвери
  и несъответствия (напр. serial = all-zeros/known-spoof стойности).

### 4.2 Реалната цена и рискове (честно — това е killer-а за MVP)
- **Driver signing:** Windows изисква **EV code-signing cert** (~300–600 €/год) + за kernel:
  **Microsoft attestation signing** през Partner Center / Hardware Dev Center (нужен EV cert,
  hardware account, dashboard submission). Без него драйверът не се зарежда на Secure Boot /
  HVCI машини. **(Вероятно — MS изисквания; точни такси за проверка.)**
- **HVCI / Memory Integrity:** все повече машини (Win11 default) отхвърлят драйвери, които не
  минават strict проверки → съвместимостта е постоянна битка.
- **BSOD отговорност:** kernel bug = син екран на клиента → репутационна катастрофа + правен
  риск. Всеки Windows Patch Tuesday може да счупи offset-и/поведение → **вечна поддръжка**.
- **Wormable attack surface:** твой ring-0 драйвер = мишена; ако е exploitable → privilege
  escalation на клиентски машини (виж скандалите с други анти-чийтове). GDPR/EU: kernel telemetry
  = чувствителни данни, изисква изрична правна база и минимизация.
- **Конкуренция с EAC:** два ring-0 античийта в един процес → нестабилност.

### 4.3 Препоръка
- **MVP (0–6 мес.):** БЕЗ собствен kernel driver. Server-authoritative (§2) + client resource
  (§3) + baseline hardening (§1.4) + backend/HWID мрежа (§5). Това вече бие „echo-lite"
  сегмента за spawn/godmode/speed/netevent-flood/ban-evasion.
- **Фаза 2 (ако има пазарна нужда и бюджет):** отделен kernel модул — но чак след EV cert,
  attestation pipeline, crash-telemetry и правен ревю. Обмисли **партньорство/лиценз** на готов
  kernel слой вместо собствен (спестява години поддръжка).
> **Спри-и-питай:** kernel е стратегическо/правно решение (EU данни, отговорност) — не се
> започва без изрично одобрение на собственика и правен ревю. **(v1.0 договор.)**

---

## 5. Backend / infra архитектура (пасва на монорепото)

Цел: **high-throughput event ingestion**, споделена **HWID/identity ban мрежа** между сървъри,
**realtime панел** (Next.js стил на монорепото), self-hosted на **Hetzner (EU)**.

### 5.1 Топология (предложение — пасва на CLAUDE.md стека)
```
FiveM server(s)  --resource(Lua/JS)-->  Ingest API (Node ESM)  -->  Redis Streams / BullMQ
       |                                       |                         |
       | server-auth signals (§2)              | validate/rate-limit     v
       | client signals (§3)                   |                    Worker(s): scoring/rules
       |                                       v                         |
       +--- WebSocket live -----------------> Panel (Next.js 15) <----- PostgreSQL (Prisma)
                                                (React 19, TS, Tailwind)   + TimescaleDB ext?
```
- **Ingest API:** Node ESM (стилът на medqr/SupremeDiscordBot), stateless, зад Nginx/Caddy;
  auth с per-server API key (в `.env`/EnvironmentFile, mode 600 — **никога** в репото).
  Batch + компресия от игровия ресурс (не per-event HTTP).
- **Опашка/буфер:** **Redis Streams** или **BullMQ** (вече в стека на SupremeDiscordBot) за
  decoupling на ingest от scoring — поема burst-ове без загуба.
- **Storage:**
  - **PostgreSQL 16 + Prisma** (както zabobovdol/Minyor) — банове, identity графи, incidents,
    audit. Партишъниране на event таблиците по време.
  - Опция **TimescaleDB** extension за времеви телеметрия (хипер-таблици, retention policies) —
    **(за проверка дали си струва vs plain partitioning на малък VPS).**
- **Панел:** **Next.js 15 · React 19 · TS · Prisma · Tailwind** (идентично на zabobovdol) —
  live incidents, player timeline, screenshot review, ban мениджмънт, per-server конфиг.
  `force-dynamic` за live страници (както бележката за zabobovdol).
- **Realtime:** WebSocket (или Server-Sent Events) за live monitoring; отделен gateway процес,
  systemd-managed, слуша на localhost зад прокси (medqr модел).

### 5.2 Споделена HWID / ban мрежа (диференциаторът)
- Централна БД с **hash-нати** identity/HWID fingerprints (§2.1, §4.1) + reason, severity,
  timestamp, source server. **Никакви сурови PII** без правна база (GDPR); хеширане + salt,
  retention policy, право на изтриване.
- **Federation модел:** всеки клиентски сървър push-ва банове и query-ва на connect
  (`playerConnecting` deferral → HTTP към ban API преди допускане).
- Anti-abuse: reputation/threshold, за да не може един server да трови мрежата (false bans).
  Human-review gate за network-wide банове.
> **Правен gate (v3.0):** тази мрежа обработва identity данни на EU граждани → **задължителен
> ревю от Правния Разбирач** (правна база, DPA с клиентите-сървъри, минимизация, consent
> където трябва) преди продукция. **(v1.0/v3.0 договор.)**

### 5.3 Деплой/инфра (моят домейн — по монорепо конвенцията)
- **medqr-стил за Node сервиси** (Ingest API, WS gateway, worker): systemd, `/opt/…`, dedicated
  user, `EnvironmentFile` mode 600, sandbox (`ProtectSystem=strict`, min `ReadWritePaths`,
  `NoNewPrivileges`, `CapabilityBoundingSet=`), `systemd-analyze security < 5`.
- **zabobovdol-стил за Postgres+панел:** Docker Compose (db/app/backup/nginx) зад
  Nginx/Caddy + Let's Encrypt (ARI авто-подновяване, §TLS 2026).
- **Бекъп:** pgBackRest за PITR на ban/incident БД (RPO критично — банове са ценни);
  `backup-verify.sh verify` (test-restore). Redis = ephemeral буфер, не source of truth.
- **Мониторинг:** Beszel + Uptime Kuma + алерти (`tools/vps/monitoring/…`); ingest lag,
  queue depth, false-positive rate.
- **Хардънинг:** ufw 22/80/443, fail2ban + CrowdSec (уеб слой — ingest API е публичен target),
  SSH ключ-само. Ingest под rate-limit/HTTP-flood защита.
- **Деплой:** през `deploy/autodeploy.sh` (монорепо-aware); blue/green на панела/ingest с
  `tools/vps/blue-green.sh` за нула downtime (баните не бива да спират).

---

## 6. Честна равносметка: реалистично vs маркетинг

| Твърдение (маркетинг стил) | Реалност |
|----------------------------|----------|
| „Лови всички чийтове" | Server-side лови spawn/godmode/speed/teleport/netevent-flood/control-theft/ban-evasion. **ESP/aimbot/triggerbot** — само частично (статистика) или чрез kernel. |
| „100% server-side, без клиент" | Не хваща чисто визуален/памет-четящ ESP (няма мрежова следа). |
| „Kernel = неразбиваем" | Kernel вдига летвата, но DMA/hardware чийтове и spoofer-и оцеляват; носи BSOD/правен/поддръжка товар. |
| „Instant HWID ban завинаги" | HWID се spoof-ва; стойността е в **корелация + мрежов ефект**, не в единичен fingerprint. |
| „Zero false positives" | Culling+ping правят дупки в server view → трябват толерантни модели; FP са неизбежни, целта е нисък FP + human review. |

**Нашето реалистично предимство:** отлична server-authoritative детекция + baseline hardening
+ споделена ban мрежа с federation + чист EU/GDPR панел, всичко self-hosted и поддържано
professionally. Това бие „echo-lite" за 80% от реалните чийтове **без** kernel риска на ден 1.

---

## Приложение A — Проверени източници (жив достъп 2026-07-06)
- OneSync / culling / routing buckets / entity lockdown / RPC natives:
  `https://docs.fivem.net/docs/scripting-reference/onesync/` (raw md прегледан ред по ред).
- State bags / `sv_stateBagStrictMode` / policy:
  `https://docs.fivem.net/docs/scripting-manual/networking/state-bags/`.
- Server convars (`sv_authMaxVariance/MinTrust`, `sv_filterRequestControl`, `sv_pureLevel`,
  `sv_enforceGameBuild`, `sv_enableNetworkedSounds/PhoneExplosions/ScriptEntityStates`,
  `sv_requestParanoia`, `sv_endpointPrivacy`):
  `https://docs.fivem.net/docs/server-manual/server-commands/`.
- `playerConnecting` / deferrals / setKickReason:
  `.../scripting-reference/events/list/playerConnecting`.
- `screenshot-basic` (client + server API): `https://github.com/citizenfx/screenshot-basic`.

## Приложение B — Открити „за проверка" (следваща итерация)
- Точните полета на всеки server gameEvent (`explosionEvent`, `weaponDamageEvent`,
  `giveWeaponEvent`, `entityCreating`) — по native docs при имплементация.
- Дали EAC излага server-facing сигнали към ресурси (вероятно не).
- Статус на `sv_scriptHookAllowed` в текущи билдове.
- Точни MS attestation такси/процес за kernel driver (2026).
- TimescaleDB vs Postgres native partitioning за нашия обем на малък VPS.
