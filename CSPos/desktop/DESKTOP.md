# Carbon Stealth POS — десктоп (.exe) инсталатор

Опакова касовата система като самостоятелно Windows приложение — **един
инсталатор `Carbon Stealth POS Setup <версия>.exe`**, без нужда от Node,
браузър или ръчна настройка. Стартира на цял екран (kiosk), подходящо за
**тъч монитор** на каса.

## Как работи

`CSPos/` е Next.js приложение. При `output: "standalone"` билдът произвежда
самостоятелен Node сървър (`.next/standalone/server.js`). Electron обвивката
(`desktop/`) стартира този сървър на локален порт и го зарежда в цял екран.

- **База данни (SQLite):** живее в потребителската папка
  (`%APPDATA%\Carbon Stealth POS\carbon-stealth-pos.db`), НЕ в инсталационната —
  оцелява при ъпдейт и не иска админ права. При първо пускане се копира заредена
  шаблонна база (`template.db`).
- **SESSION_SECRET:** генерира се веднъж и се пази в `%APPDATA%\...\config.json`
  (mode 600).
- **Prisma engine:** Windows вариантът (`query_engine-windows.dll.node`) се
  добавя от `binaryTargets = ["native", "windows"]` в `schema.prisma`.
- **Фискални устройства / ПОС терминали:** работят по мрежа (ErpNet.FP :8001,
  Tremol ZFPLab :4444, myPOS ECR) — достъпни от локалния сървър както обикновено.

## Предпоставки за билда

- Node 20+ и npm.
- За реален `.exe`: **Windows**, или Linux/macOS с `wine` + `mono` (electron-builder
  ги ползва за NSIS). Без тях се билдва само на Windows.
- Интернет за първото сваляне на Electron + electron-builder.

## Стъпки

```bash
# 1) Приложението (веднъж, в CSPos/)
cd CSPos
npm ci
npm run build                 # прави .next/standalone + Windows Prisma engine

# 2) Десктоп обвивката
cd desktop
npm install                   # electron + electron-builder
npm run dist:win              # → dist/Carbon Stealth POS Setup 1.0.0.exe
```

`prepare.mjs` (пуска се автоматично от `dist:win`) сглобява `desktop/server/`
от standalone билда, генерира заредена `template.db` и добавя Windows engine-а.
После `electron-builder` прави NSIS инсталатора в `desktop/dist/`.

### Локална проба без опаковане

```bash
cd desktop
node prepare.mjs
npm start                     # пуска Electron върху сглобения server/
```

### Portable вариант (без инсталация)

```bash
npm run dist:win:portable     # → dist/Carbon Stealth POS <версия>.exe (преносим)
```

## Икона

`desktop/build/icon.png` (512×512) вече е включена — electron-builder генерира
`.ico` от нея. Замени файла, за да смениш иконата.

## Автоматичен билд (GitHub Actions)

`.github/workflows/cspos.yml` прави `.exe` автоматично на Windows runner:
- при **всеки push** към `CSPos/**` — само качествената порта (lint, typecheck, тестове, build);
  инсталаторът не се строи, за да не се харчат Windows минути;
- при **таг** `cspos-v*` (напр. `git tag cspos-v1.0.0 && git push --tags`) — прави
  **GitHub Release** с прикачен инсталатор;
- ръчно от раздела **Actions → Run workflow**.

Не е нужно да билдваш локално — CI-ът произвежда `Carbon Stealth POS Setup <версия>.exe`.

## Подпис на компилацията (Прил. № 29, т. 4)

`after-pack.js` записва `resources/server/integrity-manifest.json` (SHA-256 на всеки файл) и, ако
има ключ, `integrity-manifest.sig` (Ed25519). При старт `main.js` проверява подписа с
`integrity-public.pem` и всеки хеш **преди** да пусне сървъра. Променен, добавен или липсващ файл
→ касата не тръгва. Неподписана компилация тръгва, но в режим СУПТО не продава.

Еднократно, от собственика, на собствения му компютър:

```bash
node scripts/gen-signing-key.mjs            # от CSPos/; частният ключ отива ИЗВЪН репото
```

1. Съдържанието на частния ключ → GitHub → Settings → Secrets → `CSPOS_SIGNING_KEY`; копие в
   сейф; файлът се изтрива от компютъра. Никога в репото, в чат или в имейл.
2. `desktop/integrity-public.pem` → commit.
3. Таг `cspos-v*` без тайната пада нарочно (`CSPOS_REQUIRE_SIGNATURE=1`).

Защитата стъпва на това, че касиерът не може да пише в папката на програмата: инсталацията е
в Program Files (`perMachine: true`). Production сървър, пуснат без Electron, се брои за
неподписан. Следващи стъпки за собственика:

- **Authenticode подпис на .exe** (сертификат за подписване на код). Без него Windows
  предупреждава при инсталация, а подмяна на самия `.exe` не се забелязва.
- **Electron fuses** (`EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar`) — след
  обновяване на electron-builder до версия с `electronFuses`. `RunAsNode` остава включен,
  защото сървърът тръгва с `fork`. Всяка такава промяна се изпитва по
  `docs/FISCAL-TEST-PROTOCOL.md`, иначе инсталаторът може да не тръгне.

## Бележки

- Инсталаторът е с избор на папка, пряк път на десктоп и в Старт меню, езици
  BG/EN.
- Ъпдейт: нова версия в `package.json` + нов билд; базата в `%APPDATA%` се пази и при първия
  старт се обновява до новата схема само с добавяне (`src/lib/schema-upgrade.ts`).
- Първа инсталация: шаблонна база без демо данни; вход с код 1 и ПИН 0000, който се сменя веднага.
- Приложението е самостоятелно (self-hosted, EU) — без облак, без телеметрия.
