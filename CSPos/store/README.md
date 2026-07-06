# Carbon Stealth POS — лицензионен магазин (store/)

Самостоятелен Express сървър: **Stripe Checkout → моментален лицензен ключ +
download линк**, активация на каси (≤ закупени места) и Ed25519-подписани
офлайн лицензи. Цени/планове: [`../docs/PRICING.md`](../docs/PRICING.md).

## Поток

1. Витрината (`/`) → избор план + брой каси + **изрично съгласие** за незабавна
   доставка (чл. 57, т. 13 ЗЗП) → `POST /api/checkout` → Stripe Checkout (bg,
   Stripe Tax, ЗДДС № за B2B, adjustable quantity).
2. `checkout.session.completed` (webhook, raw body, подпис, идемпотентно по
   session id) → генерира ключ `CSPOS-XXXXX-XXXXX-XXXXX-XXXXX`.
3. `/success` poll-ва `/api/session-status` → показва ключа + download линк
   (fallback създава лиценза със същата идемпотентна функция при закъснял webhook).
4. Касата: „Настройки → Лиценз“ → `POST /api/activate {key, deviceId}` →
   брой активации ≤ seats → връща **подписан blob** (офлайн проверка в касата,
   гратис 14 дни за абонаменти; lifetime без срок).
5. Жизнен цикъл: `invoice.paid` удължава; `payment_failed` → past_due (гратис);
   `subscription.deleted` → canceled (до края на платения период);
   `charge.refunded`/`dispute` → revoke. Портал: `POST /api/portal`.

## Пускане

```bash
cd CSPos/store
npm install
cp .env.example .env            # Stripe ключове, BASE_URL, DOWNLOAD_FILE
npm run keys:generate           # Ed25519 двойка (частният остава тук, 600)
npm run setup:stripe            # създава продукта + 3-те цени (lookup_keys)
npm start                       # порт 8790
```

В Stripe Dashboard: включи **Tax**, добави webhook endpoint
`https://<домейн>/api/webhook` със събития: `checkout.session.completed`,
`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`.

Касата (CSPos) се конфигурира с env: `LICENSE_SERVER_URL` +
`LICENSE_PUBLIC_KEY` (съдържанието на `data/license-public.pem`).

## Тестове

`npm test` — лицензионната библиотека (ключове, нормализация, подпис/фалшификация).
Преди прод: Stripe test mode + `stripe listen --forward-to localhost:8790/api/webhook`,
тестови карти, симулация на двойна webhook доставка и refund.
