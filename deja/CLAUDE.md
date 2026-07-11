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

**Качествена порта: `npm run format:check && npm run build`.**

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

## Пътна карта (по ред)

1. Страница „моята памет“: списък на страниците, изтриване поединично,
   export/import на индекса (Хромаджията M2 — доверие + GDPR хигиена).
2. HNSW/IVF индекс при >50k парчета (сега: brute-force cursor, ОК до ~20k).
3. Качване в Chrome Web Store: деплойни `server/` на deja.carbonstealth.eu
   (nginx конфигът е готов; /privacy маршрутът е CWS privacy URL-ът), попълни
   импресума (адрес+имейл, TODO маркери в privacy.html и PRIVACY.md), Data
   Disclosure „No collection“ + трите сертификации (виж store/LISTING.md).
   EN версия на политиката — преди международно промотиране.
4. Firefox порт.
