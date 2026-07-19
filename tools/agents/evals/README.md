# Агентен golden eval (детерминистичен слой)

Машинно-четими „златни случаи" + скоринг, за да ловим **регресия след редакция на дефиниция**.
Допълва `_evals/golden-cases.md` (прозата) и `_evals/promptfooconfig.yaml` (LLM-rubric слоя).

## Защо
LLM изходът варира → не пускаме агента вместо теб. Ти пускаш агента върху `task`-а, записваш
изхода му във файл, и харнесът го **скорира детерминистично** спрямо очаквани белези и капани.
„Грейдвай това, което агентът произвежда, не пътя" (`_evals/reliability.md`).

## Файлове
- `eval-lib.mjs` — чистият скорер (`scoreOutput`, `evalCheck`, `validateSpec`). Без fs/мрежа.
- `eval.mjs` — CLI (list / check / task / скоринг / батч).
- `eval.test.mjs` — `node --test` над скорера (CI гейт, без агент).
- `specs/*.json` — по един „златен случай": `{ id, agent, task, expect: [...] }`.
- `specs/injection-*.json` + `fixtures/injection-*.md` — **red-team**: враждебно съдържание;
  агентът трябва да го третира като данни, не инструкции (проверка `none` за последвана инжекция).

## Формат на проверка (`expect[]`)
- `{ any: [...], label }` — поне ЕДИН маркер трябва да е в изхода (очакван белег).
- `{ all: [...], label }` — ВСИЧКИ трябва да са.
- `{ none: [...], label }` — НИТО ЕДИН (капан / последвана инжекция / изтекла тайна).
- Маркер = низ (case-insensitive substring) или `"/pattern/flags"` (регекс).

## Употреба
```bash
node tools/agents/evals/eval.mjs --list                 # spec-овете
node tools/agents/evals/eval.mjs --check                # структурна валидност (CI, без агент)
node tools/agents/evals/eval.mjs --task kodadjiyata      # покажи входа за агента
# пусни агента върху входа, запиши изхода му в out.txt, после:
node tools/agents/evals/eval.mjs kodadjiyata out.txt     # скорирай
node tools/agents/evals/eval.mjs --run outdir/           # батч: outdir/<specId>.txt
```

## В CI
`eval.mjs --check` + `node --test eval.test.mjs` са **детерминистични** (не пускат агент) и вървят
в `agents.yml`. Поведенческият скоринг (реален агентен изход) се пуска ръчно/периодично — резултатът
е тренд на pass-rate между версиите на дефиницията, не хард гейт (LLM недетерминизъм).

## Поддръжка
Нов golden случай = нов `specs/<id>.json` от реален провал (най-ценните идват от бъгове, които сме
изпуснали). Маркирай случай за остарял след ~90 дни (фактите дрейфат). Дръж `expect` малък и специфичен.
