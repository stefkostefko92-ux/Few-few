# Stripe — предстартов чеклист (go-live)

Този документ е за превключване от **test mode** към **live mode** за билинга на
платформата (`platform.carbonstealth.eu`). Билинг кодът е в
`src/lib/stripe.ts`, `src/lib/billing.ts`, `src/lib/billing-server.ts`,
webhook-ът в `src/app/api/webhooks/stripe/route.ts`.

> Граница: тук се дава само код + статичен преглед. Реалният тест е с истински
> Stripe акаунт, live ключове и публично достъпен webhook endpoint. Всяка стъпка
> по-долу се проверява на живо в Stripe Dashboard/CLI.

---

## 0. Преди всичко: не смесвай test и live

- Test обектите (`sk_test_…`, `price_…` от test, `cus_…` от test) **не** работят
  в live. Всеки live ключ, price ID, customer, webhook secret е отделен.
- Смяната на ключове **не** мигрира съществуващи абонаменти между режимите.
- Всичко чувствително стои в env/secret store (mode 600), **никога** в архива или
  git. Виж owner flow в `deploy/README.md` — `.env` остава на сървъра.

---

## 1. Live ключове (secret + restricted)

- [ ] `STRIPE_SECRET_KEY` = **`sk_live_…`** (или, за webhook/билинг сървъра,
      **restricted key `rk_live_…`** с минимални права: Checkout Sessions
      write, Customers write, Subscriptions read, Billing Portal write,
      Webhooks — според нуждите). Restricted key е за предпочитане.
- [ ] Ключът е в `platform/.env` на сървъра (mode 600), не в репото.
- [ ] `src/lib/stripe.ts` пинва API версия `2026-06-24.dahlia` — **потвърди**, че
      съвпада с default API версията на live акаунта (Workbench → API version).
      Ако акаунтът е на друга версия, webhook payload-ите може да изглеждат
      различно (виж т. 3).

## 2. LIVE Price ID

- [ ] Създай **live** Product + recurring monthly Price в live Dashboard.
- [ ] `STRIPE_PRICE_ID` = **live** `price_…` (не test-овия).
- [ ] Цената идва само от този Price — кодът никога не чете сума от клиента
      (`createCheckoutSession` подава `price`, не `amount`).
- [ ] На Price-а е зададено `tax_behavior` (`inclusive` или `exclusive`) — виж т. 5.

## 3. Регистрация на webhook endpoint (live)

- [ ] Dashboard → Developers → Webhooks → **Add endpoint** (в **live** режим):
      URL = `https://platform.carbonstealth.eu/api/webhooks/stripe`
- [ ] Избери **точно** тези event типове (това обработва
      `src/lib/billing-server.ts`):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- [ ] Копирай **live** signing secret → `STRIPE_WEBHOOK_SECRET` = `whsec_…` в
      `.env` на сървъра. (Test-овият `whsec_…` от `stripe listen` не важи за live.)
- [ ] Забележка за API версията: webhook-ите ползват версията, зададена при
      **създаване** на endpoint-а — независима от версията на заявките. Задай я
      да съвпада с `API_VERSION` в `src/lib/stripe.ts`, иначе форматът на
      обектите може да се различава (напр. `invoice.parent.subscription_details`
      срещу стария `invoice.subscription`).
- [ ] Провери, че endpoint-ът връща 2xx бързо (подписът се проверява със суровото
      тяло `await req.text()` в route handler-а преди JSON парсване).

## 4. Customer Portal (live)

- [ ] Dashboard → Settings → Billing → **Customer portal** → активирай за **live**.
- [ ] Разреши: смяна на метод на плащане, преглед/сваляне на фактури,
      прекратяване (cancel) на абонамента.
- [ ] Задай business info, линкове към Условия и Поверителност (импресум).
- [ ] Без активиран live portal `billingPortal.sessions.create` връща грешка.

## 5. Stripe Tax + ДДС/OSS

- [ ] Dashboard → Settings → Tax → активирай **Stripe Tax** за **live**.
- [ ] Регистрирай данъчните регистрации (origin BG + всяка държава/OSS, където
      има праг). ЕС **OSS** праг за трансграничен B2C е **€10 000** общо — над
      него ДДС е по държава на потребление; регистрацията в BG е през **НАП**.
      (Провери актуалните прагове и режим преди пускане.)
- [ ] На live Price-а задай `tax_behavior` (`inclusive`/`exclusive`) — трябва да
      е зададено, иначе `automatic_tax: { enabled: true }` в checkout сесията
      може да откаже. Кодът вече подава `automatic_tax` + `billing_address_collection: "required"` + `customer_update: { address: "auto" }`.
- [ ] Провери, че фактурите показват коректно ДДС и обща цена с данък.

## 6. Право на отказ (чл. 16, б. „м") — вече в кода

- [ ] UI показва **отделна, неотметната** отметка за съгласие (BillingPanel).
- [ ] Сървърът (`startCheckoutAction`) **отказва** без `consent === true` и
      записва доказателство в AuditLog (`entity="Consent"`) с дословния текст на
      клаузата + siteId + потребител + timestamp **преди** Checkout. Провери, че
      записът се появява в одита при реален тест.
- [ ] Текстът на клаузата е ЕДИН източник: `CONSENT_CLAUSE_16M` в
      `src/lib/billing.ts` (ползва се и в UI, и в одита).

## 7. Radar / измами / chargeback

- [ ] Провери, че Radar е активен за live (базов е включен).
- [ ] Дефинирай процес за refund/chargeback (през Dashboard/Portal).

## 8. Тест с Stripe CLI (преди и след смяната)

В **test mode** (safety net преди live):

```bash
# Локален forward на webhook-а:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# (копирай показания whsec_… в STRIPE_WEBHOOK_SECRET за локалния тест)

# Симулирай ключовите събития:
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

Провери за всяко:
- [ ] **Двойна доставка** на един и същ `event.id` → ефектът е приложен само
      веднъж (идемпотентност по `WebhookEvent.id` в същата транзакция).
- [ ] Достъпът (`Site.premium`) се сменя **само** през webhook, никога през
      `success_url` redirect-а.
- [ ] `invoice.payment_failed` → `PAST_DUE`, premium следва `isPremiumStatus`
      (по подразбиране без премиум) — не се бори с мапинга на статуса.
- [ ] `customer.subscription.deleted` → `CANCELED`, premium изключен.
- [ ] Невалиден/изтекъл подпис → route връща грешка (не 2xx).

Тест карти (test mode): `4242 4242 4242 4242` (успех),
`4000 0025 0000 3155` (3DS challenge), `4000 0000 0000 0341` (fail при charge).

## 9. Финално превключване

- [ ] Смени `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` на
      **live** стойности в `platform/.env` на сървъра (mode 600).
- [ ] Рестартирай приложението (Docker Compose) — виж `deploy/README.md`.
- [ ] Направи **един реален** premium checkout с истинска карта; провери:
      активиране през webhook, фактура с ДДС, одит запис за съгласието, и
      Customer Portal отваря.
- [ ] Прекрати го през Portal и провери, че премиумът се отнема (webhook).

---

Това не е правен съвет. За данъчна/правна изрядност (ДДС регистрации, OSS/IOSS,
преддоговорна информация, Omnibus) потвърди с Правния Разбирач / данъчен
консултант преди пускане.
