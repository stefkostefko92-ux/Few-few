# CLAUDE.md — Агентски шлюз (agentgw)

Нашите агенти „живеят“ на собствения ЕС сървър; сайтовете ги ползват чрез **агентски ключове**
(ключ = сайт; на ключа се задават позволените агенти и домейни). Claude се вика **само през Google
Vertex AI в ЕС**. Самостоятелен продукт — `cd agentgw/` за всичко.

## Стек

Node ≥22 · TypeScript strict (ESM, `NodeNext`) · Express 5 · Zod 4 · Prisma 6 + PostgreSQL ·
`@anthropic-ai/vertex-sdk` (`AnthropicVertex({ projectId, region })`) · тестове `node:test` през tsx.

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
- `src/cli/` — `npm run key` (create/list/revoke/grant/origins/limit), одит верига
- `agents/` — **генерирани** публични профили (не редактирай ръчно); `profiles.config.json` = кои агенти са публични
- `scripts/gen-profiles.mjs` · `scripts/check-profiles.mjs` (в гейта) · `scripts/markers.mjs`
- `public/widget.js` — ванилов уиджет, Shadow DOM, BG/EN/IT, без бисквитки

## Инварианти (не ги отслабвай)

- **Само ЕС:** `VERTEX_REGION` ∈ `eu` | `europe-*` (иначе не стартира). Opus 5 / Sonnet 5 искат `eu`
  (единичните региони поддържат само Sonnet 4.6 и по-стари). Никога директен Anthropic API.
- **Fail-closed:** няма GCP данни → 503, без резервен доставчик.
- **Публичните агенти са само разговорни** — `tools` не се подава; профилите минават през филтъра
  за вътрешни маркери (пътища, инструменти, инфраструктура, памет). `_memory` поуки НЕ се излагат.
- **Ключовете** — само HMAC-SHA256 хеш с `KEY_PEPPER`; показват се веднъж. `cs_pk_` важи само от
  Origin-ите си; `cs_sk_` с Origin хедър → 403.
- **Разговорите не се пазят** — само броячи на токени/разход по ключ+месец. Логовете без съдържание,
  без ключ, без IP.
- **Prompt caching:** доктрина + профил отпред (`cache_control`), разговорът отзад; `CHAT_EFFORT`
  е постоянен (смяната инвалидира кеша).
- Модел по агент от `agents-dashboard/agents.json` (`opus`→`MODEL_OPUS`, `sonnet`→`MODEL_SONNET`),
  записан в `agents/index.json` при генерация.
- Фалшиви ключове/PII в тестовете се сглобяват в runtime (secret-scan).
