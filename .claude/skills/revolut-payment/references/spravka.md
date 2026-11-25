# Revolut Merchant API — справка (версия 2026-09-22)

Първоизточник: официалната OpenAPI спецификация `https://developer.revolut.com/docs/api/merchant.yaml`
(`info.version: 2026-09-22`, свалена 2026-11-17), сверена с `merchant/2026-08-17.yaml` (diff) и с
ръководството „Merchant API versions“ (свалено 2026-11-17). Номерата на редове са в yaml-а от 17.11.
НЕПРОЧЕТЕНО (Revolut връща 403 „Just a quick security check“ — бот защита, не проксито): Verify the payload
signature, Errors, Order lifecycle, Webhooks guide, Test & go live / тестови карти, 3D Secure, Changelog,
Deprecation policy. Всичко, което идва само оттам, е отбелязано „за проверка“.

## 1. Основи
- Сървъри: Production `https://merchant.revolut.com` · Sandbox `https://sandbox-merchant.revolut.com` (ред 49).
- Удостоверяване: `Authorization: Bearer <secret key>` на всяка сървърна заявка; Public key — само на клиента
  при checkout. Ключът има права по ресурс (Read/Write; Write включва Read).
- Подписани заявки: ако ключът е със signing, в Production всяка заявка иска `Revolut-Api-Timestamp`
  (Unix ms) + `Revolut-Api-Signature` (Base64 Ed25519 над timestamp + метод + път + query + тяло).
  В Sandbox минава и без тях (ред 7502–7536). Точната конструкция (сверена 17.11.2026 от Продавача с
  примерите в ръководството „API Console → Make a request“, 3/3): `timestamp + МЕТОД + път от /api + query без
  „?“ (URL-кодиран както в заявката) + минифицирано тяло`, без разделители — същата за Business и Merchant
  (`business.md` § 2). Дали ключът подписва зависи от ключа: Merchant продуктите — по подразбиране не.
- Версии (`Revolut-Api-Version`, enum ред 7548): 2023-09-01, 2024-05-01, 2024-09-01, 2025-10-16, 2025-12-04,
  2026-03-12, 2026-04-20, 2026-08-17, 2026-09-22. Липсващ/невалиден хедър, където е задължителен → 400.
  Където е по избор (cancel order, payments/{id}, apple-pay unregister, terminals, payment-intents) — без
  хедър важи НАЙ-РАННАТА версия (guide). Webhooks/customers ендпойнти изискват мин. 2024-09-01 (иначе 404).
- Чупещо между 2026-08-17 и 2026-09-22 (единствената разлика в спецификацията): отказан refund на
  **Revolut Pay** връща `200` с refund поръчката (`payments[].state: declined|failed`, `decline_reason`;
  в примера order `state: processing`), а не `400`. Карта (вкл. wallets) — пак `400` без причина.
- Идемпотентност (`Idempotency-Key`, ≤50 знака): refund (по избор), subscriptions POST (по избор),
  subscription-usages POST (ЗАДЪЛЖИТЕЛЕН), payouts POST, disbursements POST. **Create order — НЕ.**
  Capture е идемпотентен по природа (втори със същата сума = retrieve; с друга сума = грешка).
- Грешки (`Error-v2`): `code` (string или int), `message?`, `timestamp` (ms), `errorId?` (uuid).
  Rate limits: в спецификацията няма 429 и няма числа — за проверка в guide „Errors“.
- Пагинация: orders list `limit` 1–500 (100 по подразбиране), `from`/`to`; на други списъци
  `page_token` → `next_page_token` (пази всички филтри между страниците). Order list е `{orders: [...]}`
  със съкратени обекти — пълният е през `GET /api/orders/{id}`.
- Суми: цели числа в минимални единици по ISO 4217 (`7034` EUR = €70.34; ISK е без дробни). При
  `line_items` сумата = Σ `total_amount`. Карта: мин. $0.005 еквивалент.

## 2. Поръчка (Order-v7)
- `type`: payment · payment_request · refund · chargeback · chargeback_reversal · credit_reimbursement.
- `state`: pending → processing → authorised → completed | cancelled | failed. „Платено“ = `completed`.
- Полета: id (постоянен), token (временен, за widget/SDK), amount, outstanding_amount, refunded_amount,
  currency, settlement_currency, capture_mode, authorisation_type, payments[], checkout_url, redirect_url,
  merchant_order_data.reference, metadata, related_order_id, customer, line_items, shipping.
- Няма completed_at/captured_at/paid_at — моментът е в `payments[]` (completed/captured).
- `payments[]` (Payment-v3): state, decline_reason, amount, authorised_amount, settled_amount,
  settled_currency, fees, payment_method (вкл. card_country_code, card_last_four…), billing_address, risk_level.
  Payment states: pending, authentication_challenge, authentication_verified, authorisation_started,
  authorisation_passed, authorised, capture_started, captured, refund_validated, refund_started,
  cancellation_started, declining, completing, cancelling, failing, completed, declined, soft_declined,
  cancelled, failed.
- `customer`: с `id` → свързва съществуващ; само email/phone/full_name → ВИНАГИ нов клиент.
- capture_mode: `automatic` (по подразбиране) / `manual` (остава `authorised`). Final authorisation —
  7 дни, после парите се връщат; `cancel_authorised_after` до P7D (final) / P30D (pre_authorisation).
  Partial capture: веднъж, ≤ authorised, без 0; остатъкът се освобождава. line_items при capture презаписват.
- Increment authorisation: само `pre_authorisation` + `manual`, само `authorised`, само карта; ≤10 пъти,
  Σ ≤ 5× началната; последователно. Събития ORDER_INCREMENTAL_AUTHORISATION_*.
- Cancel: само `pending` или `authorised`.
- Refund: само от `completed`; пълен или частични, Σ ≤ сумата. Създава НОВА поръчка `type: refund` с
  `related_order_id`; до 2 дни до краен статус; следи по webhook/GET. 201 = създадена, не „върнато“.
  Отказан card refund (400): поръчката пак е създадена — търси я по `merchant_order_data_reference`.
- Update order: pending — всичко; authorised/completed — само reference, description, metadata, shipping,
  industry_data (+ cancel_authorised_after при authorised); processing — нищо.
- `expire_pending_after` (ISO 8601) — неплатената изтича.
- Задължителни индустриални данни (line_items/shipping за retail, industry_data за airline, lodging,
  car_rental, crypto, event, marketplace).
- Остаряло: `/orders/{id}/confirm` (→ `POST /api/orders/{id}/payments`), старият create с `public_id`.

## 3. Уебхуци
- CRUD: `POST/GET /api/webhooks`, `GET/PATCH/DELETE /api/webhooks/{id}`; най-много 10 (11-ти → 422).
  URL: http/https, хост не localhost и не IP, ≤2000 знака. `signing_secret` е във ВСЕКИ отговор (и GET).
- Rotate: `POST /api/webhooks/{id}/rotate-signing-secret`, `expiration_period` (ISO 8601, ≤7 дни) — старата
  тайна важи до изтичането; без него — невалидна веднага.
- Събития: ORDER_COMPLETED, ORDER_AUTHORISED, ORDER_CANCELLED, ORDER_FAILED,
  ORDER_INCREMENTAL_AUTHORISATION_{AUTHORISED,DECLINED,FAILED}, ORDER_PAYMENT_AUTHENTICATION_CHALLENGED,
  ORDER_PAYMENT_AUTHENTICATED, ORDER_PAYMENT_AUTHORISATION_STARTED, ORDER_PAYMENT_DECLINED,
  ORDER_PAYMENT_FAILED, SUBSCRIPTION_{INITIATED,FINISHED,CANCELLED,OVERDUE}, PAYOUT_{INITIATED,COMPLETED,FAILED},
  DISPUTE_{ACTION_REQUIRED,UNDER_REVIEW,WON,LOST}, DISBURSEMENT_{COMPLETED,DECLINED},
  DISBURSEMENT_REFUND_COMPLETED.
- Тяло (без id на събитие, без сума): order → {event, order_id, merchant_order_ext_ref?,
  incremental_authorisation_ext_reference?}; subscription → {event, subscription_id, external_reference?};
  payout → {event, payout_id}; dispute → {event, dispute_id}; disbursement → {event, id, reference?};
  disbursement refund → {event, id, original_disbursement_id, original_reference}.
  Ред не е гарантиран (ORDER_COMPLETED може да дойде преди ORDER_AUTHORISED) → винаги GET на обекта.
- Подпис: хедъри `Revolut-Request-Timestamp` (UNIX, единицата не е казана) и `Revolut-Signature` (HMAC).
  Формат `v1=<hex>` / низ `v1.{timestamp}.{сурово тяло}` / SHA-256 / допуск по време — САМО в guide
  (403 днес) → за проверка в sandbox.
- Отговор: препоръчано `204`; всеки 200–399 = доставено. При 4XX или timeout — още 3 опита през 10 мин.
  За 5XX не е описано. IP allowlist: Production 35.246.21.235, 34.89.70.170; Sandbox 35.242.130.242,
  35.242.162.241.
- Синхронни уебхуци (Fast checkout, валидиране на адрес): `POST /api/synchronous-webhooks`, ключ `swsk_…`,
  HMAC в `Revolut-Pay-Payload-Signature`; SSL с публичен CA.

## 4. Останалите ресурси
- Customers + payment methods (v2024-09-01+). Saved method: `POST /api/orders/{id}/payments` с
  `saved_payment_method {type, id, initiator, environment}`; `initiator: merchant` (MIT) само за метод,
  записан `for: merchant`; Revolut Pay през този път — само MIT.
- Subscriptions (САМО Production): plans, subscriptions, cycles, usages (usage POST с задължителен
  Idempotency-Key). Състояния: pending, active, overdue, paused, cancelled, finished. Нужен е customer_id.
  Cancel — от всяко освен cancelled/finished (висящите поръчки се отказват). change-plan — в края на цикъла;
  change-renewal-date. Endpoint за пауза/подновяване няма.
- Disputes (САМО Production): list/retrieve/accept/evidences/challenge; state needs_response, under_review,
  won, lost (+ substates). Accept е окончателно (после без challenge).
- Payouts: само към собствената Business сметка, винаги целия наличен баланс в `source_currency`.
- Disbursements и Check card details: само MCC 7995; сурови карти → PCI DSS при нас.
- Report runs: custom_report, settlement_report, payments_report, payout_statement_report,
  icpp_fee_breakdown_report → CSV чрез file_url.
- Locations / Terminals / Payment intents: push към Revolut Terminal (order `channel: pos` + location_id),
  poll до completed/cancelled/failed.
- Apple Pay: файлът в `/.well-known/apple-developer-merchantid-domain-association`, после register/unregister.

## 5. Статус
- Само Production: всички /api/subscription-plans*, /api/subscriptions*, /api/subscription-usages*, /api/disputes*.
- Beta: в спецификацията няма маркер за beta.
- Остаряло: `/orders/{id}/confirm`; create order с `public_id`; версии — политиката е в guide (403).

## 6. Как да ползваме (за нашите три продукта)
Сума/валута само от сървъра → `POST /api/orders` → redirect към `checkout_url` → правата САМО след
`GET /api/orders/{id}`: `completed` + точна сума + валута + reference. Дедупликация event+order_id;
reconciler по reference за изгубените. Refund: ключ = наш id; приключи по refund поръчката, гледай и
`payments[].state`. Ъпгрейд на версия → diff на yaml-ите, не по памет.
