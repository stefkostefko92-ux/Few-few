# Тарифи (v3.0)

Supreme Bot се продава на **тарифи (tiers)**, обезпечени по два паралелни пътя:
**Stripe** (външно плащане) и **Discord Premium Apps** (native монетизация). И
двата водят до едно и също: сървърът получава `plan`, а достъпът се гейтва
централизирано в `backend/src/lib/premium.js`.

## Тарифите

| Tier | Цена/мес | Цена/год | Сървъри | Какво включва |
|------|----------|----------|---------|----------------|
| **Free** | €0 | — | 1 | 1 панел, 2 формуляра (до 5 въпроса), 1 верификация, 30-дневни transcript-и |
| **Premium** | €4.99 | €49 | 1 | Всичко ОСВЕН white-label: до 50 панела/формуляра/въпроса, верификация, giveaways, poll-ове, sticky + scheduled/recurring, AI отговори, round-robin, webhooks, REST API, безсрочни transcript-и |
| **White-label** | €9.99 | €99 | 1 | Premium + собствен бранд бот (качваш свой Discord bot token) |
| **Agency 5** | €19.99 | €199 | до 5 | White-label tier за 5 сървъра, един абонамент, reseller-friendly |
| **Agency 10** | €39.99 | €399 | до 10 | White-label tier за 10 сървъра |

- Цените са в **EUR, с включен ДДС** (`tax_behavior=inclusive`); Stripe Tax
  начислява 20% BG ДДС по местоназначение.
- **Годишно = ~2 месеца безплатно.**
- **Пробни периоди (уточнение):** локалният 14-дневен trial (без карта) дава
  **Premium** tier. Отделно Stripe checkout-ът дава 14-дневен Stripe trial за
  **избрания план** (Premium ИЛИ White-label), ако сървърът не е ползвал trial
  (`trialUsed`). Agency планове нямат trial.
- **Отчетност:** плащанията по Agency абонаменти НЕ влизат в `PaymentLog`
  (моделът е per-server) и не носят афилиейт комисионна — agency приходите се
  четат директно от Stripe Dashboard/Sigma. Съзнателно решение; ако потрябва
  вътрешна отчетност, добави отделен `AgencyPaymentLog`.
- Само `integrations.whiteLabel` изисква White-label/Agency; всяка друга премиум
  функция изисква Premium или по-горе (виж `PREMIUM_FEATURES` в `lib/premium.js`).

## Как е моделирано (код)

- `Server.plan` — собствената тарифа на сървъра (`free|premium|whitelabel|agency5|agency10`).
  `Server.isPremium` се пази в синхрон (`true` ⇔ `plan != free`) за съвместимост.
- `Server.agencyId` → `Agency` (мулти-сървър): ако агенцията е `active`, сървърът
  наследява нейната тарифа (резолюция в `getServerTier`).
- `getServerTier(serverId)` е единственият източник на истина: комбинира
  собствена тарифа + активен trial (→ Premium) + agency seat и връща
  `{ plan, isPremium, hasWhiteLabel, limits, ... }`.
- Достъп се дава **само** през верифициран Stripe webhook или Discord entitlement
  — никога от client redirect (виж `CLAUDE.md`).

## Пускане — какво трябва да направи собственикът

### 1. Stripe (задължително)
```bash
cd SupremeDiscordBot
STRIPE_SECRET_KEY=sk_live_... bash scripts/stripe-setup.sh
```
Скриптът създава продуктите/цените (идемпотентно) и печата `STRIPE_PRICE_*`.
Попълни в `backend/.env`:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PREMIUM_MONTH=price_...
STRIPE_PRICE_PREMIUM_YEAR=price_...
STRIPE_PRICE_WHITELABEL_MONTH=price_...
STRIPE_PRICE_WHITELABEL_YEAR=price_...
STRIPE_PRICE_AGENCY5_MONTH=price_...
STRIPE_PRICE_AGENCY5_YEAR=price_...
STRIPE_PRICE_AGENCY10_MONTH=price_...
STRIPE_PRICE_AGENCY10_YEAR=price_...
```
> Стар единичен `STRIPE_PRICE_ID` (ако още стои) се третира като **white-label**
> (grandfather за заварени абонати). Миграция v27 мапва всеки текущ premium
> сървър към `whitelabel`, за да запази точно каквото е имал.

### 2. Discord Premium App (по избор, но поискано)
Виж `docs/DISCORD_MONETIZATION.md`. Накратко: включи монетизация в Developer
Portal (изисква одобрен/verified app + team payout), създай subscription SKU-та
за **Premium** и **White-label** на цени **не по-високи** от Stripe (price parity,
в сила от 7 окт. 2024), и попълни:
```
# backend/.env И bot/.env
DISCORD_SKU_PREMIUM=...
DISCORD_SKU_WHITELABEL=...
```
Agency остава само Stripe (Discord SKU-тата са per-guild).

### 3. Миграция на БД
`prisma migrate deploy` (автоматично при deploy) прилага
`20260709000000_v27_tiers_agency_discord`.

## API (frontend → backend)

- **Per-server upgrade:** `POST /api/stripe/create-checkout/:serverId`
  `{ plan: "premium"|"whitelabel", interval: "month"|"year", withdrawalConsent: true }` → `{ url }`
- **Agency:** `POST /api/agency/checkout` `{ plan: "agency5"|"agency10", interval, withdrawalConsent: true }` → `{ url }`;
  `GET /api/agency/mine`; `POST|DELETE /api/agency/:agencyId/servers/:serverId` (seat).
- **Portal:** `POST /api/stripe/portal/:serverId` · `POST /api/agency/portal`.
- **Discord entitlements (само ботът):** `POST /api/discord/entitlement`.
