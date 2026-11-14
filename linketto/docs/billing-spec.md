# linketto: план, refund/спор и реферал — спецификация

> Легендата на тестовете в `src/lib/__tests__/billing-sync.test.ts`. Писана тест-първо (02.11.2026):
> Продавача (спец) → Изпитателя (падащи тестове) → Продавача (код) → Кодаджията (3 кръга ревю).
>
> **Кодове** (всеки код значи едно нещо):
> - `D0`–`D3` — **дефекти** (раздел 0); `L` — базовата линия на stripe-lint. Не са тестове.
> - Тестове: `C` класификация · `P` цени · `S0`/`U` абонамент → план · `R` обърнато плащане (P5) ·
>   `F` FOUNDER · `G` предоставяне от checkout · `RF` реферал · `X` таксуване при спор (pause/resume) ·
>   **`A` спор по плановия абонамент** (FREE и обратно, ред на стъпките, resync) · `L` осиновяване ·
>   `B` backfill · `H` дискриминатор на hold-а · **`W` предупреждения** за ръчно наблюдение
>   (`W1` втори спор, `W2` FOUNDER-следа) · `O-1` решение на собственика.
>   `RR1` преобразуване на причината от базата (`toReversalReason`; ревю 4 — оцелял мутант).
> - Преименуване (tidy, 02.11.2026): тестовете за спор по абонамента `D1`–`D12` → `A1`–`A12` (сблъсък с
>   дефектите `D1`–`D3`); предупрежденията `R4`/`R5` от 9.4 → `W1`/`W2` (сблъсък с `R4`/`R5` от 4.3).
>   Очакванията не са сменени.

Автор: Продавача · 2026-11-02 · само спецификация, кодът не е пипан.
Обхват: `linketto/src/app/api/stripe/webhook/route.ts` + нов `linketto/src/lib/billing-sync.ts` + адитивна миграция.
Stripe API: пиннато `2025-02-24.acacia` (`src/lib/stripe.ts:14`), `stripe@^17.5.0` (`package.json:46`).

## 0. Потвърдено състояние (ф:р)

| # | Дефект | Доказателство |
|---|---|---|
| D1 | Пълен refund/спор на плащане за план не сваля плана. FOUNDER остава доживотно | `route.ts:279-338` пипа само `Purchase`/`Entitlement`. Плановият клон `route.ts:185-203` не пише нищо, по което после да се открие PaymentIntent-ът |
| D2 | `subscription.updated` не синхронизира `User.plan` | `route.ts:365-384` пипа само `Entitlement`. До FREE сваля само `deleted` (`route.ts:392-395`), и то **по `stripeCustomerId`, без да сверява `sub.id`** |
| D3 | Реферният кредит не се сторнира | `route.ts:31-44` прави increment, но `Referral` (`schema.prisma:58-68`) не пази плащането, което го е породило, и няма поле за сторно |
| D0 | (свързано) Класификацията план/магазин зависи от **липсата** на `userId` | Магазинът също носи `metadata.plan` (плана на продавача за комисионата, `shop.ts:199`). Планов checkout има `userId`+`plan` (`billing.ts:81`) |
| L | Базова линия на `stripe-lint`: 14 HIGH `webhook-swallowed-error` | `node tools/commerce/stripe-lint.mjs …/route.ts`: `.catch(() => undefined)` на :92,145,202,255,268,295,297,313,332,335,351,382,402. **Новият код не добавя нито един.** |

Бележка: паметта ми (2026-10-27) споменаваше `applyPlanLimits` в `deleted`. В днешния код го няма (`route.ts:385-404`, Grep `applyPlanLimits` в `src/` дава 0 съвпадения). Сваляне на плана значи само смяна на `User.plan`, както досега.

## 1. Решения по политиката (с източник)

**P1. Плановият абонамент е източникът на истината за PRO/BUSINESS. Синхронизираме по състояние, не по събитие.**
При всяко `customer.subscription.*` webhook-ът **взима абонамента наново** (`subscriptions.retrieve`) и прилага чиста функция върху актуалния snapshot. Така редът и повторенията нямат значение (level-triggered).
Източник: „Stripe doesn't guarantee the delivery of events in the order… You can also use the API to retrieve any missing objects“ (https://docs.stripe.com/webhooks#event-ordering). „Webhook endpoints might occasionally receive the same event more than once“ (https://docs.stripe.com/webhooks#handle-duplicate-events). Сигурно.

**P2. Кои статуси дават план.** `active`, `trialing` дават план. `past_due` също дава, като гратисен период по време на Smart Retries. `unpaid`, `paused`, `canceled`, `incomplete`, `incomplete_expired` не дават. Непознат статус също не дава (fail-closed).
Източник: таблицата Subscription statuses (https://docs.stripe.com/billing/subscriptions/overview#subscription-statuses). Цитати: `unpaid`: „Revoke access to your product when the subscription is `unpaid`“; `trialing`: „you can safely provision“; `past_due`: „Stripe might retry payment while the subscription is `past_due`“; `paused`: „Invoices are no longer created“. Гратисът за `past_due` е ограничен, защото dunning-ът завършва с cancel (`DEPLOY.md:100`). Сигурно за статусите. Гратисът е продуктово решение (O-2).

**P3. Смяна през Customer Portal = нова цена в същия абонамент → `customer.subscription.updated`.** Планът се извежда от `items.data[].price.id` през карта от env (`STRIPE_PRICE_<PLAN>_<INTERVAL>` от `plans.ts:130-135` + заварените `STRIPE_PRICE_PRO`/`STRIPE_PRICE_BUSINESS` от `plans.ts:49,59`). Непозната цена означава без промяна и аларма в лога. Не сваляме плащащ клиент заради грешка в конфигурацията.
Източник: порталът позволява „Update subscriptions; Cancel subscriptions immediately or at the end of the current billing period“ (https://docs.stripe.com/customer-management#features). Отказ „в края на периода“ оставя статуса `active` до края, после идва `deleted`/`canceled`. Вероятно (точното име на полето `cancel_at_period_end` не е цитирано от тази страница; логиката ни не зависи от него).

**P4. Без смесване: плащане се свързва с план само по наш записан ключ, никога по customer.**
- FOUNDER: `User.planPaymentIntentId == pi` (ново поле).
- PRO/BUSINESS: `User.planSubscriptionId == sub.id` (ново поле).
- Магазин: `Purchase.stripePaymentIntentId` (`schema.prisma:356`) и `Entitlement.stripeSubscriptionId` (`schema.prisma:304`).
- Реферал: `Referral.stripePaymentIntentId == pi` (ново поле).

Refund на покупка в магазина носи PI на покупката, а той никога не е равен на `planPaymentIntentId` на продавача. Затова планът на продавача не може да бъде засегнат. Членство в магазина създава **нов** Stripe Customer (`shop.ts:149-171` не подава `customer`), а цената му е `price_data`, тоест не е в картата на плановете. Това е двойна защита и при заварения fallback по customer.
Класификацията на checkout става явна: `metadata.kind = 'plan' | 'shop'` (`billing.ts:81`, `shop.ts:132-139`). Сесиите без `kind` (заварени) се класифицират по досегашното правило.

**P5. Какво е „обърнато плащане“ (reversal).** Решението се взима от актуалното състояние на плащането, не от payload-а:
- **пълен refund**: `amount_refunded >= amount` (натрупано, тоест и няколко частични, които стигат пълната сума). Частичен refund не сваля нищо (както `route.ts:286-289`).
- **спор**: има поне един спор със статус `needs_response`, `under_review`, `appeal_needs_response`, `appeal_under_review` или `lost`. **Не** се брои: `warning_needs_response`, `warning_under_review`, `warning_closed` (inquiry, без изтеглени пари), `won`, `prevented`. Непознат статус се брои за обърнато (fail-closed).

Източник: refund-ите са кумулативни, „You can issue more than one refund against a charge, but you can't refund a total greater than the original charge amount“ (https://docs.stripe.com/refunds#issue-refunds). Inquiry не е chargeback: „Some card networks initiate a preliminary phase before creating a formal dispute… an inquiry“, статусите `warning_*`. При chargeback „The card network pulls the funds“ (https://docs.stripe.com/disputes/how-disputes-work#inquiries). Пълният enum, вкл. `appeal_*` и `prevented`: https://docs.stripe.com/api/disputes/object. Възможни са няколко спора на едно плащане („Receive multiple disputes“, същата страница). Има и „late win“ (`lost` → `won`). Сигурно.
Live данни: `paymentIntents.retrieve(pi, {expand:['latest_charge']})` + `disputes.list({ payment_intent: pi })`. Филтърът `payment_intent` съществува: https://docs.stripe.com/api/disputes/list. Сигурно.

**P6. FOUNDER.** Отнема се **само** при обърнато плащане на **самото** FOUNDER плащане (P5): `plan → FREE`, `planRevokedAt`, `planRevokedReason = 'refund'|'dispute'`. Събитие за абонамент **никога** не пипа FOUNDER (`CLAUDE.md`: „Founder не се отнема при изтекъл абонамент“; `route.ts:391`). Inquiry не отнема.
**Възстановяване при спечелен спор** (`won` / late win): ако `plan == FREE` и `planRevokedReason == 'dispute'` за същия PI, се връща FOUNDER. Ако междувременно е купил друг план, само се маркира (flag) за админа. Refund е краен: refund, който по-късно се провали (`refund.failed`), **не** връща плана автоматично. Това е ръчно решение, защото поведението на `amount_refunded` при провален refund не е потвърдено в документацията (Несигурно, затова не разчитаме на него).

**P7. Refund на плащане за PRO/BUSINESS абонамент не сваля плана.** Статусът на абонамента решава (P1). Админ, който иска „върни парите и спри“, отменя абонамента в Dashboard. Идва `deleted`, после FREE. Refund само на пари е съзнателен жест (напр. двойно плащане).
Източник: refund-ът е операция върху Charge/PaymentIntent (https://docs.stripe.com/refunds#issue-refunds). Отмяната е отделна операция (https://docs.stripe.com/billing/subscriptions/overview#cancel-the-subscription). Вероятно (документацията не казва изрично „refund не отменя абонамента“, но двете са отделни API).

**P8. Спор (chargeback) върху плащане за PRO/BUSINESS абонамент: отменяме абонамента веднага** (`subscriptions.cancel`, `Idempotency-Key: plan-dispute-cancel-<sub.id>`, само ако статусът не е вече `canceled`). После синхронизацията по P1 сваля до FREE. Причината: не продължаваме да таксуваме картодържател, който оспорва. Inquiry не отменя. Спечелен спор **не** възстановява отменен абонамент, защото `canceled` е краен статус („This is a terminal state that can't be updated“, overview#subscription-statuses). Клиентът се абонира наново. **Решение за собственика (O-1), защото е необратимо.**

**P9. Реферал.** Сторнира се, когато плащането, **породило** наградата (`Referral.stripePaymentIntentId`), стане обърнато по P5. Плащане по подновяване на абонамента не пипа реферала.
- Записът се маркира, без да се трие: `reversedAt`, `reversalReason`, `clawbackPayoutId`. Следата остава.
- `referralCreditCents` на реферера се намалява с **записаната** `rewardCents`, а не с преизчислена сума. Това важи и ако `REFERRAL_PERCENT` се е сменил междувременно.
- **Вече изплатен кредит:** `requestPayoutAction` снапшотва целия баланс и го нулира (`actions/referral.ts:60-79`). Значи наградата е влязла в **първото** `ReferralPayout` с `requestedAt >= referral.createdAt`. Той се записва в `clawbackPayoutId` за одит. Балансът **може да стане отрицателен**, тоест дълг, който се приспада от бъдещи награди. `canWithdraw` вече връща false под прага (`referral.ts:21-23`), значи отрицателният баланс не може да се тегли. Плащането не се редактира: един механизъм, без двойно приспадане, без мълчалива загуба.
- Спечелен спор връща наградата (CAS обратно + increment). Refund е краен (P6).
- Нова награда за същия поканен след сторно не се дава. `Referral` е уникален по `referredUserId` (`schema.prisma:62`). Мярка срещу злоупотреба „купи → refund → купи“ (O-4).

**P10. Идемпотентност по бизнес ключ.** Не въвеждаме таблица за `event.id`: всяко действие е условен UPDATE (CAS) по състояние, ключиран по `pi` / `sub.id` / `referral.id`, по образеца на `actions/referral.ts:70-76`. Повторено събитие дава `count 0` и нищо не се случва. Сторното на реферала и промяната на баланса са в **една** `$transaction`.

**P11. Грешки.** Провален live retrieve или запис в БД връща **500**, за да ретрайне Stripe („up to three days“, https://docs.stripe.com/webhooks#automatic-retries). Новите пътища не гълтат грешки. `rewardReferrer` гълта **само** `P2002` (unique), не всичко (днес `route.ts:202`).

## 2. Миграция: да, адитивна

`prisma/migrations/20261102120000_plan_payment_links/migration.sql`. Всички полета са nullable, без default и без промяна на съществуващи редове:

```sql
ALTER TABLE "User"
  ADD COLUMN "planPaymentIntentId" TEXT,
  ADD COLUMN "planSubscriptionId"  TEXT,
  ADD COLUMN "planRevokedAt"       TIMESTAMP(3),
  ADD COLUMN "planRevokedReason"   TEXT;
CREATE UNIQUE INDEX "User_planPaymentIntentId_key" ON "User"("planPaymentIntentId");
CREATE UNIQUE INDEX "User_planSubscriptionId_key"  ON "User"("planSubscriptionId");

ALTER TABLE "Referral"
  ADD COLUMN "stripePaymentIntentId" TEXT,
  ADD COLUMN "reversedAt"            TIMESTAMP(3),
  ADD COLUMN "reversalReason"        TEXT,
  ADD COLUMN "clawbackPayoutId"      TEXT;
CREATE UNIQUE INDEX "Referral_stripePaymentIntentId_key" ON "Referral"("stripePaymentIntentId");
```
Схема: `User` (`schema.prisma:21-42`) и `Referral` (`schema.prisma:58-68`) получават съответните `String? @unique` / `DateTime?` / `String?`. `clawbackPayoutId` е обикновен `String?` без релация: одитна следа, която не каскадира. В Postgres unique върху nullable допуска много NULL-и.
Ред: бекъп, после `prisma migrate deploy` (skill `prisma-migrate`). **Backfill** на заварените редове е отделен идемпотентен скрипт `scripts/backfill-plan-links.ts`, по подразбиране `--dry-run`:
- FOUNDER: `checkout.sessions.list({ customer })` с `metadata.userId == user.id && metadata.plan == 'FOUNDER'`, от там `payment_intent`.
- PRO/BUSINESS: `subscriptions.list({ customer, status:'all' })` с цена в картата.
- Реферал: първата планова сесия на поканения дава PI.

Филтрите `customer`/`payment_intent`/`subscription` съществуват: https://docs.stripe.com/api/checkout/sessions/list.
Дали има заварени платени потребители на живо: **за проверка** (решава колко е спешен backfill-ът). Без backfill заварен FOUNDER/реферал не се разпознава при refund. Абонаментите се „осиновяват“ автоматично (U9).

## 3. Чисти функции: `src/lib/billing-sync.ts`

Без импорт на `stripe`/`prisma`. Входът е нормализиран snapshot, изходът е решение. Тестове: `src/lib/__tests__/billing-sync.test.ts` (`npm test`, `package.json:31`).

```ts
import type { PlanId } from './plans';

export type PaidPlanId = Exclude<PlanId, 'FREE'>;
export type SubscriptionPlanId = Exclude<PlanId, 'FREE' | 'FOUNDER'>; // PRO | BUSINESS

// ── Класификация на checkout ────────────────────────────────────────
export type CheckoutKind =
  | { kind: 'plan'; userId: string; plan: PaidPlanId }
  | { kind: 'shop'; productId: string; profileId: string }
  | { kind: 'ignore'; reason: 'no-metadata' | 'ambiguous' | 'unknown-plan' };
export function classifyCheckout(
  metadata: Readonly<Record<string, string>> | null | undefined,
): CheckoutKind;

// ── Цена → план (env е параметър, не process.env) ───────────────────
/** Хвърля Error при една и съща цена за два плана (грешна конфигурация). FOUNDER не влиза. */
export function buildPlanPriceMap(
  env: Readonly<Record<string, string | undefined>>,
): ReadonlyMap<string, SubscriptionPlanId>;
/** Точно един план сред позициите → той; нула или различни планове → null. */
export function planForPriceIds(
  priceIds: readonly string[],
  map: ReadonlyMap<string, SubscriptionPlanId>,
): SubscriptionPlanId | null;

// ── Статус → право ──────────────────────────────────────────────────
export function subscriptionGrantsPlan(status: string): boolean;

// ── Снимки ───────────────────────────────────────────────────────────
export interface PlanUserSnapshot {
  id: string;
  plan: PlanId;
  stripeCustomerId: string | null;
  planSubscriptionId: string | null;
  planPaymentIntentId: string | null;
  planRevokedReason: 'refund' | 'dispute' | null;
}
export interface SubscriptionSnapshot {
  id: string;
  customerId: string;
  status: string;            // актуален, от subscriptions.retrieve
  priceIds: readonly string[];
}
export interface ChargeSnapshot {
  amountCents: number;          // цели центове
  amountRefundedCents: number;  // натрупано
}

// ── Синхронизация на абонамент → User.plan (D2) ─────────────────────
export type PlanSyncDecision =
  | { action: 'noop'; reason: 'no-user' | 'founder' | 'not-plan-subscription' | 'unknown-price' | 'unchanged' }
  | { action: 'set'; plan: PlanId; adoptSubscriptionId: string | null };
export function decideSubscriptionSync(
  user: PlanUserSnapshot | null,
  sub: SubscriptionSnapshot,
  priceMap: ReadonlyMap<string, SubscriptionPlanId>,
): PlanSyncDecision;

// ── Обърнато ли е плащането (P5) ─────────────────────────────────────
export type PaymentReversal =
  | { reversed: false }
  | { reversed: true; reason: 'refund' | 'dispute' };
export function paymentReversal(
  charge: ChargeSnapshot,
  disputeStatuses: readonly string[],
): PaymentReversal;

// ── FOUNDER (D1) ─────────────────────────────────────────────────────
export type FounderDecision =
  | { action: 'noop'; reason: 'not-founder-payment' | 'unchanged' | 'refund-terminal' }
  | { action: 'revoke'; reason: 'refund' | 'dispute' }
  | { action: 'restore' }
  | { action: 'flag'; reason: 'restore-blocked-plan-changed' };
export function decideFounderPayment(
  user: PlanUserSnapshot | null,
  paymentIntentId: string,
  reversal: PaymentReversal,
): FounderDecision;

// ── Спор върху плащане по плановия абонамент (P8) ───────────────────
export function shouldCancelPlanSubscription(
  user: PlanUserSnapshot | null,
  subscriptionIdOfPayment: string | null,
  reversal: PaymentReversal,
  subscriptionStatus: string,
): boolean; // true само при reason 'dispute' + съвпадащ sub + статус != canceled + plan != FOUNDER

// ── Предоставяне от checkout (защита срещу закъсняло/повторено) ────────
export type CheckoutPlanDecision =
  | { action: 'grant'; plan: PaidPlanId; link: { paymentIntentId: string } | { subscriptionId: string } }
  | { action: 'skip'; reason: 'not-paid' | 'mode-mismatch' | 'missing-link'
      | 'payment-reversed' | 'subscription-not-granting' | 'already-founder' };
export function decideCheckoutPlanGrant(input: {
  plan: PaidPlanId;
  mode: 'payment' | 'subscription' | 'setup';
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  paymentIntentId: string | null;
  subscriptionId: string | null;
  reversal: PaymentReversal | null;        // live, за mode 'payment'
  subscriptionStatus: string | null;        // live, за mode 'subscription'
  currentPlan: PlanId;
}): CheckoutPlanDecision;

// ── Реферал (D3) ─────────────────────────────────────────────────────
export interface ReferralSnapshot {
  id: string;
  referrerId: string;
  rewardCents: number;
  createdAt: Date;
  stripePaymentIntentId: string | null;
  reversedAt: Date | null;
  reversalReason: 'refund' | 'dispute' | null;
}
export interface PayoutSnapshot {
  id: string;
  requestedAt: Date;
  status: 'pending' | 'paid';
}
export type ReferralDecision =
  | { action: 'noop'; reason: 'not-referral-payment' | 'unchanged' | 'refund-terminal' }
  | { action: 'reverse'; reason: 'refund' | 'dispute'; decrementCents: number;
      clawbackPayoutId: string | null; clawbackPayoutStatus: 'pending' | 'paid' | null }
  | { action: 'restore'; incrementCents: number };
export function decideReferralReversal(
  referral: ReferralSnapshot | null,
  paymentIntentId: string,
  reversal: PaymentReversal,
  payoutsOfReferrer: readonly PayoutSnapshot[],
): ReferralDecision;

// ── Чисти „reducer“-и: за тестове на идемпотентност и ред ────────────
export function applyPlanSync(user: PlanUserSnapshot, d: PlanSyncDecision): PlanUserSnapshot;
export function applyFounderDecision(user: PlanUserSnapshot, d: FounderDecision): PlanUserSnapshot;
export function applyReferralDecision(
  state: { referral: ReferralSnapshot; balanceCents: number },
  d: ReferralDecision,
  now: Date,
): { referral: ReferralSnapshot; balanceCents: number };
```

Правила вътре (нормативни за имплементацията):
- `decideSubscriptionSync`:
  - Ако `user.plan === 'FOUNDER'`, връща `noop founder`.
  - Ако `user.planSubscriptionId` не е null и е различен от `sub.id`, връща `noop not-plan-subscription`.
  - Ако `planSubscriptionId == null`, осиновяване е позволено само при `user.stripeCustomerId === sub.customerId` **и** `planForPriceIds ≠ null` (иначе `not-plan-subscription`).
  - Ако статусът дава план и цената е непозната, връща `noop unknown-price`.
  - Ако статусът дава план, целевият план е `planForPriceIds`, иначе е `FREE`. Еднакъв с текущия план и без осиновяване означава `noop unchanged`. Осиновяването винаги връща `set` с `adoptSubscriptionId = sub.id`.
  - При сваляне `planSubscriptionId` **не** се чисти: така `unpaid → active` (платена фактура) връща плана.
- `paymentReversal`: при `amountCents <= 0` връща `{reversed:false}`. Refund е с предимство пред спор в `reason`.
- `decideFounderPayment`:
  - `user?.planPaymentIntentId !== paymentIntentId` дава `not-founder-payment`.
  - Обърнато плащане и `plan==='FOUNDER'` дава `revoke`. Обърнато, но вече FREE, дава `unchanged`.
  - Необърнато, `planRevokedReason==='dispute'` и `plan==='FREE'` дава `restore`. При друг план дава `flag`.
  - Необърнато и `planRevokedReason==='refund'` дава `refund-terminal`.
- `decideCheckoutPlanGrant`:
  - FOUNDER изисква `mode 'payment'`, PRO/BUSINESS изискват `'subscription'`.
  - При `payment` се изисква `paymentStatus === 'paid'`. При `subscription` се приема `'paid' | 'no_payment_required'`, но **само** ако `subscriptionGrantsPlan(live статус)`.
  - `currentPlan === 'FOUNDER'` и не-FOUNDER покупка дава `already-founder`.
- `decideReferralReversal`:
  - `clawbackPayoutId` е **най-ранният** payout с `requestedAt >= createdAt`.
  - `decrementCents === referral.rewardCents`.
  - Обърнато и вече сторнирано дава `unchanged`. Необърнато и `reversalReason==='dispute'` дава `restore`. Необърнато и `'refund'` дава `refund-terminal`.

## 4. Критерии за приемане (бъдещите падащи тестове)

Обозначения: `U(plan, sub, pi, revoked)` = PlanUserSnapshot (`id:'u1'`, `stripeCustomerId:'cus_1'`); `S(id, status, prices)`; `C(amount, refunded)`; цени в env: `STRIPE_PRICE_PRO_MONTHLY=price_pro_m`, `STRIPE_PRICE_BUSINESS_ANNUAL=price_bus_y`, `STRIPE_PRICE_PRO=price_pro_legacy`.

### 4.1 Класификация и цени
| ID | Дадено | Събитие / вход | Очакван резултат |
|---|---|---|---|
| C1 | `{kind:'plan', userId:'u1', plan:'FOUNDER'}` | classifyCheckout | `plan`, FOUNDER |
| C2 | магазин `{productId, profileId, plan:'PRO'}` без userId | classifyCheckout | `shop`, **не** `plan` (plan е таксата на продавача) |
| C3 | заварен `{userId:'u1', plan:'PRO'}` без kind | classifyCheckout | `plan`, PRO |
| C4 | `{userId, plan:'PRO', productId, profileId}` без kind | classifyCheckout | `ignore ambiguous` |
| C5 | `{kind:'plan', userId, plan:'FREE'}` / `plan:'XYZ'` | classifyCheckout | `ignore unknown-plan` |
| C6 | `null` / `{}` | classifyCheckout | `ignore no-metadata` |
| P1 | env по-горе | buildPlanPriceMap | `price_pro_m→PRO`, `price_bus_y→BUSINESS`, `price_pro_legacy→PRO`; `STRIPE_PRICE_FOUNDER` липсва в картата |
| P2 | една цена в `…PRO_MONTHLY` и `…BUSINESS_MONTHLY` | buildPlanPriceMap | хвърля Error |
| P3 | `['price_x']` | planForPriceIds | `null` |
| P4 | `['price_pro_m','price_bus_y']` | planForPriceIds | `null` (различни планове) |
| P5 | `['price_bus_y']` | planForPriceIds | `BUSINESS` |

### 4.2 Абонамент → план (D2)
| ID | Дадено | Събитие (live snapshot) | Очакван резултат |
|---|---|---|---|
| S0 | статуси | subscriptionGrantsPlan | true за `active`,`trialing`,`past_due`; false за `incomplete`,`incomplete_expired`,`unpaid`,`paused`,`canceled`,`'foo'` |
| U1 | `U(PRO, sub_1)` | updated, `S(sub_1, active, [price_pro_m])` | `noop unchanged` |
| U2 | `U(PRO, sub_1)` | updated (Portal смяна), `S(sub_1, active, [price_bus_y])` | `set BUSINESS` |
| U3 | `U(PRO, sub_1)` | updated, `S(sub_1, unpaid, …)` | `set FREE`; `planSubscriptionId` остава `sub_1` |
| U4 | `U(PRO, sub_1)` | updated, `S(sub_1, paused, …)` | `set FREE` |
| U5 | `U(PRO, sub_1)` | updated, `S(sub_1, past_due, …)` | `noop unchanged` (гратис) |
| U6 | `U(FREE, sub_1)` след U3 | updated, `S(sub_1, active, [price_pro_m])` (платена фактура) | `set PRO` |
| U7 | `U(FOUNDER, null)` | **deleted**, `S(sub_old, canceled, [price_pro_m])`, customer `cus_1` | `noop founder` |
| U7b | `U(FOUNDER, sub_old)` | deleted, `S(sub_old, canceled)` | `noop founder` |
| U8 | `U(PRO, sub_2)` | deleted, `S(sub_1, canceled)` (стар абонамент) | `noop not-plan-subscription` (днес `route.ts:392` би свалил до FREE) |
| U9 | заварен `U(PRO, null)` | updated, `S(sub_1, active, [price_pro_legacy])`, `cus_1` | `set PRO, adoptSubscriptionId:'sub_1'` (осиновяването винаги е `set`, дори при същия план) |
| U10 | заварен `U(PRO, null)` | `S(sub_9, canceled)`, customer `cus_OTHER` | `noop not-plan-subscription` |
| U11 | заварен `U(BUSINESS, null)` | членство в магазина `S(sub_m, canceled, ['price_adhoc'])`, същият customer | `noop not-plan-subscription` (цената не е в картата) |
| U12 | `U(PRO, sub_1)` | `S(sub_1, active, ['price_x'])` | `noop unknown-price` (без сваляне) |
| U13 | `user = null` | всяко | `noop no-user` |
| U14 **обратен ред** | `U(PRO, sub_1)` | събития `deleted` после закъсняло `updated(active)`. И двете четат live `S(sub_1, canceled)` | след `applyPlanSync` два пъти и в двата реда: `plan = FREE` |
| U15 **повторение** | `U(PRO, sub_1)` | едно и също `S(sub_1, unpaid)` ×2 | първо `set FREE`, после `noop unchanged`; крайно състояние еднакво |

### 4.3 Обърнато плащане (P5)
| ID | Дадено | Вход | Очакван резултат |
|---|---|---|---|
| R1 | `C(4900, 4900)`, `[]` | paymentReversal | `reversed refund` |
| R2 **частичен** | `C(4900, 1000)`, `[]` | | `{reversed:false}` |
| R3 | `C(4900, 4900)` след два частични (2000+2900) | | `reversed refund` |
| R4 | `C(4900, 0)`, `['needs_response']` | | `reversed dispute` |
| R5 | `['warning_needs_response']` / `['warning_under_review']` / `['warning_closed']` | | `{reversed:false}` (inquiry) |
| R6 | `['won']` / `['prevented']` | | `{reversed:false}` |
| R7 | `['lost']` / `['under_review']` / `['appeal_needs_response']` / `['appeal_under_review']` | | `reversed dispute` |
| R8 | `['won','needs_response']` (няколко спора) | | `reversed dispute` |
| R9 | `['brand_new_status']` | | `reversed dispute` (fail-closed) |
| R10 | `C(0, 0)` | | `{reversed:false}` |
| R11 | `C(4900, 4900)`, `['needs_response']` | | `reversed refund` (refund с предимство) |

### 4.4 FOUNDER (D1)
| ID | Дадено | Събитие | Очакван резултат |
|---|---|---|---|
| F1 | `U(FOUNDER, pi:'pi_F')` | `charge.refunded` pi_F, R1 | `revoke refund`; apply: `plan FREE, planRevokedReason 'refund'` |
| F2 **частичен** | `U(FOUNDER, pi_F)` | refunded pi_F, R2 | `noop unchanged`; остава FOUNDER |
| F3 **повторение** | състояние след F1 | същото събитие пак | `noop unchanged` |
| F4 **refund в магазина при продавач с план** | `U(FOUNDER, pi_F)` (продавач) | refunded **pi_S** (покупка), R1 | `noop not-founder-payment`; остава FOUNDER |
| F4b | същият, `U(PRO, sub_1)` | refunded pi_S | `decideFounderPayment` → `not-founder-payment`; `decideSubscriptionSync` не се вика за pi |
| F5 | `user = null` | refunded pi_X | `noop not-founder-payment` |
| F6 | `U(FOUNDER, pi_F)` | `dispute.created` `needs_response` | `revoke dispute` |
| F7 | след F6 | `dispute.closed` live `['won']` | `restore`; apply: FOUNDER, `planRevokedReason null` |
| F8 | след F6, после купил PRO: `U(PRO, sub_1, pi_F, 'dispute')` | won | `flag restore-blocked-plan-changed`; плана не се пипа |
| F9 | след F1 | live `C(4900, 0)` (refund провален) | `noop refund-terminal` |
| F10 | `U(FOUNDER, pi_F)` | inquiry `warning_needs_response` | `noop unchanged` |
| F11 **FOUNDER при deleted** | виж U7/U7b | | `noop founder` |
| F12 **обратен ред** | checkout за FOUNDER **закъснява** след refund | `decideCheckoutPlanGrant(FOUNDER, payment, paid, pi_F, reversal = R1)` | `skip payment-reversed` (плана не се дава отново) |

### 4.5 Предоставяне от checkout
| ID | Вход | Очакван резултат |
|---|---|---|
| G1 | FOUNDER, payment, paid, pi_F, `{reversed:false}`, FREE | `grant FOUNDER link {paymentIntentId:'pi_F'}` |
| G2 | PRO, subscription, paid, sub_1, live `active`, FREE | `grant PRO link {subscriptionId:'sub_1'}` |
| G3 | PRO, subscription, paid, sub_1, live `canceled` (закъсняло събитие) | `skip subscription-not-granting` |
| G4 | FOUNDER, payment, `unpaid` | `skip not-paid` |
| G5 | FOUNDER, `subscription` | `skip mode-mismatch` |
| G6 | FOUNDER, payment, paid, `paymentIntentId:null` | `skip missing-link` |
| G7 | PRO, subscription, paid, active, `currentPlan FOUNDER` | `skip already-founder` |
| G8 | PRO, subscription, `no_payment_required`, live `trialing` | `grant PRO` |

### 4.6 Реферал (D3), награда 735 ¢ = 15% от 4900 (`referral.ts:9,15-18`)
| ID | Дадено | Събитие | Очакван резултат |
|---|---|---|---|
| RF1 | Referral `pi_R`, created T0, баланс 735, без payouts | refund pi_R, R1 | `reverse refund, decrement 735, clawback null`; apply: баланс 0, `reversedAt` set |
| RF2 **повторение** | след RF1 | същото | `noop unchanged`; баланс 0 (не −735) |
| RF3 **частичен** | Referral pi_R | R2 | `noop unchanged` |
| RF4 **изплатен кредит, чака плащане** | баланс 0; payout p1 `pending`, requestedAt T1 > T0 | R1 | `reverse, decrement 735, clawbackPayoutId 'p1', status 'pending'`; apply: баланс **−735** |
| RF5 **изплатен кредит, платен** | p1 `paid`, T1 > T0 | R1 | `clawback 'p1', status 'paid'`; баланс −735; `canWithdraw(-735) === false` |
| RF6 | payout p0 с T(−1) < T0, баланс 735 | R1 | `clawback null`, баланс 0 |
| RF7 | payouts p0 (<T0), p1 (>T0), p2 (>p1) | R1 | `clawback 'p1'` (най-ранният след T0) |
| RF8 | Referral pi_R | refund на **pi_renewal** (подновяване) | `noop not-referral-payment` |
| RF9 | Referral pi_R | спор `needs_response`, после live `won` | `reverse dispute` (−735), после `restore increment 735`; втори `won`: `noop unchanged` |
| RF10 | след RF1 | live `C(…, 0)` | `noop refund-terminal` |
| RF11 | Referral pi_R | refund на покупка в магазина pi_S от поканения | `noop not-referral-payment` |
| RF12 | `rewardCents: 735` записан, `REFERRAL_PERCENT` вече е друг | R1 | `decrement 735` (записаната, не преизчислена) |
| RF13 | Referral `stripePaymentIntentId: null` (заварен) | R1 за pi_R | `noop not-referral-payment` (покрива се с backfill) |

### 4.7 Спор по плановия абонамент (P8)
| ID | Вход | Очакван резултат |
|---|---|---|
| X1 | `U(PRO, sub_1)`, sub на плащането `sub_1`, `reversed dispute`, статус `active` | `true` |
| X2 | като X1, но `reversed refund` | `false` (P7) |
| X3 | като X1, но inquiry (`{reversed:false}`) | `false` |
| X4 | като X1, статус `canceled` | `false` (вече отменен; без втори API call) |
| X5 | `U(PRO, sub_2)`, плащане на `sub_1` | `false` |
| X6 | `U(FOUNDER, …)` | `false` |

## 5. Места в `route.ts` за смяна (днешни редове)

| Ред | Промяна |
|---|---|
| `:1-8` | импорт от `@/lib/billing-sync`. Адаптерите (виж долу) идват от нов `@/lib/stripe-state.ts` (impure, не се unit-тества) |
| `:12-45` `rewardReferrer` | нов параметър `paymentIntentId: string`, записва се в `Referral.stripePaymentIntentId`. Гълта **само** `P2002`, всичко друго хвърля и води до 500 |
| `:170-172` | `payoutOk` става общ `ok`. Всеки нов път, който хвърли, прави `ok=false`, после 500 |
| `:179-203` планов клон | `classifyCheckout(session.metadata)`. За `plan`: live `reversal` (payment) или live статус на абонамента (subscription), после `decideCheckoutPlanGrant`. При `grant` има CAS `updateMany({ where:{ id, plan:{ not:'FOUNDER' } } … })` с `plan`, `stripeCustomerId`, `planPaymentIntentId` **или** `planSubscriptionId`, `planRevokedAt/Reason: null`. За FOUNDER where е `{ id }`. После `rewardReferrer(userId, plan, amount_total, firstPI)` |
| `:204-215` | клонът на магазина се гейтва с `kind === 'shop'` вместо с наличие на `productId`. Логиката на магазина `:216-276` **не** се променя |
| `:279-317` `charge.refunded` | логиката на магазина остава. **Добавя се** `await syncPaymentReversal(pi)` (общ за refund и спор): live state, после `decideFounderPayment`, `decideReferralReversal`, `shouldCancelPlanSubscription`, и прилагане с CAS |
| `:318-338` `charge.dispute.created` | магазинът остава. Добавя се `syncPaymentReversal(pi)`. Ако `dispute.payment_intent` е null, PI се взима през `charges.retrieve(dispute.charge)` |
| нов case | `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated` водят **само** до `syncPaymentReversal(pi)` (магазинът не се пипа) |
| `:365-384` `subscription.updated` | `Entitlement` частта остава. Добавя се `syncPlanSubscription(sub.id)`: `subscriptions.retrieve`, потребител по `planSubscriptionId`, иначе заварен по `stripeCustomerId` с `planSubscriptionId IS NULL`. После `decideSubscriptionSync` и CAS `updateMany({ where:{ id, plan:{ not:'FOUNDER' }, OR:[{ planSubscriptionId: sub.id }, { planSubscriptionId: null }] } })` |
| `:385-395` `subscription.deleted` | **махаме** свалянето по `stripeCustomerId` и го заменяме със `syncPlanSubscription(sub.id)`. `Entitlement` частта `:396-402` остава |
| нов case | `customer.subscription.paused` и `customer.subscription.resumed` водят до `syncPlanSubscription` (излишни, но безвредни при level sync) |

Адаптери в `src/lib/stripe-state.ts`, вързани към **acacia**:
- `loadPaymentState(stripe, pi)`: `paymentIntents.retrieve(pi,{expand:['latest_charge']})` дава `ChargeSnapshot`. `pi.invoice` → `invoices.retrieve` → `invoice.subscription` дава sub на плащането. `disputes.list({payment_intent: pi, limit: 100})` дава статусите.
- `loadSubscription(stripe, id)`.
- `firstPaymentIntentOfSession(stripe, session)`: payment mode → `session.payment_intent`. Subscription mode → `invoices.retrieve(session.invoice).payment_intent`.

**Внимание при ъпгрейд:** в `2025-03-31.basil` са махнати `invoice` от PaymentIntent/Charge и `payment_intent`/`charge` от Invoice (https://docs.stripe.com/changelog/basil/2025-03-31/add-support-for-multiple-partial-payments-on-invoices). Вместо тях се ползва `invoicePayments.list`. Затова адаптерите са изолирани. Ъпгрейдът на SDK (v18+) ги сменя и чистите функции остават.

Извън `route.ts`:
- `billing.ts:81`: `metadata: { kind: 'plan', userId, plan }`.
- `shop.ts:132-139`: `kind: 'shop'`.
- `DEPLOY.md:90-98`: нови събития `charge.dispute.updated|closed|funds_withdrawn|funds_reinstated`, `customer.subscription.paused|resumed` (включват се в Dashboard, от собственика или VPS-аджията).
- Админ панел: показва `planRevokedAt/Reason`, сторнирани реферали с `clawbackPayoutId` и отрицателен баланс (UI, Кодаджията/Преводача).

## 6. Решения за собственика (с предложено подразбиране)

- **O-1** P8, отмяна на абонамента при chargeback: **да**. Необратимо, затова се иска изрично „да“ преди стъпка 4.
- **O-2** P2, гратис при `past_due`: **да**. Условие: dunning да завършва с cancel (`DEPLOY.md:100`) и Dashboard да е проверен.
- **O-3** Автоматично възстановяване при `won`: **да** за FOUNDER и реферал.
- **O-4** Нова реферна награда след сторно: **не**.
- **O-5** Отрицателен реферален баланс като видим дълг: **да**. Дашбордът (`dashboard/page.tsx:2076-2090`) трябва да го показва честно.

## 7. Остатъчни рискове (извън трите дефекта, за отделна задача)

- `billing.ts:34` пуска checkout само при `plan === 'FREE'`. Потребител, свален при `unpaid`, още има жив абонамент и може да си купи втори. Предложение: гейтът да проверява и нетерминален `planSubscriptionId`.
- Магазинът отнема достъп при всеки `dispute.created`, вкл. inquiry (`route.ts:335`). Това не съвпада с P5 и е за отделно решение.
- 14 HIGH `webhook-swallowed-error` (базова линия).
- Право на отказ / pro-rata при плановете (чл. 16(а)/8(8)/14(3) Дир. 2011/83) не се променя тук. Refund-ът тук е само механика. За правния слой: Правния Разбирач.

## 8. Инварианти

Инварианти:
- сървърна сума ✓: Price ID от env (`billing.ts:50,58`), сумите идват от Stripe обекти (`route.ts:201,220`), реферът ползва записаната `rewardCents`.
- подпис върху суровото тяло ✓: `request.text()` + `constructEvent`, 400 при грешка (`route.ts:162-168`).
- `payment_status` ✓ за payment mode (`route.ts:182`). ? Предстои за subscription mode: допълнително live статус на абонамента (G3, G8).
- идемпотентност по `event.id` ?: предстои, решена по бизнес ключ (`pi`/`sub.id`/`referral.id`) с CAS, P10. Тестове U15/F3/RF2.
- права само през webhook ✓: `route.ts:149-150`, `billing.ts:80`. Новите пътища са само в webhook-а.

Граница: тук няма реален Stripe акаунт. Чистите функции се доказват с `npm test`, адаптерите с test mode ключове и `stripe listen --forward-to localhost:3000/api/stripe/webhook` + `stripe trigger charge.refunded` / `charge.dispute.created` на машина с интернет.

Това не е правен съвет.

## 9. Решения на собственика (02.11.2026) — ЗАДЪЛЖИТЕЛНИ, заменят предложенията в раздел 6

Правило на собственика: „качеството на първо място; ако е по-добро и по-бързо, а малко по-скъпо — избери него“. Плюс червената линия „необратимо → не без изрично да“.

- **O-1 — ЗАМЕНЕНО.** Без отмяна на абонамента (необратимо). Вместо това: при обърнато плащане по спор на PRO/BUSINESS абонамент → планът става FREE (`planRevokedAt/Reason = 'dispute'`) И таксуването се **паузира** обратимо: `subscriptions.update(sub, { pause_collection: { behavior: 'void' } })`. При `won` (спорът е спечелен) → `pause_collection: null` (възобновяване) и планът се възстановява по живия статус на абонамента. Чистата функция се преименува на `decidePlanSubscriptionCollection(...)` → `'pause' | 'resume' | 'none'`. Таблица 4.7 се пренаписва така:
  - X1 спор (reversed), статус active → `'pause'`
  - X2 refund (reversed refund) → `'none'`
  - X3 inquiry (`reversed:false`) → `'none'`
  - X4 статус canceled → `'none'`
  - X5 друг sub → `'none'`
  - X6 FOUNDER → `'none'`
  - X7 спорът е `won`, абонаментът е на пауза от нас (`planRevokedReason='dispute'`) → `'resume'`
  - X8 повторено събитие при вече паузиран (pause_collection вече зададено) → `'none'` (идемпотентност)
  - Докато `planRevokedReason='dispute'` и спорът не е `won`, `decideSubscriptionSync` НЕ връща плана дори при статус active (плановият клон не бива да „възкреси“ спорен план).
- **O-2 — ДА**: гратис при `past_due`. Условие за собственика (не за кода): Stripe Dashboard → Billing → Revenue recovery: след последния неуспешен опит абонаментът да се отменя (DEPLOY.md:100).
- **O-3 — ДА**: автоматично възстановяване при `won` за FOUNDER, реферал и плановия абонамент (виж O-1).
- **O-4 — ДА** (без нова награда след сторно).
- **O-5 — ДА**: отрицателният баланс е видим дълг; `canWithdraw` не пуска под прага. UI промяна в дашборда — само ако числото днес се показва невярно (провери `dashboard/page.tsx:2076-2090`); иначе отделна задача.

### 9.1 Отговори на Изпитателя (стъпка 4, 02.11.2026)

**В1 (X8): откъде се знае, че `pause_collection` е зададено.** Пети задължителен аргумент от живия абонамент:
```ts
export function decidePlanSubscriptionCollection(
  user: PlanUserSnapshot | null,
  subscriptionIdOfPayment: string | null,
  reversal: PaymentReversal,
  subscriptionStatus: string,       // live, subscriptions.retrieve
  collectionPaused: boolean,        // live: subscription.pause_collection !== null
): 'pause' | 'resume' | 'none';
```
- `'pause'`: обърнато по спор, sub съвпада с `user.planSubscriptionId`, `plan !== 'FOUNDER'`, статусът не е краен (`canceled`/`incomplete_expired`), **`collectionPaused === false`**.
- `'resume'`: необърнато, sub съвпада, `planRevokedReason === 'dispute'`, статусът не е краен, **`collectionPaused === true`**.
- Всичко друго → `'none'`. X8: повторено събитие при вече паузиран → `'none'`. Огледално X8b: повторен `won` при вече възобновен → `'none'`.
- Задължителен (без подразбиране): извикващият е длъжен да подаде живото състояние; подразбиране `false` би дало втори API call при всяко повторение.
- Ред в адаптера: **първо** Stripe (pause/resume), **после** записът в БД. Срив между двете → 500 → ретрай: живият `collectionPaused` вече е сменен → `'none'`, а записът в БД се довършва. Обратният ред би загубил `resume` (след изчистен `planRevokedReason` X7 вече не би дал `'resume'`).
- `Idempotency-Key`: `plan-collection-<pause|resume>-<sub.id>-<event.id>`.

**В2: преходът „спор по абонамент → FREE“ и обратно.**
```ts
export type PlanSubscriptionDisputeDecision =
  | { action: 'noop'; reason: 'not-plan-subscription-payment' | 'founder' | 'unchanged' }
  | { action: 'revoke'; reason: 'dispute' }
  | { action: 'restore' };
export function decidePlanSubscriptionDispute(
  user: PlanUserSnapshot | null,
  subscriptionIdOfPayment: string | null,
  reversal: PaymentReversal,
): PlanSubscriptionDisputeDecision;
export function applyPlanSubscriptionDispute(user: PlanUserSnapshot, d: PlanSubscriptionDisputeDecision): PlanUserSnapshot;
```
- `user`/sub липсва или `user.planSubscriptionId !== subscriptionIdOfPayment` → `not-plan-subscription-payment`. FOUNDER → `founder`.
- Обърнато по **спор**: вече `FREE` + `'dispute'` → `unchanged`, иначе `revoke` (apply: `plan FREE`, `planRevokedReason 'dispute'`, `planSubscriptionId` остава).
- Обърнато по **refund** → `unchanged` (P7: refund не сваля абонаментен план).
- Необърнато (`won`/`prevented`/inquiry) и `planRevokedReason === 'dispute'` → `restore` (apply: чисти само причината; **планът не се пипа**). Планът се връща от следващата `decideSubscriptionSync` по живия статус (O-1: „по живия статус“). В `route.ts` restore е последван веднага от `syncPlanSubscription(sub.id)`.
- Иначе → `unchanged`.

**В3 (X7):** сигнатурата е с 5 аргумента. X7 се пренаписва с `collectionPaused = true` (очакването `'resume'` не се сменя). X1–X6 получават `collectionPaused = false` (очакванията не се сменят).

**В4: причина в `noop`, когато O-1 блокира връщането на плана.** Нова стойност `'dispute-hold'`:
`PlanSyncDecision.noop.reason` = `'no-user' | 'founder' | 'not-plan-subscription' | 'unknown-price' | 'unchanged' | 'dispute-hold'`.
Правило: след проверките за FOUNDER/чужд абонамент/осиновяване/непозната цена, ако `user.planRevokedReason === 'dispute'` и целевият план е платен → `noop dispute-hold`. Към FREE синхронизацията работи нормално (става `unchanged`, защото е вече FREE).

**Допълнения, открити при имплементацията (в обхвата на D2/O-1):**
- `decideCheckoutPlanGrant` получава незадължително поле `holdSubscriptionId: string | null` (= `planSubscriptionId`, когато `planRevokedReason === 'dispute'`). Закъсняло/повторено `checkout.session.completed` за **същия** абонамент → `skip 'dispute-hold'`. Иначе повторената доставка би изчистила причината и би върнала плана по време на спора (живият статус при `pause_collection` остава `active`). Тест G9.
- `selectAdoptableSubscription(eventSub, customerSubs, priceMap)`: при заварен потребител без `planSubscriptionId` и събитие за **мъртъв** абонамент, ако същият customer има жив абонамент с планова цена, се осиновява живият. Иначе закъсняло `deleted` на стар абонамент би осиновило мъртвия и би заключило плащащия на FREE (U8 за заварените). Тестове L1–L3.
- `flag` (F8) се записва като `console.warn` с id на потребителя (без PII). За отделна задача: видим флаг в админ панела.

### 9.2 Ревю на Кодаджията (02.11.2026) — допълнителни критерии, ЗАДЪЛЖИТЕЛНИ (качеството първо)
Тестове първо (Изпитателя), после поправка (Продавача). ID-тата продължават съществуващите.
- **A10 (бележка, Сигурно):** спорът по плановия абонамент пази КОЕ плащане е оспорено. Необърнато събитие
  (`reversed:false`) по ДРУГ PaymentIntent на същия абонамент, докато спорът по записания PI е отворен →
  `decidePlanSubscriptionCollection` = `'none'` и `decidePlanSubscriptionDispute` = `noop`/`unchanged`. Resume и restore
  се допускат САМО за записания оспорен PI. Нужно поле (напр. `planDisputedPaymentIntentId`, адитивна колона в
  същата нова миграция) или преизползване на съществуващо — по преценка на Продавача, с обосновка.
- **A11 (дребно):** при `'pause'` отнемането в базата става ПРЕДИ заявката към Stripe; при `'resume'` остава „първо Stripe“.
  Сторното на реферала е в отделен опит и не зависи от успеха на паузата. Тестът е на нивото на решението/реда,
  без мрежа (напр. чиста функция за реда на стъпките или проверка на плана, който webhook-ът изпълнява).
- **G10 (дребно):** след успешно предоставяне на план от абонамент webhook-ът синхронизира по живото състояние на
  абонамента (затваря състезанието grant↔deleted). Ако не е изразимо като чист тест — бележка в доклада защо.
- **F13 (дребно):** предоставянето на не-FOUNDER план НЕ изтрива `planRevokedReason='dispute'`, когато FOUNDER е
  отнет по спор (`planPaymentIntentId` зададен), така че `won` по FOUNDER спора стига до `flag` (F8 достижим в потока).
- **L4 (дребно):** при осиновяване на заварен абонамент с цена извън `STRIPE_PRICE_*` — `noop not-plan-subscription`
  с причина, която webhook-ът логва (`console.warn`); в DEPLOY.md: backfill dry-run ПРЕДИ включване на новия webhook.
- **B1 (дребно):** backfill-ът за реферал взема първата сесия с `payment_status === 'paid'` и ненулев PI, не `sessions[0]`.
  Изразено като чиста функция с тест.
Инвариантите от раздел 8 остават. Нищо мрежово към Stripe в тестовете.

### 9.3 Отговор на 9.2 (Продавача, 02.11.2026, стъпка 5)

**Дискриминатор на hold-а (бележка 1 на Изпитателя, F13 ↔ dispute-hold).**
```ts
isSubscriptionDispute(user) =
  user.planRevokedReason === 'dispute' &&
  (user.planDisputedPaymentIntentId != null || user.planPaymentIntentId === null)
```
Обосновка:
- `planDisputedPaymentIntentId != null` сам не стига. Заварен ред и тестовете O-1/A9 (без записан PI) трябва да останат под hold.
- `planPaymentIntentId === null` сам не стига. Бивш FOUNDER (стар `pi_F`) с нов абонамент, който получи спор по абонамента, би излязъл от hold.
- Комбинацията: новият път **винаги** записва оспорения PI. Ако го няма, спорът е по абонамента само когато няма FOUNDER плащане, по което да е.
- Важи навсякъде, където се решава hold:
  - `decideSubscriptionSync` (`dispute-hold`);
  - `disputeHoldSubscriptionId` → `holdSubscriptionId` в grant (тест H1);
  - resume/restore в `decidePlanSubscriptionCollection`/`decidePlanSubscriptionDispute` (тест H2: запазен FOUNDER-спор не възобновява чужда пауза);
  - CAS в `syncPlanSubscription` (`OR: reason null | reason ≠ dispute | (planDisputedPaymentIntentId null И planPaymentIntentId not null)`).

**A10.** Нова колона `User.planDisputedPaymentIntentId` (в същата миграция). Затова не преизползвам `planPaymentIntentId`: той е ключът на FOUNDER и F13 изисква двете да съжителстват. Resume/restore се допускат само при `recorded == null || recorded == paymentIntentId`.

**A11.** `planDisputeSteps` дава реда на стъпките. Founder, абонамент и реферал са три отделни опита през `runIsolated`; първата грешка води до 500.

**G10.** `subscriptionIdToResyncAfterGrant` + `syncPlanSubscription` веднага след успешен grant.

**F13.** `shouldClearRevocationOnGrant`. **L4.** `adoptionSkipReason` + `console.warn`. **B1.** `firstPaidPaymentIntent` (FOUNDER и реферал в backfill-а).

**Остатъчен риск (Вероятно, рядко):** два отворени спора по РАЗЛИЧНИ плащания на един абонамент. Записва се първият. При `won` по него планът се връща, докато вторият още е отворен. Следващо събитие по втория (`updated`/`closed`/`funds_withdrawn`) пак паузира и отнема.

### 9.4 Второ ревю на Кодаджията (02.11.2026) — ЗАДЪЛЖИТЕЛНИ (качеството първо)
- **F13e (N1, Сигурно):** `shouldClearRevocationOnGrant` пази причината САМО при FOUNDER-спор: условието за пазене
  получава `&& !isSubscriptionDispute(user)`. Верига: бивш FOUNDER (pi_F) → PRO sub_1 → спор по sub_1 (pi_S) → нов
  PRO sub_2 → grant изчиства причината и pi_S; смяна PRO→BUSINESS после НЕ е `dispute-hold`.
- **F14 (N2):** `decideFounderPayment` при необърнато плащане по pi_F, когато `isSubscriptionDispute(user)` → `flag`, не `restore`.
- **A12 (N3):** при необърнато плащане по абонамента `syncSubscriptionDispute` ВИНАГИ завършва с ресинхронизация по
  живото състояние (level-triggered), не само в клона db-restore. Чист тест на решението (напр. стъпка `'resync'` в
  `planDisputeSteps` за необърнато плащане) — по преценка на Изпитателя с Продавача.
- **W1 (остатъчен риск 4):** втори спор по друг PI на същия абонамент, докато има записан → `console.warn` за ръчно наблюдение.
- **W2 (остатъчен риск 5б):** restore по абонамента при `planPaymentIntentId !== null` → `console.warn` (FOUNDER-следата).
- **DEPLOY §1 т. 6:** след рестарта backfill dry-run, при нужда `--apply` (идемпотентен) — затваря прозореца apply→рестарт.
Тестове първо за F13e, F14, A12 (и W1/W2, ако са изразими като чисто решение). Инвариантите от раздел 8 остават.

### 9.4.1 Направено (Продавача, 02.11.2026, стъпка 6)
- **F13e:** `shouldClearRevocationOnGrant` добавя `&& !isSubscriptionDispute(user)`. Нов grant чисти спора по стар абонамент, затова вече няма вечен hold. Чист FOUNDER-спор се пази както преди (F13a, F13e-b).
- **F14:** `decideFounderPayment` дава `flag` (не `restore`), когато `isSubscriptionDispute(user)`. Условният запис (CAS) за FOUNDER restore в `route.ts` получава и `planDisputedPaymentIntentId: null` (защита при състезание). Съобщението на flag-а назовава и двата случая.
- **A12:** `planDisputeSteps(c, d, reversal?)` добавя `'resync'` при `reversed === false`. В `route.ts` `'resync'` вика `syncPlanSubscription`; извикването е махнато от `db-restore`, за да няма двоен sync. Без вързан потребител и при необърнато плащане също се прави sync (осиновяване на заварен).
- **W1/W2:** `planDisputeWarning` праща резултата в `console.warn` с id-та на абонамента, потребителя и плащането (без лични данни).
  - `'second-dispute'` се дава само при решение `revoke` или `unchanged`; не при `not-plan-subscription-payment` или `founder`.
  - `'restore-founder-trace'` се дава при всеки `restore`, когато `planPaymentIntentId !== null`.
- **DEPLOY §1 т. 6:** dry-run след рестарта, при нужда `--apply`.

### 9.5 Платените функции при сваляне на план (растежен клон, сливане с main 14.11.2026)
Клонът с одита добави `lib/plan-limits.ts` (спира собствен домейн, скрит бадж и излишни профили при сваляне);
main добави синхронизацията по-горе. При сливането решението „кога“ е чиста функция
`limitsOnDowngrade` (`src/lib/plan-limits-core.ts`), тествана в `plan-limits.test.ts`:
- **L1:** окончателно сваляне към FREE — абонаментът е изтекъл/отказан (`syncPlanSubscription` → FREE) или
  пълен refund на FOUNDER → `applyPlanLimits` (идемпотентен, чете текущия план; при ретрай без условие по `count`).
- **L2:** спор (по абонамента или по FOUNDER) е обратим → платените функции НЕ се пипат (иначе спечелен спор
  връща плана без собствения домейн). Провал на `applyPlanLimits` → 500 → Stripe ретрайва.
