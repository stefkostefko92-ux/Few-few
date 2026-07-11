# Déjà — Chrome Web Store листинг

**Английският е основният език на листинга** (default_locale: en); българският е
допълнителен. Пакетът: `npm run zip` → `release/deja-<версия>.zip`.

**Скрийншоти:** CWS приема САМО 1280×800 или 640×400. За основния (EN) листинг
качи `search-en.png`, `options-en.png`, `welcome-en.png`; за BG езиковия таб —
`search-bg.png`, `options-bg.png`, `welcome-bg.png` (всички 1280×800 в
`store/screenshots/`). `popup-*`, `landing-*` НЕ са store скрийншоти.

**Privacy policy URL:** https://deja.carbonstealth.eu/privacy (английска,
канонична; BG версия на /privacy-bg). Деплойни `server/` преди подаване.

**Контакти във формуляра:** support email `info@carbonstealth.eu`, privacy
contact `privacy@carbonstealth.eu`.

---

## EN listing (основен) — copy-paste

**Item title:** Déjà — your browser's memory

**Short description (≤132 chars):**
Search the pages you've read by meaning, in 50+ languages. Everything runs
locally — nothing ever leaves your device.

**Detailed description:**

You've seen it. Déjà finds it.

Your browser history only remembers titles and URLs. Déjà remembers the
CONTENT. Describe what you recall in your own words — "that article about
sodium-based batteries" — and Déjà surfaces the page, even if you don't
remember the title, the site, or the exact words.

✓ 100% local processing — the AI embedding model runs inside your browser and
  your vectors live in IndexedDB. No servers, no cloud, no telemetry. What you
  read never leaves your device.
✓ Semantic search in 50+ languages — ask in one language, find pages you read
  in another.
✓ Private by default — mail, chats, login and banking pages are skipped
  automatically (built-in address list; add your own patterns too).
✓ Automatic forgetting — optionally delete pages older than 3/6/12/24 months.
✓ Keyboard shortcut Alt+Shift+D for instant search.

The only network request the extension ever makes is a one-time download of
the embedding model from Hugging Face (cached locally afterwards; you can
point it at your own mirror instead).

**Category:** Productivity → Tools
**Language:** English (default) + Български + Italiano

## Single purpose (за review-а)

Déjà lets users semantically search the web pages they have already read.
It locally indexes page text and answers natural-language queries entirely
on-device. That is its single purpose; every permission serves it.

## Обосновка на правата (за review-а)

| Permission | Justification |
|---|---|
| Content script on `http(s)://*/*` | The product's core function: extracting readable text of pages the user visits so they can be searched later. No data leaves the device. |
| `storage` | User settings (pause, denylist, retention). |
| `unlimitedStorage` | The local vector index grows with the user's reading history. |
| `offscreen` | Hosts the local ONNX/WASM embedding model — service workers are too short-lived for it. |
| `alarms` | Daily retention cleanup and idle cleanup of the model host document. |

**Remote code:** none. ONNX Runtime WASM ships inside the package. Model
weights (data, not code) are fetched once from Hugging Face and cached locally.
That one-time download necessarily reveals the user's IP address to Hugging
Face's CDN (disclosed in the privacy policy); users can point the extension at
a self-hosted mirror instead (Settings → model mirror).

## Privacy практики (отговори за формуляра)

- Collects user data: **No** (всичко остава на устройството)
- Certifications: и трите отметки = Yes (не продаваме, не ползваме извън
  single purpose, не ползваме за кредитоспособност)

---

## BG listing (допълнителен език) — copy-paste

**Заглавие:** Déjà — паметта на браузъра ти

**Кратко описание (≤132 знака):**
Търси страниците, които си чел, по смисъл — на 50+ езика. Всичко локално:
нищо не напуска устройството ти. Никога.

**Пълно описание:**

Виждал си го. Déjà го намира.

Историята на браузъра помни само заглавия и адреси. Déjà помни СЪДЪРЖАНИЕТО.
Опиши каквото си спомняш със свои думи — „статия за батерии на натриева
основа“ — и Déjà изважда страницата, дори да не помниш нито заглавието,
нито сайта, нито точните думи.

✓ 100% локална обработка — embedding модел в браузъра ти, вектори в IndexedDB.
  Без сървъри, без облак, без telemetry. Прочетеното не напуска устройството.
✓ Семантично търсене на 50+ езика — питаш на един език, намираш четеното на друг.
✓ Поверителност по подразбиране — поща, чатове, вход и банкиране се пропускат
  автоматично (вграден списък по адрес; добави и свои шаблони).
✓ Автоматично забравяне — по избор Déjà трие страници, по-стари от N месеца.
✓ Клавишна комбинация Alt+Shift+D за мигновено търсене.

Единствената мрежова заявка е еднократното теглене на модела от Hugging Face
(после се кешира локално; можеш да посочиш и собствено огледало).
