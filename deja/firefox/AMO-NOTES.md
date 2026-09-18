# Déjà — addons.mozilla.org (AMO) ревю бележки

Какво иска AMO ревюто за Déjà и как го покриваме. AMO е по-строг от Chrome Web
Store по **source code submission** и подписването е задължително.

## 1. Source code submission (задължително при минифициран bundle)

Déjà се доставя като **esbuild minify** bundle (`dist-firefox/`). AMO политиката
изисква: ако качественият код е генериран/минифициран/транспилиран, трябва да
**предадем изходния код + инструкции за възпроизвеждане** на същия bundle.

Пакет за качване в „Source code“ полето (ZIP на репото, само нужното):

- `src/` (целият), `firefox/embed-adapter.js`, `firefox/manifest.firefox.json`
- `build.mjs`, `package.json`, `package-lock.json`
- `_locales/`, `icons/`, HTML/CSS за страниците
- **README за рецензента** (кратък `REVIEWER-BUILD.md`) с точни стъпки:
  ```
  Изисква Node >= 20 и npm.
  npm ci
  node build.mjs --firefox        # → dist-firefox/
  # (по избор) npx web-ext build --source-dir dist-firefox
  ```
- Пиши точната версия на `esbuild` и `@huggingface/transformers`
  (заковани в `package-lock.json`) — рецензентът трябва да получи **идентичен**
  изход. Без `postinstall` магии, без мрежа по време на build (WASM идва от
  `node_modules`, не се тегли).

Забележка: **WASM файловете** (`wasm/ort-*.wasm`) са предкомпилирани артефакти от
`@huggingface/transformers`. Обясни на рецензента, че идват от npm пакета (не са
наш ръчен binary), с версия от `package-lock.json` — това предотвратява въпрос
„откъде е този .wasm“.

## 2. Нула отдалечен код (същата червена линия като CWS)

- Цялата логика е в пакета; няма `eval`, `new Function`, CDN `<script src>`,
  отдалечен `import()`.
- ORT-WASM е **в пакета**. Теглата на модела се теглят еднократно от Hugging Face
  (`huggingface.co`) — това са **данни за ML модел, не изпълним код**. Декларирай
  го честно (виж privacy). AMO допуска сваляне на данни, но не и на код.

## 3. Privacy / данни

- **Privacy policy URL** е задължителен ако се обработват потребителски данни.
  Ползвай съществуващата политика на Déjà (`deja/PRIVACY.md` → hostната
  `/privacy` страница). Тя вече казва: всичко локално, нула cloud, нула telemetry.
- В AMO листинга декларирай честно: разширението индексира текста на посетените
  страници **локално** (IndexedDB), не го изпраща никъде. Единствената изходяща
  заявка е еднократното теглене на модела от Hugging Face (по избор — собствен
  `modelHost` огледало) — разкрий, че при това HF вижда IP-то (както в PRIVACY.md
  v1.1).
- Никаква продажба/споделяне на данни.

## 4. Permissions justification (за рецензента)

| Permission | Обосновка |
|-----------|-----------|
| `content_scripts` на `http/https://*/*` | Самата същност на продукта — семантична памет на страниците, които потребителят чете. Индексирането е локално; вграден агресивен denylist (поща/чат/банки/логин) пази чувствителни сайтове. |
| `storage` + `unlimitedStorage` | Индексът (вектори + метаданни) в IndexedDB може да порасне; настройки в `storage.local`. |
| `alarms` | Дневен retention prune + логическо освобождаване на embedding двигателя при бездействие. |

**Няма** `offscreen` (Firefox няма такова), **няма** `tabs`/`webRequest`/broad
API permissions отвъд горните. Least privilege е спазен.

## 5. Технически чеклист преди качване

- [ ] `browser_specific_settings.gecko.id = "deja@carbonstealth.eu"` присъства.
- [ ] `strict_min_version` е зададен и тестван на тази версия.
- [ ] `npx web-ext lint --source-dir dist-firefox` е чист (0 errors).
- [ ] Load Temporary Add-on минава: индексиране + търсене работят, event page
      преживява студеното теглене на модела.
- [ ] Version в `manifest.firefox.json` расте спрямо предишен ъплоуд.
- [ ] Source ZIP + `REVIEWER-BUILD.md` са готови за „Source code“ полето.
- [ ] Privacy policy URL е валиден и достъпен.

## Граница

Тук не можем да качим в AMO, да минем ревюто или да подпишем `.xpi` — това става
на машина с Firefox + AMO акаунт (`web-ext sign` с API ключове, които живеят на
машината, **не** в репото). Тази бележка е чеклистът, който да следваш там.

## Източници

- AMO source code policy: <https://extensionworkshop.com/documentation/publish/source-code-submission/>
- AMO review policies: <https://extensionworkshop.com/documentation/publish/add-on-policies/>
