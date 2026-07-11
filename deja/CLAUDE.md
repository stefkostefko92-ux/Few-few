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
`deja:clear` (към background) и `{target:'deja-offscreen', type:'embed'}`
(към offscreen). Offscreen се създава лениво през `ensureOffscreen()`.

## Команди

```bash
npm ci
npm run build         # esbuild → dist/ (Load unpacked оттам)
npm run format:check  # качествена порта: това + build трябва да минават
npm run icons         # tools/generate_icons.py (иска Pillow) — иконите са комитнати
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
  източникът на истината. `default_locale: "bg"`.
- CWS материали: `store/LISTING.md` (single purpose, обосновка на права,
  описания) + `store/screenshots/` (генерирани с scratchpad Playwright скрипт).

## Пътна карта (по ред)

1. HNSW/IVF индекс при >50k парчета (сега: brute-force cursor, ОК до ~20k).
2. Качване в Chrome Web Store (privacy policy URL на carbonstealth.eu — TODO).
3. Firefox порт (webRequest няма нужда — само offscreen→background worker размяна).
