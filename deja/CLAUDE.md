# CLAUDE.md — Déjà

Déjà — локална семантична памет на браузъра. Chrome MV3 разширение: индексира
текста на страниците, които потребителят чете, и позволява търсене на човешки
език („онази статия за батерии на натриева основа“). **Всичко е локално** —
embeddings през transformers.js (ONNX/WASM) в offscreen документ, вектори в
IndexedDB. Никакви данни на потребителя не напускат устройството.

## Стек

Plain JS ESM · esbuild · @huggingface/transformers (ONNX Runtime WASM) ·
IndexedDB · Prettier. Без framework, без TypeScript (както medqr/adblock).
UI текстове — български.

## Архитектура (потокът на данните)

```
content.js (всяка http/https страница)
  │  извлича article/main innerText, праща deja:page
  ▼
background.js (service worker)
  │  denylist/pause → chunker.js (~1100 знака, припокриване 150)
  │  опашка: 1 страница в даден момент; hash (FNV-1a) прескача непроменени
  ▼
offscreen.js (offscreen документ — живее дълго, пази модела зареден)
  │  Xenova/paraphrase-multilingual-MiniLM-L12-v2, q8, 384d, pooling=mean, normalize
  ▼
lib/db.js (IndexedDB: pages по urlKey, chunks с индекс byUrlKey)

search.html → deja:search → embed на заявката → dot product по всички chunks
(нормализирани → dot == косинус) → топ парче на страница → топ 10 страници.
```

Съобщенията между контекстите: `deja:page`, `deja:search`, `deja:stats`,
`deja:clear` (към background). Embed минава през **дълготраен Port**
(`chrome.runtime.connect({name:'deja-embed'})`) — отвореният порт държи SW жив,
докато offscreen тегли модела/смята (еднократен sendMessage НЕ ресетира
idle-таймера и SW умираше след 30 сек при първото теглене). Offscreen се
създава лениво (`ensureOffscreen()`) и се **затваря при бездействие** (alarm
`deja-offscreen-gc`, 10 мин без embed) — иначе моделът държи ~120MB RAM вечно.

**Устойчива опашка:** чакащите страници живеят в `chrome.storage.local`
(`pending`), не в паметта на SW — рестарт не губи нищо; drain при всяко
събуждане, до 3 опита на страница. Правило: състоянието НИКОГА само в паметта
на SW.

## Команди

```bash
npm ci
npm run build         # esbuild → dist/ (Load unpacked оттам)
npm run format:check  # качествена порта: това + build трябва да минават
npm run icons         # tools/generate_icons.py — САМО fallback; реалните икони са
                      # брандова графика (remove.bg + resize), комитнати в icons/
npm run zip           # release/deja-<версия>.zip за Chrome Web Store
```

**Качествена порта: `npm run format:check && npm run build && npm test`** (тестовете искат `DEJA_CHROME`; `npm test` сам строи и `dist-test`).

## Chrome Web Store — червени линии

- **Нула отдалечен код.** ORT WASM-ът се копира от node_modules в `dist/wasm/`
  (build.mjs) и `env.backends.onnx.wasm.wasmPaths` сочи там. Теглата на модела
  се теглят еднократно от Hugging Face — това са **данни**, не код (позволено),
  кешират се в Cache API.
- **Минимални права:** storage, offscreen, unlimitedStorage, alarms (дневен
  retention). Content script на `http(s)://*/*` е самата същност на продукта —
  обосновката за review-а е готова в `store/LISTING.md`.
- CSP на extension страниците изисква `'wasm-unsafe-eval'` (вече в манифеста).
- Manifest bump: версията в manifest.json и package.json се движат заедно.

## Поверителност (не се преговаря)

- Данните не напускат устройството. Никакъв telemetry, никакъв cloud.
- `lib/settings.js` има denylist по подразбиране (поща, чатове, login, банки,
  плащания) — съвпадение по подниз, умишлено агресивно. Не го отслабвай.
- Пауза от popup-а спира индексирането моментално; „Изчисти паметта“ трие всичко.

## Направено след MVP (v0.2.0)

- Options страница: потребителски denylist, retention (0/3/6/12/24 месеца,
  дневен alarm), modelHost. Вграденият denylist е константа (`BUILTIN_DENYLIST`)
  и винаги важи — потребителят само добавя.
- SPA навигации: content.js следи location.href на 2 сек (history API-то е
  недостъпно от изолирания свят); дубликатите се режат по хеш в background-а.
- WebGPU (fp16) с тих fallback към WASM (q8) — offscreen документите често
  нямат GPU достъп, WASM е гарантираният път.
- i18n: `_locales/{bg,en,it}` + `lib/i18n.js` (data-i18n атрибути). BG е
  източникът на истината за низовете, но `default_locale: "en"` — пазарът е
  международен, EN е основният CWS листинг (BG/IT са допълнителни).
- CWS материали: `store/LISTING.md` (single purpose, обосновка на права,
  описания) + `store/screenshots/` (генерирани с scratchpad Playwright скрипт).

## Направено след v0.2.0 (v0.3.0 — агентски одит)

- Port keepalive + устойчива опашка + offscreen GC (Хромаджията H1/H2/M3).
- Search ranking фикс: групиране по целия сортиран списък, не топ-40 парчета;
  минимални обекти при скориране; guard за чужда размерност (Кодаджията).
- Сериализация на embed в offscreen (застъпени ONNX run-ове).
- Welcome страница при инсталация (прозрачност, CWS friction ↓).
- PRIVACY.md v1.1: честно IP разкриване за HF, ограничение на denylist по тема,
  импресум скелет, дата/версия (Правния Разбирач B1/B3/M1/H2).
- Plural форми (1 спомен/страница), IT „изплуване“ образ, валидация на modelHost.
- Дизайн: „изплуващи“ резултати, --recall сила на спомена, дълбочинен фон,
  дишащо търсене — ванилен CSS, prefers-reduced-motion уважен.

## Направено във v0.5.0 (10-те подобрения)

- **Omnibox**: `dj <заявка>` в адресната лента → search.html?q= (авто-търсене).
- **Скок до абзаца**: резултатите линкват с `#:~:text=` цитат от парчето.
- **Датови филтри**: chips всички/седмица/месец/година → `minTime` в search.
- **„Моята памет“** (memory.html): списък, „Забрави“ поединично, export/import
  на целия индекс (`deja:memory:*` съобщения; формат `deja-memory` v2).
- **По-умен extractor** (content.js): кандидат-скоринг по дължина × линкова
  гъстота, шумочистене и вътре в article, блоково сглобяване на текста.
- **Свързани спомени**: центроид на страницата срещу останалите (on-demand).
- **DB v2 — пакетирани вектори по страница** (`pagevecs`, един Float32Array
  на страница): ~20× по-малко IDB четения при търсене, мащаб към 50k+ парчета;
  миграция v1→v2 в onupgradeneeded. Отговорите на съобщенията са
  униформени: `{ok, result}`.
- **Firefox порт кит**: `firefox/` (manifest + embed-adapter loopback Port +
  README интеграция + AMO бележки). Building не е вързан още.
- **Pro tier спецификация**: `docs/PRO.md` (E2E-криптиран sync като Pro котва;
  privacy контролите ВИНАГИ безплатни; Stripe Checkout + webhook лиценз).
- **EN/IT landing**: server/en.html + it.html + hreflang в трите + keywords
  (≥5, вкл. „Carbon Stealth“ — правило на репото) + nginx /en /it + sitemap.

## v1.x (пътят до 1.2)

- **1.0**: Firefox build (`npm run build:firefox` → dist-firefox/; zip:firefox),
  тестове в репото (`npm test`, test/{lib,e2e,smoke}.mjs — иска DEJA_CHROME,
  по избор DEJA_MODEL_MIRROR), версията се щампова от package.json в двата
  манифеста, рефактори (lib/msg.js send, lib/dom.js el/countLabel, PAGES цикъл).
- **1.1**: omnibox живи подсказки (title substring, Enter по подсказка отваря
  директно), <mark> откроени думи в снипетите, badge с брой страници,
  търсене в „Моята памет“.
- **1.2**: топ-домейни статистика в „Моята памет“, „Подкрепи Déjà“ линк
  в popup-а, двойни release пакети (Chrome + Firefox).

## v1.3 „компаньон“ (растеж на потребителите)

- **Страничен панел** (`sidepanel/`, permission `sidePanel`, Alt+Shift+S или бутон
  в popup-а): търсене + „по темата на тази страница“ + последни спомени.
  Активният таб идва от content script-а (`deja:active` → `storage.session`),
  **без „tabs“ право** (то носи предупреждение „чете историята“).
- **Контекстно меню** (`contextMenus`): „запомни избрания текст“ → отделен
  спомен с ключ `<url>#clip-<fnv>` (`deja:clip`; `indexPage` приема явен
  `urlKey`); „забрави тази страница“ (`deja:forget-url`).
- **`activeTab`** само за „Забрави тази страница“ от popup-а (URL на текущия таб).
- **Последни спомени** на празната търсачка (`deja:recent`); **светла тема** по
  `prefers-color-scheme` в search/popup/options (панелът и memory наследяват).
- Firefox: `sidebar_action` вместо `side_panel`; `chrome.sidePanel` е guard-нат.
- Store пакет: `store/PUBLISH.md` (стъпки), `store/promo/` (tile + marquee),
  `sidepanel-{bg,en}.png` композиция (реална статия 880px + панел 400px).
- **CWS уроци (Тайния агент, 09.2026):** Data Disclosure се попълва и при
  чисто локална обработка (User Data FAQ Q3) → отмятаме Web history + Website
  content, НЕ „does not collect“; от 01.08.2026 промяна в практиките се разкрива
  проактивно → `onInstalled` с `reason === 'update'` отваря welcome с бележка.
  Правило: **всеки нов приемник на URL/съдържание** (напр. `deja:active`) минава
  същия гейт paused/isDenied като индексирането и чисти стария ключ.

## v1.4 „liquid glass“ + „Мрежата на спомените“ (визия)

- **Материал** `src/glass.css` — зарежда се ПОСЛЕДЕН на всяка страница (build.mjs го
  копира): оцветено тяло + `backdrop-filter: blur() saturate()` + SVG пречупване
  `url(#lg-refract)` (feTurbulence→feDisplacementMap; **само Chromium** — гейт през
  `navigator.userAgentData`, иначе остава blur), ръб/каустика с inset сенки, блик по
  курсора (`--mx/--my` от `ambient.js`), „гел“ бутони (spring easing). Класът `.lg`
  прави стъкло от всичко; списъкът селектори в glass.css е **източникът** — `.card`
  е в него (затова в промо страницата не ползвай `.card` за нестъклени неща).
- **Жив фон** `lib/nebula.js` (+ `lib/ambient.js` го вдига на всяка страница): всеки
  светещ възел = запомнена страница (`setMemories(n)`), линиите = семантични връзки;
  `focus(true)` при търсене, `surface(n)` — изплуващи искри при резултати (≥350 мс
  между тях — нула строб, WCAG 2.3.1). Canvas 2D, `aria-hidden`, `pointer-events:none`.
- **Цена (измерена, CDP TaskDuration/сек):** 22.8% при 1280×800, 30.3% при 1920×1080,
  12.8% popup; скрипт ≤3.6%. Трикове: аврора на 1/6 резолюция, линии в 6 alpha кофи
  (6 stroke-а вместо стотици), 30 fps таван, вътрешна резолюция ×0.62 за големи
  страници, **заспива след 15 с без вход**, пауза при скрит таб.
- **Движението е по избор (WCAG 2.2.2):** `prefers-reduced-motion` → статичен кадър;
  настройката „Жив фон“ (`settings.ambientMotion`, по подразбиране true) → също.
  Пази го `test/ambient.mjs` (в `npm test`): движи се / reduced / изключен / aria /
  стъклото реално има backdrop-filter.
- **Ъпдейт бележката** (welcome?update=) се отваря само ако `previousVersion <
  DATA_PRACTICES_VERSION` (background.js) — визуален ъпдейт не отваря таб. Вдигай
  константата при всяка нова промяна в това какво Déjà вижда/пази.
- Store графиките (скрийншоти + promo tile/marquee) са от реалния двигател + стъкло,
  не мокъп; скриптовете живеят в scratchpad-а (Playwright + PIL композиция).

## v1.5 „полза от първата минута“ (растеж + отзиви)

Контекст: Google спира „Featured“ значката (блог 20.08.2026, номинациите са
затворени); сигналът за качество вече е **оценката по скорошни отзиви**, а
слотовете за публикуване (по подразбиране 2 на издател) растат с качество и
ползване. Затова: полза веднага + честна молба за отзив.

- **Отметки в паметта** (`bookmark-sync.js` + чисти `lib/bookmarks.js`):
  `optional_permissions: ["bookmarks"]` → нула предупреждения при инсталация;
  правото се иска в страница при клик (`lib/bookmarks-ui.js`). Учи заглавие +
  папка + думите от адреса — **никога не отваря страниците**. Един идемпотентен
  `reconcile()` = импорт + жив синхрон + възстановяване (`planSync` дава
  index/mark/unmark/remove). Прочетена страница пази пълния текст и само
  получава `bookmark: {folder}`; `kind: 'bookmark'` = само-отметка. Retention не
  пипа отметки; „забрави“ → `bookmarkSkip`; изключване трие само-отметките и
  връща правото. Измерено: ~36 отметки/с (WASM, 1 нишка), търсене 55–135 мс при
  3000 спомена; най-новите се учат първи.
- **Молба за отзив** (`lib/rate.js`): след 3-тото успешно намиране (клик на
  резултат/цитат/omnibox подсказка). Еднакво за всички, без награда, без
  пресяване; винаги до „Оцени“ стои „Нещо не работи?“ (mailto само с версия +
  браузър). „Не сега“ → още веднъж след 30 дни и 10 намирания, максимум 2.
  Една покана наведнъж — поканата за отметки (млада памет, <30) има предимство,
  и редът е детерминиран (молбата се монтира СЛЕД решението за поканата).
- **Отговор от паметта** (`lib/answer.js` чисти функции + `lib/answer-ui.js`):
  Prompt API (`LanguageModel`, Gemini Nano) в extension страниците — НЕ в SW.
  Езици днес: en/es/de/fr/ja → BG/IT интерфейс отговаря само на латински въпроси
  (на английски); кирилски въпрос → мълчание. Въпрос → отговор сам; ключови думи
  → бутон; `downloadable` → карта „Включи“ (кликът е жестът за тегленето). До 6
  източника (прочетени с откъс ≤900 знака, отметки само със заглавие); цитатите
  [n] стават линкове + перла на цитираната карта; измислен номер остава текст.
  Откъсите са **недоверени данни** (системният промпт го казва), изходът се
  рисува само като текст. Устройство/език без поддръжка → функцията мълчи.
- **Тестове:** `dist-test` (`npm run build:test`) дава опционалните права
  предварително — headless Chromium не може да приеме диалога за право; релийз
  пакетът е непроменен. Prompt API в e2e е подменен през `addInitScript`
  (истинският тук казва `unavailable` — няма GPU). Playwright „not stable“ при
  анимирания фон → позицията е мерена кадър по кадър; кликът е директен.
- `[hidden]` е глобално `!important` в glass.css (компонент с `display: flex`
  иначе го надписва). Светлата тема на welcome: welcome.css се зарежда след
  search.css — светлият override живее и в welcome.css.

## Пътна карта (по ред)

1. Качване в Chrome Web Store: деплойни `server/` на deja.carbonstealth.eu
   (/privacy е CWS privacy URL-ът) + формуляра от store/LISTING.md.
2. Firefox build интеграция (--firefox → dist-firefox/, по firefox/README.md).
3. Pro v1 (по docs/PRO.md, след решение на собственика).
4. HNSW при >100k парчета (пакетираните вектори стигат до ~50k).
