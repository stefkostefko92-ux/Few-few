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
- **Минимални права:** storage, offscreen, unlimitedStorage. Content script на
  `http(s)://*/*` е самата същност на продукта — обосновава се в review бележките.
- CSP на extension страниците изисква `'wasm-unsafe-eval'` (вече в манифеста).
- Manifest bump: версията в manifest.json и package.json се движат заедно.

## Поверителност (не се преговаря)

- Данните не напускат устройството. Никакъв telemetry, никакъв cloud.
- `lib/settings.js` има denylist по подразбиране (поща, чатове, login, банки,
  плащания) — съвпадение по подниз, умишлено агресивно. Не го отслабвай.
- Пауза от popup-а спира индексирането моментално; „Изчисти паметта“ трие всичко.

## Пътна карта (по ред)

1. Options страница: потребителски denylist + retention (авто-изтриване след N месеца).
2. SPA навигации (history API hook в content.js — сега хващаме само първия load).
3. WebGPU device с fallback към WASM (в offscreen.js).
4. HNSW/IVF индекс при >50k парчета (сега: brute-force cursor, ОК до ~20k).
5. Многоезичен UI (BG е източникът на истината, после EN/IT).
