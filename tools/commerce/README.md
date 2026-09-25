# tools/commerce — Stripe „ръце" на Продавача (v2.0)

```bash
node tools/commerce/stripe-lint.mjs backend/src/routes        # статичен детектор на анти-патърни
stripe listen --forward-to localhost:3000/api/stripe/webhook  # локален webhook тест (Stripe CLI)
stripe trigger checkout.session.completed                     # симулирай събитие
stripe trigger invoice.payment_failed
```

- **stripe-lint.mjs** — евристичен (regex) скенер за най-скъпите грешки в payments код:
  webhook без проверка на подпис, `constructEvent` без 3-те аргумента, сума/цена от клиента,
  достъп около `success_url`, липсваща идемпотентност на `*.create`, Stripe.js не от
  `js.stripe.com`, `express.json()` без `express.raw()` за webhook, твърдо зашит `sk_`/`rk_` ключ.
  От 2026-09-24 и: **платен достъп, записан в GET маршрут** (целта на `success_url` — отваря се без
  плащане), `express.json()` монтиран преди Stripe webhook маршрута, webhook без запис на `event.id`,
  webhook, който връща 200 без `await` на ефекта, абонамент без `customer.subscription.deleted`. Сканира
  и js/ts блоковете в `.md` (пробите). Webhook маршрут = реална дефиниция във файл, който ползва Stripe —
  Discord webhook-и и import редове вече не дават фалшиви HIGH; тестовите файлове се прескачат.
  Тестове: `node --test tools/commerce/`. Връща изходен код **1** при HIGH находка → ползваемо като CI
  гейт. Евристично е — **потвърди ръчно**.

- **stripe listen / trigger** (Stripe CLI, отделна инсталация) — единственият верен тест на webhook
  логиката: реален подпис, реални събития, реален ретрай. `stripe-lint` е статичен предпазител, не замяна.

## Какво НЕ покрива (граница)
- Реалното SCA/3DS поведение е на издателя на картата — тествай с test карти
  (`4000002500003155` = 3DS required, `4000000000000341` = fail at charge).
- Идемпотентността се доказва само с **двойна доставка** на едно и също събитие — пусни го два пъти
  през `stripe trigger` и виж, че ефектът (таксуване/комисиона/достъп) е приложен веднъж.

⚠ Ключове (`sk_…`/`rk_…`) и webhook secret остават в env/secret vault (mode 600), **никога** в репото или
архива. Test и live ключове са строго разделени. Пин-вай Stripe API версията в клиента.
