---
name: quality-gate
description: >-
  Пуска пълния quality gate на засегнатия продукт (lint + typecheck/format + test + build) ПРЕДИ да
  обявиш работа за готова. Ползвай ВИНАГИ преди commit/PR/„готово", когато си пипал код в който и да е
  продукт — дори без потребителят да казва „пусни тестовете". Гейтът е различен на всеки продукт;
  CI е path-филтриран (всеки workflow тича само при промяна в неговата папка), затова пусни точно
  гейта на продукта, който си докоснал. „Готово" = гейтът е РЕАЛНО зелен, не „предполагам минава".
---

# Пусни quality gate на засегнатия продукт

**Едно правило:** `cd` в продукта, пусни неговия пълен гейт, покажи изхода. Не смесвай продукти
(няма root `package.json`). CI дублира точно това (path-филтрирано), затова зелено локално = зелено CI.

## Гейт по продукт (пусни от папката на продукта)
| Продукт | Команди |
|---------|---------|
| `zabobovdol/` | `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` |
| `medqr/` | `npm run lint` · `npm run format:check` · `npm test` |
| `Gaming/` | `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` (turbo fans out) |
| `linketto/`, `Minyor/`, `scuolabulgara/`, `mastilko/`, `CSPos/` | Next+TS: `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` |
| `SupremeDiscordBot/`, `treydar/`, `panev/`, `vizitka/`, `eternaltouch/` | plain ESM: `npm run lint` · `npm test` (виж product `package.json`) |

Не помниш командите на конкретен продукт → **прочети неговия `CLAUDE.md`/`README`** (там е каноничният
списък). Не гадай скриптове.

## Агентен слой (ако си пипал `.claude/agents`, hooks, tools/agents|memory)
```bash
node tools/agents/oversee.mjs                    # fail-closed: 0 твърди = здрав
node tools/agents/evals/eval.mjs --check         # структурна валидност на golden spec-овете
node --test $(find tools -name '*.test.mjs')     # надзор + скорер + рубрика
```

## Сигурност (винаги преди commit)
```bash
node tools/security/secret-scan.mjs              # нула тайни/PII в diff-а
```

## Дефиниция на „готово"
Всяка стъпка от гейта на продукта е пусната и **зелена** (покажи изхода) + secret-scan чисто.
Провал → поправи и пусни пак, не докладвай „готово". Български за потребителски/комит текст.
