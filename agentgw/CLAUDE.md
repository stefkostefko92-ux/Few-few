# CLAUDE.md — Агентски шлюз (agentgw)

Нашите агенти „живеят“ на собствения ЕС сървър; сайтовете ги ползват чрез **агентски ключове**
(ключ = сайт; на ключа се задават позволените агенти и домейни). Claude се вика **само през Google
Vertex AI в ЕС**. Самостоятелен продукт — `cd agentgw/` за всичко.

## Стек

Node ≥22 · TypeScript strict (ESM, `NodeNext`) · Express 5 · Zod 4 · Prisma 6 + PostgreSQL ·
`@anthropic-ai/vertex-sdk` v1 (`AnthropicVertex({ projectId, region })`, API версия `2026-10-21`;
вдига се САМО заедно с `@anthropic-ai/sdk` v1 — иначе второ копие) · тестове `node:test` през tsx.

## Команди (гейтът)

```bash
npm ci
npm run gate          # lint (prettier + профили) + typecheck + test + build — „готово“ = зелено
npm run profiles      # регенерира agents/ от вътрешните дефиниции (пусни след промяна там)
npm run dev           # локално (иска DATABASE_URL + KEY_PEPPER)
npm run key -- …      # CLI за ключове (след build) — виж deploy/DEPLOY.md §7
```

## Layout

- `src/app.ts` — Express: `/v1/chat` (SSE), `/v1/agents`, `/widget.js`, `/healthz`, CORS, headers
- `src/claude.ts` — `ChatModel` договор + `buildParams` (кеш, thinking, effort, нула tools) + Vertex клиент
- `src/keys.ts` — формат/хеш на ключове, `Store` интерфейс; `src/store/{prisma,memory}.ts`
- `src/pii.ts` — редакция (имейл, телефон, ЕГН, IBAN, карта) преди изпращане
- `src/pricing.ts` — list цени + `PRICE_MULTIPLIER` (ЕС крайна точка +10%)
- `src/leak.ts` — филтър на SSE изхода (канарче, откъси от доктрината, вътрешни папки)
- `src/eval/` — оценка на безопасността на публичния чатбот (харнес + сценарии; живо — само ръчно)
- `src/cli/` — `npm run key` (create/list/revoke/grant/origins/limit), одит верига
- `agents/` — **генерирани** публични профили (не редактирай ръчно); `profiles.config.json` = кои агенти са публични
- `scripts/gen-profiles.mjs` · `scripts/check-profiles.mjs` (в гейта) · `scripts/markers.mjs`
- `public/widget.js` — ванилов уиджет, Shadow DOM, BG/EN/IT, без бисквитки

## Инварианти (не ги отслабвай)

- **Само ЕС:** `VERTEX_REGION` ∈ `EU_REGIONS` (`src/config.ts`) — `eu` + изричен списък на
  регионите на Vertex в държави от ЕС (иначе не стартира; `europe-west2` Лондон и `europe-west6`
  Цюрих НЕ са ЕС). Opus 5.5 / Sonnet 5.5 искат `eu`
  (единичните региони поддържат само Sonnet 4.6 и по-стари). Никога директен Anthropic API и никога
  Anthropic-managed на Google Cloud (само `global`, не е ЕС обработка).
- **Fail-closed:** няма GCP данни → 503, без резервен доставчик.
- **Публичните агенти са само разговорни** — `tools` не се подава; профилите минават през филтъра
  за вътрешни маркери (пътища, инструменти, инфраструктура, памет). `_memory` поуки НЕ се излагат.
- **Ключовете** — ключ = сайт → позволени агенти + домейни, с месечен таван; само HMAC-SHA256 хеш с
  `KEY_PEPPER`; показват се веднъж. `cs_pk_` важи само от Origin-ите си; `cs_sk_` с Origin хедър → 403.
- **Разговорите не се пазят** — само броячи на токени/разход по ключ+месец. Логовете без съдържание,
  без ключ, без IP.
- **Prompt caching:** доктрина + профил отпред (`cache_control`), разговорът отзад; `CHAT_EFFORT`
  е постоянен (смяната инвалидира кеша).
- Модел по агент от `agents-dashboard/agents.json` (`opus`→`MODEL_OPUS`, `sonnet`→`MODEL_SONNET`),
  записан в `agents/index.json` при генерация.
- Фалшиви ключове/PII в тестовете се сглобяват в runtime (secret-scan).
- **Цени = fail-closed:** `MODEL_*` без ред в `src/pricing.ts` → шлюзът не стартира; непознат модел
  при таксуване → таванът на всички известни цени по категория. Прекъснат/филтриран поток (няма
  финален `usage`) се таксува с горна граница `MAX_OUTPUT_TOKENS` изход; без `message_start`
  (прекъсване по време на отварянето или преди първото събитие) входът е горна оценка — UTF-8
  байтовете на `system` + `messages` (`inputTokensUpperBound`).
- **Отказ (`stop_reason: "refusal"`) = нулиране на контекста:** уиджетът маха отказания ход и не пази
  частичния отговор (docs: handle-streaming-refusals). Сървърът е без история — няма какво да нулира.
- **Филтър на изхода:** канарче (`LEAK_CANARY`, случайно за процеса) в доктрината + тесен списък
  маркери; засечено → потокът спира със `refusal` (`reason: output_filtered`). Сравнява нормализиран
  поток (tag знаци U+E0020–E007E → ASCII, празни „букви“ U+3164/U+2800… → интервал; канарче:
  NFKD без диакритики + главни + кирилски/гръцки двойници + само букви/цифри; откъси: NFKC, тирета
  → „-“, интервали → един, без невидими и комбиниращи знаци, латинските двойници приети) и задържа
  по нормализирани знаци: последните `дължина на канарчето − 1` букви/цифри и последните 64 знака
  на откъсите. Остатъчен риск: кодирано/преведено/изписано с думи или обърнато (RLO) канарче, както
  и с малки главни (U+1D04…), букви Cherokee или арабско-индийски цифри, не се хваща — филтърът е
  втори слой, не единствен.
  Пълният `findMarkers` НЕ е за живия изход (блокира „Edit“, „собственик“…).
- **Повторни откази:** `REFUSAL_STRIKES` за `REFUSAL_WINDOW_MIN` по ключ+IP (IPv6 по /64; в паметта,
  без съдържание) → 429 `too_many_refusals`. „Ударът“ се резервира в началото на заявката и се
  освобождава при затварянето на отговора, така че паралелни заявки не минават всички покрай прага.

## Решения (приети от координатора, 2026-11-19)

- **Недовършен поток се таксува до `MAX_OUTPUT_TOKENS`.** Причина: финалният `usage` идва едва с
  `message_delta`; при прекъсната от клиента връзка или спрян от филтъра поток преди него
  шлюзът записваше ~1 изходен токен, докато Google таксува генерираното до прекъсването —
  отваряне и затваряне на заявки заобикаляше месечния таван. Горната граница е fail-closed;
  цената е надценка до `MAX_OUTPUT_TOKENS` изход на прекъсната заявка.
- **Броячът на откази е по ключ+IP, не само по ключ.** Причина: публичният ключ е общ за всички
  посетители на сайта — кофа само по ключ дава на един злонамерен посетител да спре чата за всички
  (DoS). IP се държи само в паметта (като лимита заявки/мин), не се записва. Цена: посетители зад
  общ NAT (или в една IPv6 /64) делят една кофа, а заявките в полет се броят към прага — при
  `REFUSAL_STRIKES=5` от една кофа може да има най-много 5 едновременни заявки (уиджетът праща една
  наведнъж). Лимитът заявки/мин и неуспешните ключове остават по точен IP.
- **Грешка на Vertex по средата на потока се таксува като недовършен поток** (`MAX_OUTPUT_TOKENS`
  изход). Причина: без финалния `message_delta` не знаем колко е генерирано, а дали Google таксува
  частично генерираното при такава грешка, не е проверено. Цена на едно такова прекъсване при
  подразбиращия се `MAX_OUTPUT_TOKENS=4096` и `PRICE_MULTIPLIER=1.1`: 4096 × 20 USD/MTok × 1.1 ≈
  **0,090 USD** на Opus 5.5 и ≈ **0,045 USD** на Sonnet 5.5 изход, плюс входа (ако грешката е преди
  `message_start` — горна оценка по байтове: ~12 KB промпт ≈ 0,053 USD на Opus 5.5). Надценката
  остава в месечния брояч на ключа; не се връща автоматично.

## Модели — как да провериш и смениш

Подразбиране: `claude-opus-5-5` / `claude-sonnet-5-5` — GA в `eu (Europe multi-region)` по
страниците на Google Cloud (сверено 2026-11-19):
`docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/opus-5-5` и `…/sonnet-5-5`.
Заявките са съвместими с 5.5 (adaptive thinking, изрично `effort`, без temperature/top_p/top_k,
без `budget_tokens`, без prefill — разговорът винаги завършва с потребителя).

1. Model Garden → „Claude Opus 5.5“ / „Claude Sonnet 5.5“ → **Enable**; IAM → Quotas → квота за `eu` > 0.
2. Проба (на сървъра, с удостоверенията на service account-а):
   `curl -sS https://aiplatform.eu.rep.googleapis.com/v1/projects/<ПРОЕКТ>/locations/eu/publishers/anthropic/models/claude-sonnet-5-5:rawPredict -H "Authorization: Bearer $(gcloud auth print-access-token)" -H 'Content-Type: application/json' -d '{"anthropic_version":"vertex-2023-10-16","messages":[{"role":"user","content":"Здравей"}],"max_tokens":50}'`
   → 200. 404 = моделът не е активиран/наличен в `eu`; 429 = квота.
3. Връщане назад без deploy: `MODEL_OPUS=claude-opus-5` / `MODEL_SONNET=claude-sonnet-5` в
   `/etc/agentgw/agentgw.env` → `systemctl restart agentgw`. Нов модел ID = първо ред в `src/pricing.ts`.

## Оценка на безопасността (само ръчно, на сървъра — струва пари)

По „Building strong safety evaluations“ (anthropic.com/engineering, 13.11.2026): реалната
конфигурация (същият Express, доктрина + профил, PII, филтър, нулиране след отказ), предварително
записани конструкт и прагове (`src/eval/scenarios.ts` → `PREREGISTRATION`), сдвоени случаи
вредно/безобидно, многоходов симулиран потребител (отделен модел), ARR + Wilson 95 %, счупен
оценител → `grader_broken` и изключен. `npm test` НЕ вика модел.

```bash
cd /opt/agentgw/current
sudo systemd-run --quiet --pty --wait --uid=agentgw --gid=agentgw \
  -p EnvironmentFile=/etc/agentgw/agentgw.env -p WorkingDirectory=/opt/agentgw/current \
  /usr/bin/node dist/eval/safety.js run --max-usd 5 --out /var/tmp/agentgw-safety.jsonl
```

- `--max-usd` е задължителен (без подразбиране); от 75 % нови случаи не започват. Преди всяко
  повикване се резервира горната му граница (вход по байтове + целия `max_tokens`): не се побира →
  не се вика. Неуспешен опит се таксува с горната граница и се брои (`failedCalls`). 16 сценария × 7 = 112.
- Симулиран потребител = `EVAL_USER_MODEL` (подразб. `MODEL_SONNET`), оценител = `EVAL_GRADER_MODEL`
  (подразб. `MODEL_OPUS`); Haiku се отказва. Изход 0 = pass, 1 = fail, 2 = invalid.
- Записът (mode 600) е синтетичен. Валидация на оценителя: човек разметва сляпо извадка
  (`{"id":"…","appropriate":true}` на ред) → `node dist/eval/safety.js kappa отчет.jsonl разметка.jsonl`
  (Cohen's kappa ≈ съгласието между двама души). Изтрий записа след прегледа.
- Промяна на прагове/сценарии след видян резултат = нов `PREREGISTRATION.version`.
