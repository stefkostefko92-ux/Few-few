# uBlock Origin — какво имат, а ние нямаме (реализуемо в MV3)

Сверено с реалния uBO source/wiki (Resources-Library, Procedural-cosmetic-filters,
Static-filter-syntax) + compliance модела на одобрения **uBO Lite**.

**Compliance правило (важи навсякъде):** вграждаме фиксирания КОД в пакета; от
`filters.json` идват само ДАННИ (домейн → scriptlet/surrogate + аргументи). Точно
моделът на uBOL → напълно Web Store compliant. За scriptlets: `scripting.
registerContentScripts({ world:"MAIN", runAt:"document_start" })` (НЕ
`chrome.userScripts`, която иска ръчен developer-mode toggle).

---

## Приоритизиран roadmap (стойност × осъществимост)

### ★★★★★ 1. Scriptlets engine (`##+js(...)`) — най-голямата липса
uBO има ~90 scriptlet-а, инжектирани в MAIN world преди страничния скрипт —
сърцето на модерното анти-адблок + API-ниво блокиране, което DNR+козметика не могат.
**MV3:** registerContentScripts world:MAIN; код в пакета, per-site данни от канала.
**Усилие: високо · Стойност: много висока.**

Топ ~20 за вграждане:
- Анти-адблок / property: `set-constant`/`set`, `abort-on-property-read` (aopr),
  `abort-on-property-write` (aopw), `abort-current-script` (acs), `abort-on-stack-trace`,
  `nobab`/`nofab`, `popads`
- API-response pruning (генерализира ръчните YouTube хакове): `json-prune`,
  `json-prune-fetch-response`, `json-prune-xhr-response`, `no-fetch-if`, `no-xhr-if`
- Таймери/events: `no-setTimeout-if` (nostif), `no-setInterval-if` (nosiif),
  `addEventListener-defuser` (aeld), `prevent-window-open` (nowoif)
- Още: `remove-node-text` (rmnt), `set-cookie`/`remove-cookie`, `href-sanitizer`, `nowebrtc`
- **`trusted-*` варианти** (trusted-replace-fetch-response и т.н.) — само от НАШИЯ
  Ed25519-подписан списък (нашият канал е trusted); никога от user-import.

### ★★★★★ 2. Redirect / surrogate ресурси през DNR
Вместо да блокираме gpt.js/analytics (чупи сайтове), пренасочваме към вградени
неутрализирани стъбове. **MV3:** DNR `redirect.extensionPath` → web_accessible_resource.
**Усилие: ниско-средно · Стойност: висока** (пряко маха „счупени сайтове").

Вграждаме:
- noop стъбове: `noopjs`, `noop.txt/html/css/json`, `noop-1s.mp4`, `noop-*.mp3`,
  `noop-vast2/3/4.xml`, `1x1.gif`/`2x2.png` (tracking пиксели), `click2load.html`
- функционални сурогати (стъбват API-то): **GPT** (googletagservices), **adsbygoogle**,
  **GA/analytics**, **google-ima** (видео ad SDK), **amazon apstag**, GTM, scorecardresearch,
  doubleclick ad_status, outbrain — приоритет GPT/adsbygoogle/GA/IMA/apstag.

### ★★★★☆ 3. `$csp=` инжекция (DNR modifyHeaders)
Инжектира Content-Security-Policy header → блокира inline скриптове/презареждане
на анти-адблок. **MV3:** DNR modifyHeaders append responseHeaders. **Усилие: средно.**

### ★★★★☆ 4. `$permissions=` (Permissions-Policy)
Изключва browsing-topics (FLoC-наследник) и др. per-site. **MV3:** modifyHeaders
append permissions-policy. **Усилие: ниско (щом csp пайплайнът е готов) · privacy win.**

### ★★★★☆ 5. Response header removal (`removeheader`)
Маха `refresh`/`report-to`/`set-cookie` (срещу meta-refresh redirect / tracking cookies).
**MV3:** DNR modifyHeaders remove. **Усилие: ниско.**

### ★★★★☆ 6. `$redirect-rule=` (redirect само при блок)
Разделя „блок" от „заместител". **MV3:** DNR redirect с priority композиция. **Усилие: средно.**

### ★★★☆☆ 7. Липсващи процедурни/action оператори
Имаме: `:has-text`, `:matches-css`, `:upward`, `:xpath`, `:min-text-length`, `:remove()`, `:has()`.
**Липсват (MV3-ок, чист JS):**
- **`:matches-attr(name="value")`** — срещу рандомизирани class/id/attr (силно препоръчан)
- **`:matches-path(text|regex)`** — козметика по URL path/query
- **`:style(...)`** — инжектира CSS на елемента (маха overlay/scroll-lock)
- **`:remove-attr()` / `:remove-class()`** — action (scroll-lock/blur без да трие елемента)
- средна стойност: `:matches-media`, `:matches-prop`, `:watch-attr`, `:others`, matches-css-before/after
**Усилие: ниско-средно · Стойност: средна-висока** (най-вече matches-attr/matches-path/style).

### ★★★☆☆ 8. UX / engine
- **Subscribe към филтър-листи по URL** (Fanboy Annoyances, uAssets scriptlets, региони)
  — fetch на ТЕКСТ (данни) → парсър → DNR dynamic + козметика/scriptlet данни.
  Compliance ✅. **Усилие: средно-високо** (нужен runtime филтър→DNR парсер; внимавай
  за dynamic-rule тавана). Разширява съществуващия „My filters" парсер.
- **Element zapper** — еднократно махане без запис. **Усилие: ниско · UX win.**
- **No-cosmetic-filtering per site** — toggle за счупени сайтове. **Усилие: ниско.**

---

## Съзнателно ПРОПУСНАТО (невъзможно в Chrome MV3)
HTML filtering `##^`/`filterResponseData`, `$replace=` (response body rewrite),
`$cname` uncloaking (иска DNS API), MV2 per-request blocking webRequest,
`urltransform` (Firefox MV2). `chrome.userScripts` като основен механизъм (иска
ръчен toggle).

---

## Предложена подредба за спринтове
1. Scriptlet engine + топ 15 scriptlet-а (№1) — най-голям скок; генерализира YT хаковете
2. Surrogate redirects (№2) — веднага маха счупени сайтове
3. DNR modifyHeaders слой: `$csp` + `$permissions` + `removeheader` (№3-5, един пайплайн)
4. Процедурни оператори: matches-attr/matches-path/style/remove-attr/remove-class (№7)
5. Subscribe-by-URL + zapper + per-site no-cosmetics (№8)

Източници: github.com/gorhill/uBlock/wiki (Resources-Library, Procedural-cosmetic-filters,
Static-filter-syntax) · uBOL FAQ.
