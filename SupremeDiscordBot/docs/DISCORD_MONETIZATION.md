# Discord Premium Apps — единственият път за плащане (v3.3)

**Решение на собственика (12.09.2026):** Supreme Bot се продава **само** през
Discord Premium Apps. Stripe остава единствено за **заварени** абонати (webhook +
портал); нова покупка през Stripe няма (`POST /api/stripe/create-checkout` и
`POST /api/agency/checkout` връщат **410** при `BILLING_PROVIDER=discord`, което е
подразбирането). **Пробен период няма** по никой път.

Всичко по-долу е сверено с живата документация на Discord на 12.09.2026 —
**сверявай пак преди промяна на цени/SKU**, Discord обновява политиките (Developer
Policy — 11.09.2026; Premium Apps FAQ — 29.08.2026; Paid Services Terms — 29.08.2025).

---

## 1. Защо Discord-only (правно и продуктово)

| Факт (източник) | Следствие за нас |
|---|---|
| **Developer Policy**: от 07.10.2024 приложение с платени функции трябва да ги предлага през Premium Apps **и** на цена не по-висока от която и да е друга опция | С един канал паритетът е тривиален; няма риск „Stripe по-евтино → нарушение“ |
| **Premium Apps FAQ**: поддържат се само **месечни** абонаменти и еднократни покупки; годишни, ограничени във времето отстъпки и дарения **не** | Няма годишен план. `DISCORD_PLANS` в `lib/billing.js` е само месечен |
| **Guild vs user SKU не съжителстват**; guild абонамент = един сървър | Няма мулти-сървърен Agency SKU → Agency **не се продава** (заварените работят) |
| **Monetization Terms (06.06.2024)**: в ЕС/UK Discord е **препродавач** — начислява и внася ДДС, издава разписки, обработва възстановяванията по своята политика | Ние не виждаме карта, не сме продавач; Общите условия го казват (Terms §5–6) |
| **Payout**: 85/15 до $1M, после 70/30; праг $100 → $25; 45 дни след края на месеца | Приходът е нетен от комисионата на Discord; ДДС не е наш оборот |
| **Entitlement-ът е източникът на истината**; отмяната идва като `SUBSCRIPTION_UPDATE` (ENDING), изтичането като `ENTITLEMENT_UPDATE` с `ends_at`, refund като `ENTITLEMENT_DELETE`/`deleted:true` | Правата се дават/отнемат **само** от entitlement събития; абонаментът е само „защо/докога“ |

## 2. Допустимост (eligibility) — направи ги преди да включиш магазина

Проверено в Developer Portal → App → Monetization (списъкът е на Discord; сверявай):

- приложението е **верифицирано** и принадлежи на **Team** (не личен акаунт);
- собственикът на Team-а е 18+, с потвърден имейл и **2FA**;
- ботът ползва **slash команди**; в App Directory има **ToS + Privacy** линкове
  (нашите: `/terms`, `/privacy`);
- **payout** и данъчна информация са попълнени; приети са **Monetization Terms**
  и **Monetization Policy**;
- достъпно за разработчици в **US/EU/UK**.

## 3. Създай SKU-тата (Monetization → Subscriptions)

Две **guild-scoped, месечни** subscription SKU-та. Цените се избират от фиксираната
стълба на Discord — избери най-близката до информативната ни цена:

| SKU | Тарифа в кода | Информативна цена (lib/billing.js) |
|-----|---------------|-------------------------------------|
| Premium | `premium` | от €4.99/мес |
| White-label | `whitelabel` | от €9.99/мес |

Крайната сума (с ДДС по държавата на купувача) я показва Discord в checkout-а —
затова таблото и сайтът пишат „от …“ и „Discord показва крайната цена“.

Магазин (официален формат на адресите):
```
https://discord.com/application-directory/<DISCORD_CLIENT_ID>/store
https://discord.com/application-directory/<DISCORD_CLIENT_ID>/store/<SKU_ID>
```
В чат Discord ги рендерира като карта с бутон за покупка; ботът праща и native
`ButtonStyle.Premium` бутон (`bot/src/utils/premiumRequired.js`).

## 4. Конфигурация

`backend/.env` (и `bot/.env` за SKU-тата — ботът рисува бутона):
```dotenv
BILLING_PROVIDER=discord          # discord (по подразбиране) | stripe | both
DISCORD_CLIENT_ID=...             # = application id; ползва се и за URL на магазина
DISCORD_SKU_PREMIUM=<sku_id>
DISCORD_SKU_WHITELABEL=<sku_id>
```
При `discord`/`both` `index.js` крещи на старт, ако липсва някоя от трите.
`GET /api/billing/config` връща публичната конфигурация за таблото (без тайни).

## 5. Веригата в кода

```
Discord checkout ──► ENTITLEMENT_CREATE ─► bot/events/entitlementCreate.js
                 ──► SUBSCRIPTION_CREATE ─► bot/events/subscriptionCreate.js
                                             │
                    POST /api/discord/entitlement   (grant/revoke — ПРАВАТА)
                    POST /api/discord/subscription  (само състояние + одит)
                                             │
                    Server.plan/planSource="discord"/discordEntitlementId/discordSkuId
                    Server.discordSubscriptionId/Status/CurrentPeriodEnd   (v48)
```

- **Grant** само за guild SKU (premium/whitelabel), само за съществуващ сървър,
  **никога** върху Stripe-обезпечен сървър (взаимно изключване в двете посоки).
- **Revoke** при `type=delete`, `deleted:true` или минал `endsAt` — само ако сървърът
  е обезпечен точно от този entitlement; после `syncServerPaidFlag` (агенция може да
  го държи платен) и `reconcileWhitelabel` (бранд ботът слиза).
- **Reconcile** (`POST /entitlements/reconcile`) при старт и на всеки 6 ч
  (`ENTITLEMENT_RECONCILE_MS`): Discord не преизпраща gateway събития. Празен активен
  списък при налични Discord-обезпечени сървъри **не** revoke-ва (вероятен fetch
  проблем).
- **Subscription статус** се пази като сурово число и се превежда **по документацията**
  в `lib/discordSubscription.js`: `0 active · 1 inactive · 2 ending`. Внимание:
  `discord-api-types` 0.38.48 обявява Ending=1/Inactive=2 — разминаване, затова
  не ползваме enum-а на пакета. Етикетът е информативен; **достъпът никога не се
  извежда от него**.

## 6. Какво вижда клиентът

- **Табло → Premium**: състояние (източник на правата: discord / stripe-легаси /
  agency / grace), „от €…“, линк към магазина (нов таб). Няма наш бутон за поръчка и
  няма отметка за чл. 16(а) — и двете са в checkout-а на Discord (продавачът).
- **Бот**: `/premium status` показва източника, „подновява се на …“/„отменен —
  достъп до …“ (Discord timestamp) и линк към магазина; при Free — native premium
  бутон. Гейтнатите функции ползват `sendPremiumRequired`, чийто резервен път е
  магазинът (не таблото).
- **Отмяна/възстановяване**: в Discord (User Settings → Subscriptions); достъпът
  остава до края на платения период. Refund → Discord по неговата Refund Policy;
  ние не можем да върнем пари за Discord покупка.

## 7. Тест

- Test entitlements: `POST/DELETE /applications/{app}/entitlements` (Developer
  Portal → Test) в тестов guild — без реално плащане.
- Провери: `Server.plan` става `premium`/`whitelabel`, `/premium status` показва
  „Discord subscription“, `GET /api/billing/:id` дава `source: "discord"`; след DELETE
  планът пада на `free` и бранд ботът слиза.
- Гейтове: `billingProvider.test.js`, `discordSubscription.test.js`, `noTrial.test.js`
  (backend); `discordSubscriptionEvents.test.js` (bot); `checkout-cta.test.js` (frontend).

## 8. Заварени Stripe абонати

Discord не изисква прекратяване на съществуващи отношения. Webhook-ът продължава да
се проверява и обработва: отмяна с гратис, refund/chargeback → незабавно сваляне,
дунинг. Порталът е достъпен от Premium страницата **само** за сървър с
`planSource="stripe"`. Ако собственикът реши да мигрира всички към Discord — това е
комуникация с клиента (отмяна в Stripe + покупка в Discord), не автоматика.
