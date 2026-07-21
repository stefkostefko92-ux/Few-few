# CLAUDE.md — mastilko/

Мастилко — безплатно създаване на **етикети за печат, визитки и CV** на
български. Без регистрация, без база данни, без бисквитки. BG.
Домейн: mastilko-bg.com.

## Стек и команди

Next.js 15 App Router · React 19 · TS strict · Tailwind · Zod · jose · bcryptjs.
Path alias `@/*`. **Няма Prisma/база** — цялото ПОТРЕБИТЕЛСКО съдържание живее в
localStorage на клиента (умишлено, GDPR-минимализъм). Единственото сървърно
състояние е **рекламните банери**: проста JSON база в `MASTILKO_DATA_DIR`
(`data/banners.json`), управлявана от админ панела — виж по-долу.

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
  (`GEMINI_API_KEY`, модел `GEMINI_MODEL`, подразбиране `gemini-flash-latest`
  — alias към актуалния безплатен Flash; фиксираните версии Google спира за
  нови проекти с 404).
  Ключът е САМО на сървъра. Без ключ → 503 и сайтът работи без AI. Не добавяй
  аналитика/бисквитки — политиката за поверителност обещава „без“.
  **Правен контекст (одит 2026-07, решение на собственика):** ползва се
  **безплатният Gemini tier**. `/poveritelnost` затова изрично разкрива, че
  Google може да ползва AI заявките за подобряване на продуктите си (вкл.
  преглед от хора) + трансфера към САЩ (DPF/SCC), а до всеки AI бутон стои
  „не включвай лични данни“. **Не отслабвай тези текстове.** Остатъчен риск
  (приет от собственика): условията на Gemini API предвиждат Paid tier за
  потребители от ЕИП — Google може да ограничи ключа.
- AI подсказките винаги са **по действие на потребителя** и до бутона стои
  текст, че въведеното отива към Google — пази това при промени (GDPR).
- Топлата палитра (paper/ink/tera/med/gora) е в `tailwind.config.ts`;
  темите за етикети/визитки — `src/lib/themes.ts`. Маскотът (синя мастилена
  капка) е `public/mascot.webp` + пълното лого `public/logo-full.png` (качени
  от собственика — не ги генерирай наново).

## Структура

- 8 инструмента: `src/app/{etiketi,vizitki,cv,pismo,gramoti,pokani,tabelki,wifi}/`
  — сървърни обвивки с metadata; редакторите са клиентски:
  `src/components/studios/*Studio.tsx`.
- Общи парчета: `AiAssist` (AI бутон + предложения; режим `translate-en` за
  EN превод), `PrintBar`, `SheetPreview` (props `landscape` за грамоти/табелки
  → инжектира `@page landscape`), `ThemePicker`, `ThemeToggle` (тъмна тема,
  `.dark` клас, скрипт против трепване в layout), `useLocalState` (localStorage
  + чете споделен линк `#p=…`), `ProjectFile` (свали/качи JSON + `ShareButton`),
  `ImageUpload` (лого/снимка — смалява в браузъра до data URL, нищо навън),
  `QrImage`+`useQrDataUrl` (QR изцяло в браузъра — пакет qrcode, НИКОГА външна
  услуга). Тествана логика: `src/lib/{print,vcard,wifi}.ts`;
  `src/lib/share.ts` (base64url кодиране на дизайн в URL).
- Правни страници: `/poveritelnost`, `/usloviya` — при промяна в обработката
  на данни ги обнови (и мини Правния Разбирач).

## Админ панел + рекламни банери

- `/admin` (табло) и `/admin/vhod` (вход) — пази ги `src/middleware.ts`
  (проверява подписана jose сесия). `SESSION_SECRET` в env (base64, безопасен);
  админите в `data/admins.json` (НЕ в env — bcrypt „$“ чупи dotenv), пишат се с
  `node scripts/hash-admin.mjs <user> <pass>`. **Само админът получава
  бисквитка** (httpOnly сесия) — посетителите нямат.
- Данни: `src/lib/banners.ts` (server-only) чете/пише `data/banners.json`.
  API: `src/app/api/admin/banners` (защитено, PUT целия списък),
  `/api/banners` (публично, само активните). Банерите се показват от
  `src/components/BannerZone.tsx` (лента под хедъра; „home“ разположение и на
  началната). **Собствени промоции — без чужди скриптове/проследяване.**
  Решение на собственика (2026-07): собствени банери сега, място за външна
  мрежа по-късно (тогава ще трябва банер за съгласие — не пускай преди това).
- `data/` НЕ се трие при деплой (`autodeploy.sh` rsync exclude) и е в
  `ReadWritePaths` на unit-а; на прод е `/opt/mastilko/data`.
