# Supreme AdBlock — `adblock/`

Chrome extension (Manifest V3) за блокиране на реклами. Част от моно-репото на
Carbon Stealth; няма общ код с другите продукти.

- **Стек:** vanilla JS (без билд стъпка), `declarativeNetRequest` + content scripts.
- **Домейн:** самостоятелно разширение · публикува се в Chrome Web Store.
- **Език:** UI е на английски (глобална аудитория); коментарите/комитите на BG.

## Структура

```
manifest.json           MV3 конфигурация (версията живее само тук + package.json)
background.js           service worker — рулсети, allowlist, статистики, съобщения
theme.js                прилага Carbon Stealth / светла тема
content.js / .css       козметика (вкл. процедурни селектори) + Smart Detection
cosmetic_generic.css    EasyList генерична козметика (гейтната с html[data-tbab-on])
meta.js                 Facebook / Instagram sponsored постове
cookies.js / .css       затваряне на cookie/consent банери (вкл. Shadow DOM)
antiadblock.js / .css   махане на "disable adblocker" стени
picker.js / .css        element picker (ръчно скриване) + zapper (еднократно)
scriptlets/             scriptlet engine (##+js): policy.js (ЕДИНСТВЕН източник на
                        политиката — инлайнва се в engine-а, importScripts в SW, content
                        script ПРЕДИ content.js в изолирания свят, vm в билда) + engine.js
                        (clean-room код) + list.txt (данни) → main.js
                        (пече се от build_scriptlets.mjs; MAIN world при document_start)
youtube_loader.js       инжектира youtube_main в MAIN world (с bypass fallback)
youtube_main.js         MAIN world — маха рекламните полета от player отговора
youtube_skip.js         auto-skip + enforcement fallback (видеото винаги зарежда)
youtube.css             скрива рекламните UI елементи на YouTube
rules/                  DNR статични правила: ad_rules + youtube_rules +
                        easylist/easyprivacy/urlhaus/removeparam (билднати от
                        tools/build_filters.mjs) + козметичен bundle + counts
lib/abp2dnr.js          ЕДИНСТВЕН ABP/uBO → DNR конвертор (класически скрипт, root.ABP2DNR):
                        билдът го ползва през vm, SW през importScripts (листите от автора)
popup/ · options/       UI (popup + настройки; карти „Филтър-листи" и „Фокус")
report/                 „Сайтът е счупен?" — бързи поправки + mailto доклад (нищо не се праща само)
icons/ · _locales/      икони · локализация
tools/                  build_filters.mjs (EasyList→DNR + каталога tools/lists.json → rules/list_<id>.json,
                        rules/cosmetic_<id>.json, rules/lists.json, THIRD_PARTY_NOTICES.txt; синхронизира
                        rule_resources в manifest-а) + build_scriptlets.mjs (+ uBO scriptlet-и на 64 парчета
                        по хост в scriptlets/ubo/) + генератори + package.sh (Chrome + Firefox zip)
                        + compare_blockers.mjs (публични тестове срещу конкурентите — числата за landing-а)
                        + e2e_redirect.mjs (истински Chromium през Playwright: DNR redirect → resources/*
                        smoke; `PW_ROOT=$(npm root -g) node tools/e2e_redirect.mjs "$PWD" <url> <global>`)
tests/                  npm test — engine/live канал/билд/DNR/паритет на политиката (нула зависимости)
store/ · docs/          store графики + листинг/submission текстове
```

## Качествен гейт (преди „готово")

```
node -c *.js popup/*.js options/*.js tools/*.mjs   # syntax на всички скриптове
python3 -c "import json; json.load(...)"     # валиден manifest/rules/locale
npm test                                      # tests/: engine + live канал + билд + DNR правила + YouTube + cookies
PW_ROOT=$(npm root -g) npm run test:browser   # реален Chromium: cookies.js фикстури + истинското разширение (не е в CI — иска Playwright)
PW_ROOT=$(npm root -g) npm run landing:assets # server/*.webp: бранд щитът + РЕАЛНИЯТ popup (след промяна на popup/версия)
PW_ROOT=$(npm root -g) node tools/perf_speedtest.mjs [--old <разархивиран zip>]  # цена на главната нишка (Speedtest-подобно); след промяна в content scripts/CSS
node tools/build_scriptlets.mjs --check       # scriptlets/main.js свеж спрямо list.txt
bash tools/package.sh                         # билд + самопроверка на пакета
```

## Инварианти (не чупи)

- **Единствена цел** (Web Store): блокиране на реклами/тракери. **Без remote
  code, никога.** Единствените мрежови заявки са дневен GET на
  `adblock.carbonstealth.eu/filters.json` (+ `.sig` — Ed25519 подпис, проверява
  се при конфигуриран ключ) — само ДАННИ (домейни, CSS селектори, YT полета),
  които се валидират строго и не се изпълняват. Данни са разрешени в MV3; код не е.
- **Scriptlets (`##+js`):** точно uBOL моделът — КОДЪТ (`scriptlets/engine.js`) е
  фиксиран в пакета; per-site директивите се **пекат при билда** от `list.txt` в
  `scriptlets/main.js`. Scriptlet КОД никога не идва от мрежата; live директиви (само
  ДАННИ: host + име + аргументи) идват единствено от Ed25519-подписания `filters.json`
  и се **ре-валидират в engine-а** срещу същия allowlist. Нула eval.
  Билд-валидаторът е allowlist на имена + строга проверка на аргументите;
  `set-constant` стойностите — само от фиксиран речник. **След промяна на
  engine.js или list.txt пусни `node tools/build_scriptlets.mjs`** и препакетирай.
- YouTube: **не** блокираме `googlevideo.com`. Player ЗАЯВКАТА получава само
  добавени boolean флагове (isInlinePlaybackNoAd — спира доставката на реклами
  при източника); никога не пипаме съществуващи полета (подписи/timestamps) и
  всичко е try/catch с pass-through. От отговорите само махаме рекламните
  полета/renderer-и на място. Ако акаунт е флагнат и YouTube откаже
  възпроизвеждане, `youtube_loader` прави еднократен bypass reload, за да
  зареди видеото (с реклами) вместо празен плейър; disableRequestFlags в
  filters.json е аварийният стоп за флаговете.
- Всички `chrome.*.on*.addListener` се регистрират **синхронно на top level** в
  service worker-а.
- Smart Detection крие само cross-origin iframe с точен IAB рекламен размер —
  консервативно, за да няма false positives.
- **cookies.js кликва само CMP-специфични бутони глобално**; всичко генерично (текст,
  aria-label, test-id) — само вътре в контейнер, който говори за бисквитки, никога бутон,
  който изпраща форма, никога линк навън, нищо генерично на страници за вход/OAuth/плащане.
  Нов генеричен селектор НИКОГА в глобалния слой (гейтнато от `tests/cookies.test.mjs`).
- **Главната нишка на страницата е чужда.** `cosmetic_generic.css` — само индексируеми
  правила (вложен блок, генерира го `tools/generic_css.mjs`), НИКОГА голям `:is()` списък
  (~47× по-скъп style recalc; докладвано Speedtest 900 → 150 Mbps). MutationObserver-ите не
  сканират целия документ при всяка промяна: само добавените поддървета, промени само на
  текст не струват нищо, една `querySelectorAll` на списък, не на селектор.
- **Content script ≠ страница на разширението:** SW приема от content script само
  `smartHit`, `getCosmetic`, `saveCustomSelector`, `ytBypass`, `cookieRejected`; всичко
  друго — само от popup/options/report (`sender.url` на разширението).
- **Листи: в пакета само ясно лицензирани.** Лист без лиценз за разпространение (BG, PL NC,
  Dandelicence) никога не влиза в пакета — сваля се от автора САМО при включване от
  потребителя, конвертира се локално като данни (динамични правила ≥ 200000). Един
  невалиден `urlFilter` проваля ЦЕЛИЯ ruleset в Chrome — `tests/rules.test.mjs` и
  реалното зареждане в browser теста го пазят.
- **Езици:** ≥54 (днес 70), всеки с пълни ключове и същите `$1` плейсхолдъри
  (`tests/i18n.test.mjs`). Нов ключ → във ВСИЧКИ `_locales`. CSS — логически свойства
  (`margin-inline-start`, `inset-inline-*`), за да работи RTL.
