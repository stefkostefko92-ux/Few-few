# linketto: миграция Stripe → Revolut Business — спецификация (ЧЕРНОВА)

Автор: Продавача · 2026-11-14 · само спецификация, кодът в `src/` не е пипан.
Статус: **чернова за решение на собственика**. Нищо от тук не се пуска с реални пари без раздел 4.

**Източници (свалени днес, 2026-11-14):**
- `[M]` Merchant API OpenAPI: https://developer.revolut.com/docs/api/merchant.yaml — `info.version: 2026-08-17`. Цитатите са с ред от този файл (`M:ред`); редовете се местят при нова версия.
- `[B]` Business API OpenAPI: https://developer.revolut.com/docs/api/business.yaml (`B:ред`).
- `[PPSA]` Payment Processing Services Agreement, **Revolut Bank UAB**, „will apply from 17 November 2025“, v1.1.0: https://cdn.revolut.com/terms_and_conditions/pdf/payment_processing_services_agreement_9f705ee7_1.1.0_1776182172_en.pdf
- `[FEES]` Business Fees (Basic), **Revolut Bank UAB**, „updated on 1st July 2025“, v1.3.1: https://cdn.revolut.com/terms_and_conditions/pdf/business_fees_basic_fba1ea5d_1.3.1_1751298910_en.pdf
- `[SIG]` Ръководство „Verify the payload signature“: https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature — **директното сваляне върна 403**; съдържанието е видяно само през резюме от търсачка → етикет „Вероятно“, сверява се ръчно преди код.
- Недостъпни днес (403/бот-страница): `revolut.com/legal/*` HTML страниците, ръководствата под `developer.revolut.com/docs/guides/*`, EUR-Lex (PSD2). Затова там, където те са единственият източник, стои **UNVERIFIED**.

Етикети: **Сигурно** (дословен цитат от първоизточник) · **Вероятно** (вторичен път или извод) · **UNVERIFIED** (няма първоизточник днес).

---

## 0. Какво ползваме днес от Stripe (ф:р)

| Функция | Къде в кода |
|---|---|
| Планове PRO €4 / BUSINESS €9 месечно, отстъпка 0/10/15/20% за 1/3/6/12 мес., авансово; FOUNDER €49 еднократно | `src/lib/plans.ts:41-90`, `:113-137`; Price ID от env `STRIPE_PRICE_<PLAN>_<INTERVAL>` (`plans.ts:149-154`) |
| Планов checkout (винаги `customer`, създаден с idempotency key по `user.id`; блок при жив абонамент; изтичане на отворени сесии) | `src/lib/plan-checkout.ts:156-166`, `src/lib/plan-checkout-stripe.ts:56-86`, `src/app/actions/billing.ts:118` |
| Customer Portal (смяна/отказ/карта/фактури) | `src/app/actions/billing.ts:148` |
| Синхронизация план ↔ плащане (level-triggered, CAS), refund/спор, пауза на таксуването при спор, реферално сторно | `src/lib/billing-sync.ts` (чисти функции), `src/lib/stripe-state.ts:36-131`, `src/app/api/stripe/webhook/route.ts:727-975`; спецификация `docs/billing-spec.md` §1 P1–P11 |
| Магазин: Connect Express onboarding | `src/app/actions/shop.ts:56-67`; `User.stripeAccountId/stripeChargesEnabled` (`prisma/schema.prisma:29-30`) |
| Магазин: separate charges & transfers, превод нето − такса | `src/lib/payout.ts:13-70` (`transfers.create` + `source_transaction`, idempotency `transfer-<session>`) |
| Комисиона 8/4/0% + обработка 1,9% + €0,30 | `src/lib/plans.ts:157-184` |
| Refund с `reverse_transfer` | `src/app/actions/shop.ts:321-329`, `src/app/actions/admin.ts:170-178` |
| Членства (абонамент към създател, `Entitlement`), **изключени** | `plans.ts:17` (`MEMBERSHIPS_ENABLED = false`), `shop.ts:164-180`, `schema.prisma:332-348` |
| Промо кодове с резервация | `src/lib/coupon.ts`, `coupon-reservation.ts`, `coupon-ledger.ts` |
| ДДС: Stripe Tax, платформата е доставчик по чл. 9а Регл. 282/2011; магазинът продава само при Stripe Tax или test mode | `src/lib/stripe-tax.ts:6-19`, `TAX.md`, `Purchase.vatAmountCents/netAmountCents/buyerCountry` (`schema.prisma:396-398`) |
| Реферал 15%, праг €100, ръчно изплащане от админа | `src/lib/referral.ts:9-32`; `ReferralPayout` |

---

## 1. Таблица: Stripe → Revolut

| Stripe функция | Revolut еквивалент | Статус / източник |
|---|---|---|
| Checkout Session (hosted) | `POST /api/orders` → `checkout_url` (Hosted Payment Page); `redirect_url`, `expire_pending_after`, `merchant_order_data` | **Сигурно** — `M:55` (createOrder), пример `checkout_url: https://checkout.revolut.com/payment-link/…` `M:465`; полета на `Order-Creation-v7` `M:10335-10377` |
| Payment Element (вграден) | Revolut widget/SDK („Flow 2: Widget or card-not-present“) | **Сигурно**, че съществува — `M:3272-3290`. SAQ ниво за widget-а: **UNVERIFIED** |
| Статус на плащане | `Order-State`: `pending` · `processing` · `authorised` · `completed` · `cancelled` · `failed` | **Сигурно** — `M:8096-8120` |
| Методи | `card`, `apple_pay`, `google_pay`, `revolut_pay_card`, `revolut_pay_account`, `sepa_direct_debit` | **Сигурно** — `Payment-Method-Type` `M:10586-10595`. Apple Pay домейн: `POST /api/apple-pay/domains/register` `M:6121` |
| Idempotency-Key | **Само** на: refund (`M:977`), създаване на абонамент (`M:3298`), subscription-usages (задължителен, `M:4202-4210`), payouts (`M:4619`), disbursements (`M:4930`). `maxLength: 50` (`M:7614-7633`). **Няма** на `POST /api/orders` и `POST /api/customers` | **Сигурно** — `M:55-70`, `M:1437` нямат параметъра |
| Webhook endpoint | `POST /api/webhooks` (url + events), `signing_secret` (`wsk_…`) във всеки отговор, `rotate-signing-secret` | **Сигурно** — `M:5711`, `M:6020-6040`, `M:17181-17196` |
| Подпис `stripe-signature` | Хедъри `Revolut-Request-Timestamp` + `Revolut-Signature`; HMAC | **Сигурно** за хедърите и HMAC — `M:8062-8084`, `M:7441`. Формула `v1=` + HMAC-SHA256(secret, `"v1." + timestamp + "." + raw body`), няколко подписа при ротация: **Вероятно** — `[SIG]` през търсачка, директно 403. Препоръчан толеранс на timestamp: **UNVERIFIED** |
| Ретрай на webhook (Stripe: до 3 дни) | Ack = всеки код **200–399**; при **4XX** или таймаут — „3 more times, each with a 10-minute delay“ | **Сигурно** — `M:7382-7396`. Ретрай при **5XX** не е описан → **UNVERIFIED** |
| `event.id` за дедупликация | **Няма.** Тяло = `{event, order_id, merchant_order_ext_ref}` (поръчка), `{event, subscription_id, external_reference}` (абонамент), `{event, dispute_id}` (спор) — без id на събитие, без сума | **Сигурно** — примери `M:7317-7372` |
| IP allowlist на webhook | Prod `35.246.21.235`, `34.89.70.170`; Sandbox `35.242.130.242`, `35.242.162.241` | **Сигурно** — `M:7283-7288` |
| Събития | Order: `ORDER_COMPLETED/AUTHORISED/CANCELLED/FAILED`; Payment: `ORDER_PAYMENT_DECLINED/FAILED/…`; Subscription: `SUBSCRIPTION_INITIATED/FINISHED/CANCELLED/OVERDUE`; Dispute: `DISPUTE_ACTION_REQUIRED/UNDER_REVIEW/WON/LOST`; Payout: `PAYOUT_*` | **Сигурно** — `M:17129-17137`. **Няма** отделно refund събитие (refund-ът е поръчка `type: refund`) |
| Refund (пълен/частичен) | `POST /api/orders/{id}/refund`; нова поръчка `type: refund` с `related_order_id`; няколко частични до сумата; само за `completed`; асинхронен „up to 2 days“ | **Сигурно** — `M:971-997` |
| `reverse_transfer` | **Няма** (няма Connect) | **Сигурно** по отсъствие — няма такъв път в `M` |
| Спорове / chargeback | `GET /api/disputes`, `/{id}`, `/accept`, `/evidences`, `/challenge`; states `needs_response`, `under_review`, `won`, `lost` (без inquiry/`warning_*`) | **Сигурно** — `M:2074-2550`, `M:7741-7770`. „This endpoint is only available in **Production** environment“ (`M:2092`) → **споровете не се тестват в sandbox** |
| Customer | `POST/GET /api/customers`, `…/payment-methods` | **Сигурно** — `M:1437-1880` |
| Запазена карта + MIT | `POST /api/orders/{id}/payments` със `saved_payment_method`; `initiator: merchant` само при `savePaymentMethodFor: merchant` | **Сигурно** — `M:1089-1120`. Договорно: MIT „You cannot do this without our express permission“ + задължения (предизвестие, разписка, лесен онлайн отказ) — `[PPSA]` §9 „Merchant initiated transactions“ |
| Stripe Billing (Subscriptions) | **Subscriptions API**: `subscription-plans` (variations × phases, `cycle_duration` ISO 8601, напр. `P1M`, `P1Y`), `subscriptions` (HPP flow със `setup_order_id`), `change-plan` (само `at_cycle_end`), `change-renewal-date`, `cancel`, `cycles` (всеки цикъл има `order_id`) | **Сигурно**, че съществува — `M:2872-4128`. Състояния `pending/active/overdue/paused/cancelled/finished` (`M:13600-13640`). **За всички пътища OpenAPI посочва само Production сървър** (`M:2877-2879` и сл.) → sandbox: **UNVERIFIED**. GA/beta етикет: в спецификацията няма → **UNVERIFIED** |
| `subscriptions.pause/resume` (ползваме при спор) | **Няма API за пауза** — `paused` съществува като състояние, но няма път `pause`/`resume`; `Subscription-Update` мени само `external_reference` | **Сигурно** по отсъствие — `M:13973-14010`, пътища `M:3208-4128` |
| Smart Retries / dunning | Събитие `SUBSCRIPTION_OVERDUE`, състояние `overdue` („has a failed payment and is awaiting resolution“). Политиката за повторни опити (брой, интервал, кога → `cancelled`) **не е описана** | **Сигурно** за събитието; политиката **UNVERIFIED** |
| Proration при смяна на план | Няма — смяната е само в края на цикъла | **Сигурно** — `M:3630-3650` |
| Customer Portal | **Няма** еквивалент | **Сигурно** по отсъствие (grep `portal` в `M` дава само Business портала, `M:731`) |
| Connect (onboarding/KYC, split, transfers към трети) | **Няма.** `industry_data.type: marketplace` + `Marketplace-Seller {id, name, website}` е само **информация** за под-продавача | **Сигурно** — `M:119`, `M:9884-9910`. Merchant payouts: „Only internal payouts to business accounts are supported“, сумата е целият наличен баланс (`M:4615`, `M:14464`). Disbursements: „available to merchants with the gambling merchant category code (MCC 7995) only“ (`M:4911`) |
| Превод към трети (за вариант б) | Business API `POST /pay` към counterparty; `request_id` за идемпотентност | **Сигурно** — `B:12946-12975`, `B:18643-18660` |
| Stripe Tax | **Няма изчисление.** `line_items[].taxes[] = {name, amount}` се подава **от нас** | **Сигурно** — `Tax` `M:8507-8525` |
| Държава на купувача | `issuer_country` (държава на издаване на картата) и `billing_address` на `Card-v2`; `card_country_code` в плащанията | **Сигурно**, че полетата съществуват — `M:12262-12303`, `M:12221-12227`, `M:10877-10879`. Дали `billing_address` винаги е попълнен през HPP: **UNVERIFIED** |
| Подписване на заявките | Ключ с включено подписване: в Prod задължителни `Revolut-Api-Timestamp` + `Revolut-Api-Signature`; в Sandbox не | **Сигурно** — `M:7454`, `M:7471-7488` |
| Пиниране на версия (`apiVersion`) | Хедър `Revolut-Api-Version` (дата, напр. `2026-08-17`) | **Сигурно** — `M:7493`, `M:7634-7640` |
| Sandbox | `https://sandbox-merchant.revolut.com` | **Сигурно** — `M:52-53` (с изключенията за абонаменти/спорове по-горе) |
| Такси (ЕС карти) | Basic план: EEA consumer cards **1% + €0,20**; Amex 1,7%; други карти 2,8% (+ същата фиксирана); Revolut Pay online 1%; chargeback такса **EUR 15** | **Сигурно за версия 1.3.1 (01.07.2025)** — `[FEES]`. Текущата версия и другите планове (Grow/Scale/Enterprise): **UNVERIFIED** (страницата на `revolut.com/legal` върна 403). Помощният център показва 1% + €0,25 — противоречие, **UNVERIFIED** |
| Договорна забрана за трети | „you cannot use the Services to accept or process payments on behalf of anyone else“ | **Сигурно** — `[PPSA]` §3 „What can you (and can't you) use this payment processing…“, ред „You can also only use the Services yourself, and only in your own right…“ |

**Следствие за `PROCESSING_FEE` (`plans.ts:166`):** 1,9% + €0,30 покрива EEA consumer (1% + €0,20) с буфер, но **не** покрива „any other cards“ 2,8% + €0,20 (небизнес извън ЕИП/бизнес карти) — на €3 продукт таксата е €0,36 срещу €0,28 удръжка. Решение за собственика, не код (раздел 4, О-6).

---

## 2. Предложена архитектура (адитивна)

### 2.1 Принципи (непроменени от `billing-spec.md`)
1. Сумата/цената е сървърна: от `plans.ts` (`intervalPriceCents`) или от `Product` в базата; никога от формата.
2. Права **само** през проверен webhook **или** reconciler, и в двата случая след `GET` на актуалния обект. Redirect-ът (`redirect_url`) е само UX.
3. Level-triggered: webhook-ът е само „събуди се и провери“. Тялото няма сума и id на събитие, затова решението винаги идва от `GET /api/orders/{id}` / `GET /api/subscriptions/{id}` / `GET /api/disputes/{id}`.
4. Идемпотентност по **бизнес ключ** (CAS условни записи), като днес (P10). Таблица по `event.id` е невъзможна, защото Revolut не праща такъв.
5. Revolut ретрайва само 3 пъти × 10 мин → **reconciler cron е задължителен**, не допълнение.

### 2.2 Модули (нови, без `server-only` там, където се тестват; клиентът се инжектира)
| Файл | Роля |
|---|---|
| `src/lib/revolut.ts` (server-only) | HTTP клиент: база по env (prod/sandbox), `Authorization: Bearer`, `Revolut-Api-Version: 2026-08-17`, по желание Ed25519 подпис на заявката; помощник за `Idempotency-Key` (≤ 50 знака) |
| `src/lib/revolut-webhook.ts` (чист) | `verifyRevolutSignature(rawBody, timestampHeader, signatureHeader, secrets[], nowMs)` — constant-time сравнение, няколко `v1=` подписа, няколко активни тайни (ротация), прозорец на timestamp |
| `src/lib/revolut-state.ts` (адаптер, инжектиран) | `getOrder`, `findOrderByReference(ref)` (през `merchant_order_data_reference`), `getSubscription`, `getCycles`, `getDispute`, `listDisputes`, `refundOrder(id, amount, key)`, `cancelSubscription(id)` — тесен интерфейс с mock в тестовете |
| `src/lib/revolut-plans.ts` (чист) | Карта план × период → `plan_variation_id` от env (`REVOLUT_PLAN_VAR_<PLAN>_<INTERVAL>`); обратна карта за синхронизация; непозната вариация → без промяна + аларма (както P3) |
| `src/lib/billing-sync.ts` (запазва се) | Решенията остават. Входът става неутрален към доставчика: `SubscriptionSnapshot {state, paidThrough}`, `PaymentSnapshot {state, amount, refundedAmount, disputes[]}`. Нова карта на статусите (2.4) |
| `src/lib/vat.ts` (замества `stripe-tax.ts`) | Чисти функции за ставка по държава + `shopSalesAllowed()` по нов флаг `VAT_ENGINE_ENABLED`. Съдържанието е на Данъчника; тук само интерфейсът |
| `src/app/api/revolut/webhook/route.ts` | `await req.text()` (суровото тяло, **без** JSON парсване преди проверката) → подпис → `GET` на обекта → CAS → `204`. Невалиден подпис → 4xx и без странични ефекти |
| `scripts/reconcile-revolut.ts` (cron) | Висящи `PaymentOrder` (`pending/processing` > 15 мин), refund поръчки ≤ 2 дни, абонаменти с `paidThrough` < сега + 1 ден, отворени спорове → същата функция `applySnapshot` като webhook-а |
| Страница „Абонамент“ в дашборда | Замества Customer Portal: отказ (бутон), смяна на план (насрочена), история на плащанията. Смяна на карта: **UNVERIFIED** дали Revolut дава път без нов setup order |

### 2.3 Промени в схемата (само адитивни, nullable; Stripe колоните остават за историята — 10 г. OSS/Н-18)
```
User      + revolutCustomerId String? @unique
          + planRevolutSubscriptionId String? @unique
          + planRevolutOrderId String? @unique      // FOUNDER поръчка
          + planPaidThrough DateTime?               // край на платения цикъл (от cycles[].end_date)
          + planDisputedOrderId String?
PaymentOrder (нов) id (=наш reference, пращан в merchant_order_data.reference)
          kind plan|founder|shop|membership · userId? · purchaseId? · revolutOrderId String? @unique
          amountCents Int · currency · state · paidAt DateTime? (от payments[] completed) · lastSyncedAt
          @@index([state, createdAt])
Purchase  + revolutOrderId String? @unique · revolutRefundOrderIds String[] · payoutReference String?
Referral  + revolutOrderId String? @unique
Entitlement + revolutSubscriptionId String? @unique   // само ако членствата се пуснат
RevolutDispute (нов) revolutDisputeId @unique · orderId · state · reason · updatedAt
WebhookLog (нов, само одит) event · objectId · receivedAt · outcome   // НЕ е гард за идемпотентност
```
Ред: бекъп → `prisma migrate deploy` (skill `prisma-migrate`). В linketto `prisma format` пренарежда целия файл → полетата се добавят ръчно, после `prisma validate` с `DATABASE_URL`.

### 2.4 Карта на статусите (замества P2 и P5 в `billing-spec.md`)
- **Абонамент → план:** `active` → план; `overdue` → план като гратис, но **само до `planPaidThrough` + N дни** (N е решение, О-3), защото политиката на Revolut за повторни опити е неизвестна; `pending` → не (първото плащане не е минало); `paused`, `cancelled`, `finished` → не, **след** `planPaidThrough` (платеното се дава до края на платения цикъл); непознато → не (fail-closed).
- **Обърнато плащане:** пълен refund = сумата на `completed` refund поръчките с `related_order_id = X` ≥ сумата на X; спор = поне един спор в `needs_response`, `under_review` или `lost`; `won` не се брои; непознат статус се брои за обърнат (fail-closed). Refund поръчка в `failed`/`declined` не се брои.
- **FOUNDER:** поръчка (`POST /api/orders`), не абонамент; отнема се само при обърнато плащане на **самата** поръчка (P6 остава).
- **Спор по абонамент:** без API за пауза → вариантите са в О-2.

### 2.5 Създаване на поръчка без Idempotency-Key
1. Запиши `PaymentOrder {id, state: 'creating'}` в базата.
2. `POST /api/orders` с `merchant_order_data.reference = PaymentOrder.id`.
3. При таймаут/5xx **не** създавай нова: `GET /api/orders?merchant_order_data_reference=<id>` → ако има, осинови я.
4. CAS запис `revolutOrderId` само ако е `null`.

---

## 3. Критерии за приемане (бъдещи падащи тестове, R1…)

Чисти функции → `src/lib/__tests__/revolut-*.test.ts` (node:test през tsx); адаптери → срещу mock на `revolut-state`.

**Подпис и webhook**
- **R1** Валиден подпис (тестовият вектор от `[SIG]`, сверен ръчно) → приет; един сменен байт в тялото → отхвърлен.
- **R2** Хедър с два `v1=` подписа, единият валиден → приет. Две активни тайни (ротация) → приет с всяка.
- **R3** Timestamp извън прозореца → отхвърлен (защита от replay), дори при валиден HMAC.
- **R4** Маршрутът чете `req.text()` преди каквото и да е парсване; тест с тяло, чието `JSON.stringify(JSON.parse(x)) !== x`, минава.
- **R5** Невалиден подпис → 4xx, нула записи в БД, нула извиквания към Revolut.
- **R6** Тяло `{event: 'ORDER_COMPLETED', order_id}` без `GET` не дава права: ако `GET /api/orders/{id}` върне `pending` → нищо.
- **R-dedupe** Двойна доставка на `ORDER_COMPLETED` за една поръчка → един `Purchase`/един план/една реферална награда/един имейл. Гардът е условен запис по `revolutOrderId`/`PaymentOrder.state` (CAS), **не** таблица по `event.id` (Revolut не праща id на събитие, `M:7317-7372`). Провал на `GET` или на запис → код, който Revolut **ретрайва** (4xx по `M:7395`; поведението при 5xx се сверява в sandbox, преди да се избере кодът), и reconciler-ът (R14) поема останалото след третия ретрай.

**Сума и поръчки**
- **R7** Сумата на поръчката за план = `intervalPriceCents(plan, interval)`; за продукт = цената в базата след промо кода; стойност от формата се игнорира.
- **R8** `ORDER_COMPLETED`, но `order.amount`/`currency` ≠ записаните в `PaymentOrder` → без права + аларма.
- **R9** Таймаут при `POST /api/orders` → втори опит намира поръчката по `merchant_order_data_reference`, нула дубли.
- **R10** `paidAt` се взима от `payments[]` в състояние `completed`, не от `order.updated_at`.

**Абонаменти на плановете**
- **R11** `active` → PRO/BUSINESS по вариацията; непозната вариация → без промяна + аларма.
- **R12** `cancelled` с `planPaidThrough` в бъдещето → планът остава до тази дата; след нея → FREE (reconciler).
- **R13** `overdue` → гратис до `planPaidThrough + N`; после FREE, без изтриване на домейна (виж R-limits).
- **R14** Reconciler: висяща поръчка, за която webhook не е дошъл, се финализира от `GET` със същия резултат като от webhook-а (същата функция).
- **R15** Смяна на план → `change-plan` с `at_cycle_end`; правата се сменят едва когато новият цикъл е `active`; повторно натискане не създава втора смяна.
- **R16** Двоен абонамент: жив `planRevolutSubscriptionId` или платен FOUNDER → нов checkout отказан (както днес `plan-checkout.ts`).
- **R17** Отказ от дашборда → `cancel` веднъж (повторно = no-op при `cancelled`), без загуба на платения период.
- **R18** FOUNDER: събитие за абонамент никога не сваля FOUNDER.

**Refund и спор**
- **R19** Refund през админа носи `Idempotency-Key = refund-<orderId>-<сума>-<n>`; двойно натискане → един refund.
- **R20** Частичен refund не сваля нищо; натрупани refund-и до пълната сума → FOUNDER отнет, реферал сторниран (P9).
- **R21** Refund поръчка `failed`/`declined` не се брои за обърнато плащане.
- **R22** `DISPUTE_ACTION_REQUIRED` → `GET /api/disputes/{id}` → `needs_response` → обърнато; `DISPUTE_WON` → възстановяване по P6/P9.
- **R23** Спор по абонаментно плащане → действие по решението О-2 (по подразбиране: `cancel`, идемпотентно), записан `planDisputedOrderId`.

**Защитни критерии от прегледа на PR #296 (поправят се в НОВИЯ поток)**
- **R-erase** Изтриване/анонимизиране на акаунт с жив абонамент (`planRevolutSubscriptionId` в състояние, различно от `cancelled`/`finished`) **първо** вика `cancelSubscription` при Revolut (идемпотентно: вече `cancelled` = успех). При провал → грешка и **без** изтриване/анонимизиране. Днес `src/lib/account-erasure.ts:94` нулира само `stripeCustomerId`, без да спре абонамента, и таксуването продължава.
- **R-limits** Платените функции (собствен домейн, скрит бадж, излишни профили) спират **само при окончателно сваляне**: абонаментът е `cancelled`/`finished` след `planPaidThrough`, пълен refund, **загубен** спор (вкл. FOUNDER). При обратими състояния (`overdue` в гратис, отворен спор `needs_response`/`under_review`, `paused`) → само скриване, без изтриване на домейна. Решението остава чиста функция (днес `limitsOnDowngrade`, `src/lib/plan-limits-core.ts:52`, `cause: 'subscription' | 'refund' | 'dispute'`), която трябва да различава отворен от загубен спор. Прилагането е идемпотентно и при ретрай: не зависи от броя обновени редове на предишния CAS (повторно прилагане върху вече свален план дава същото крайно състояние).
- **R-buyer** Достъпът на купувач до платено съдържание (курс/урок, доставка, разписка) се намира по поръчката/покупката (`Purchase`/`Entitlement`/`PaymentOrder`) и **не** зависи от `Profile.published`, slug-а или анонимизиран/свален профил. Поправката за learn/delivery/receipt при скрит профил, която координаторът прави днес в стария код, трябва да се **запази** в новия поток (тестът се пренася 1:1).

**Магазин, ДДС, ключове**
- **R24** `shopSalesAllowed()` е `false`, докато не е избран вариант за магазина (О-1) **и** `VAT_ENGINE_ENABLED=1` (fail-closed, както днес `stripe-tax.ts:16-19`).
- **R25** Купувач от държава X: `Purchase.buyerCountry` = избраната от купувача държава; `issuer_country` на картата се пази като второ доказателство; при разминаване → флаг за Данъчника (правилото е негово).
- **R26** Секретният ключ, webhook тайната и частният ключ за подписване се четат само от env; `secret-scan` е зелен; sandbox и prod ключове не се смесват (prod ключ + sandbox база URL → отказ при старт).
- **R27** Ако избраният вариант е MIT + наш cron (О-3б): преди всяко таксуване се праща предизвестие със сума и дата, след него — разписка; отказът е един клик онлайн (`[PPSA]` §9). Тестът проверява, че таксуване без записано предизвестие е невъзможно.

---

## 4. Решения за собственика (с препоръка)

**О-1. Магазинът на създателите (най-рисковото).** Revolut **няма** Connect: няма onboarding/KYC на продавачи, split или преводи към трети през Merchant API (раздел 1). Договорът на Revolut Bank UAB забранява „to accept or process payments on behalf of anyone else“ (`[PPSA]` §3).
- **(а) Всеки създател ползва СВОЯ акаунт/линк** (собствен Revolut Merchant, revolut.me или payment link). Ние не пипаме парите. Минуси: не можем автоматично да удържим комисиона (8/4%) и да доставим продукта, защото не виждаме плащането (освен ако създателят ни даде свой API ключ, а това е чужда тайна при нас, не го препоръчвам). Платформата престава да е доставчик по чл. 9а. TAX.md и общите условия се пренаписват (Правния + Данъчника).
- **(б) Платформата събира и превежда** (Merchant → наш Business акаунт → `POST /pay` към counterparty на създателя, `B:12946`). Технически възможно. Рискове: (1) пряко противоречи на `[PPSA]` §3, освен ако Revolut не го разреши **писмено** (те имат `industry_data.type: marketplace`, `M:119`, което подсказва, че приемат marketplace търговци, но условията им са неясни → **UNVERIFIED**); (2) PSD2: събиране на пари за трети и превеждането им е платежна услуга (паричен превод), която иска лиценз, освен ако не важи изключението за търговски агент (чл. 3(б) Дир. 2015/2366, агент „on behalf of only the payer or only the payee“). Платформа, която действа и за двете страни, по правило не попада в изключението (съображение 11). Текстът на EUR-Lex днес **не беше достъпен** → **UNVERIFIED**, за Правния Разбирач. Плюс KYC на продавачите, DAC7 и средства на клиенти. Не препоръчвам без юридическо становище и писмо от Revolut.
- **(в) Магазинът временно се изключва** (`shopSalesAllowed() = false`, продуктите остават видими като „скоро“, заварените покупки и достъпи работят по R-buyer).
- **(г) Хибрид: магазинът остава на Stripe Connect, плановете минават на Revolut.** Противоречи на решението „спираме Stripe“, затова е само за сведение.
- **Препоръка: (в) веднага + (а) като „външен линк за плащане“ без комисиона**, докато Правния + Revolut (писмено) не кажат дали (б) е допустимо. Това е единственият вариант без регулаторен риск и без чужди тайни при нас.

**О-2. Спор по абонамент (днес: обратима пауза).** Revolut няма pause API. Варианти: (а) `cancel` при `DISPUTE_ACTION_REQUIRED`, клиентът се абонира наново след `won`; (б) оставяме таксуването и само маркираме. **Препоръка (а)**: не таксуваме оспорващ картодържател; необратимо → собственикът решава.

**О-3. Механизъм на абонаментите.**
- **(а) Revolut Subscriptions API**: 2 плана × 4 вариации (`P1M`, `P3M`, `P6M`, `P1Y`; ISO 8601 допуска `P3M`/`P6M`, но в примерите на `M:13093-13099` ги няма → да се сверят в sandbox), HPP за първото плащане и запазване на картата, `change-plan` в края на цикъла, `cancel`. Минуси: OpenAPI посочва само Production сървър за тези пътища; GA статусът и политиката за повторни опити при `overdue` → **UNVERIFIED**.
- **(б) Запазена карта + наш cron (MIT)**: пълен контрол над dunning и смяна на план, но иска изрично разрешение от Revolut за MIT (`[PPSA]` §9), предизвестие и разписка за всяко таксуване и наш планировчик (още един паричен ръб).
- **Препоръка (а)**, при условие че Revolut потвърди писмено sandbox достъп и GA статус. Иначе (б). Гратисът при `overdue`: **N = 7 дни** (предложение).
- Смяна на план: само в края на цикъла, без proration. Ъпгрейд PRO→BUSINESS веднага → нов абонамент + `cancel` на стария (без refund на остатъка). Това е продуктово решение и минава през Правния (информация преди договора).

**О-4. Заварените Stripe абонати.** Прехвърляне на запазени карти между доставчици: **UNVERIFIED** (изисква PCI процес между Stripe и Revolut). **Препоръка:** Stripe абонаментите се отменят в края на периода (`cancel_at_period_end`), абонатите получават покана да се абонират през Revolut; Stripe webhook-ът и ключовете остават живи само за четене, refund и спорове, докато не изтече и последният платен период и прозорецът за спорове.

**О-5. Реферални изплащания.** Сега са ръчни (`ReferralPayout`). Автоматизация през Business `POST /pay` с `request_id = payout.id` е възможна (`B:18643-18660`). **Препоръка:** остават ръчни (няма нов паричен ръб).

**О-6. Такса обработка.** 1,9% + €0,30 покрива EEA consumer (1% + €0,20), но не и „other cards“ (2,8% + €0,20). Решение: остава или става по-ниска за ЕИП (конкурентно предимство), след сверка на текущата тарифа на Revolut.

---

## 5. Какво се трие (едва след cutover + О-4 прозореца)

| Трие се | Заменя го |
|---|---|
| `src/lib/stripe.ts`, `src/lib/plan-checkout-stripe.ts`, `src/lib/stripe-state.ts` | `revolut.ts`, `revolut-state.ts` |
| `src/lib/stripe-tax.ts` | `src/lib/vat.ts` (интерфейсът `shopSalesAllowed` се пази) |
| `src/lib/payout.ts` (Connect transfers) | нищо (О-1) или Business payouts при (б) |
| Connect onboarding в `src/app/actions/shop.ts:56-67`, `stripe.refunds.create` с `reverse_transfer` (`shop.ts:321-329`, `admin.ts:170-178`) | `refundOrder` с Idempotency-Key |
| `billingPortal` в `src/app/actions/billing.ts:148` | страница „Абонамент“ |
| `src/app/api/stripe/webhook/route.ts` | `src/app/api/revolut/webhook/route.ts`; старият **остава** до края на О-4 |
| npm `stripe`, env `STRIPE_*`, `tools/commerce/stripe-lint.mjs` за linketto | env `REVOLUT_*`; lint правила за Revolut (нужни са: raw body, `GET` след webhook, Idempotency-Key на refund) |
| **НЕ се трие:** Stripe колоните в `User`/`Purchase`/`Referral`/`Entitlement` | история, OSS/Н-18 (10 г.) |
| `src/lib/billing-sync.ts` | **остава** — решенията P1, P4, P6, P9, P10 важат; входните типове стават неутрални към доставчика |

**Env (нови):** `REVOLUT_API_BASE`, `REVOLUT_SECRET_KEY`, `REVOLUT_API_VERSION=2026-08-17`, `REVOLUT_WEBHOOK_SECRETS` (списък, за ротация), `REVOLUT_SIGNING_PRIVATE_KEY` (ако ключът е с подписване), `REVOLUT_PLAN_VAR_<PLAN>_<INTERVAL>` (8 бр.), `REVOLUT_FOUNDER_AMOUNT` не (сумата е от `plans.ts`), `VAT_ENGINE_ENABLED`. Само в секретния store на сървъра (VPS-аджията).

---

## 6. Правен слой (за Правния Разбирач и Данъчника)
- MIT задълженията на Revolut (`[PPSA]` §9: предварително съгласие за сума и честота; условия на абонамента с начало/край, сума, честота; предизвестие преди и разписка след всяко таксуване; лесен онлайн отказ) се припокриват с правото на ЕС и трябва да влязат в текстовете и имейлите.
- Плащащият бутон остава по чл. 8(2) Дир. 2011/83 („Поръчка със задължение за плащане“ или равностоен надпис). За плановете (услуга/SaaS) важат чл. 16(а) + чл. 8(8) + чл. 14(3)/14(4)(а), не чл. 16(м).
- ДДС: Revolut не смята ДДС (`M:8507-8525`). Ставката по държава, OSS и доказателствата за местоположението са на Данъчника. Revolut дава `issuer_country` и (вероятно) `billing_address`.
- PSD2 изключението за търговски агент и забраната в `[PPSA]` §3 → становище преди всяко решение за О-1(б).

Инварианти (за миграцията): сървърна сума — ? предстои (R7, R8) · подпис върху суровото тяло — ? предстои (R1–R5; формулата е „Вероятно“) · `payment_status` → при Revolut `order.state === 'completed'` след `GET` — ? предстои (R6, R10) · идемпотентност по `event.id` — ✗ невъзможна при Revolut (няма id на събитие), заместена с CAS по бизнес ключ — ? предстои (R-dedupe, R9, R19) · права само през webhook/reconciler след `GET` — ? предстои (R6, R14).

Това не е правен съвет.

---

## 7. Решения на собственика (14.11.2026) — ЗАДЪЛЖИТЕЛНИ, заменят препоръките в раздел 4

1. **О-1 Магазин → (в) + (а):** продажбите ПРЕЗ Linketto спират. Създателят може да сложи СВОЙ линк за плащане
   към продукт (собствен Revolut, revolut.me, PayPal…). Linketto не пипа парите, не взима комисиона и не доставя
   (чл. 9а: не разрешаваме таксуването, не доставяме, условията не са наши — за потвърждение от консултанта).
2. **О-3 Абонаменти → предплатени периоди:** планът се плаща еднократно за 1/3/6/12 месеца (отстъпка 0/10/15/20%
   от `BILLING_INTERVALS`) или FOUNDER завинаги. Без автоматично таксуване, без MIT, без dunning, без пауза. Преди
   изтичане Brevo праща напомняне с линк за подновяване. **О-2** отпада (няма абонамент, който да се спира).
3. **О-4:** Linketto не е пуснат, няма платили потребители → Stripe се маха изцяло, без преходен период. Колоните
   в базата остават (адитивно — миграция за почистване по-късно, след потвърждение).
4. **Имейл:** Brevo (вече направено, `src/lib/email.ts`).

### 7.1 Критерии за приемане — предплатени планове (P1…; тестове първо)
- **P1 (цена):** сумата идва САМО от `plans.ts` (`intervalPriceCents` / FOUNDER `priceCents`); клиентът подава
  план и период, никога сума. Цените са с ДДС.
- **P2 (поръчка):** checkout създава `PlanOrder(pending)` ПРЕДИ поръчката при Revolut; `merchant_order_data.reference`
  = `PlanOrder.id`; при провал на Revolut → `failed`, без пренасочване. `expire_pending_after` = `PT1H`.
- **P3 (подпис):** уебхукът проверява `Revolut-Signature` = `v1=` + HMAC-SHA256 hex на `v1.{timestamp}.{сурово тяло}`
  с `REVOLUT_WEBHOOK_SECRET`; приема всеки от няколко подписа (ротация); отказва при разлика във времето > 5 мин.
  Сравнение с `timingSafeEqual`. Без тайна → 503.
- **P4 (истината е API-то):** уебхукът носи само `event` + `order_id` → поръчката се чете с `GET /api/orders/{id}`;
  правото се дава само при `state === 'completed'`, `amount` и `currency` = записаните в `PlanOrder`.
- **P5 (идемпотентност):** преходът `pending → completed` е условен запис (CAS); повторно събитие или reconciler
  не удължава плана втори път. Уебхук при вътрешна грешка → 4XX (Revolut ретрайва само при 4XX/таймаут).
- **P6 (удължаване):** същият план → от `max(сега, изтичане)` + периода; ъпгрейд PRO→BUSINESS → от сега + периода +
  остатъкът от стария, преизчислен по месечната цена; даунгрейд докато тече платен период → отказ при checkout;
  FOUNDER → без изтичане и не купува PRO/BUSINESS.
- **P7 (изтичане):** cron сваля изтеклите PRO/BUSINESS на FREE и прилага `applyPlanLimits` (R-limits: окончателно).
- **P8 (напомняния):** 7 дни и 1 ден преди изтичане — по едно писмо на етап (без дубли), с линк за подновяване.
- **P9 (reconciler):** cron проверява `pending` поръчки на възраст 15 мин – 3 дни през API и прилага P4/P5.
- **P10 (refund):** само админ; `POST /api/orders/{id}/refund` с `Idempotency-Key` = `PlanOrder.id`; при пълен
  refund планът се сваля (окончателно) и рефералният бонус се сторнира.
- **P11 (ДДС):** под прага €10 000 трансгранични B2C продажби за текущата и предходната година → ДДС на България
  20% (чл. 20б ЗДДС); над прага → ставка по държавата на купувача; таблицата на ставките НЕ е проверена →
  **fail closed** (checkout отказва), докато не се попълни от TEDB с дата. Пазим `buyerCountry` (адрес за
  таксуване) и `cardCountry` (държава на картата) — две доказателства.
- **P12 (реферал):** бонус {percent}% само за първата завършена поръчка на поканения, веднъж.
- **P13 (магазин):** продукт без `externalUrl` не се показва; с `externalUrl` (само https) бутонът води навън с
  `rel="nofollow noopener noreferrer"` и бележка, че плащането е при създателя. Купените по-рано (няма) пазят R-buyer.
