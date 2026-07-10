# Supreme AdBlock — конкурентен анализ и roadmap (2026)

Дълбоко проучване спрямо водещите блокъри (uBlock Origin / uBOL, AdGuard,
Brave Shields, Ghostery, AdBlock Plus, Pi-hole/NextDNS) — какво ни трябва, за да
сме **най-пълни, най-автоматични и най-добри**, оставайки Chrome Web Store
compliant (single purpose, no remote code, минимални права).

Методология: 109 агента, 116 извлечени твърдения, адверсариална верификация
(3 гласа/твърдение). Само 3 твърдения отпаднаха при проверката (отбелязани
по-долу като „остаряло“). Датите на източниците са 2025–2026.

---

## 1. Терен на боя: MV3 declarativeNetRequest (DNR) реалните тавани в Chrome 2026

Това е рамката, в която играем. Ключовите числа (верифицирани спрямо Chrome
developer docs):

| Ресурс | Таван | Бележка |
|--------|-------|---------|
| Статични правила (гарантиран минимум) | **30 000** на разширение | Глобален пул ~**300 000–330 000** между ВСИЧКИ разширения |
| Статични рулсети | до **100** декларирани, до **50** едновременно активни | *(отхвърлено остаряло твърдение „само 10 активни“)* |
| Динамични правила | до **30 000** общо, но само **5 000** „unsafe“ | „safe“ (block/allow/allowAllRequests/upgradeScheme) → 30 000 от Chrome 121; *(отхвърлено остаряло „твърд таван 5000“)* |
| Session правила | **5 000** | изчистват се при рестарт/ъпдейт |
| Regex правила | **1 000** на тип, <2KB всяко | RE2 engine — **без** backreferences/lookaheads/possessive |
| `getMatchedRules` | **20 извиквания / 10 мин** | иска `declarativeNetRequestFeedback`; **не** става за real-time логър |

**Шест action типа:** `block`, `redirect`, `allow`, `allowAllRequests`,
`upgradeScheme`, `modifyHeaders`. `removeparam` **не е** самостоятелен action —
прави се през `redirect` с URL transform.

**Какво MV3 губи спрямо MV2 (и водещите го усещат):**
- Няма `webRequest` `onBeforeRequest` динамична реакция per-request.
- `$cname` (CNAME uncloaking) — иска Firefox `dns.resolve` API, **Chrome не го
  дава на разширения** → в Chrome MV3 е невъзможно нативно.
- `$strict1p/$strict3p`, `$redirect-rule`, `$replace` — MV2-only.
- `$removeparam` деградирал (без regex/exclusions), cookie rules премахнати.
- Service worker заспива → козметиката „примигва“ 1.5–2 сек при събуждане.

> **Извод:** Ние вече ползваме статични рулсети (248) + динамични от
> `filters.json`. Имаме много запас (30 000 динамични „safe“) — недоизползван.

---

## 2. Как водещите компенсират MV3 (и къде сме ние)

- **uBlock Origin Lite (uBOL):** изцяло декларативен, service worker **не е
  нужен** за филтриране → надежден на старт. Но: static rules се обновяват
  **само** при ъпдейт на разширението; **няма** генерична козметика по
  подразбиране (иска „Complete“ режим); **YouTube блокирането е ненадеждно** дори
  в Complete. → Тук имаме реален шанс да ги надминем на YouTube.
- **AdGuard standalone app:** локален прокси + root сертификат → системно
  HTTPS филтриране, надеждно блокира YouTube, DNS филтриране. **Разширение не
  може това** — не е нашата лига (ние сме extension). Позиционираме се като
  „най-добрият extension“, не „като desktop app“.
- **Процедурни козметични селектори (uBO):** `:has()`, `:has-text()`,
  `:matches-css()`, `:matches-attr()`, `:matches-path()`, `:xpath()`,
  `:upward()`, `:watch-attr()` + action оператори `:remove()`, `:style()`,
  `:remove-attr()`, `:remove-class()`. **MV3-съвместими** (JS в content script,
  data-driven). **Ние поддържаме само plain CSS `querySelectorAll`** →
  най-голямата ни функционална дупка в козметиката.

---

## 3. YouTube — състоянието към 2026 и нашето предимство

**Заплахите:**
- **SSAI (server-side ad insertion):** реклами, зашити в самия видео поток →
  неразличими, не могат да се прехванат като отделни заявки. Extension-ите са
  по-уязвими от desktop apps. **Няма пълно решение още.**
- **SABR/UMP протокол + „fake buffering“:** при блокирана реклама GVS инжектира
  backoff забавяне ~80% от дължината на рекламата вместо самата реклама.
- **„Locker“ скрипт:** YouTube прави `JSON.stringify` non-writable през
  `Object.defineProperty` рано → ако нашият content script не е преди locker-а,
  proxy-то се чупи. Workaround: proxy на `Object.assign` вместо това.

**Най-надеждната текуща техника (верифицирано, production adblocker юни 2026):**
1. **`isInlinePlaybackNoAd = true`** в player заявката → **изцяло спира
   доставката на реклами И свързания backoff/fake-buffering delay.** Това е
   единичната най-ценна находка от проучването.
2. document-start page-context proxy на `JSON.parse`, `fetch()` (на
   `/youtubei/v1/player`, `/browse`, `/search`, `/next`), `XHR`, `appendChild`,
   `setTimeout`, `Promise.then`.
3. InnerTube `/youtubei/v1/player` е контролната точка.

**Къде сме ние:** proxy-ваме `JSON.parse` + `Response.prototype.json`, махаме
`adPlacements`/`playerAds`/`adSlots`. **Не** ползваме още `isInlinePlaybackNoAd`,
**не** сме защитени срещу locker-а, **не** proxy-ваме `/browse`/`/search`/`/next`.

---

## 4. Автоматизация на филтрите — легално и MV3-съвместимо

- **uAssets/EasyList/EasyPrivacy** са публични (EasyList: GPLv3 + CC-BY-SA 3.0) →
  **може легално** да ги интегрираме с атрибуция.
- **AdGuard `tsurlfilter` declarative-converter** (open source) конвертира ABP/uBO
  синтаксис → MV3 DNR. Важни ограничения, които трябва да заобиколим:
  - Козметичните правила се **игнорират** (дават празен DNR масив) → трябва да
    ги хванем в content script, не в DNR.
  - `$removeparam/$removeheader/$csp` се обединяват само **в рамките на един
    филтър**, не между листи → внимавай при merge на няколко публични листи.
  - `$domain` частично (без regex/any-TLD домейни); `@@` → `allowAllRequests`;
    `$important` вдига приоритета.
- **Chrome Web Store позволява** теглене на remote **конфигурационни данни** за
  включени функции, стига цялата **логика** да е в пакета → това е правната
  основа за нашия `filters.json`. Remote **код** (eval/interpreter/`<script src>`
  към външен ресурс) е забранен. Enforcement на новите 2026 политики: **1 август
  2026** — трябва да сме изрядни дотогава (вече сме).

---

## 5. Диференциращи функции — какво имат те, а ние не (и струва ли си)

| Функция | Кой го има | Възможно ли е в Chrome MV3 extension? | Препоръка |
|---------|-----------|----------------------------------------|-----------|
| Процедурни козметични селектори | uBO, AdGuard | ✅ Да (content script) | **Правим** — най-висок приоритет |
| CNAME uncloaking / first-party tracker блок | uBO(FF), Brave, NextDNS | ❌ **Не** (Chrome няма dns API) | Не преследваме в extension; опционален DoH съвет |
| DNS-level блокиране | AdGuard, Pi-hole, NextDNS | ❌ Не в extension | Опционален companion гайд, не код |
| `$removeparam` (utm_/fbclid/gclid) | uBO, AdGuard | ⚠️ Частично (през `redirect`) | **Правим** — ниско усилие |
| Fingerprint защита | Brave, AdGuard | ⚠️ Рисково (чупи сайтове, граничи с single-purpose) | Пропускаме засега |
| Network request логър | uBO | ⚠️ `getMatchedRules` е квотиран (20/10мин) | Ползваме нашия Smart Detection лог + content-script наблюдение |
| Malware/phishing листи | AdGuard, Brave | ✅ Да (статичен рулсет) | **Правим** — опционален рулсет, ниско усилие |
| Cloud sync | всички | ✅ Вече имаме (`chrome.storage.sync`) | Готово |
| Per-site профили/режими | uBOL, Brave | ✅ Вече имаме allowlist; може Basic/Aggressive | Разширяваме леко |

---

## 6. Приоритизиран roadmap (ефект × усилие)

### Tier 1 — Максимален ефект, разумно усилие (прави ги първо)

1. **YouTube: `isInlinePlaybackNoAd = true` в player заявката.**
   Спира рекламите И fake-buffering delay в корена. Малка, хирургична промяна в
   `youtube_main.js`/`youtube_loader.js`. → директно ни прави най-добри на
   YouTube спрямо uBOL. *(ефект: огромен · усилие: средно)*

2. **YouTube: втвърди proxy-то срещу locker + разшири обхвата.**
   Гарантирай `document_start` преди locker-а; fallback proxy на `Object.assign`;
   proxy и на `/browse`/`/search`/`/next` (не само `/player`), за да махаме и
   feed/search реклами от Innertube отговорите. *(ефект: висок · усилие: средно)*

3. **Процедурни козметични селектори в content.js, карани от `filters.json`.**
   Добави поне `:has()` (Chrome вече има нативен CSS `:has`), `:has-text()`,
   `:matches-css()`, `:upward()`, `:xpath()` + action `:remove()`/`:style()`.
   Data-driven → MV3-compliant, обновяемо без re-review. Затваря най-голямата ни
   козметична дупка спрямо uBO. *(ефект: висок · усилие: средно-високо)*

4. **Интегрирай EasyList + EasyPrivacy като статични рулсети (build-time).**
   Конвертирай през `tsurlfilter` при билд: network → DNR рулсети, cosmetic →
   content-script селектори. С атрибуция (GPLv3/CC-BY-SA). Разширява покритието
   от 248 на десетки хиляди правила, оставаме в 30 000 таван. *(ефект: огромен ·
   усилие: средно)*

### Tier 2 — Втвърдяване и автоматизация

5. **Подписани филтър-ъпдейти (Ed25519).**
   Верифицирай подписа на `filters.json` с `crypto.subtle` преди прилагане;
   пази последните работещи / вградените като fallback при провал на подпис/мрежа.
   Точно каквото правят production YT блокърите. Защитава data-only канала ни от
   подмяна. *(ефект: среден (сигурност) · усилие: ниско-средно)*

6. **`$removeparam` през DNR `redirect` URL transform.**
   Маха tracking параметри (`utm_*`, `fbclid`, `gclid`, `mc_eid`…). *(ефект:
   среден · усилие: ниско)*

7. **Опционален malware/phishing рулсет.**
   Статичен рулсет от публична листа (напр. URLhaus/phishing), toggle в
   настройките. *(ефект: среден · усилие: ниско)*

### Tier 3 — Полиране и позициониране

8. **Basic / Aggressive режими** (като Brave Standard/Aggressive) — надгражда
   allowlist-а с per-site интензивност. *(ефект: нисък-среден · усилие: ниско)*

9. **Companion гайд за DNS-level защита** — тъй като CNAME/DNS не могат в
   extension, документирай как потребителят да ползва DoH (напр. публичен DNS с
   blocklist) за first-party tracker защита. Не код, а стойност. *(ефект: нисък ·
   усилие: много ниско)*

### Съзнателно НЕ правим (с обосновка)
- **CNAME uncloaking / DNS в extension** — технически невъзможно в Chrome MV3.
- **Fingerprint spoofing** — рисково за счупване на сайтове и граничи с
  нарушаване на single-purpose политиката.
- **Локален прокси / системно филтриране** — това е desktop app, не extension.

---

## 7. Едно изречение накрая

Не можем да сме „AdGuard desktop“ (прокси/DNS/CNAME са извън extension обхвата),
но **можем да сме най-добрият Chrome extension на пазара** — с YouTube блокиране,
което надминава uBOL (Tier 1), пълна процедурна козметика като uBO (Tier 1),
автоматично обновяване на утвърдени публични листи (Tier 1) и подписан data-only
канал за поправки без re-review (Tier 2). Точно това ни прави най-пълни,
най-автоматични и най-добри в нашата категория.

---

## Източници (подбрани, primary-first)

- Chrome DNR API — <https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest>
- Chrome content filtering (MV3) — <https://developer.chrome.com/docs/extensions/develop/concepts/content-filtering>
- Chrome Web Store MV3 изисквания — <https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements>
- CWS policy updates 2026 (enforcement 01.08.2026) — <https://developer.chrome.com/blog/cws-policy-updates-2026>
- uBOL FAQ — <https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)>
- uBO процедурни козметични филтри — <https://github.com/uBlockOrigin/uBlock/wiki/Procedural-cosmetic-filters>
- uBO статичен филтър синтаксис — <https://github.com/gorhill/uBlock/wiki/Static-filter-syntax>
- uAssets — <https://github.com/uBlockOrigin/uAssets>
- AdGuard tsurlfilter declarative-converter — <https://github.com/AdguardTeam/tsurlfilter/tree/master/packages/tsurlfilter/src/rules/declarative-converter>
- AdGuard: YouTube server-side ad insertion — <https://adguard.com/en/blog/youtube-server-side-ad-insertion.html>
- YouTube adblock техники (SABR/isInlinePlaybackNoAd) — <https://iter.ca/post/yt-adblock/>
- Brave Shields — <https://brave.com/shields/>
- NextDNS CNAME uncloaking — <https://medium.com/nextdns/nextdns-added-cname-uncloaking-support-becomes-the-first-cross-platform-solution-to-the-problem-e3f437f84342>
- uBO first-party tracker блокиране — <https://www.bleepingcomputer.com/news/security/ublock-origin-now-blocks-sneaky-first-party-trackers-in-firefox/>
