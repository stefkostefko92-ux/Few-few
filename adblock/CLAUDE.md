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
meta.js                 Facebook / Instagram / Threads sponsored постове (етикетът за екранния четец, ~70 езика)
gpc.js + rules/gpc.json Global Privacy Control: navigator.globalPrivacyControl (MAIN, регистриран от SW) +
                        Sec-GPC: 1 (статичен рулсет, приоритет 1 — разрешен сайт/пауза са над него)
cookies.js / .css       затваряне на cookie/consent банери (вкл. Shadow DOM)
antiadblock.js / .css   махане на "disable adblocker" стени
picker.js / .css        element picker (ръчно скриване) + zapper (еднократно)
scriptlets/             scriptlet engine (##+js): policy.js (ЕДИНСТВЕН източник на
                        политиката — инлайнва се в engine-а, importScripts в SW, content
                        script ПРЕДИ content.js в изолирания свят, vm в билда) + engine.js
                        (clean-room код) + list.txt (данни) → main.js
                        (пече се от build_scriptlets.mjs; MAIN world при document_start)
youtube_loader.js       подава live добавките (данни) на youtube_main чрез DOM събитие
youtube_main.js         MAIN world (регистриран от SW) — маха рекламите от player/feed отговорите като текст
youtube_skip.js         auto-skip + enforcement fallback (видеото винаги зарежда)
youtube.css             скрива рекламните UI елементи на YouTube
rules/                  DNR статични правила: ad_rules + youtube_rules +
                        easylist/easyprivacy/urlhaus/removeparam (билднати от
                        tools/build_filters.mjs) + козметичен bundle + counts
lib/foreign.js          внос от uBlock Origin / AdGuard / Adblock Plus (Настройки + welcome): само разделя
                        текста на сайтове и редове; SW проверява всичко отново (`importForeign` →
                        parseImportedList — правило с път НИКОГА не става блок на целия домейн)
lib/abp2dnr.js          ЕДИНСТВЕН ABP/uBO → DNR конвертор (класически скрипт, root.ABP2DNR):
                        билдът го ползва през vm, SW през importScripts (листите от автора)
popup/ · options/       UI (popup + настройки; карти „Филтър-листи" и „Фокус"). Popup-ът има 3D щит:
                        popup/img/*.webp = ПРЕРЕНДЕРИРАН three.js (tools/popup_shield3d.mjs, комитва се;
                        статичен кадър в CSS, показва се веднага), popup/shield3d.js = ~8 KB собствен
                        WebGL2 (без библиотека) САМО за преосветяване по курсора — след първото
                        рисуване, не при reduced-motion/-data/автоматизация/софтуерен GL. Състоянието
                        идва от `#hero[data-state]` (protected|paused|off|allowed), пише го popup.js.
                        Liquid Glass: стъклото е само CSS (backdrop-filter + маскиран ръб ::after + --mx/--my
                        от popup.js), сиянието е body::before; prefers-reduced-transparency → плътни панели.
                        НЕ ползвай localStorage в popup-а (първият достъп ~40 ms) и не връщай three.js в пакета.
                        **↶ N** (5.5.0, отмяна на picker-а) е бутон до „Скрий елемент“, не отделен ред: пълното
                        изречение е aria-label/title; ако редът прелее, `.actions.squeeze` оставя на Settings само
                        зъбното колело (fitPopup()). Отделен ред за нещо ново = над 600 px на 9 езика (измерено).
                        **Таван 600 px** (Chrome): fitPopup() стяга отстоянията (`html.tight`) само ако съдържанието
                        го мине, а долната лента остава само с икони (`.foot.compact`); всичките 73 локала — гейт в
                        tests/browser/popup-fit.browser.mjs. Нещо ново в popup-а → провери там, не само на английски.
                        **Отзив в CWS (5.1.8):** ★ в долната лента + карта (лист отдолу, покритото — inert), най-много
                        2 пъти през ≥ 60 дни, след ≥ 7 дни и ≥ 1000 блокирани, само при работеща защита. Решава SW
                        (`reviewDue`/`reviewUrl` — линк само при инсталация от CWS), popup-ът рисува; ключът
                        `reviewAsk` в Настройки маха всичко. БЕЗ стимули, без филтър по мнение, никога по сайтовете
                        или като известие (CWS Program Policies) — не добавяй „оцени с 5 звезди“ или награди.
blocked/                страницата вместо опасен сайт: динамично redirect правило (regexSubstitution →
                        chrome.runtime.getURL — затова е WAR БЕЗ use_dynamic_url), приоритет 2 (под разрешен сайт,
                        пауза и YouTube bypass). „Продължи“ само през SW (`proceedDangerous`: http(s), хост от URLhaus)
                        → едно session allow правило; в рамка страницата не прави нищо (click-jacking). Статичното
                        правило на URLhaus без resourceTypes НЕ хваща main_frame — затова съществува това.
report/                 „Сайтът е счупен?" — бързи поправки (вкл. „за 1 час“ → allowUntil + аларма allow-expire) + mailto доклад
welcome/                първо пускане: бързи избори (setFeatures/setList — features се праща ЦЯЛ), вносът, клавишите
icons/ · _locales/      икони · локализация
tools/                  build_filters.mjs (EasyList→DNR + каталога tools/lists.json → rules/list_<id>.json,
                        rules/cosmetic_<id>.json, rules/lists.json, THIRD_PARTY_NOTICES.txt; синхронизира
                        rule_resources в manifest-а) + build_scriptlets.mjs (+ uBO scriptlet-и на 64 парчета
                        по хост в scriptlets/ubo/) + генератори + package.sh (Chrome + Firefox zip)
                        + compare_blockers.mjs (публични тестове срещу конкурентите — числата за landing-а)
                        + promo/ (промо клипове в стила на boy/: film.html 16:9 за YouTube/сайта/CWS (`--cut store`
                        — без сравнение и без „free“) + film-social.html 9:16 за Reels/TikTok/Shorts (`--cut social`:
                        hook „рекламата умира“ в първата секунда, loop, −14 LUFS, корица, 4:5 изрез; „Free“ и
                        рекламният плейър — НИКОГА в медиите на CWS) + timeline.json; бурята идва от
                        server/index.html, popup/панелите от store генератора, звукът е генериран;
                        `PW_ROOT=$(npm root -g) PYTHONPATH=<numpy> FFMPEG=$(command -v ffmpeg) node tools/promo/render.mjs [--cut social]`;
                        caption-и и правила за публикуване → docs/SOCIAL.md)
                        **Клиповете НЕ се обновяват повече** (решение на собственика, 2026-10-15): нито при нова
                        версия, нито при промяна в popup-а/сайта/текстовете — не пускай render.mjs, не предлагай
                        нов рендер и не пиши стъпки „смени клипа“ в кита/документите. Последният рендер е store
                        cut 5.1.8. Инструментите остават в репото само за изрично искане на собственика.
                        + popup_shield3d.mjs (three.js от CDN САМО в инструмента → popup/img/; `PW_ROOT=$(npm root -g) node tools/popup_shield3d.mjs`;
                        `--hero <png>` = голям щит за промото)
                        + store_promo.mjs (промо плочка 440×280 + marquee 1400×560: 3D щитът, ударен от мълния — БЕЗ текст,
                        наситени, запълнени; правилата на Google „Supplying Images“) + generate_icons.py (иконите; 128 = 96×96
                        рисунка + 16 px отстъп + светъл ореол само по външния силует — install диалогът и магазинът)
                        + e2e_redirect.mjs (истински Chromium през Playwright: DNR redirect → resources/*
                        smoke; `PW_ROOT=$(npm root -g) node tools/e2e_redirect.mjs "$PWD" <url> <global>`)
tests/                  npm test — engine/билд/DNR/паритет на политиката (нула зависимости)
store/ · docs/          store графики + листинг/submission текстове. Скрийншотите: `python3 store/screenshots/build.py`
                        (английските, комитват се) и `--locales` (другите 62 езика на магазина → dist/, JPEG,
                        надписи в store/screenshots/i18n.json, нужни са Noto шрифтовете) — минимум текст, истинският
                        popup на съответния език. store/cws-unlisted.json = 10-те езика, които магазинът не показва.
server/                 сайтът adblock.carbonstealth.eu: index, privacy, support, youtube-ad-blocker,
                        cookie-banner-blocker (+ sitemap, llms.txt, robots, filters.json). **Нова страница =**
                        кратък адрес в nginx.conf И Caddyfile + файлът в списъка на deploy/autodeploy.sh + IndexNow
                        `urlList` там + sitemap + llms.txt — `tests/site.test.mjs` гейтва всичко това.
                        **Езиковите страници** server/<bg|de|it|es|fr|pt-br>/index.html се ГЕНЕРИРАТ:
                        `node tools/site_lang.mjs` от tools/site-lang/<език>.json (en.json е източникът) със стиловете
                        на youtube-ad-blocker.html — не ги пипай на ръка (`--check` е в site.test). hreflang групата
                        (английската + 6 + x-default) е взаимна; нов език = JSON + LANGS в генератора + `for l in`
                        в autodeploy.sh + nginx/Caddy `/<език>` → `/<език>/` + IndexNow + sitemap + llms.txt.
```

## Качествен гейт (преди „готово")

```
node -c *.js popup/*.js options/*.js tools/*.mjs   # syntax на всички скриптове
python3 -c "import json; json.load(...)"     # валиден manifest/rules/locale
npm test                                      # tests/: engine + билд + DNR правила + YouTube + cookies
PW_ROOT=$(npm root -g) npm run test:browser   # реален Chromium: cookies.js фикстури + истинското разширение + YouTube + back/forward
                                              # cache + axe (WCAG 2.2 AA, popup (и с картата за отзив)/настройки/welcome/report, двете
                                              # теми; axe-core през AXE_PATH или до Playwright) + молбата за отзив + popup ≤ 600 px на
                                              # 73 локала — не е в CI
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
  `scriptlets/main.js` (+ `scriptlets/ubo/`). **От 5.1.4 няма канал на живо:** нито код,
  нито директиви идват от мрежата; engine-ът не слуша никакво DOM събитие, а ключ
  `scriptlets` във `filters.json` се игнорира (CWS: нищо изтеглено не управлява MAIN
  world). Нула eval.
  Билд-валидаторът е allowlist на имена + строга проверка на аргументите;
  `set-constant` стойностите — само от фиксиран речник. **След промяна на
  engine.js или list.txt пусни `node tools/build_scriptlets.mjs`** и препакетирай.
- YouTube (5.1.3, след „блокира след 3 клипа“): **не** блокираме `googlevideo.com`, `/ptracking`
  (playback пинг на съдържанието) и `/api/stats/atr` изобщо — плейър, който не докладва, е
  сигнал за „трите удара“. `youtube_main.js` е **регистриран от SW** (MAIN world, document_start,
  `sa-youtube`), не инжектиран с `<script src>`; махнат е от web_accessible_resources. Рекламите се
  махат като ТЕКСТ преди парсване (`"adPlacements"/"adSlots"/"playerAds"` → `"no_ads"`, метода на
  uBO), не с глобален `JSON.parse` хук. **Всяка подменена функция — тук и в `scriptlets/engine.js`
  (`cloak`) — е Proxy на родната с маскиран `Function.prototype.toString`**: `fetch.toString()` трябва
  да е точно `function fetch() { [native code] }` (тестове + browser проверка). Свежите iframe-и
  получават същите куки (YouTube взема „чист“ fetch от iframe). Само ATR пингът с рекламното
  състояние (регексът на uBO) се отговаря локално; таймерът 17000 ms (fake buffering) → 17 ms.
  **Без** request флагове по подразбиране (isInlinePlaybackNoAd на watch страница е сигнал);
  filters.json `requestFlags` може да ги пусне, с plain-retry резервата. `youtube_skip` само mute +
  родния Skip — **никога** 16× (YouTube го брои). Ако YouTube все пак откаже, bypass-ът (6 ч) маха
  и `sa-youtube`, и scriptlet-ите от YouTube страниците.
- `rules/ad_rules.json` и `rules/youtube_rules.json` идват **само** от `tools/generate_rules.py` — правило се
  добавя там, не в JSON-а. Id-тата са фиксирани (изваден id не се ползва повторно: YouTube 1001/1003);
  `tests/generate_rules.test.mjs` ребилдва във временна папка и сравнява байт по байт.
- Всички `chrome.*.on*.addListener` се регистрират **синхронно на top level** в
  service worker-а.
- **„Връзки на страницата“** (popup): content.js чете Resource Timing САМО при отваряне на кутията, само в top
  frame, само за нашето съобщение `getConnections`; „Блокирай тук“ = `siteBlocks[site]` → едно правило на сайт
  (60000+, `initiatorDomains`, приоритет 5000: над изключенията на листите ≤ 5, под allowlist 10000). Защитен хост
  (SA_POLICY.protectedHost) никога; импортът минава през `cleanSiteBlocks`. Нов диапазон динамични id → провери
  `logListKey` и getHealth (бюджетът на Chrome е в „Състояние на ядрото“).
- **Клавишни комбинации** (manifest `commands`): само `Alt+Shift+<буква>` / `MacCtrl+Shift+<буква>`
  (Option+Shift пише знаци на Mac). Никога буква, която Chrome пази и тихо отказва като suggested key
  (B — лентата с отметки, C, P, W, X, Z; измерено в Chromium), нито менютата на Google Docs/Sheets/Slides
  (F E V I O T H A N D X S R). Днес U (сайтът) и Q (пауза); picker-ът е без клавиш. Гейт в
  `tests/control.test.mjs`, реалното присвояване — в `tests/browser/control.browser.mjs`.
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
  друго (вкл. `undoHidden`, `importForeign`, `setAllow` с `minutes`, `siteBlock`, `proceedDangerous`) — само от
  popup/options/report/welcome/blocked
  (`sender.url` на разширението).
- **Листи: в пакета само ясно лицензирани.** Лист без лиценз за разпространение (BG, PL NC,
  Dandelicence) никога не влиза в пакета — сваля се от автора САМО при включване от
  потребителя, конвертира се локално като данни (динамични правила ≥ 200000). Един
  невалиден `urlFilter` проваля ЦЕЛИЯ ruleset в Chrome — `tests/rules.test.mjs` и
  реалното зареждане в browser теста го пазят.
- **Езици:** ≥54 (днес **70 езика = 73 папки**: es/es_419, pt_BR/pt_PT, zh_CN/zh_TW са варианти — твърдим
  броя ЕЗИЦИ, гейт в `tests/store.test.mjs`; магазинът показва 63, защото af, be, bs, cy, gl, is, kk, km, mn,
  zu не са в листинга му — Chrome пак ги ползва), всеки с пълни ключове и същите `$1` плейсхолдъри
  (`tests/i18n.test.mjs`). Нов ключ → във ВСИЧКИ `_locales`. CSS — логически свойства
  (`margin-inline-start`, `inset-inline-*`), за да работи RTL.
