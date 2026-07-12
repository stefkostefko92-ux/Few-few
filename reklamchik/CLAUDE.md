# CLAUDE.md — reklamchik

Насоки за AI асистенти в `reklamchik/` — **Рекламчика**: web приложение за автоматизирано
управление на платена реклама (Google Ads + Meta Ads). Домейн-агентът е
**„Рекламчика“** (`.claude/agents/reklamchika.md`) — пускай него за рекламна експертиза,
кампанийна стратегия и API въпроси; той е обучен с проучването в `RESEARCH.md`.

## Стек

Express 4 · EJS · better-sqlite3 (WAL) · plain JS **ESM** (`"type": "module"`) · без build стъпка.
Node ≥20 (използва вграден `fetch`). Стил: Prettier (100 колони, single quotes) + ESLint.

## Quality gate (задължителен преди „готово“)

```bash
npm run lint && npm run format:check && npm test
```

## Железни правила на продукта

1. **Нищо не харчи само.** Кампания се публикува ВИНАГИ със `status: PAUSED` в платформата;
   активирането е отделно човешко действие. Никога не махай това.
2. **`guard.js` минава ПРЕДИ всяко платформено повикване.** Нови полета/фийчъри се добавят
   първо там (бюджетни тавани, DSA <18, специални категории, consent, AI Act).
3. **Токени само криптирани** (`crypto.js`, AES-256-GCM, ключ от средата). Никакви тайни в
   репото, в логовете или в одитната следа (`audit_log.detail_json` — без токени!).
4. **Автоматизация с граници**: правилата изискват `min_spend`, имат `cooldown_hours`,
   бюджетните промени са ≤ ±20% на стъпка. Не разхлабвай без изрично искане на собственика.
5. **API версии се вдигат съзнателно** (`GOOGLE_ADS_API_VERSION`, `META_API_VERSION` в
   `config.js`) — при вдигане сверявай deprecation бележките; Google major живее ~1 г.,
   Meta Marketing API ~1 г. Класически Google VIDEO кампании са read-only през API —
   YouTube върви през DEMAND_GEN (не „поправяй“ мапинга VIDEO→DEMAND_GEN).
6. **Dry-run режимът е свещен**: без креденшъли всичко работи симулирано (`connectors/base.js`).
   Нова connector функционалност получава dry-run еквивалент + тест.
7. **BG UI**, „ … “ кавички; одитната следа и предпазителите говорят български.

## Къде какво

| Файл                          | Отговорност                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/guard.js`                | твърди предпазители (бюджет/DSA/consent/AI Act) — сърцето на безгрешността                     |
| `src/connectors/googleAds.js` | Google Ads REST (v24): бюджет = отделен ресурс, GAQL отчети                                    |
| `src/connectors/metaAds.js`   | Meta Graph API (v25.0): ODAX, placements (вкл. `threads`), CTWA, `dsa_payor`/`dsa_beneficiary` |
| `src/rules.js`                | двигател на авто-правилата + `RECOMMENDED_RULES` (прагове от проучването)                      |
| `src/scheduler.js`            | цикъл sync+rules; `tick()` е идемпотентен и не се препокрива                                   |
| `RESEARCH.md`                 | пълното проучване с източници — четвъртичният мозък на продукта                                |

## Тестове

`test/smoke.test.js` — Node вграден runner, `DB_PATH=:memory:`. Guard-овете, правилата,
dry-run детерминизмът и auth редиректите са покрити; нова логика → нов тест там.
