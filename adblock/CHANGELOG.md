# Changelog

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
