# studiopult — Студио пулт

Локална страница **само на 127.0.0.1** на компютъра на собственика (Windows + NVIDIA). През нея той говори с
нашите 35 агента (по подразбиране AI Studio) и пуска видео задачите им: doctor, loudnorm, кадри → видео,
мастер, YouTube 4K60, 9:16. Има и преглед на готовите файлове и „Разреши/Откажи“ за всяка рискова стъпка.
Claude се вика през **Claude Agent SDK** с API ключ на Anthropic, който живее само на компютъра.
Пултът **не се деплойва** (няма го в `deploy/`).

## Стек
Node ≥22 · TS strict (ESM/NodeNext) · `node:http` без рамка · единствена runtime зависимост
`@anthropic-ai/claude-agent-sdk` (точна версия; носи вграден Claude Code, затова **не** `--omit=optional`) ·
UI: обикновен HTML/CSS/JS в `public/` (системни шрифтове, без CDN, без SVG).

## Гейт
```bash
npm run gate          # prettier --check · tsc (src + tests) · tsx --test tests/*.test.ts · build
```

## Пускане на компютъра на собственика (Windows)
1. **Git for Windows** е задължителен (`winget install Git.Git`). Без Git Bash куките на агентите падат тихо и
   пазачите не работят, затова пултът изобщо не тръгва без него.
2. Ключът е в **`%LOCALAPPDATA%\studiopult\key.txt`**, на един ред `sk-ant-…`. Не е в репото и не е в
   средата на другите програми.
3. `cd studiopult && npm ci && npm run build && npm start`. Терминалът печата **еднократен** адрес
   `http://127.0.0.1:4390/?k=…`; отвори го в браузъра.
4. Натисни **„Самопроверка на пазачите“**. Трябва да е зелено: канарската команда е спряна.
5. Папката на студиото е `%USERPROFILE%\Videos\studio` (или `STUDIOPULT_STUDIO`). Портът е `STUDIOPULT_PORT`.

Linux (разработка): ключът е в `$XDG_CONFIG_HOME/studiopult/key.txt` с `chmod 600`. Scrub на средата иска
**bubblewrap** (`apt install bubblewrap`), иначе Claude Code не тръгва.

## Как работи (важно за промени)
- **Диспечер:** главната нишка е `pult-dispatch` (Sonnet, ниско усилие, само `Agent(<избран>)`). Само така
  тичат SubagentStart/Stop куките (памет, учене, dod-check, usage-capture) и `agent-cap` → месечният таван.
- **Преден план:** PreToolUse кука на SDK (`foregroundAgent`) слага `run_in_background: false`. Без нея
  субагентът тръгваше фоново и диспечерът отговаряше преди резултата (живата проба 28.11.2026).
- **Настройките** са от `.claude/` на репото (`settingSources: ['project']`). `STUDIOPULT=1` в средата на
  SDK заглушава Stop напомнянията `session-dod` и `artifact-sync`; те са за работната сесия, не пазачи.
- **Разрешения:**
  - режимът е `default` + `canUseTool`;
  - четенето (Read, Grep, Glob, WebFetch, WebSearch) е позволено без питане;
  - Bash, PowerShell, Write и Edit минават **само с клик**;
  - „винаги разрешено“ не се прилага;
  - таймаут от 5 минути или затворена страница → отказ.
- **Тавани:**
  - $3 и 80 хода на съобщение (`maxBudgetUsd`/`maxTurns`);
  - $20 на ден (`spend.json` до ключа); при 75% предупреждава и не пуска нова работа;
  - отгоре е месечният `budgets.json`.
- **Изход** (Ctrl+C или затворен терминал): спира агента и рендера. Без това процесът на SDK оставаше сирак.

## Layout
`src/config.ts` (пътища, ключ, fail closed) · `src/http/guard.ts` (Host, Origin, токен → бисквитка, заглавия) ·
`src/files.ts` (безопасен резолвер) · `src/tasks.ts` (задача → argv, един рендер, ход) ·
`src/approvals.ts` (одобрения) · `src/budget.ts` (дневен таван) · `src/agent.ts` (опции на SDK, диспечер,
поток → събития) · `src/selfcheck.ts` · `src/server.ts` · `src/index.ts` · `public/` · `tests/`.
