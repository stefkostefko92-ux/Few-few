# Рекламчика — автоматизирана платена реклама

Web приложение за **автоматизирано управление на платена реклама** през:

- **Google Ads** — Search, Performance Max, Demand Gen (= YouTube: in-stream, in-feed, Shorts), Display
- **Meta Ads** — Facebook, Instagram, **Threads**, Messenger + **Click-to-WhatsApp**

Собственик на домейна знания е агентът **„Рекламчика“** (`.claude/agents/reklamchika.md`).
Пълното проучване (API версии, лимити, прагове, право на ЕС) е в [`RESEARCH.md`](./RESEARCH.md).

## Философия: безгрешност по подразбиране

1. **Нищо не харчи само.** Всяка кампания се създава като чернова → публикува се **ПАУЗИРАНА**
   в платформата → активира се само със съзнателно човешко действие.
2. **Твърди предпазители** (`src/guard.js`) преди всяко API повикване: тавани на бюджета
   (на кампания + общ), DSA блокади (без профилиране под 18, без специални категории),
   изискване за потвърдено съгласие (Consent Mode v2 / CMP) при EEA таргетиране,
   AI Act чл. 50 разкриване за AI креативи.
3. **Автоматизацията е ограничена**: правилата действат само при статистическа маса
   (мин. разход), имат cooldown, а бюджетните промени са капнати на ±20% на стъпка
   (пази learning phase и джоба).
4. **Пълна одитна следа**: всяко действие — човешко или автоматично — се записва
   (GDPR чл. 5(2) отчетност).
5. **Dry-run по подразбиране**: без креденшъли всичко се симулира детерминистично —
   приложението се разучава и тества без да похарчи стотинка.

## Старт

```bash
cd reklamchik
npm install
npm run dev          # http://localhost:3060 — dry-run, вход: admin@localhost / admin
```

Quality gate (пускай преди всяко „готово“):

```bash
npm run lint && npm run format:check && npm test
```

## Свързване (реални акаунти)

### Google Ads

1. **Developer token**: production MCC акаунт → https://ads.google.com/aw/apicenter (ревюто бави — кандидатствай рано; Basic ниво = 15 000 операции/ден).
2. **OAuth**: Google Cloud проект → OAuth client (Web) → scope `https://www.googleapis.com/auth/adwords`, `access_type=offline` → refresh token.
3. Попълни `GOOGLE_ADS_*` в `.env`, добави връзка в „Връзки“ с customer ID (без тирета) и refresh token-а.
4. Разработвай срещу **test accounts** (не сервират реклами и не харчат).

### Meta

1. Meta App (Business use case) → App Review за `ads_management`, `ads_read`, `business_management`.
2. Business Manager → **System User** → генерирай токен (препоръка: 60 дни, не „never expires“), scoped към конкретния ad account + page.
3. Попълни `META_APP_ID`/`META_APP_SECRET` в `.env`, добави връзка с `act_<id>` и System User токена.
4. Access tier: _Limited_ стига за собствени акаунти в development; _Full_ (500+ calls/15 дни, <15% error) за продукция.

Токените се пазят **само криптирани** (AES-256-GCM, ключ `ENCRYPTION_KEY` от средата).

## Архитектура

```
src/
  server.js / app.js      Express + helmet CSP + rate limit + CSRF
  config.js               всичко чувствително от средата; isDryRun()
  db.js                   SQLite (better-sqlite3, WAL): connections, campaigns,
                          creatives, metrics_daily, rules, audit_log
  crypto.js               AES-256-GCM за токени в покой
  guard.js                твърдите предпазители (бюджет, DSA, consent, AI Act)
  connectors/
    base.js               интерфейс + dry-run симулатор (детерминистични метрики)
    googleAds.js          Google Ads REST v24 (бюджет = отделен ресурс; VIDEO→DEMAND_GEN)
    metaAds.js            Meta Graph API v25.0 (ODAX, placements вкл. threads, CTWA, DSA полета)
  rules.js                двигател на правилата (метрика→условие→действие, cooldown, min_spend)
  insights.js             синхронизация на дневни метрики
  scheduler.js            цикъл: sync + правила на всеки N минути
  routes/ + views/        BG UI: дашборд, кампании, правила, връзки, одит
```

## Какво съзнателно НЕ прави

- **Не** обслужва клиенти — продуктът е **first-party** (собствените ни рекламни акаунти).
  Роля „обработващ“ (чл. 28 GDPR) изисква DPA, tenant изолация и per-tenant изтриване,
  които не са имплементирани.
- **Не** активира кампании автоматично — авто-действие „activate“ не съществува в
  двигателя на правилата; активира само човек.

- **Не** създава класически Video кампании в Google — те са **read-only през API**;
  YouTube минава през Demand Gen (документирано ограничение на Google).
- **Не** поддържа политическа реклама (`contains_eu_political_advertising` винаги „не“).
- **Не** качва Custom Audiences от имейл листи без декларирано правно основание (виж RESEARCH.md §Право).
- **Не** заобикаля съгласието през server-side CAPI — server събития следват същия consent gate.

## Деплой

Като medqr/vizitka: systemd услуга + reverse proxy; `.env` на сървъра (mode 600).
Интегрира се в `deploy/autodeploy.sh` при пускане в продукция (собственик: VPS-аджията).
