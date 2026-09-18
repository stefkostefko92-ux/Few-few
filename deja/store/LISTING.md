# Déjà — Chrome Web Store листинг (v1.3)

**Английският е основният език на листинга** (default_locale: en); българският
(и италианският) са допълнителни. Пакетът: `npm run zip` → `release/deja-<версия>.zip`.
Пълните стъпки за подаване: **`store/PUBLISH.md`**.

**Скрийншоти** (CWS приема САМО 1280×800 или 640×400; до 5 на език, в `store/screenshots/`):

| # | EN (основен) | BG (езиков таб) | Какво показва |
|---|---|---|---|
| 1 | `search-en.png` | `search-bg.png` | семантично търсене, филтри, откроени думи, скала на спомена |
| 2 | `sidepanel-en.png` | `sidepanel-bg.png` | страничният панел „по темата на тази страница“ до реална статия |
| 3 | `memory-en.png` | `memory-bg.png` | „Моята памет“: списък, търсене, статистика, export/import |
| 4 | `welcome-en.png` | `welcome-bg.png` | прозрачност при инсталация (какво прави / не прави) |
| 5 | `options-en.png` | `options-bg.png` | retention, собствен denylist, огледало на модела |

**Промо графики** (`store/promo/`): `small-tile-440x280.png` (задължителен),
`marquee-1400x560.png` (по избор). Store icon = `icons/icon128.png`.

**Privacy policy URL:** https://deja.carbonstealth.eu/privacy (английска,
канонична; BG на /privacy-bg). **Трябва да върне 200 преди подаване.**

**Контакти във формуляра:** support email `info@carbonstealth.eu`, privacy
contact `privacy@carbonstealth.eu`. Homepage: https://deja.carbonstealth.eu

---

## EN listing (основен) — copy-paste

**Item title:** Déjà — your browser's memory

**Short description (≤132 chars):**
Search the pages you've read by meaning, in 50+ languages. Runs entirely on
your device — nothing ever leaves your browser.

**Detailed description:**

You've seen it. Déjà finds it.

Your browser history only remembers titles and URLs. Déjà remembers the
CONTENT. Describe what you recall in your own words — "that article about
sodium-based batteries" — and Déjà surfaces the page, even if you don't
remember the title, the site, or the exact words. It even jumps to the exact
paragraph.

WHAT YOU GET
✓ Search by meaning — ask in your own words, in 50+ languages; ask in one
  language, find pages you read in another.
✓ Side panel companion — open it next to any page and see what you have
  already read on that page's topic, plus your recent memories.
✓ Type "dj" in the address bar — search your memory straight from the omnibox
  with live suggestions.
✓ Remember a passage — right-click any selected text: "Déjà: remember
  selected text". It becomes its own searchable memory.
✓ Jump to the exact paragraph — results open the page with the matching
  passage highlighted.
✓ Date filters, related memories, recent memories on the empty search page.
✓ My memory — see everything Déjà remembers, forget any page with one click,
  export/import your whole index as a file.

PRIVATE BY DESIGN
✓ 100% local processing — the AI embedding model runs inside your browser and
  your data lives in IndexedDB. No servers, no cloud, no telemetry, no account.
✓ Mail, chats, login and banking pages are skipped automatically (built-in
  address list; add your own patterns).
✓ Pause with one click. "Forget this page" and "Clear memory" are always there.
✓ Automatic forgetting — optionally delete pages older than 3/6/12/24 months.
✓ Light and dark themes follow your system.

The only network request the extension ever makes is a one-time download of
the embedding model from Hugging Face (cached locally afterwards; you can
point it at your own mirror instead).

**Category:** Productivity → Tools
**Language:** English (default) + Български + Italiano

## Single purpose (за review-а)

Déjà lets users semantically search the web pages they have already read.
It locally indexes page text and answers natural-language queries entirely
on-device. That is its single purpose; every permission serves it.

## Обосновка на правата (за review-а — copy-paste в „Permission justification“)

| Permission | Justification |
|---|---|
| Content script on `http(s)://*/*` | Core function: extracts the readable text of pages the user visits so they can be searched later, and reports the active page's URL/title to the side panel. Nothing leaves the device. |
| `storage` | User settings (pause, denylist, retention) and the indexing queue; `storage.session` holds the active tab's URL/title for the side panel. |
| `unlimitedStorage` | The local vector index grows with the user's reading history. |
| `offscreen` | Hosts the local ONNX/WASM embedding model — service workers are too short-lived for it. |
| `alarms` | Daily retention cleanup and idle cleanup of the model host document. |
| `contextMenus` | "Déjà: remember selected text" and "Déjà: forget this page" items on the page context menu. |
| `sidePanel` | The companion side panel (search + what you have read on this page's topic). |
| `activeTab` | Only to read the current tab's URL when the user clicks "Forget this page" in the popup. Not used for anything else. |

**Remote code:** none. ONNX Runtime WASM ships inside the package. Model
weights (data, not code) are fetched once from Hugging Face and cached locally.
That one-time download necessarily reveals the user's IP address to Hugging
Face's CDN (disclosed in the privacy policy); users can point the extension at
a self-hosted mirror instead (Settings → model mirror).

## Privacy практики (Data Disclosure формуляр)

- **Data usage** → отметни **Web history** и **Website content** (обработват се
  изцяло локално, но CWS User Data FAQ Q3 изисква разкриване и при локална
  обработка). Нищо друго. Подробностите ред по ред — в PUBLISH.md.
- Трите сертификации → отметни и трите (не продаваме, не ползваме извън single
  purpose, не ползваме за кредитоспособност).

---

## BG listing (допълнителен език) — copy-paste

**Заглавие:** Déjà — паметта на браузъра ти

**Кратко описание (≤132 знака):**
Търси страниците, които си чел, по смисъл — на 50+ езика. Изцяло на твоето
устройство: нищо не напуска браузъра ти.

**Пълно описание:**

Виждал си го. Déjà го намира.

Историята на браузъра помни само заглавия и адреси. Déjà помни СЪДЪРЖАНИЕТО.
Опиши каквото си спомняш със свои думи — „статия за батерии на натриева
основа“ — и Déjà изважда страницата, дори да не помниш нито заглавието,
нито сайта, нито точните думи. Дори скача до точния абзац.

КАКВО ПОЛУЧАВАШ
✓ Търсене по смисъл — със свои думи, на 50+ езика; питаш на един език,
  намираш четеното на друг.
✓ Страничен панел-компаньон — отвори го до всяка страница и виж какво вече си
  чел по нейната тема, плюс последните си спомени.
✓ Напиши „dj“ в адресната лента — търсене в паметта направо от omnibox-а с
  живи подсказки.
✓ Запомни абзац — десен клик върху избран текст: „Déjà: запомни избрания
  текст“. Става самостоятелен спомен за търсене.
✓ Скок до точния абзац — резултатите отварят страницата с маркиран пасаж.
✓ Датови филтри, свързани спомени, последни спомени на празната търсачка.
✓ Моята памет — виж всичко запомнено, забрави страница с един клик, изтегли/
  възстанови целия индекс като файл.

ПОВЕРИТЕЛНОСТ ПО ДИЗАЙН
✓ 100% локална обработка — AI моделът работи в браузъра ти, данните са в
  IndexedDB. Без сървъри, без облак, без telemetry, без акаунт.
✓ Поща, чатове, вход и банкиране се пропускат автоматично (вграден списък по
  адрес; добави и свои шаблони).
✓ Пауза с един клик. „Забрави тази страница“ и „Изчисти паметта“ са винаги там.
✓ Автоматично забравяне — по избор Déjà трие страници, по-стари от 3/6/12/24 месеца.
✓ Светла и тъмна тема според системата.

Единствената мрежова заявка е еднократното теглене на модела от Hugging Face
(после се кешира локално; можеш да посочиш и собствено огледало).
