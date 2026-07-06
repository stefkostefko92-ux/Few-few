# CS Anticheat — Пазарен и ценови анализ + бизнес/ценови модел

> Автор: „Продавача" (Carbon Stealth) · Дата: 2026-07-06 · Статус: research draft v1
> Обхват: FiveM anticheat SaaS. Цел: надминем echo.ac и detect.ac.
> Метод: WebSearch/WebFetch към pricing страници, comparison статии, community. Всяко число носи
> източник и **етикет на увереност** (Сигурно / Вероятно / Несигурно). Цените се менят — потвърди
> на живо преди go-live. Валутите са смесени (GBP/USD/EUR) — конверсиите са приблизителни.

---

## 0. TL;DR за решаващия

- Пазарът е **~20 000+ активни публични FiveM сървъра** (Вероятно), силно фрагментиран, десетки
  anticheat вендори, **никой доминиращ** по цена/качество едновременно.
- Двата „титана" (echo.ac, detect.ac) са **client-side / screenshare-first** и **game-agnostic** —
  не са чист FiveM server-side продукт. Това е **дупка**, в която влизаме.
- Болка №1 на пазара: **leak/bypass цикъл** — anticheat кодът изтича, прави се bypass, ефективността
  пада. Печели този с **бърз update cadence + server-side логика + global ban network**.
- Ценови коридор на пазара: **€12–50/мес** subscription, **€90–235 lifetime**. Има място за
  **€19–29/мес core** с premium tier нагоре.
- Нашият edge: **EU/GDPR-изрядност (data-processing на клиента), прозрачност (no leaked source),
  no-bypass SLA, global HWID ban network като мрежов ефект, Stripe Billing + Customer Portal +
  Stripe Tax (OSS ДДС) от ден 1.**

---

## 1. Ценообразуване на конкурентите

### 1.1 echo.ac (титан #1) — Сигурно (от echo.ac към 2026-07-06)

Game-agnostic (Minecraft/Rust/FiveM/Roblox — един пакет, не отделен FiveM tier). Валута **GBP**.
Client-side + screenshare/forensics ("FBI-style" detection, HWID marking, споделяне на scans по линк).

| План | Цена | Включва |
|------|------|---------|
| Free | £0/мес | 1000+ detections, unlimited scans |
| Personal | **£12.99/мес** или **£129.99 lifetime** | 5000+ detections, client detection, unlimited scans w/ analysis, 24/7 support, basic API |
| Professional | **£19.99/мес** | като Personal + full API access |
| Enterprise | **£39.99/мес** | Professional + 5 enterprise users (доп. user £4.99) |

- Модел: **per-account/лиценз**, **не** явно per-server или per-slot (Несигурно за FiveM slot скалиране).
- Free tier + „try free" trial е реален — това е агресивен freemium вход.
- Забележка: echo е по-скоро **screenshare/anti-cheat платформа за multiple games**, не FiveM-native
  server-side. Силна бранд/Trustpilot присъствие.

### 1.2 detect.ac (титан #2) — Сигурно (от detect.ac към 2026-07-06)

Валута **USD**. „710+ detection methods", weekly updates, 24/7 support.

| План | Цена | Включва |
|------|------|---------|
| 1 Month | **$19.99** | 1 мес достъп, 710+ detections, 24/7, weekly updates |
| 3 Month | **$39.99** (≈33% отстъпка) | 3 мес + **2 free months при първа покупка** |
| 1 Year | **$149.99** (≈37% отстъпка) | 12 мес, priority support |
| Detect 1x Day | **$18.99 one-off** | single 24h key (screenshare по нужда) |
| Enterprise | custom quote | custom durations, 5 user + 1 admin slot, enterprise features |

- Модел: **subscription per-лиценз**, **не** per-server/per-slot за стандартните tier-ове.
- „Detect 1x Day" еднократен 24h ключ е умен low-friction on-demand screenshare — добра идея за копиране.

### 1.3 Конкуренти за сравнение — Вероятно (comparison статии, цени менят се)

| Продукт | Месечно | Друго | Бележки / източник |
|---------|---------|-------|--------------------|
| **FiveGuard** | €40/мес | €100 lifetime | Core без aimbot (Plus tier); **source изтекъл** — bypass риск. [fiveguard.net] |
| **WaveShield** | ~€49.99/мес | quarterly + lifetime | Claim **15 000+ servers**; 403 на директен fetch [waveshield.xyz] |
| **FiniAC** | Core €34.99 / Plus €39.99 / Ultimate €49.99 | −20% quarterly, −30% bi-annual | Aimbot detection зад Plus [fini.ac/pricing] |
| **PhoenixAC** | $35 (1мес) | $70/3мес, $135/год, **$235 lifetime** | Объркваща двойна ценова мрежа |
| **AnvilAC** | $11.99/мес | $29.99/q, $65.99/год, $89.99 lifetime | Claim 1 900+ servers — **най-евтиният сериозен** |
| **Fiveuxe** | ~$39/мес | ~$149/год | **Global Hive-Mind ban network** (blacklist за 0.3s, 12+ HW identifiers) |
| **Raven** | $17.99/мес | $44.99/q, $149.99 lifetime | AI-branding |

> „Alpha AC" / „Constantine" не се появиха в индексирани резултати към днешна дата (Несигурно —
> възможно ниша, преименувани или неактивни). За проверка на живо преди да цитираме.

**Изводи от цените:**
- Ценови коридор: **entry $12–20/мес**, **mid $35–40/мес**, **premium ~$50/мес**.
- Lifetime е разпространен ($90–235) — но е **лош SaaS модел** (нула recurring, максимален
  support-дълг). Ползвай го само тактически, не като основа.
- Годишен = ~35–40% отстъпка спрямо 12×месечно — стандарт в бранша.
- **Никой не таксува явно per-slot** — стандартът е per-server/per-лиценз flat. Това ни улеснява.

---

## 2. Пазар

- **Размер:** ~**20 000+ активни публични FiveM сървъра** (Вероятно); GTA BOOM тракира **18 723**
  англоезични listings. **200 000+ DAU**, **250 000+ peak concurrent**, **15M+ installs** (2025).
  [novonode / gtaboom / activeplayer.io]
- Реалният брой (вкл. private/whitelisted RP мрежи) е **по-висок** — сериозните платци често са
  именно private RP общности с монетизация (donations/VIP), които губят пари при cheating.
- **Кой плаща:** server owners на RP/roleplay мрежи (най-платежоспособни — имат приходи от donations,
  Patreon, VIP пакети), competitive/deathmatch, и хостинг провайдъри (bundle с server hosting →
  reseller канал).
- **Болки на server owners (защо сменят anticheat):**
  1. **Leak/bypass цикъл** — anticheat кодът изтича на leak forums, cheat разработчиците правят
     таргетиран bypass, ефективността **пада с времето** (FiveGuard е учебникарски пример). [xgamingserver]
  2. **Бавни updates** — ако вендорът не пуска бързи detection updates, сървърът е незащитен.
  3. **False positives / performance hit** — ban на невинни играчи или лаг убива общността.
  4. **Ban evasion** — cheater сменя акаунт/HWID и се връща; без cross-server мрежа е loop.
  5. **Слаб support** — при инцидент owner-ът иска отговор в минути, не дни.
- **Lock-in фактори:**
  - **Global ban network** (мрежов ефект) — колкото повече сървъри, толкова по-ценна е блеклиста.
    Fiveuxe/Sniff залагат точно на това. **Това е най-силният ни lock-in лост.**
  - Интеграция в server config/resources (switching cost).
  - Subscription inertia + натрупана ban история/HWID база на клиента.

---

## 3. Модел на монетизация (препоръка)

**Основа: recurring subscription през Stripe Billing (НЕ lifetime като основен продукт).**
Причина: anticheat е **непрекъснат** update-разход; lifetime = отрицателна unit economics.

### 3.1 Оси на ценообразуване
- **Per-server лиценз** (server = 1 CFX license key / endpoint). Прост, съответства на бранша.
- **Tier по обхват/фичъри**, не по slots — slot-based таксуване дразни и е трудно за enforce.
- **Add-on: Global Ban Network** — включено платено, но е и мрежово-стойностен диференциатор.

### 3.2 Препоръчани планове (ценова таблица)

> Валута **EUR** (ние сме EU/VCC, ДДС OSS). Цените са **предложение**, не финални — A/B срещу
> €19/€29/€39 котви. Годишен = 2 месеца безплатни (~17% отстъпка) — консервативно, пази cashflow.

| План | Месечно | Годишно | Обхват | Ключово включено |
|------|---------|---------|--------|------------------|
| **Free / Community** | €0 | — | 1 server, до N slots | Base detections, server-side checks, community ban list (read-only), branded. Придобивен канал. |
| **Indie** | **€19/мес** | **€190/год** | 1 server | Пълни detections, HWID ban, weekly+ updates, Discord support, **global ban network (read)** |
| **Pro** | **€39/мес** | **€390/год** | до 3 servers | Всичко от Indie + **write в global ban network**, screenshare on-demand, priority support, API, no-bypass SLA |
| **Network / Enterprise** | **€99+/мес** (custom) | custom | unlimited servers | White-label опция, dedicated detection tuning, SLA с response time, audit log export, invoice/PO билинг |
| **Screenshare 1-Day** | **€9 one-off** | — | — | Единичен 24h key (a la detect.ac „Detect 1x Day") — low-friction upsell |

### 3.3 Допълнителни лостове
- **Trial стратегия:** **14-дневен free trial БЕЗ карта** на Pro (или карта с €0 auth) → най-нисък
  friction, най-добра конверсия за B2B tooling. Trial → авто-downgrade към Free, не към плащане
  без съгласие. Използвай `trialing` статус + `customer.subscription.trial_will_end` (3 дни преди
  край, провери payment method). **Не** активирай Premium от success_url — само от webhook.
- **Reseller / White-label** за хостинг провайдъри: волумен отстъпки, sub-account билинг. Голям канал
  във FiveM (сървъри се купуват заедно с хостинг).
- **Global HWID ban network като добавена стойност** — безплатните виждат/наследяват мрежата read-only;
  платените **допринасят и се ползват** двупосочно. Мрежов ефект = защитен ров.
- **Annual push:** офер 2 безплатни месеца + заключва retention срещу leak-паниката.

---

## 4. Позициониране срещу двата титана

echo.ac и detect.ac са **client-side/screenshare-first, multi-game, non-EU**. Нашата ниша:
**FiveM-native, server-side-first, EU-compliant, transparency-first.**

**USP предложения (нареди по важност):**
1. **„No leaked source, no bypass" прозрачност** — публична update-честота, changelog, bug-bounty.
   Директен удар по leak-болката (FiveGuard разказ).
2. **EU/GDPR предимство** — hosted в ЕС, ясен **Data Processing Agreement** за server owner-а
   (той е data controller за играчите си, ние sub-processor), data-minimisation на HWID/IP хешове.
   Титаните са мъгливи по GDPR — това е реален B2B аргумент за EU/UK мрежи. (не е правен съвет)
3. **No-bypass SLA + бърз update cadence** — договорен ангажимент, не маркетинг.
4. **Global ban network с мрежов ефект** — колкото растем, толкова по-силна защита (Fiveuxe модел,
   но с EU-изрядност и прозрачно ban-appeal).
5. **Цена/стойност** — влизаме на **€19 core** (под FiniAC/FiveGuard/WaveShield €35–50), с honest
   feature gating (aimbot detection **включен** в core, не gated като FiveGuard/FiniAC — това е дразнител).
6. **Support/UX** — Customer Portal self-serve, прозрачни фактури, бърз Discord/ticket SLA.

**Позиционен слоган-посока:** „Server-side FiveM anticheat, изграден в ЕС, обновяван по-бързо от
bypass-ите — без изтекъл код, без скрити такси."

---

## 5. Stripe интеграция план

> Граница: тук даваме архитектура + статичен план. Реалният тест е с **test-mode** ключове и
> `stripe listen` на машина с интернет.

**Модел:** Stripe Checkout (hosted) **или** Payment Element + **Stripe Billing** (subscriptions).
PCI обхват = **SAQ A** (картата стои в iframe от `js.stripe.com`, не докосва нашия сървър).

1. **Продукти/цени в Stripe:** дефинирай `Product` (Indie/Pro/Network) + `Price` (monthly/annual)
   в Stripe. **Цената идва от `price` ID на сървъра**, никога от `req.body.amount`. Per-server =
   quantity или отделен subscription item.
2. **Създаване:** сървър прави `Checkout Session` (mode `subscription`) или `Subscription` с
   **`Idempotency-Key`**; пази `cus_…` в потребителя, за да не дублираш Stripe клиенти. Пин-вай
   `apiVersion`. Restricted key (`rk_…`) от secret vault, test/live разделени.
3. **SCA/3DS:** PSD2 изисква strong customer authentication за EU карти → обработи `requires_action`
   (3DS2). Recurring fixed-amount може да мине merchant-initiated, но **не разчитай на exemption** —
   покрий `requires_action` при първо плащане. Тествай с `4000002500003155` (3DS) и
   `4000000000000341` (fail).
4. **Webhook (сърцето на достъпа):** raw-body парсер **преди** `express.json()`; провери
   `stripe-signature`; върни 2xx <5s; **идемпотентност по `event.id` в същата транзакция** като
   бизнес-ефекта. Достъп/лиценз се дава **тук**, не в `success_url`.
   - `checkout.session.completed` → първоначална активация на лиценз.
   - `invoice.paid` / `invoice.payment_succeeded` → provision при `active`, премести expiry напред.
   - `invoice.payment_failed` → dunning известие (Smart Retries).
   - `customer.subscription.updated` → план/статус смяна.
   - `customer.subscription.deleted` (`canceled`/`unpaid`) → **отнеми достъп / деактивирай license key**.
   - `customer.subscription.trial_will_end` → провери payment method.
5. **ДДС (EU OSS):** **Stripe Tax** — B2C трансгранично над праг **€10 000** → OSS деклариране в
   държавата на потребление (BG през НАП, ДДС 20%). За B2B EU с валиден VAT ID → reverse charge
   (Stripe Tax поддържа VAT ID collection). **Провери прага/режима на живо преди go-live.** (не е правен съвет)
6. **Фактури + Customer Portal:** авто-фактури (`draft`→`open`→`paid`); **Stripe Customer Portal**
   за self-serve (смяна на карта, отказ, изтегляне на фактури) — не пиши собствен billing UI.
7. **Dunning:** Smart Retries (~8 опита/2 седмици) + имейли; след последен опит → `past_due`→`unpaid`
   → деактивация през webhook.
8. **Право на отказ (14 дни, дигитална услуга):** за дигитално съдържание/услуга по чл. 16(м) отказът
   отпада само при **изрично предварително съгласие + потвърждение за загуба на правото** →
   реализирай **отделна, неотметната по подразбиране** отметка на checkout + ехо в потвърждението.
   За subscription без незабавно „consumed" изпълнение по-безопасно е да позволиш 14-дневен
   pro-rata refund. **Подай на Правния Разбирач за одит.** (не е правен съвет)
9. **Закаляване:** Radar за fraud, ясен refund/chargeback път, audit log на финансови действия
   (без PII), restricted keys, webhook secret в env/secret store.

**Тестов план:** двойна webhook доставка (без дубъл license), 500→retry (без двойно таксуване),
грешна валута/сума (отхвърля се), изтекъл подпис (400/401), 3DS `requires_action`, trial→active,
subscription.deleted→revoke.

---

## Източници

- echo.ac — https://echo.ac/ (pricing, 2026-07-06)
- detect.ac — https://detect.ac/ (pricing, 2026-07-06)
- FiveM anticheat comparison 2026 (Medium, Vinayak Gandhi) — FiniAC/FiveGuard/WaveShield/PhoenixAC/AnvilAC/Raven цени
- fiveguard.net; waveshield.xyz; fini.ac/pricing; fiveuxe.com; sniff.ac; phoenix-ac.com
- XGamingServer FiveM Anticheat Guide 2026 — https://xgamingserver.com/blog/fivem-anticheat-guide/ (болки, leak проблем)
- Пазарни числа: novonode.com/fivem-server-list, gtaboom.com/servers, activeplayer.io/fivem/
- HWID/global ban: fiveuxe.com, sniff.ac, fivembanlist.com, medium (Sync Top, HWID ban 2025)
- Stripe: docs.stripe.com (Billing, Tax, webhooks, Checkout, Customer Portal)

> **Дисклеймър:** Не е правен съвет. Цените на конкурентите се менят — потвърди на живо преди
> ценово решение. ДДС/OSS праг и чл. 16(м) прилагане → Правния Разбирач.
