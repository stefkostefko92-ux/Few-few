# CLAUDE.md — mastilko/

Мастилко — безплатно създаване на **етикети за печат, визитки и CV** на
български. Без регистрация, без база данни, без бисквитки. BG.
Домейн: mastilko.carbonstealth.eu.

## Стек и команди

Next.js 15 App Router · React 19 · TS strict · Tailwind · Zod. Path alias `@/*`.
**Няма Prisma/база** — цялото потребителско съдържание живее в localStorage на
клиента (умишлено, GDPR-минимализъм).

```bash
npm run dev / build / start
npm run lint && npm run typecheck && npm test   # качествена порта (задължителна)
```

## Твърди правила на продукта

- **Милиметрите са свещени.** Печатната математика е в `src/lib/print.ts`
  (чиста, тествана с node:test) — А4 = 210 × 297 mm, визитка = 90 × 54 mm.
  Всички размери по листа се рендират в CSS `mm`; на екран листът се мащабира
  с `transform: scale()` (`SheetPreview`), а при печат мащабът пада
  (`.print-area { transform: none }` в `globals.css`). Не чупи този механизъм.
- **Печата се само `.print-area`** — виж `@media print` в `globals.css`;
  всичко извън листа носи `no-print`.
- **Нищо потребителско не отива на сървъра**, освен при изричен клик върху AI
  бутон: `/api/ai` (единственият route) препраща към Google Gemini
  (`GEMINI_API_KEY`, модел `GEMINI_MODEL`, подразбиране `gemini-2.5-flash` —
  безплатният Flash). Ключът е САМО на сървъра. Без ключ → 503 и сайтът
  работи без AI. Не добавяй аналитика/бисквитки — политиката за
  поверителност обещава „без“.
- AI подсказките винаги са **по действие на потребителя** и до бутона стои
  текст, че въведеното отива към Google — пази това при промени (GDPR).
- Топлата палитра (paper/ink/tera/med/gora) е в `tailwind.config.ts`;
  темите за етикети/визитки — `src/lib/themes.ts`. Маскотът (синя мастилена
  капка) е `public/mascot.png` + пълното лого `public/logo-full.png` (качени
  от собственика — не ги генерирай наново).

## Структура

- `src/app/{etiketi,vizitki,cv}/page.tsx` — сървърни обвивки с metadata;
  редакторите са клиентски: `src/components/studios/*Studio.tsx`.
- Общи парчета: `AiAssist` (AI бутон + предложения), `PrintBar`,
  `SheetPreview`, `ThemePicker`, `useLocalState` (localStorage персистенция).
- Правни страници: `/poveritelnost`, `/usloviya` — при промяна в обработката
  на данни ги обнови (и мини Правния Разбирач).
