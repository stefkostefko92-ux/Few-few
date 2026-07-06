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
- при **всеки push** към `CSPos/**` — качва инсталатора като artifact на билда;
- при **таг** `cspos-v*` (напр. `git tag cspos-v1.0.0 && git push --tags`) — прави
  **GitHub Release** с прикачен инсталатор;
- ръчно от раздела **Actions → Run workflow**.

Не е нужно да билдваш локално — CI-ът произвежда `Carbon Stealth POS Setup <версия>.exe`.

## Бележки

- Инсталаторът е с избор на папка, пряк път на десктоп и в Старт меню, езици
  BG/EN.
- Ъпдейт: нова версия в `package.json` + нов билд; базата в `%APPDATA%` се пази.
- Приложението е самостоятелно (self-hosted, EU) — без облак, без телеметрия.
