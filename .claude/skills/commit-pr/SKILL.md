---
name: commit-pr
description: >-
  Нашите git/PR конвенции — conventional български комити, feature branch → PR → main, secret-scan преди
  commit, PR по шаблона. Ползвай когато трябва да комитваш, push-ваш, отваряш PR, или потребителят каже
  „запази промените", „вдигни", „направи PR". Никога тайни в commit; conventional заглавие; работи на
  feature клон, не директно на main без разрешение.
---

# Commit & PR (конвенции на репото)

## Преди commit — винаги
```bash
node tools/security/secret-scan.mjs          # нула тайни/PII в diff-а (hard gate)
# + пусни quality-gate на засегнатия продукт (виж skill quality-gate)
```

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

## Агентен слой
Пипаш `.claude/agents|skills|hooks`, `tools/agents|memory|skills`, таблото → пусни допълнително:
`node tools/agents/oversee.mjs` · `node tools/skills/lint.mjs` · `node --test $(find tools -name '*.test.mjs')`.
Собственик на CI/PR конвейера = агентът **Конвейерът**.

## Дефиниция на „готово"
secret-scan чисто · гейт зелен · conventional български commit на feature клон · PR (draft) с попълнен шаблон.
