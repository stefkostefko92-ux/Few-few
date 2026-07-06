# CS Anticheat — Синтез на разузнаването (Фаза 0)

> Обединяване на 7-те досиета в продуктова теза, threat model и архитектура.
> Дата: 2026-07-06 · Източници: досиета 01–07 в тази папка.
> Етикети за увереност наследени от изворните доклади: **[П]отвърдено / [В]ероятно / [Н]есигурно**.

---

## 1. Голямата находка: титаните не са това, за което ги мислят

**[П]** echo.ac и detect.ac **не са real-time античийтове** — те са **forensic „screenshare" скенери**. Правят еднократен usermode scan на Windows artefacts (Prefetch, USN Journal, Amcache, SRUM, IFEO, registry) и търсят *следи*, че чийт е бил пускан. echo сам се позиционира като „Screenshare tools and client-side anticheats"; detect.ac дословно казва „Prove the cheat **was ever there**" — не „prevent".

Последствия, които отварят целия пазар за нас:

| Слабост на титаните | Източник | Нашата контра |
|---|---|---|
| Не спират активен aimbot/ESP/god mode — само доказват post-hoc | 02, 03 [П] | Real-time server-authoritative детекция |
| Заподозреният сам пуска скенера → trace cleaner / close window / VM = bypass | 02, 03 [П] | Always-on tamper-resistant client + server ядро |
| echo ползва непроменен `ntfsDump.exe` → преименуване на чийта го крие (self-whitelist bug) | 02 [П] | Никаква security-by-obscurity; server-authoritative истина |
| detect е във вечна anti-forensic котка-мишка (седмични „bypass detections", geймифицирани bypasser състезания) | 03 [П] | Детекция на мрежово/поведенческо ниво, не artifact-parsing |
| DMA/hardware + kernel чийтове оставят ~нула следи → слепи | 01, 02, 03 [П] | Behavioral AI на server-side sync данни |
| echo kernel driver (`echo_driver.sys`) = CVE-2023-38817, cert revoked, MS Vulnerable Driver Blocklist | 01 [П] | Kernel само фаза 2, подписан + attestation + VDP |
| Голям leak проблем в бранша (FiveGuard/WaveShield/ElectronAC source търгуван) | 01 [П] | Защитата не е в тайната на кода |
| Нула GDPR прозрачност (без retention срок, без connect notice, без чл. 22 appeal, без DPIA); echo controller е UK → трети-държавен трансфер | 05 [П] | EU дружество + прозрачност като продаваем диференциатор |
| Едностранни Discord webhook-и (само известие) | 07 [П] | Действие директно от Discord (Ban/Kick/Appeal бутони) |

**Теза:** пазарната дупка е **FiveM-native, real-time, server-authoritative античийт с честен GDPR модел** — точно класът, който двата титана структурно нямат.

---

## 2. Threat model — врагът се дели на 2 класа

**[П]** (досие 01, 04):

### Клас A — usermode Lua executor-и / mod menu-та
redENGINE, Eulen (~$60 lifetime), Skript.gg, HX, Susano, TZX, D3D, Cobra, Brady.
- Инжектират в `FiveM_b*.exe`, спамят `TriggerServerEvent`, dump-ват ресурси.
- Носят **HWID spoofer-и** (рандомизиран disk serial/SMBIOS/MAC/Rockstar ID след reboot) за ban-evasion.
- Имат **resource-stopper** — гасят самия AC ресурс.
- **Ловими:** client scan (масата) + server-authoritative валидация + signed heartbeat/watchdog.

### Клас B — hardware DMA / external
blurred.gg тип (~$299 lifetime): 2 PC + PCIe DMA карта + KMBox.
- **Нищо не се инжектира** в процеса → всеки client-scan е сляп.
- **Ловим само server-side behavioral** (snap-angle, hit-ratio, aim-pattern).

**Честна граница [П]:** ESP/aimbot нямат мрежова следа. Чисто server-side **не ги лови надеждно** — това е точно където маркетингът на echo/detect замъглява. Нашата чест: признаваме границата и я атакуваме с behavioral AI + (по-късно, opt-in) hardware attestation, а не с фалшиви обещания.

---

## 3. Архитектура — отбрана в дълбочина (defense-in-depth)

Приемаме **компрометиран клиент** по подразбиране. Всеки слой има различна цена за заобикаляне; истината живее на сървъра.

```
┌─────────────────────────────────────────────────────────────┐
│ СЛОЙ 0 — Config hardening (нула код, убива цели класове)      │
│   sv_pureLevel, entity lockdown (strict routing buckets),    │
│   sv_filterRequestControl, sv_authMinTrust/MaxVariance,      │
│   sv_stateBagStrictMode, изкл. networked phone explosions    │
├─────────────────────────────────────────────────────────────┤
│ СЛОЙ 1 — Server-authoritative ядро (незаобиколимо) ★         │
│   OneSync sync-tree: позиция/health/скорост през server      │
│   natives; event rate-limit; giveWeapon/explosion валидация  │
│   → детекция на god mode, teleport, spawn, event spam        │
├─────────────────────────────────────────────────────────────┤
│ СЛОЙ 2 — Behavioral AI (за Клас B / DMA)                     │
│   аномалии в aim (snap-angle, hit-ratio), speed/teleport     │
│   модели с толерантност към culling(424u)+ping               │
├─────────────────────────────────────────────────────────────┤
│ СЛОЙ 3 — Client integrity resource (слаб, третиран като hint)│
│   GetNumResources, natives-hook detection, screenshot-basic  │
│   (opt-in), signed heartbeat/watchdog срещу resource-stopper │
├─────────────────────────────────────────────────────────────┤
│ СЛОЙ 4 — Kernel (ФАЗА 2, не MVP) — само след бюджет+правен   │
│   EV cert + MS attestation + HVCI; opt-in; локална обработка │
└─────────────────────────────────────────────────────────────┘
        │ live телеметрия (не post-hoc, устойчиво на cleaner)
        ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKEND — Node ESM Ingest API → Redis Streams/BullMQ →       │
│   PostgreSQL 16 + Prisma → Next.js 15 панел + WebSocket live │
│   → споделена HASH-ната HWID/ban federation мрежа            │
└─────────────────────────────────────────────────────────────┘
        │ HMAC-подписан webhook
        ▼
┌─────────────────────────────────────────────────────────────┐
│ DISCORD — rich alert по severity + action бутони             │
│   (Ban/Kick/Ignore/Appeal) + /ac slash bot + live sticky     │
└─────────────────────────────────────────────────────────────┘
```

★ = основната ни преднина спрямо титаните.

### Ключови принципи (от досиетата)
1. **Server-authoritative преди всичко** (04 [П]) — единственият неизключваем слой е OneSync sync-tree.
2. **Config hardening = безплатна защита** (04 [П]) — baseline профил убива класове чийтове преди детекция.
3. **Приеми компрометиран клиент** (01 [П]) — client репортите са хипотези, не факти.
4. **Multi-signal fingerprint + cross-server ban** (01 [П]) — HWID-only е спукан от spoofer-ите; мрежата е lock-in лостът.
5. **Signed heartbeat/watchdog** (01 [П]) — тишина от AC ресурса = ban (срещу resource-stopper).
6. **Устойчивост на cleaner-и** (02, 03 [П]) — данните тръгват на живо, не се трият post-hoc.

---

## 4. Backend / инфра (досие 04 [В])

- **Stack, пасващ на монорепото:** Node ESM Ingest API → **Redis Streams / BullMQ** → **PostgreSQL 16 + Prisma** → **Next.js 15** панел → WebSocket live monitoring.
- **Ban federation:** централна **hash-ната** HWID/ban мрежа между сървъри (мрежов ефект = lock-in).
- **Деплой (EU/Hetzner):** medqr-стил `systemd` за сервисите, zabobovdol-стил Docker за db+панел, pgBackRest PITR.
- **Kernel = фаза 2, не MVP** — EV cert + MS attestation + HVCI + BSOD/правна отговорност + вечна поддръжка. MVP тръгва **без собствен driver**.

---

## 5. GDPR като конкурентно предимство (досие 05 [П])

Титаните са уязвими правно; ние го превръщаме в USP.

**Blockers (задължителни преди прод):**
1. **Connect-time layered notice** (чл. 13) — играчът знае какво се сканира. Титаните нямат.
2. **Автоматичен бан = чл. 22** → **meaningful human review + appeal** (стандарт SCHUFA C-634/21).
3. **Ban-мрежа** = профилиране + съвместни администратори (чл. 26) → споделяй само hash+причина+timestamp; централен delisting; ban expiry.
4. **DPIA** (чл. 35) задължителна → публикувай резюме като маркетинг.
5. **Screenshot/kernel** = чл. 9 / системен риск → opt-in, криптиран, auto-delete, локална обработка.

**Основание:** детекцията на **чл. 6(1)(f) легитимен интерес + документиран LIA** (не съгласие — то е оттегляемо); съгласие само за инвазивните екстри. Хешираният HWID **остава** лични данни. Роли: сървърът е администратор, ние **processor** → **DPA по чл. 28**. **Предимство:** EU дружество (Carbon Stealth VCC) избягва трети-държавния трансфер на UK-базирания echo.

---

## 6. Комерсиализация (досие 06 [П/В])

- **Пазар:** ~20 000+ активни публични FiveM сървъра, 200k+ DAU, силно фрагментиран. Болка №1 = **leak/bypass цикъл**.
- **Модел:** recurring subscription (НЕ lifetime), per-server, tier по фичъри:
  | План | Цена | За кого |
  |---|---|---|
  | Free | €0 | tiny/тест — server-authoritative baseline |
  | **Indie** | **€19/мес** | малки сървъри |
  | **Pro** | **€39/мес** | aimbot/behavioral + Discord actions + ban network |
  | Network | €99+/custom | мрежи, white-label, reseller |
  | Screenshare key | €9 еднократно | ad-hoc review |
- Годишен = 2 месеца безплатни; 14-дневен trial без карта; reseller/white-label за хостинг провайдъри.
- **Edge:** aimbot detection **в core** (не gated като FiveGuard/FiniAC), под ценовите котви €35–50, no-leaked-source прозрачност, no-bypass SLA, GDPR пакет.
- **Stripe:** Checkout/Payment Element + Billing, SAQ A, SCA/3DS, Stripe Tax (OSS ДДС), Customer Portal, dunning, достъп само през webhook (`invoice.paid`/`subscription.deleted`), идемпотентност по `event.id`.

---

## 7. Discord слой (досие 07 [П/В])

Три независими повърхности, всяка над това, което титаните дават:
1. **Alert pipeline** — HMAC-подписан webhook execute, rich embed по severity (играч/HWID/detection/confidence/screenshot като `attachment://`) + **action бутони** (Ban/Kick/Ignore/Appeal), rate-limit слой (batching, dedup по HWID, queue+drain при 429, ≤10 embed/съобщение).
2. **Management bot** (discord.js v14 Gateway, ESM по `SupremeDiscordBot/` стил) — `/ac lookup|ban|unban|stats|status|history|note`, двупластова server-side authz, append-only audit, multi-server tenant scoping (anti-IDOR), OAuth2 (`bot`+`applications.commands`).
3. **Live sticky embed** — auto-updating статус (онлайн/детекции/бана/uptime), edit не ново съобщение, интервал ≥60 s.

**Сигурност (неприкосновена):** токен в `.env` (600, извън git), Ed25519 при HTTP interactions, HMAC срещу spoof на detection alerts, least-privilege intents, re-authz + idempotency при всеки бутон, `allowed_mentions:{parse:[]}` срещу @everyone injection през player име.

---

## 8. Roadmap (предложение за следваща фаза)

| Фаза | Съдържание | Зависимости |
|---|---|---|
| **1 — MVP** | Config hardening профил + server-authoritative resource (god mode/teleport/event-spam) + Ingest API + Postgres + минимален панел + Discord alerts | 04, 07 |
| **2 — Детекция дълбочина** | Behavioral AI (aim/speed) + client integrity + heartbeat/watchdog + hash-ната HWID ban federation | 01, 04 |
| **3 — Комерсиализация** | Stripe Billing + планове + onboarding + **GDPR артефакти** (connect notice, DPA шаблон, DPIA, appeal flow) | 05, 06 |
| **4 — Kernel (по избор)** | Подписан driver + attestation + VDP — само след бюджет + правен ревю (**спри-и-питай собственика**) | 04, 05 |

**Отворени въпроси за собственика (спри-и-питай):** auto-ban политика (чувствителност/human-in-the-loop), бюджет за kernel фаза (EV cert + attestation), screenshot по подразбиране вкл./изкл., приоритет MVP срещу дълбочина.

---

### Забележки за надеждност
Маркетинговите числа на титаните („710+ methods", „1M+ players", „<0.1% FP") са **непроверени [Н]**. Цените са снапшот към 2026-07-06 и се менят — потвърди преди ценово решение. UnknownCheats/Reddit/Trustpilot бяха частично Cloudflare-блокирани; използвани са search-снипети + директни първоизточници. Runtime находки (реален трафик на driver, screenshot поведение) изискват headless/клиентска проверка — не са потвърдени статично. **Правният слой е обща информация, не правен съвет.**
