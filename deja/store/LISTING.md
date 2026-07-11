# Déjà — Chrome Web Store листинг

Материали за качване в CWS Developer Dashboard. Скрийншотите са в
`store/screenshots/` (1280×800). Пакетът: `npm run zip` → `release/deja-<версия>.zip`.

## Single purpose (за review-а, EN)

Déjà lets users semantically search the web pages they have already read.
It locally indexes page text and answers natural-language queries entirely
on-device. That is its single purpose; every permission serves it.

## Обосновка на правата (за review-а, EN)

| Permission | Justification |
|---|---|
| Content script on `http(s)://*/*` | The product's core function: extracting readable text of pages the user visits so they can be searched later. No data leaves the device. |
| `storage` | User settings (pause, denylist, retention). |
| `unlimitedStorage` | The local vector index grows with the user's reading history. |
| `offscreen` | Hosts the local ONNX/WASM embedding model — service workers are too short-lived for it. |
| `alarms` | Daily retention cleanup (auto-deleting old pages when the user enables it). |

**Remote code:** none. ONNX Runtime WASM ships inside the package. Model
weights (data, not code) are fetched once from Hugging Face and cached locally.

## Кратко описание (132 знака, BG)

Търси страниците, които си чел, по смисъл — на 50+ езика. Всичко локално:
нищо не напуска устройството ти. Никога.

## Описание (BG)

Виждал си го. Déjà го намира.

Историята на браузъра помни само заглавия и адреси. Déjà помни СЪДЪРЖАНИЕТО.
Опиши каквото си спомняш със свои думи — „статия за батерии на натриева
основа“ — и Déjà изважда страницата, дори да не помниш нито заглавието,
нито сайта, нито точните думи.

✓ 100% локално — embedding модел в браузъра ти, вектори в IndexedDB.
  Без сървъри, без облак, без telemetry. Данните ти не напускат устройството.
✓ Семантично търсене на 50+ езика, включително български.
✓ Поверителност по подразбиране — поща, чатове, вход и банкиране никога
  не се индексират. Добави свои изключения, пауза с един клик.
✓ Автоматично забравяне — по избор Déjà трие страници, по-стари от N месеца.
✓ Клавишна комбинация Alt+Shift+D за мигновено търсене.

## Категория и езици

- Категория: Productivity → Tools
- Езици: български (основен), English, Italiano

## Privacy практики (отговори за формуляра)

- Collects user data: **No** (всичко остава на устройството)
- Privacy policy URL: `PRIVACY.md` качен на https://carbonstealth.eu/deja/privacy
  (TODO: качи преди подаване)
