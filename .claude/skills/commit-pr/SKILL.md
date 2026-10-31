---
name: commit-pr
description: >-
  Нашите git/PR конвенции — conventional български комити, feature branch → PR → main, secret-scan преди
  commit, PR по шаблона. Ползвай когато трябва да комитваш, push-ваш, отваряш PR, или потребителят каже
  „запази промените", „вдигни", „направи PR". Никога тайни в commit; conventional заглавие; работи на
  feature клон, не директно на main без разрешение.
allowed-tools: Bash(git branch *) Bash(git status *)
---

# Commit & PR (конвенции на репото)

## Състояние при зареждане (вмъкнато от git)
- Клон: !`git branch --show-current`
- Незаписани промени (по продукти — един продукт на commit):

!`git status --short`

## Преди commit — винаги
```bash
node tools/security/secret-scan.mjs          # нула тайни/PII в diff-а (hard gate)
node tools/agents/scope-check.mjs --staged   # монорепо закон №1: един продукт на промяна (hard gate; и в CI: scope.yml)
# + пусни quality-gate на засегнатия продукт (виж skill quality-gate)
```

## Ядро → тест първо и преглед за сигурност (31.10.2026)
```bash
node tools/agents/core-map.mjs --diff        # ядро = пари, фискал, вход, медицински и лични данни, схема
```
Пипа ядро → преди draft PR: умение `security-review` върху промените и умение `code-review` на ниво
`low` (най-малко фалшиви попадения). Ядро без тест в същия продукт (изход 1) → първо тест (умение
`test-driven-development`); човекът чете тестовете първи. Листата (изгледи, стилове, текстове) — свободно.
Слоевете по Anthropic: в сесията → `security-review` → `code-review` → CI (`security.yml`, `new-deps`).

## Commit
- **Conventional, български, описателен:** `type(scope): описание` — type ∈
  `feat|fix|chore|docs|refactor|perf|test|build|ci|style|revert`. Пример: „feat(medqr): спешен SOS изглед".
- Съобщението обяснява **какво и защо**, не преразказва diff-а. Съответства на съществуващата история.
- Тайни/лични данни/ключове — **никога** в commit (hard-гейтнато от secret-scan + CI security workflow).

## Branch → PR → main
- Работи на **feature клон**, не директно на `main` без изрично разрешение. `git push -u origin <branch>`.
- При мрежов провал — retry с exponential backoff (2s/4s/8s/16s).
- След push — отвори PR (draft), ако няма отворен за клона. **Провери за PR шаблон**
  (`.github/pull_request_template.md`) и попълни секциите му (Свързан issue / Проблем / Промяна / Чеклист)
  от реалните промени; пропусни секции за тайни/креденшъли. Заглавие на PR = **conventional** (гейтва се
  от `pr-title.yml`).
- Ако PR-ът е вече **merged** → нова работа е нов PR; рестартирай клона от последния `main` (не трупай
  върху merged история).

## Преглед от нашите агенти (правило на собственика, 27.10.2026)
PR с код или зависимости минава през НАШИТЕ агенти, преди да е готов — кои, решава пътят, не настроението:
```bash
node tools/agents/pr-review.mjs --pr <номер> --ref <клон> --title "<заглавие>" --out <scratchpad>/pr-review --record
```
Код → Кодаджията + до двама собственици на домейна (каса → Касаджията, плащания → Продавача, деплой →
VPS-аджията …); само зависимости → Кодаджията; само документи → никой. Присъда „блокер“ или „поправки“ →
оправи и пусни пак (дневникът `tools/agents/pr-reviews.json` пази кой sha е прегледан). Всеки отворен PR:
`tools/agents/pr-triage.mjs --prs <списък от GitHub>` → `pr-review.mjs --plan`.

## Агентен слой
Пипаш `.claude/agents|skills|hooks`, `tools/agents|memory|skills`, таблото → пусни допълнително:
`node tools/agents/gate.mjs` (включва oversee и уменията) · `node --test $(find tools -name '*.test.mjs')` — виж quality-gate.
Собственик на CI/PR конвейера = агентът **Конвейерът**.

## Дефиниция на „готово"
secret-scan чисто · гейт зелен · ядро → с тест и с `security-review` · conventional български commit на feature
клон · PR (draft) с попълнен шаблон · нашите агенти по `pr-triage` са прегледали PR-а без открит блокер.
