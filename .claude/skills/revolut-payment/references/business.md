# Revolut Business API — справка (версия 1.0, свалена 2026-11-17)

Първоизточник: официалната OpenAPI спецификация `https://developer.revolut.com/docs/api/business.yaml`
(`openapi: 3.1.1`, `info.version: "1.0"` ред 3, 21 459 реда, SHA-256 `276b6d2c…3904311`, свалена 2026-11-17 →
HTTP 200, `text/yaml`). Номерата на редове са в този файл. Прочетени ръководства (HTTP 200, 17.11): API Console →
Introduction, Make a request, Signing requirements, Create an API key, Manage API key settings, Rotate an API key;
Business → „Test your flows with simulations“ (`.md`).
**НЕПРОЧЕТЕНО** (403 „quick security check“ — бот защита, 3 опита с изчакване, и през WebFetch): About webhooks,
Manage webhooks, Make your first API request (наследеният OAuth/JWT), Confirmation of Payee, Payment drafts,
Retrieve transactions, Introduction. Всичко, което идва само оттам, е „за проверка“ и не е допълнено по памет.

## 0. Най-важното — Business API вече НЕ е „OAuth с JWT“
- `securitySchemes` (ред 14446): `ApiKey` (ред 14447) — Bearer API ключ от **API Console** + по избор подпис
  Ed25519; `AccessToken` (ред 14463) — OAuth 2.0 с client-assertion JWT, маркиран **Deprecated** (ред 14467:
  „switch to API keys as soon as possible“). Всеки ендпойнт приема и двата (`security`), напр. `/pay` ред 12971–12975.
- Ръководството „Create an API key“: Business и Merchant вече са на **един** модел; един ключ може да покрива и
  двата API; наследеният OAuth за Business „still supported for the interim period“ (без дата — за проверка).

## 1. Основи
- Сървъри (ред 33–37): Production `https://b2b.revolut.com/api/1.0` · Sandbox `https://sandbox-b2b.revolut.com/api/1.0`.
  Уебхуци v2 са на **`/api/2.0`** (ред 13801–13805, 13940, 14174, 14283). Sandbox акаунт: `sandbox-business.revolut.com` (ред 21377).
- Версия: само в пътя (1.0; 2.0 за уебхуци). Хедър `Revolut-Api-Version` **няма** (0 съвпадения) — за разлика от Merchant.
- **Суми: `number`/`double` в ОСНОВНИ единици** — `amount` на `/pay` (ред 18684–18687, пример `amount: 10` EUR ред 12995),
  `legs[].amount`/`fee`/`balance` (ред 18576–18603), `Account.balance` (ред 14583). Не са центове (както в Merchant).
- Каталог на ендпойнтите: 101 операции; всеки носи `x-api-access.scopes` (напр. ред 68–70) и таблица „Required API key permissions“.

## 2. Удостоверяване
**API ключ (текущият модел)** — ред 14447–14462 + ръководствата API Console:
- `Authorization: Bearer <API_KEY>` на всяка заявка. Права по ресурс: Read / Write (включва Read) / None; до **50**
  активни ключа; създаване и смяна на правата искат SCA (push, имейл или селфи).
- **Подпис Ed25519** — `Revolut-Api-Timestamp` (Unix **ms**) + `Revolut-Api-Signature` (Base64 на 64-байтовия суров
  подпис) — ред 19899–19922. Съобщението е `timestamp + МЕТОД + път (от /api, напр. /api/1.0/team-members) + query
  (без „?“, URL-кодиран точно както в заявката) + тяло (минифициран JSON)`, **без разделители**. **Проверено
  локално**: node `crypto.sign` с публичните демо-вектори от „Make a request“ → 3/3 PASS + контра-проба с разделители FAIL.
- Дали се подписва зависи от **ключа**, не от ендпойнта. Ключ със: Accounts, Transactions, Cards (вкл. sensitive),
  Exchange, Team, Transfers (counterparties, drafts, payout links, transfers), Business Webhooks → създава се **с**
  подпис. Accounting, Expenses и **всички Merchant продукти** → без (Signing requirements, иконите CheckboxOn/Off).
  Подпис, добавен по-късно, **не може да се махне**. В Sandbox хедърите са по избор, но ако ги има — трябва да са валидни.
- Двойката ключове: в Production се генерира **локално** (`openssl genpkey -algorithm ed25519`), качва се само
  публичният; Revolut никога не вижда частния. Нова двойка за Production — не преизползвай sandbox ключа.
- Видимост: ключ без подпис се показва **веднъж**; ключ с подпис може да се види пак в конзолата.
- IP allowlist (IPv4/IPv6/CIDR) — по избор, **задължителен** за Card sensitive details; частни IP → заявките се отказват.
- Срок на ключа: задава се само при създаване (валиден до 23:59 в часовата зона на устройството).
- Ротация: новата стойност е веднага; старата се отнема сега / 24 ч / 3 / 7 / 14 дни / на дата; публичният ключ за
  подпис се пренася. Компрометиран → „Now“. Препоръка: на ~90 дни.

**OAuth 2.0 (остарял)** — ред 14463–14500: access token **40 минути** (ред 14475), `refresh_token` за нов (ред 14476),
client-assertion JWT (ред 14479); обхвати `READ`, `WRITE`, `PAY`, `READ_SENSITIVE_CARD_DATA` (ред 14482–14486); при
`READ_SENSITIVE_CARD_DATA` без IP whitelist **никой** ендпойнт не работи (ред 14489–14497). Изтекъл токен → 401, `code: 1000`
(ред 19936–19943). Сертификатите остават в Business app → Settings → APIs → Business API certificates.
**НЕПРОЧЕТЕНО:** claims `iss`/`sub`/`aud`/`exp`, адрес на token endpoint, срок на refresh token, повторно съгласие (90 дни?).

## 3. Ресурси и права (scope на API ключ · наследен OAuth обхват)
| Ресурс | Ендпойнти (ред) | Scope · OAuth |
|---|---|---|
| Accounts | `GET /accounts` (1435), `/accounts/{id}` (1499), `/accounts/{id}/bank-details` (1563) | `accounts:read` · READ |
| Транзакции | `GET /transactions` (12392), `GET /transaction/{id}` (12626) | `transactions:read` · READ |
| Counterparties | `GET /counterparties` (4594), `POST /counterparty` (4896), `GET/DELETE /counterparty/{id}` (5520, 5698), `PATCH …/payment-methods/{id}` (5744), `/countries` (5261), `/fields` (5323) | `counterparties:read/write` |
| CoP / VoP | `POST /account-name-validation` (940) | `counterparties:write` · WRITE |
| Плащане към контрагент | `POST /pay` (12951), `/pay/indicative-quote` (13097), `/pay/fields` (13364) | `payments:write` · READ+PAY |
| Между свои сметки | `POST /transfer` (13538), `GET /transfer-reasons` (13607) | `transfers:write` · READ+PAY |
| FX | `GET /rate` (5829), `POST /exchange` (5927), `GET /exchange-reasons` (6040) | `exchange:read/write` · PAY |
| Payment drafts | `/payment-drafts*` (8373–9102) | `payment-drafts:read/write` · WRITE |
| Payout links | `/payout-links*` (9193–9550) | `payout-links:read/write` · PAY+WRITE |
| Карти | `/cards*` (2779–4372), `GET /cards/{id}/sensitive-details` (4479) | `cards:*`, `card-sensitive-details:read` · READ_SENSITIVE_CARD_DATA |
| Card invitations | `/card-invitations*` (1635–2656) | `card-invitations:*` |
| Екип | `/team-members*`, `/roles`, `/departments*` (10652–12317) | `team-members:*`, `departments:*` |
| Разходи | `GET /expenses` (6127), `/expenses/{id}` (6461), `…/receipts/{id}/content` (6758) | `expenses:read` |
| Счетоводство | `/accounting-categories*`, `/tax-rates*`, `/label-groups*` (44–10515) | `accounting-categories:*`, `tax-rates:*`, `labels:*` |
| Уебхуци v2 | `/webhooks*` на /api/2.0 (13806–14287) | `webhooks:read/write` |
| Симулации | `/sandbox/topup` (9750), `/sandbox/transactions/{id}/{action}` (9618) | `simulations:write` (само Sandbox) |

- `Account.account_type`: current, **merchant**, savings, credit, debt, blocking, other (ред 14609–14618). Bank details
  носят `pooled` + `unique_reference` (ред 14670–14675) — при pooled сметка основанието е ключът за сверка.
- `/pay`: `request_id`, `account_id`, `receiver{counterparty_id, account_id|card_id}`, `amount`, `currency` задължителни
  (ред 18742–18747); `reference` ≤140 (18690–18692); `charge_bearer`; `transfer_reason_code` / `exchange_reason_code` по държава;
  `name_validation_id` (18733–18741) връзва CoP проверката с плащането. Към Revolut сметка — мигновено (12957).
- Payment draft остава чернова, докато **човек** не я изпрати от Business app; при правила за одобрение отива в
  „Pending review“ и чака одобряващ (ред 8447–8457). Ендпойнт за изпращане на чернова през API **няма**.
- Payout link: `counterparty_name`, `request_id`, `account_id`, `amount`, `currency`, `reference` (ред 16462–16469);
  `payout_methods` по подразбиране revolut + bank_account (16529–16533); състояния created, failed, awaiting, active,
  expired, cancelled, processing, processed (18028–18036); отказ поради `too_many_name_check_attempts` (17937). Само UK, ЕИП, AU, SG (21365).
- CoP/VoP (940–1430): услуги `uk_cop`, `eu_cop`, `ro_cop`, `au_cop` (14877–14881); `result_code` matched / close_match /
  not_matched / cannot_be_checked / temporarily_unavailable (1073–1312); EUR причини вкл. `account_switched` (14907–14916).
  „Не е пълен инструмент срещу измами“ (946–951). UK — само след заявка към поддръжката (955). 404 `3006` = нямаш достъп
  до CoP (1387–1402). 429 `3162`: в Румъния >3 проверки за 24 ч без плащане → блок 24 ч (1403–1421).

### Пагинация
| Списък | Как | Таван |
|---|---|---|
| `/transactions` | обратно по `created_at`; следваща страница `to` = `created_at` на последния (изключително), `from` включително (12398–12467) | `count` ≤1000, по подразбиране 100 |
| counterparties, payout-links, team-members, roles | `created_before` + `limit` | 1000 |
| cards, card-invitations | `created_before` + `limit` | 100 |
| accounting-categories, tax-rates, labels, departments | `page_token` → `next_page_token` (липсва = край) | 500 |
| expenses | `from`/`to` + `count` | 500 |
| failed-events | `created_before` + `limit`, не по-старо от 21 дни (14338–14355) | 1000 |
Филтри на `/transactions`: `from`, `to`, `account`, `type`, `request_id`, `state` (многократно, 12509–12525). Филтри на
`/counterparties`: `name`, `account_no`, `sort_code`, `iban`, `bic`.
Вероятно: keyset по `created_at` с изключителен `to` губи редове с еднакъв `created_at` на границата — застъпвай и дедупликирай по `id`.

## 4. Идемпотентност, състояния, лимити, грешки
- `request_id` (≤40 знака, препоръчан UUID v4) — задължителен за `/pay` (18646–18677), `/transfer` (18872–18889),
  `/exchange` (16854–16877), payout links (16490), карти (2911) и card invitations (1673).
  **Важи само 2 седмици** (18668–18676): след това същият `request_id` може да създаде нова транзакция.
- Повторен `request_id` → **400 `code: 3020` „Duplicate request“** (13064–13068), не оригиналът. Тогава търсиш:
  `GET /transactions?request_id=…&from=…` — `from` е задължителен, интервалът е ≤14 дни (12494–12508).
  `GET /transaction/{id}?id_type=request_id` е **остаряло** (12663–12686).
- `TransactionState` (18748–18785): created (асинхронно или насрочено), pending (при Revolut→Revolut се прескача),
  completed, declined, failed, reverted. `TransactionType` (18786–18806): atm, card_payment, card_refund,
  card_chargeback, card_credit, charge, charge_refund, exchange, transfer, loan, fee, refund, topup, topup_return,
  tax, tax_refund, rev_payment. Несигурно: дали `completed` може да стане `reverted` — спецификацията не казва; не приемай `completed` за необратимо без проверка в ръководството.
- Грешки: `Error {code:int, message}` (16595–16606), `ErrorWithId` + `error_id` (16608–16621). 401 `1000`, 403 `9002`
  (19966), 429 `3162` + `Retry-After` (19968–19993), 500 `5000` (20007), 503 + `Retry-After` (20010–20018).
  Общ числов rate limit в спецификацията **няма** — за проверка.

## 5. Уебхуци
- v2: `POST/GET /webhooks`, `GET/PATCH/DELETE /webhooks/{id}`, `POST …/rotate-signing-secret`, `GET …/failed-events`
  (13806–14355, база `/api/2.0`). Само HTTPS (13811). Най-много **10** → 422 `3352` (13871–13882).
- Събития (19857–19863): `TransactionCreated`, `TransactionStateChanged`, `PayoutLinkCreated`, `PayoutLinkStateChanged`.
  Без `events` → по подразбиране двете Transaction* (16554–16563).
- `signing_secret` (префикс `wsk_`) е във всеки отговор, вкл. GET (19798–19800) — не се логва и не се връща към клиент.
- Ротация: `expiration_period` ≤ `P7D`, по подразбиране `P0D` = старата тайна спира веднага (19864–19878); най-много
  **3** активни тайни → 422 `3355` (14257–14268).
- Повторни опити: v2 — при „HTTP error response“ още **3 пъти през 10 мин** (21448); v1 — още 2 (21425–21426).
  Вероятно: тук и 5XX е „error response“ (в Merchant 5XX не е описан).
- Неуспешните събития се четат до **21 дни** назад (`/failed-events`, 14287–14355) — източник за проверка на висящите.
- Тяло (по примера на failed-events, 14371–14406): `{event, timestamp, data}`; при TransactionCreated `data` е цялата
  транзакция (id, type, state, request_id, reference, legs[] със сума, такса, валута, контрагент). PayoutLinkStateChanged:
  `data{id, request_id, old_state, new_state}`. Примерът за TransactionStateChanged **липсва**. Id на събитие в тялото няма
  (`WebhookEvent.id` е само в обвивката на failed-events) → дедупликация по `event` + `data.id` + състояние.
- **Подпис на уебхука:** `Revolut-Signature` / `Revolut-Request-Timestamp` — **0 съвпадения** в `business.yaml`; схемата
  е в „About webhooks“ → **НЕПРОЧЕТЕНО**. Не приемай, че е като при Merchant. Проба с истински уебхук в sandbox преди кода.
  IP адреси на подателя — също за проверка.
- v1 `/webhook` (13676–13762) — остарял; абонира за всичко без избор (21437).

## 6. Статус
- **Само Sandbox:** симулациите — top-up ≤10 000 във всяка валута, състояния pending/completed/reverted/failed; преход
  на транзакция complete/revert/decline/fail (крайни) — ръководството за симулации + 9618, 9750.
- **Няма ги в Sandbox (на практика само Production):** Expenses (21332), `/counterparties/countries` (5268), `/counterparties/fields`
  (5330), `/pay/fields` (13371). В Sandbox само за тест: CoP — валидна заявка винаги `cannot_be_checked` (953–957);
  indicative quote — винаги `instant` (13109–13111). Counterparty в Sandbox — тестови Revtag `john1pvki`…`john9pvki` (21317–21324).
- **Остаряло:** OAuth `AccessToken` (14467); Webhooks v1 (13676–13762); `id_type=request_id` (12663–12686); `Expense.labels` → `splits[].labels` (16962–16967).
- **Beta:** в спецификацията няма маркер.

## 7. Разлики спрямо Merchant API (често се бъркат)
| | Business | Merchant |
|---|---|---|
| Хост | `b2b.revolut.com/api/1.0` (+ `/api/2.0` за уебхуци) | `merchant.revolut.com/api` |
| Версия | в пътя | хедър `Revolut-Api-Version` (дата) |
| Суми | `double`, основни единици | цели числа, минимални единици |
| Идемпотентност | `request_id` в тялото, задължителен, 2 седмици, повтор → 400 `3020` | хедър `Idempotency-Key`; create order го няма |
| Подпис на заявки | по подразбиране **да** (Accounts, Transfers и т.н.) | по подразбиране **не** |
| Остарял вход | OAuth + JWT (40 мин) | secret key (мигриран в конзолата) |
| Събития | `TransactionCreated`… (PascalCase), тялото носи сумата | `ORDER_COMPLETED`… тялото носи само id |
| Повторни опити | при грешка 3 × 10 мин | при 4XX/timeout 3 × 10 мин |
| Изплащане | `/pay`, `/transfer`, payout links, drafts | payouts само към своята Business сметка, целия баланс |
Ключът и тайната на уебхука са **различни** обекти: Business уебхук ≠ Merchant уебхук (отделен адрес, тайна, парсер).

## 8. Как да ползваме (за нашите продукти) — предложение, нищо не е внедрено
- Business API днес не се вика никъде (grep `b2b.revolut` в fakturist/linketto/rilievi → 0).
- **fakturist — банковият превод за план:** днес мастърът потвърждава на ръка (`fakturist/src/routes/admin-actions.ts:55-59`)
  по основанието „FKT-…“ (`fakturist/prisma/schema.prisma:585-586`). Ключ само за четене (`transactions:read` + уебхук) →
  `TransactionCreated` → `GET /transaction/{id}` → `completed`, кредитен leg, EUR, сума (→ центове с десетичен разбор) ==
  `amountCents`, основанието съвпада → **предложение** в панела; човек потвърждава (правилото „права по план само от
  проверен webhook или от мастър панела“ остава). Резерва: `/transactions` по прозорец + `/failed-events`.
- **fakturist — сверка на клиентите** (`src/bank/reconcile.ts:83`, `:172`; `BankLine` в `schema.prisma:1017-1044`): поток
  на живо вместо camt.053 би искал API ключа на всеки клиент при нас = чужди банкови данни + PSD2 (AIS) → Правния Разбирач; дотогава остава файлът.
- **Баланс на Merchant:** сметки `account_type: merchant` (14613) → табло с баланса (`accounts:read`). Дали `/transfer` приема merchant сметка като източник — за проверка.
- **CoP/VoP:** нужно само ако ние плащаме навън (връщане по банков път на FAILED плащане по план). Пътят е CoP → payment draft → човек изпраща в app.

Инварианти (за бъдещ код): сървърна сума ? (само от `GET /transaction/{id}`, `double` → центове с десетичен разбор) ·
подпис върху суровото тяло ? (схемата на Business уебхука е НЕПРОЧЕТЕНА — проба в sandbox) · `payment_status` ?
(аналогът е `state: completed` от GET, не от тялото на събитието) · идемпотентност по `event.id` ? (id на събитие няма →
дедупликация по `event` + `data.id` + състояние; изходящите — `request_id`) · права само през webhook + GET ✓ (правилото
на fakturist остава; човек потвърждава).

Това не е правен съвет.
