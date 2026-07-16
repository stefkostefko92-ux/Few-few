# Déjà — Firefox порт кит

Скеле за порт на Déjà (Chrome MV3) към **Firefox MV3**. Всичко тук е адитивно —
не пипа `src/`, `build.mjs` или `manifest.json`. Изходната архитектура (Chrome):
MV3 **service worker** + **offscreen документ** (там върви transformers.js
ONNX/WASM през Port `deja-embed`) + IndexedDB + `_locales/{bg,en,it}` + CSP с
`wasm-unsafe-eval`.

Статус: **скица за интеграция**, не финален build. Реалното зареждане/тестване
става на машина с Firefox (`about:debugging` → Load Temporary Add-on) — тук няма
как да се пусне браузър. Числата за версии са потвърдени на живо (виж „Източници“).

## Файлове в този кит

| Файл | Роля |
|------|------|
| `manifest.firefox.json` | Firefox MV3 манифест (event page + `browser_specific_settings.gecko`, без `offscreen`). |
| `embed-adapter.js` | Shim, който bundle-ва offscreen embedding двигателя в background страницата и лъже `chrome.offscreen` / `getContexts` / Port `deja-embed`, за да остане `src/background.js` непроменен. |
| `AMO-NOTES.md` | Изисквания на addons.mozilla.org ревюто (source submission, privacy, permissions justification). |

## Какво се разминава (Chrome → Firefox)

| Тема | Chrome MV3 | Firefox MV3 | Решение в този кит |
|------|-----------|-------------|--------------------|
| Background | `service_worker` (ефимерен, ~30s idle) | **Event page** `background.scripts` — `service_worker` **не се поддържа** (bug 1573659) | `manifest.firefox.json` ползва `background.scripts: ["background.js"]`. |
| Offscreen | `chrome.offscreen` документ държи модела | **Няма `chrome.offscreen`** | Embedding двигателят се bundle-ва В background страницата; `embed-adapter.js` дава loopback Port `deja-embed` в същия контекст. |
| `getContexts` | `chrome.runtime.getContexts` | **Липсва** | Shim в адаптера, който връща 0/1 „OFFSCREEN_DOCUMENT“. |
| Namespace | `chrome.*` (callback + promise) | `chrome.*` е **callback-стил**, `browser.*` е **promise** | Адаптерът сочи `globalThis.chrome = browser` (+ esbuild `banner` за другите bundle-и). |
| ID на add-on | опционален | **задължителен** за публикуване | `browser_specific_settings.gecko.id = "deja@carbonstealth.eu"`. |
| Мин. версия | `minimum_chrome_version` | `browser_specific_settings.gecko.strict_min_version` | `"128.0"` (виж по-долу защо). |
| Host permission prompt | инсталационен warning | **до FF 126** host permissions НЕ се питат/показват; **от FF 127** се показват и даряват при инсталация | Затова `strict_min_version` е висок — иначе `http/https://*/*` няма да е дарен. |
| `type: "module"` в background | поддържа се | все още tracked (bug 1811443) — **не разчитай** | Firefox background bundle се прави **класически IIFE** (без `type: module`). |
| CSP | обект `content_security_policy.extension_pages` | **същият формат**, `wasm-unsafe-eval` поддържан | Копира се дословно. |

### Защо `strict_min_version: "128.0"`

Déjà декларира `content_scripts` за `http/https://*/*` — тоест иска широки host
permissions. До Firefox 126 те не се даряваха при инсталация (щяха да са
недарени и content script-ът нямаше да инжектира без runtime заявка). От **FF 127**
host permissions от манифеста се показват и даряват на инсталация. Слагаме 128 с
малък запас (стабилно MV3 event page + host-perms поведение). Ако решим да
поддържаме по-стари Firefox, трябва runtime `permissions.request` поток — извън
обхвата на скицата. *(Сигурно: FF 127 е границата за host-perm даряване; изборът
128 е предпазлив, не задължителен.)*

## Какво остава СЪЩОТО (нула промени)

- **IndexedDB** (`lib/db.js`) — идентично API в Firefox.
- **transformers.js / ONNX-WASM** — същият модел, същите WASM файлове в пакета
  (`dist-firefox/wasm/`), същият `wasmPaths` через `getURL('wasm/')`,
  `numThreads = 1`. Нула отдалечен код — теглата на модела са **данни**, не код.
- **i18n формат** — `_locales/{bg,en,it}/messages.json` и `__MSG_*__` работят
  еднакво; `default_locale: "en"` се пази.
- **Икони, commands (`Alt+Shift+D`), options_ui, action/popup** — без промяна.
- **Устойчива опашка, alarms, denylist, retention, search ranking** — целият
  `src/background.js` работи непроменен зад shim-овете на адаптера.

## Как адаптерът пази `src/background.js` непроменен

`src/background.js` вика (Chrome-специфично): `chrome.runtime.getContexts(...)`,
`chrome.offscreen.createDocument/closeDocument`, и
`chrome.runtime.connect({name:'deja-embed'})` → чака отговор от offscreen.js.

`embed-adapter.js` инсталира **синхронно на import** (преди background.js):

1. `globalThis.chrome = browser` — за да са всички `chrome.*` promise-и.
2. `chrome.offscreen = { createDocument, closeDocument }` — маркира двигателя за
   лениво зареждане / логическо „затваряне“.
3. `chrome.runtime.getContexts` — връща 0 или 1 „OFFSCREEN_DOCUMENT“ според флаг.
4. Обвива `chrome.runtime.connect`: за `deja-embed` връща **loopback Port**, чийто
   отсрещен край е embedding двигателят В тази страница (същият протокол
   `{texts, modelHost}` → `{ok, vectors}`), който преди беше в `offscreen.js`.

Резултат: background.js мисли, че говори с offscreen; всъщност всичко тече в
background event page-а. Firefox event page **не се терминира докато тече
слушателят/работата** — няма cross-context idle гонка като при Chrome
SW+offscreen (за това port keepalive-ът в Chrome; тук е излишен, но безвреден).

## Интеграция с `build.mjs` (стъпка по стъпка)

`build.mjs` не се пипа в тази задача. Планът за паралелна промяна (когато е
разрешено да се редактира build-ът):

1. **Флаг.** `const FIREFOX = process.argv.includes('--firefox');`
   `const dist = FIREFOX ? 'dist-firefox' : 'dist';` target `firefox128` за FF.
2. **Alias banner за всички bundle-и** (за да са `chrome.*` promise-и и в
   content/popup/options/search/welcome):
   ```js
   const ffBanner = FIREFOX
     ? { js: "if(typeof globalThis.browser!=='undefined'){globalThis.chrome=globalThis.browser;}" }
     : undefined;
   // подай banner: ffBanner към ДВАТА esbuild.build извиквания
   ```
3. **Background entry.** За Firefox background-ът трябва да зареди адаптера ПРЕДИ
   background.js и да е **класически IIFE** (не module):
   ```js
   if (FIREFOX) {
     await esbuild.build({
       ...common, target: 'firefox128', format: 'iife', banner: ffBanner,
       stdin: {
         contents: "import '../firefox/embed-adapter.js';\nimport '../src/background.js';",
         resolveDir: 'src', loader: 'js',
       },
       outfile: `${dist}/background.js`,
     });
   }
   ```
   (Двата side-effect импорта се оценяват по ред: адаптер → shim-ове → background.)
   Останалите страници (popup/options/search/welcome) се build-ват както за Chrome,
   но с `format: 'iife'` за скриптовете на страниците (или остави ESM — Firefox
   поддържа `<script type="module">` на extension страници; **background-ът** е
   изключението). `offscreen` entry-то се **пропуска** за Firefox.
4. **Манифест.** `copyFileSync(FIREFOX ? 'firefox/manifest.firefox.json' : 'manifest.json', ...)`.
   `offscreen.html` **не се копира** за Firefox.
5. **WASM + статика + `_locales` + `icons`** — идентично, в `dist-firefox/`.
6. **Пакетиране.** `web-ext build --source-dir dist-firefox` за подписан `.xpi`
   / AMO качване (виж AMO-NOTES.md).

Проверка след build: `about:debugging#/runtime/this-firefox` → Load Temporary
Add-on → `dist-firefox/manifest.json`; Inspect background → изтъркай deja:page и
deja:search; следи за студено теглене на модела (минути) без да умре страницата.

## Отворени точки за проверка (не приемай за дадено)

- `web-ext lint` върху `dist-firefox/` трябва да е чист преди AMO.
- Потвърди на реален Firefox, че event page преживява студеното теглене на модела
  (~120MB) без терминиране по средата на embed.
- `chrome.storage.session` (ако се ползва някъде) има разлики — Déjà ползва само
  `storage.local`, така че е ОК.

## Източници

- Background service_worker неподдържан + `scripts`/`page`: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background>
- Event pages, host permission prompt (FF 127), gecko.id: <https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/>
- `type: module` в background все още tracked: bug 1811443 <https://bugzilla.mozilla.org/show_bug.cgi?id=1811443>
