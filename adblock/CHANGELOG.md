# Changelog

## 5.0.0 — 2026-09-09

### Фаза 6 — pre-flight с 4 агента (Хромаджията · Кодаджията · Тайният агент · Качествения)
- **Store скрийншотите са снимка на реалния popup** (`store/screenshots/build.py`
  рендва `popup.html` + `popup.css` с демо числа през headless Chromium) —
  арт-ът вече не може да дрейфне от UI-а; премиум редизайнът се вижда в стора.
- **Минимални права:** `tabs` отпадна (при `<all_urls>` е излишен — един warning
  „Read your browsing history“ по-малко); `resources/*` с `use_dynamic_url`
  (сурогатните пътища не са отгатваеми за anti-adblock сонди; DNR redirect-ът
  проверен в истински Chromium — `tools/e2e_redirect.mjs`).
- **Кодаджията (6 Medium, 0 High — затворени):** per-site „без козметика“ важи и
  при повторно включване на защитата и за Smart Detection; `counts.popupHosts`
  влиза в `counts.json` (health картата показваше 0); `$csp` конверторът отказва
  `report-uri`/`report-to`; абонаментите се теглят с timeout и байтов таван по
  време на стрийминга; sync пише по един ключ с таван 8000 B (голям
  `userFilters` не спира тихо синхрона на останалото).
- **Качествения:** aeld тестът беше театър (`ok(…, true)`) — сега убива мутация;
  последното копие на политиката (`build_filters.mjs`) → `SA_POLICY` + гейт;
  `LIVE_SCRIPTLET_MAX`/`ARG_MAX` на едно място; `ensureAlarms()`; rulesets
  enable/disable се извеждат от `RULESET_IDS`; `FALLBACK == en` гейт.
- **Тайният агент (Web Store + Edge):** privacy текстът е браузър-неутрален и
  точен (filters.json ~2×/ден; абонамент — при добавяне + дневно); reviewer note
  пренаписан позитивно (18 фиксирани рутини в пакета, `filters.json` = конфигурация,
  без `eval`/`Function`/`<script src>`); листингът разкрива promo/donate,
  Permissions-Policy и cookie/beacon блокирането; „Bypasses…“ → „Keeps pages
  usable…“; Edge: описания на 4 езика (≥250 знака), Notes for certification за
  дистанционните DNR правила, „remote code → No“, search-terms лимити.
  Акаунт-действие за човек: publisher name = Carbon Stealth + верифициран сайт.

### Фаза 1 — единствен източник на политиката
- `scriptlets/policy.js`: имена/алиаси, граматика на аргументите, речници, selector/
  attr/tag/cookie правила, защитени хостове и `validateDirective(name, args, live)` в
  ЕДИН класически скрипт — инлайнван в engine-а, `importScripts` в service worker-а,
  `node:vm` в билда/тестовете. Трите ръчни копия изчезнаха; паритетният тест гейтва
  „няма локални копия" + инварианта live ⊂ build.

### Фаза 2 — сила на блокирането
- **Live канал ×6.7**: до 20 000 домейна между релийзи (бяха 3 000), като 20
  chunk-нати `requestDomains` правила вместо 20 000 отделни; същото за „My filters".
- **Конвертор EasyList→DNR**: `$csp=` (modifyHeaders на документи, консервативен
  charset), `$redirect=` → нашите сурогати (непознат ресурс = пропуск, никога счупен
  redirect), `--report` хистограма на пропуснатите редове. Regex шаблони остават
  извън (RE2-несъвместим regex в статичен рулсет спира целия рулсет).
- **Сурогати**: Google IMA SDK (`ima3.js` — играе adsManagerLoaded → LOADED →
  CONTENT_RESUME_REQUESTED → ALL_ADS_COMPLETED без реклами, плейърите тръгват),
  comScore beacon, Outbrain widget, noop txt/html/css/json + VAST.
- **Set-Cookie strip** за отговори от известни ad-tech/tracker домейни (third-party;
  в `privacy` рулсета, изключваем).
- Броячът на блокирани заявки вече брои live правилата и НЕ брои YouTube bypass
  allow-правилото.
- Процедурни оператори: `:matches-media()`, `:matches-prop()`, `:watch-attr()`.
- **Popup/popunder blocker**: хистограмата на конвертора показа, че 2 939 от 3 146
  пропуснати EasyList реда са `$popup` — клас, който DNR по принцип не вижда. Сега
  тези домейни се пекат в MAIN-world engine-а като `window.open` guard (по домейн-
  суфикс; same-host и не-http винаги минават). Най-големият пропуснат клас стана функция.

### Фаза 3 — доверие и сигурност
- **Тестове на вратата на доверието**: Ed25519 с реални ключове (Node WebCrypto) —
  валиден/подправен/липсващ подпис, непознат ключ, anti-rollback, равна версия,
  ротация; регистрация на engine-а (excludeMatches само за валидни allowlist хостове,
  off → unregister, провал → `scriptletsError` + retry alarm); `applyState` таблица;
  `getHealth`. Recording `chrome` mock (`tests/_chrome.mjs`).
- **Ротация на подписващия ключ**: `SIG_PUBKEYS_B64` е списък — релийз с [current,
  next] → смяна на сървъра → отпадане на стария ключ (документирано в `server/README.md`).
- **Engine health** карта в настройките: engine регистриран?, активни рулсети, live/
  user/allowlist правила, последен ъпдейт (+ причина при провал), Ed25519, popup
  хостове, YouTube bypass. Провал на `registerContentScripts` вече е видим и се
  повтаря след 1 мин (преди беше тих `console.warn` = нула scriptlet-и).
- **Производителност**: `onEachMutation` коалесира mutation бурстове в един пас на
  кадър (rAF; `setTimeout` при скрит таб) с natives, capture-нати при старт.
- Рефактори без промяна на поведението: `defuseTimer` (nostif/nosiif), `forEachMatch`
  (remove-attr/remove-class/href-sanitizer/remove-node-text) — покрити от тестовете.

### Фаза 4 — UX
- **Дневник „Блокирано на тази страница"** в popup-а (`getTabLog`): кои заявки/
  домейни са спрени в текущия таб — само локално, нищо не напуска устройството.
- **Абонаменти за филтър-листи по URL** (`addSubscription`/`refreshSubscriptions`):
  листата се дърпа като текст, конвертира се със същия валидатор като „My filters"
  и се опреснява дневно; управляван блок между маркери в userFilters, без да пипа
  ръчните правила.
- **Per-site „без козметика"** (`setNoCosmetics`): изключва скриването на елементи
  само на един сайт, ако оформлението се чупи; мрежовото блокиране остава.
- **i18n**: `i18n.js` + `_locales/{en,bg,it,de}` (80 низа × 4; `__MSG_` в manifest-а;
  липсващ ключ оставя английския текст). Тест за паритет на ключове/плейсхолдъри.
- **Премиум редизайн на popup-а** (Cosmic Slate, тъмна + светла тема, CSS-only, без
  промяна по ID/скриптове): hero със статус-пулс, метрики като плочки, site-група,
  дневник, promo, footer; reduced-motion уважен.

### Фаза 5 — свежест и разпространение
- **Седмичен CI ребилд на листите** (`adblock-lists.yml`, понеделник 04:17 UTC):
  EasyList/EasyPrivacy/URLhaus → DNR + popup hosts + main.js, пълен гейт, PR при
  промяна — нищо не влиза в main без преглед.
- Landing page (`server/index.html`), `llms.txt`, `sitemap.xml`, JSON-LD за 5.0.
- `docs/EDGE.md` — публикуване в Microsoft Edge Add-ons със същия пакет.
- `docs/SUBMISSION.md` reviewer note: engine-ът не е интерпретатор — 18 именувани
  рутини с фиксирана граматика; `main.js` + `policy.js` в пакета.


## 4.7.0

Консолидиран релийз преди Web Store — пълен uBO scriptlet roster, тестове в репото, гейт в CI:
- **Последните scriptlet-и:** `abort-on-stack-trace`/`aost` (прекъсва достъп само от
  скрипт, чийто stack мачва needle), `set-cookie` (пре-отговаря consent стени — само ако
  бисквитката липсва, стойност САМО от фиксиран речник или малко число; никога сесии),
  `remove-cookie` (**само от печения списък** — може да разлогне потребител; live
  каналът го отказва и в service worker-а, и в engine-а). Roster: 18 scriptlet-а.
- **`youtube.css` гейтнат при bypass** (`html[data-tbab-yt-bypass]`, задава се от
  `youtube_skip.js`): по време на 6-часовия bypass рекламните UI елементи вече не се
  крият с CSS — клиентът е наистина „чист“ (без пре-детекция); enforcement
  overlay/scroll-lock правилата остават активни.
- **Тестовете са в репото** (`tests/`, `npm test`, нула зависимости): engine (печени +
  live канал: сигурност, всички 18 scriptlet-а, ReDoS, poisoned globals, защитени
  хостове), билд-валидатор (зловредни директиви, `$`-аргументи, IMPL↔ALIASES drift,
  `--check`), DNR правила (структура, **0 block правила достигат main_frame**, бюджет,
  `RULESET_IDS`↔manifest, санитизация в service worker-а). Билдът прие `--list/--out`,
  за да не пипат тестовете репото. CI (`adblock.yml`) пуска тестовете + `--check`.
- `package.json`: `npm test / build:scriptlets / check:scriptlets / build:filters /
  icons / package`; премахнат застоял `zip` скрипт (грешен за монорепо).
- Скрийншотите за Store отразяват новите функции (scriptlets, beacons/cryptominers).
- `docs/SUBMISSION.md` синхронизиран (версия, чеклист с `npm test`).
- **Pre-flight с 4 агента (Тайният агент · Хромаджията · Кодаджията · Качествения) —
  всичко затворено:** `tests/` вече не влиза в Store zip-а (`new Function` там беше
  червен флаг), пакетът се самопроверява за dev файлове и `eval`/`new Function`;
  `mv3-lint` пропуска `tests/`, тестовете ползват `vm` (CI гейтът минава докрай);
  `no-window-open-if` мигрира на `needleMatcher` (отхвърлен regex блокираше ВСЕКИ
  `window.open`); `abort-on-stack-trace` игнорира собствените chrome-extension кадри;
  `set-cookie` с denylist на имена (session/auth/csrf/… — „само ако липсва" е сляпо
  за HttpOnly); allowlist cap 5000 (ids да не прелеят в live диапазона); `setInterval`
  в YouTube fallback 300→1000ms (MutationObserver покрива тригерите); печените
  директиви се пускат ПОСЛЕДНИ в engine-а (край на hoisting-капаните); паритетен тест
  на политиката между engine/service worker/build + `assertNamesInSync` вижда и
  `background.js`; тестове за всичките 18 scriptlet-а. **Privacy/листинг (Store):**
  декларирани import-by-URL заявката, `chrome.storage.sync` при включен sync и
  локалният Smart Detection лог; `declarativeNetRequestFeedback` обоснован през
  `getMatchedRules()`; без чужди марки в листинга/скрийншотите; Store иконата с 16px
  падинг; скрийншотите с реалната версия.

## 4.6.0

Live scriptlet канал + нови scriptlet-и + toggle за privacy рулсета:
- **Live scriptlet канал (Level 2)** — най-голямата останала uBO-липса. Подписаният
  `filters.json` вече може да носи `scriptlets: [{h, n, a}]` (само **данни**: host, име,
  аргументи). Канонизация на uBO алиаси + валидация в background (същите правила като
  билда), доставка към MAIN-world engine-а като JSON низ на DOM събитие, и
  **ре-валидация в самия engine** (allowlist = вградените имена, argument safety,
  set-constant речник). Страница може само да (пре)конфигурира блокирането срещу
  СЕБЕ СИ с вече позволени директиви — без ескалация, без code/network sink;
  кооперираща страница може само да се откаже от live директиви за себе си
  (каналът не е timing-critical). Live директивите са САМО с изричен host и никога
  върху YouTube/core CDN (двойно: service worker + engine).
- **Adversarial review на канала (2 Medium + 2 Low, всички затворени):** ReDoS
  guard-ът в `toReg` беше заобиколим (`((.)|(.))+~`, `(.?){30}` — структурните
  проверки са слепи през вложени скоби, `?` не се броеше) → вече се отхвърля ВСЯКА
  квантифицирана група + се брои `?`; отхвърлен regex мачва НИЩО (fail-safe), не
  „всичко". Същото в `content.js`. Глобалните live директиви можеха да минат на
  YouTube → live = само изричен host + engine-ът никога не прилага live на core
  video/CDN. Listener-ът е capture на `window` (преди всеки page скрипт, без
  handle за махане). Live селектори/атрибути/тагове минават през `safeSelector`
  + denylist (`sandbox`, `type`, `href`, `src`… не се махат; `input/textarea/form`
  не се таргетират) — в service worker-а И в engine-а. `JSON.parse` е capture-нат
  при старт; `it.d` се чете веднъж и се материализира (poisoned getter не може да
  смени стойност между валидация и изпълнение); `hasOwnProperty` в `runDirective`.
- **Red-team (Разбивача) след поправките — 3 възпроизведени, 0 HIGH, всички затворени:**
  полиномен ReDoS `/.*.*=/` (q=2, без група) → квантори ≤1 (паритет с `content.js`);
  `FORM_ATTR` хващаше само пълни литерали (`[type^=pass]`, `[name$=pwd]`,
  `[autocomplete=cc-number]` минаваха) → чувствителни токени навсякъде в стойността +
  `id/class/aria-label`, синхронно в engine и service worker (пази и live cosmetic);
  подменен `Array.prototype.slice` разцепваше валидирано/изпълнено (само самонараняване)
  → `slice`/`isArray`/`hasOwnProperty` capture-нати при старт. Издържали: cross-frame/
  cross-world ескалация, атрибутна denylist, NEVER_LIVE/homograph/IDN, експоненциален ReDoS.
  Hook-овете се слагат при пристигане (след document_start) → за не-timing-critical
  директиви; timing-critical остават печени при билда. Нула remote code.
- **Нови scriptlet-и:** `href-sanitizer` (пренаписва tracking/redirect линкове към
  реалната цел — само http(s), не може да инжектира `javascript:`), `remove-node-text`/
  `rmnt` (изчиства текст на възли по needle — best-effort за inline скриптове в Chromium),
  `nowebrtc` (блокира RTCPeerConnection — WebRTC IP leak/fingerprint; само където е
  указан).
- **Toggle „Block tracking beacons & cryptominers“** за `privacy` рулсета (вкл. по
  подразбиране) — по-строг е от uBO за `sendBeacon`, затова е изключваем per user.
- **Нови икони (Cosmic Slate).** Целият icon set (16/32/48/128 + Store icon, promo
  tile, marquee) е прерисуван 1:1 по новото лого на сайта (`favicon.svg`): тъмна
  заоблена плочка, cyan щит-контур + мълния. Оптична корекция per размер (по-дебел
  щрих без пълнеж на 16/32). Старият „swoosh“ sampler е премахнат.
- **Сървър:** `filters.json` v2 с документирано `scriptlets: []` поле; схемата в
  `server/README.md` (данни, двойно валидирани, без trusted-*).

## 4.5.0

Сигурност + нови защити (security-пас по целия extension):
- **Нов `privacy` рулсет** (данни, DNR): блокира **third-party hyperlink
  auditing и beacon-и** (`<a ping>` / sendBeacon към чужди домейни — чист
  tracking, нула легитимна употреба; first-party остава, за да не чупим сайтове)
  и **cryptomining** домейни (Coinhive/JSEcoin/CryptoLoot и наследници —
  browser-майнъри, които крадат CPU). Включен по подразбиране с глобалния toggle.
- **`ytBypass` защита в дълбочина:** bypass-ът вече се приема САМО от YouTube
  таб (проверка на `sender.tab.url`) — подправен enforcement елемент на друг
  сайт не може да изключи блокирането.
- **Изричен CSP** за страниците на разширението (`script-src 'self';
  object-src 'self'`) — документира и фиксира строгата MV3 политика.
- Одит на sink-овете: всички `innerHTML` са статични литерали; `sender.id`
  проверка на всички съобщения; без `externally_connectable`; без eval/remote
  code. `resources/*` умишлено БЕЗ `use_dynamic_url` (DNR `extensionPath`
  redirect не работи с dynamic URL — същото прави uBO Lite).
- **Обновени филтър-листи** от живите източници към 2026-09-08 (EasyList 3735,
  EasyPrivacy 8990, URLhaus 380; +355 домейн-специфични козметични правила) — 2
  месеца нови рекламни/tracker домейни. Верифицирано: 0 block правила достигат
  main_frame; бюджет 13 023 / 30 000 статични правила.
- **YouTube embed bypass** (adversarial review): `ytBypass` вече проверява URL-а на
  самия frame (`sender.url`, задава се от браузъра), не на таба — иначе YouTube
  embed на чужд сайт се отхвърляше, макар bypass-ът нарочно да покрива `sub_frame`.
  Reload само след потвърден `ok` от service worker-а.

## 4.4.1

Поправка: YouTube спираше да зарежда клипове след ~3 гледания (анти-адблок enforcement).
- **Първопричина** (доказана от Хромаджията + Кодаджията): „точно 3" е броячът на
  YouTube (3-strike enforcement), който ни детектира всяка сесия. Старият bypass
  само спираше инжекцията на player-скрипта при reload, но **статичните DNR правила
  (youtube_rules + easylist/easyprivacy) продължаваха да блокират** first-party
  detection пътищата на YouTube (`/pagead/`, `/ptracking`, `/api/stats/ads`) →
  YouTube пак детектираше → траен твърд блок = „спира да зарежда". Content script
  няма достъп до `declarativeNetRequest`, затова bypass-ът беше на грешен слой.
- **Поправка (на верния слой):** при enforcement `youtube_skip.js` праща
  `ytBypass` до service worker-а, който добавя **един high-priority
  `allowAllRequests` DNR правило само за YouTube** (id 70000, приоритет 20000 —
  надвива ВСЕКИ блокиращ ruleset) ПРЕДИ reload. Чак тогава презаредената страница е
  наистина „чист" клиент и видеото зарежда (рекламите се връщат за сесията, auto-skip
  ги пропуска бързо).
- Bypass-ът **авто-изтича след 6ч** (enforcement идва на вълни → блокирането се
  възобновява по-късно), с alarm + reconcile при рестарт (динамичните правила
  персистират). `youtube_loader`/`youtube_skip` зачитат bypass състоянието
  (`ytBypassUntil`) — не преинжектират и не оставят „мъртъв плейър".

## 4.4.0

Scriptlet engine (`##+js(...)`) — uBO паритет спринт 1, най-голямата останала липса:
- Нов **scriptlet engine**, инжектиран в MAIN world на страницата преди нейните
  скриптове (`chrome.scripting.registerContentScripts` · `world:"MAIN"` ·
  `runAt:"document_start"`) — достига там, докъдето DNR + козметиката не могат:
  property-капани, timer/event defuser-и, JSON pruning на ad отговори.
- 12 clean-room (MIT) scriptlet-а + uBO алиаси: `set-constant`/`set`,
  `abort-on-property-read`/`aopr`, `abort-on-property-write`/`aopw`,
  `abort-current-script`/`acs`, `no-setTimeout-if`/`nostif`,
  `no-setInterval-if`/`nosiif`, `addEventListener-defuser`/`aeld`, `json-prune`,
  `no-fetch-if`, `no-window-open-if`/`nowoif`, `remove-attr`/`ra`,
  `remove-class`/`rc`.
- **Compliance (точно uBOL моделът):** КОДЪТ е фиксиран в пакета; per-site
  ДИРЕКТИВИТЕ се пекат при билда от `scriptlets/list.txt` в `scriptlets/main.js`
  (`tools/build_scriptlets.mjs`). Нищо не се тегли или изпълнява по време на работа
  — MV3 compliant, нула remote code.
- **Сигурност:** билд-валидатор с allowlist на имена; всеки аргумент се проверява
  (без `__proto__`/`constructor`/`prototype`, без `<script>` пробив, дължина);
  `set-constant` стойността идва само от фиксиран речник. Всеки scriptlet е
  try/catch и **fail-open** — лоша директива никога не чупи страницата.
- Регистрацията е динамична → спазва глобалния toggle и allowlist-а
  (`excludeMatches`); при изключено разширение engine-ът се разрегистрира.
- Курираният списък е консервативен: само неутрализация на анти-адблок детекторни
  библиотеки (не пипа легитимно съдържание).

## 4.3.0

UX функции (uBO паритет спринт 4):
- **Element zapper** — десен бутон → „Zap this element (once)" маха елемент
  еднократно, само за текущата страница (нищо не се записва). Допълва picker-а,
  който запазва правило.
- **Import filter list by URL** — в „My filters" вече може да се внесе филтър-лист
  по URL (fetch на ТЕКСТ, не код): добавят се приложимите редове (домейн-блокове
  + ##козметика) към твоите филтри, санитизирани (без форм-контроли/универсални).

## 4.2.0

Блокиране на рекламните browser API-та (uBO паритет спринт 3 — DNR modifyHeaders):
- Ново **„Block ad-targeting browser APIs"** — през Permissions-Policy header
  изключва **Google Topics, FLoC (interest-cohort), Protected Audience
  (FLEDGE), Attribution Reporting и Private Aggregation** на всеки сайт. Тези са
  новите рекламни/tracking API-та в браузъра; изключваме ги в корена.
- Реализирано като статично DNR modifyHeaders правило (append Permissions-Policy
  на document отговорите) — чисти данни, нула код. Toggle в настройките (вкл. по
  подразбиране).

## 4.1.1

Още процедурни козметични оператори (uBO паритет спринт 2):
- **`:matches-attr(name=value)`** — селекция по атрибут, специално срещу
  **рандомизирани class/id/attr имена** (модерна анти-козметична тактика);
  името и стойността могат да са /regex/.
- **`:matches-path(text|/regex/)`** — стеснява козметиката по URL path/query.
- **`:style(declarations)`** — action: инжектира CSS на елемента (маха overlay/
  scroll-lock, връща display).
- **`:remove-attr(name)` / `:remove-class(name)`** — action: маха атрибут/клас
  (разбива scroll-lock/blur без да трие елемента); name може да е /regex/.
Работят в „My filters", подписания live канал и bundle-натата EasyList козметика.
Тествано в реален Chromium.

## 4.1.0

uBlock-стил surrogate redirects (Спринт 1 от uBO паритет):
- Известни ad/tracker скриптове — Google Publisher Tag, AdSense (adsbygoogle),
  Google Analytics/gtag/GTM, Amazon apstag — вече се **пренасочват към вградени
  неутрализирани стъбове** вместо просто да се блокират. Сайтове, които чакат
  тези скриптове да съществуват, вече НЕ се чупят, а тракерите са обезвредени.
- Вградени noop ресурси (noop.js, 1x1 tracking пиксел) за бъдещи правила.
- DNR redirect към пакетиран web_accessible_resource (priority над block) —
  напълно Web Store compliant, стъбовете са clean-room минимални (не копие на
  uBO GPL кода).

## 4.0.4

Затваряне на остатъчните security дупки (повторен одит — Кодаджията + Хромаджията):
- **ReDoS guard затворен докрай.** Подредени квантори (`[a-z]*[a-z]*x`), които
  заобикаляха предишния guard и замразяваха таб (доказано ~39 сек), вече се
  отхвърлят — максимум 1 квантор в regex тяло.
- **Санитизацията вече покрива и атрибутни форм-селектори:** `[type=password]`,
  `[name=login]`, `[autocomplete=current-password]` и универсални/водещ-псевдо
  селектори (`html *`, `body > *`, `:not(#x)`) не могат да крият/махат форм-полета
  или цялата страница от remote config.
- **Anti-rollback:** стар (валидно подписан) `filters.json` вече се отхвърля —
  `version` трябва да е монотонен (спира replay при компрометиран сървър).
- **Import с валидация на shape + санитизация на селекторите** — импортиран
  файл не може да инжектира `:remove()`/ReDoS в customHidden или да счупи
  разширението с грешен тип.
- YouTube loader: `onerror` fallback при провалена WAR инжекция (диагностика).

## 4.0.3

Security hardening (одит с Кодаджията + Хромаджията — 0 critical/high намерени):
- **Подписаните ъпдейти вече не могат да се downgrade-нат.** При браузър с
  Ed25519 (Chrome 137+) валиден `.sig` е ЗАДЪЛЖИТЕЛЕН — липсващ/невалиден подпис
  отхвърля ъпдейта. По-стари браузъри приемат best-effort, за да не спрат live
  ъпдейтите. (Спира зловреден filters.json при компрометиран сървър.)
- **Строга санитизация на remote селектори:** форм-контроли (input/button/form…)
  и структурни тагове не могат да се крият от filters.json (UI DoS защита).
- **ReDoS guard:** процедурните `:has-text(/regex/)` от config се капват по
  дължина/сложност и тестват ограничен текст.
- **Import вече не заобикаля санитизацията:** `liveConfig`/`liveUpdated` не се
  приемат от импортиран файл.
- **Message handler-ите приемат само собствени съобщения** (`sender.id` проверка).
- **web_accessible_resources: `use_dynamic_url`** — по-малко fingerprinting.

## 4.0.2

Over-blocking / false-positive поправки след одит (Хромаджията + Кодаджията):
- **Навигация вече не се блокира по грешка.** ABP `$~type` филтрите се
  конвертираха към DNR excludedResourceTypes, който в Chromium ЗАПАЗВА
  main_frame → 106 правила блокираха навигация (yandex /clck/, sourceforge
  /tracker/, страници с /ads/ в URL се чупеха). Сега main_frame е изрично
  изключен от block правилата — 0 правила достигат навигацията.
- **Marketplace/обяви сайтове вече не се над-скриват.** Махнати широките
  substring селектори ([class^='ad-'], [id^='ad-'], [id*='-ad-'], [class$='-ad']
  и др.), които скриваха легитимни обяви (ad-title/ad-price/id=ad-12345) на
  bazos/ss.lv/olx-подобни. Точните ad-контейнер селектори остават.
- **EasyList $generichide се спазва.** На 183 хоста (accounts.google.com,
  Facebook Ads Manager и др.), които EasyList изрично изключва, вече НЕ
  прилагаме генеричната козметика (спираше легитимен UI/бутони).
- **Sticky ленти вече не се крият по грешка.** Махнати токените banner/promo
  от sticky ad-сигнала (скриваха promo-bar/top-banner/hero-banner ленти).
- Guard срещу колабсиране на lazy-load контейнери; domain-scope safety при
  паднали ~edu/~gov изключения (не разширяваме block обхвата).

## 4.0.1

- Filter updates are now cryptographically verified: the Ed25519 public key is
  embedded and every filters.json download must match its signature when one
  is served. A bad signature is rejected and the last good configuration
  stays. (The signing key lives only on our server.)

## 4.0.0

Biggest release yet: full EasyList coverage, a smarter YouTube pipeline and
uBlock-class cosmetic filtering, all still data-only and Web Store compliant.

- **EasyList + EasyPrivacy built in.** Both lists are compiled at build time
  into declarativeNetRequest rulesets (~12,600 rules; pure domain filters are
  merged into requestDomains rules, so tens of thousands of source lines fit
  Chrome's static rule budget). Core video/CDN domains stay protected.
- **EasyList cosmetic rules built in.** 13,600+ generic selectors ship as a
  native CSS file (gated so the on/off toggle and allowlist still work) and
  16,300+ domain-specific selectors apply per site.
- **Procedural cosmetic selectors** (uBlock-style): `:has-text()`,
  `:matches-css()`, `:upward()`, `:xpath()`, `:min-text-length()` and the
  `:remove()` action, usable from "My filters" and the live filter update.
- **YouTube: ads suppressed at the source.** The player request now carries
  `isInlinePlaybackNoAd`, so YouTube skips ad delivery entirely, which also
  avoids the server-side "fake buffering" delay applied when ads are blocked
  client-side. Feed, search and related-videos ads (ad renderers) are pruned
  from the API responses. Both lists are remotely tunable, with an emergency
  kill-switch, via the data-only filter update.
- **YouTube: hardened against the anti-adblock "locker" script.** If page
  globals are frozen before our hook lands, an alternative code path still
  strips the ads; late injection is repaired retroactively.
- **Tracking-parameter removal** (toggleable): `utm_*`, `fbclid`, `gclid`,
  `msclkid` and 30+ other click identifiers are stripped via DNR
  `queryTransform`, no request logging involved.
- **Malware protection** (opt-in): blocks known malware domains from the
  URLhaus list (abuse.ch).
- **Signed filter updates.** `filters.json` can now be verified against an
  embedded Ed25519 public key; a bad signature is rejected and the last good
  configuration stays.
- Accurate filter counts in the popup/settings, computed from the bundled
  rulesets.

## 3.9.0

- Rebrand to **Supreme AdBlock** with the new shield logo (background removed):
  fresh 16/32/48/128 icons and store icon from the real artwork, updated popup,
  settings, promo tiles, screenshots, privacy page and all docs. Package renamed
  to supreme-adblock-<version>.zip.

## 3.8.2

- Move the live filter update to a dedicated subdomain
  (adblock.carbonstealth.eu), served as a plain static site separate from the
  main SPA. It now hosts everything the extension needs externally:
  filters.json, the privacy policy (/privacy) and a landing page. Ready-to-deploy
  files + Caddy config in server/ (excluded from the extension package).

## 3.8.1

- Review fixes (Хромаджията + Кодаджията):
  - Drop the generic `.ytp-error` from YouTube enforcement detection; it fired
    on any unavailable/errored video and wrongly disabled ad removal for the
    tab. Renamed dialogs are handled via the updatable enforcement list.
  - Validate live-config selectors (reject page-wide ones like `*`/`body`) and
    protect core player fields from ad-field pruning, so a compromised update
    can't break sites or playback.
  - Correct the docs/invariants that still said "no network requests".

## 3.8.0

- Live filter updates (data only, no code): the extension fetches a small
  `filters.json` from carbonstealth.eu daily and applies it as extra block
  domains and CSS selectors. This means new ad networks and YouTube DOM changes
  can be fixed server-side without a Web Store re-review. Toggle + "Update now"
  in settings; disclosed in the privacy policy. Sanitised strictly (strings
  only, core domains never blockable, nothing executed).
- YouTube enforcement/black-screen detection is now driven by an updatable
  selector list (plus the player error state), so when YouTube renames the
  "ad blocker detected" dialog we can restore the reload-and-play fallback via
  the live update instead of a new release.

## 3.7.1

- Anti-adblock: only reset the page's scroll/position after an actual wall is
  removed, so ordinary sites are never re-laid-out.
- Smart Detection counter is now updated through a serialised chain, so hits
  from many frames can't lose updates.
- YouTube: only reload for the enforcement bypass when the flag can be
  persisted, and guard it in memory too, so a blocked sessionStorage can't loop.
- Import settings only accepts known setting keys.

## 3.7.0

- YouTube videos always load now. If YouTube detects the ad removal on a
  flagged account and refuses to play, the extension reloads once with ad
  removal disabled for that tab, so the clip plays (with ads, which auto-skip
  still handles) instead of showing a blank player. Normal accounts keep full
  ad blocking with no reload.

## 3.6.2

- Fix a regression that broke all cosmetic filtering: the Smart Detection
  helper was named `hide`, shadowing the cosmetic `hide()` and throwing
  "Cannot read properties of undefined (reading 'dataset')" on every page.
  Renamed it to `flagHidden`.

## 3.6.1

- Housekeeping: tidied comments and copy across the codebase for a cleaner,
  consistent style. No behaviour changes.

## 3.6.0

- Smart Detection now also catches **sticky/anchored banner ads** (edge-pinned
  bars carrying a third-party frame or ad-named container), a format filter
  lists struggle with, while leaving real sticky navbars/headers alone.
- New **"why blocked" log**: a live, transparent list in settings showing each
  heuristic catch with its host, size and the reason it was flagged.

## 3.5.0

- New, unique **Smart Detection**: a list-free heuristic that blocks ads no
  filter list knows yet. A cross-origin iframe sized to a standard IAB ad slot
  (300×250, 728×90, 160×600, 320×50, ...) is hidden on sight, regardless of
  network, catching "zero-day" ad placements that rule-based blockers miss.
  Toggleable, with a live "caught so far" counter in settings.

## 3.4.2

- Fix: YouTube page became unclickable while the video played. YouTube's
  anti-adblock dialog was hidden but its full-page backdrop stayed, swallowing
  clicks and locking scroll. The backdrop is now removed and page interaction /
  scrolling restored (CSS + JS), scoped to the enforcement dialog only.

## 3.4.1

- Fix: after a YouTube ad, the shared video element is restored to the user's
  real mute state and playback speed (it could stay muted or stuck at 16x).
- Performance: throttle the cosmetic, cookie, anti-adblock and Meta observers,
  coalescing DOM mutations so busy pages (YouTube, feeds) stay smooth.
- Guard the content script against starting twice on repeated toggles, and
  re-hide immediately when protection is turned back on.
- Cache the sync flag instead of reading storage on every change.

## 3.4.0

- Recolored the whole UI and icon to match the carbonstealth.eu brand palette:
  near-black background (#060608), cream text (#f5f5f0), cyan accent (#00e5ff /
  #00b8d4) and green "protected" state (#00ff88); paused state uses #ff3366.
- New cyan shield icon and store graphics.

## 3.3.0

- Cross-device sync: optionally keep settings, allowlist and filters in sync
  across every Chrome you're signed into (chrome.storage.sync).
- Pause for 30 minutes from the popup, with automatic resume (chrome.alarms).
- Cookie banners: the dismisser now runs inside consent iframes and handles
  Sourcepoint (Mediaset and other EU media sites), including the Italian
  "Continua senza accettare" / "Accetta" buttons. Fixes the persistent banner
  on sportmediaset.mediaset.it.

## 3.2.0

- New "My filters" editor (uBlock/AdBlock-style): write your own rules, block
  a domain, hide an element everywhere (`##.selector`) or only on one site
  (`site.com##.selector`). Comments with `!`.
- Right-click "Block an element here" context menu, like uBlock/AdBlock.
- Domain block rules from My filters are applied as dynamic rules; cosmetic
  lines are applied by the content script, with core video/CDN domains
  protected from accidental blocking.

## 3.1.2

- Redesigned popup: crisp inline SVG icons (no emoji), real product logo, a
  clearer protected/paused hero state, refined metrics and a tidy footer with
  the support link.

## 3.1.1

- Cookie/consent banner dismissal now searches open shadow DOM (where many
  modern consent managers live), covers many more frameworks (Osano, Iubenda,
  Termly, Cookie-Script, Quantcast FC, CookieYes, ...) and removes leftover
  dimming overlays/scroll locks.

## 3.1.0

- New "YouTube ad blocking" toggle in settings. When off, the extension does
  not touch YouTube at all (no network rules, no player script, no auto-skip), useful if a network/region ever has trouble playing video.
- YouTube handling now also respects the per-site allowlist: allowlist
  youtube.com to disable all YouTube interference for your account.
- The YouTube player script is injected on demand by a loader, so the toggle
  and allowlist fully control whether it runs.
- Built-in filter rules only, no remote fetches and no remotely hosted code.

## 3.0.3

- YouTube ad removal now prunes the ad fields in place from the parsed player
  response (JSON.parse / Response.json) instead of rebuilding the network
  response. The video stream and its signature are never touched, which avoids
  any chance of a corrupted/forbidden playback request.

## 3.0.2

- Fix: the global on/off toggle now fully stops all blocking. The previous
  runtime filter import left dynamic rules active even when protection was off,
  which could keep a site (e.g. YouTube) broken until the extension was removed.
- Removed the runtime EasyList/EasyPrivacy network import. Blocking now relies
  on the bundled curated rules plus per-page cosmetic filtering and YouTube
  response sanitising, the stable approach used by MV3 blockers. Dropped the
  `alarms` permission and any leftover imported rules are cleaned up on load.
- UI: clearer "time saved" formatting for small values; footer shows the
  bundled filter count.

## 3.0.1

- Fix: YouTube videos could fail to start because the player waits on
  doubleclick's ad_status.js / pagead id before initialising. These are now
  allowed to load (ads are still removed from the player response), instead of
  being blocked at the network layer.
- Stop blocking log_event / csi_204 (logging & timing, not ads).
- Imported filter lists can never block core video/CDN domains (googlevideo,
  ytimg, gstatic, ...).

## 3.0.0

- Block sponsored posts on Facebook & Instagram (toggleable).
- Accurate saved-data/time stats based on per-resource-type counting.
- Settings backup: export and import as JSON.
- Production-safe blocked counter (works outside developer mode).
- Carbon Stealth theme with light/dark switch.
- Free to use, with an optional donation link.

## 2.2.0

- Daily auto-update of EasyList + EasyPrivacy filters (manual update too).
- "Data saved" and "time saved" counters.
- Light / dark theming.

## 2.1.0

- Per-site allowlist and a full settings page.
- Cookie / consent banner auto-dismiss.
- Anti-adblock bypass.
- Element picker for hiding anything manually.

## 2.0.0

- YouTube video ad removal (pre-roll / mid-roll) plus auto-skip fallback.
- Expanded network blocklist.

## 1.0.0

- Initial release: network-level ad blocking and cosmetic filtering.
