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
1. ✅ **Scriptlet engine (№1) — ИЗПЪЛНЕНО (v4.4.0)** — 12 scriptlet-а в MAIN world
2. ✅ **Surrogate redirects (№2) — ИЗПЪЛНЕНО (v4.1.0)** — GPT/adsbygoogle/GA/apstag стъбове
3. ✅ **DNR modifyHeaders (№3-5) — ИЗПЪЛНЕНО (v4.2.0)** — Topics/FLoC/Protected-Audience Permissions-Policy
4. ✅ **Процедурни оператори (№7) — ИЗПЪЛНЕНО (v4.1.1)** — matches-attr/matches-path/style/remove-attr/remove-class
5. ✅ **Subscribe-by-URL + zapper (№8) — ИЗПЪЛНЕНО (v4.3.0)**

### Scriptlet engine — как е реализиран (v4.4.0)
Точно uBOL моделът: КОДЪТ е в пакета, per-site ДАННИТЕ се пекат при билда.
- `scriptlets/engine.js` — clean-room (MIT) имплементации на 12 scriptlet-а +
  bootstrap. Шаблон с `/*__SCRIPTLET_MAP__*/` инжекционна точка.
- `scriptlets/list.txt` — курирани `##+js(...)` директиви (данни). Консервативен:
  само неутрализация на анти-адблок детектори (не чупи легитимно съдържание).
- `tools/build_scriptlets.mjs` — компилатор: валидира всяко име (ALIASES allowlist),
  всеки аргумент (без `__proto__/constructor/prototype`, без markup, дължина),
  set-constant стойност само от фиксиран речник → пече `scriptlets/main.js`.
- `background.js::syncScriptlets()` — регистрира `main.js` през
  `chrome.scripting.registerContentScripts({ world:"MAIN", runAt:"document_start" })`
  динамично (спазва глобалния toggle + allowlist чрез `excludeMatches`).
- Реализирани: `set-constant`, `abort-on-property-read/-write`, `abort-current-script`,
  `no-setTimeout-if`, `no-setInterval-if`, `addEventListener-defuser`, `json-prune`,
  `no-fetch-if`, `no-window-open-if`, `remove-attr`, `remove-class` (+ uBO алиаси).

### Остатъчно / следващо
- **Scriptlet engine — live channel** — v4.4.0 пече само курирания списък при билда.
  Live scriptlet-и от `filters.json` (Level 2 „shim-then-configure") са бъдеща стъпка;
  изискват отделен под-канал и жив timing-тест преди пускане.
- **`trusted-*` варианти** — само от нашия Ed25519-подписан канал; не в v1.
- Липсващи scriptlet-и: `abort-on-stack-trace`, `remove-node-text`, `href-sanitizer`,
  `set-cookie`/`remove-cookie`, `nowebrtc` — добавят се в engine.js при нужда.

> ⚠️ **Преди Web Store submission:** курираните site-specific директиви (ако се добавят
> към глобалните анти-адблок) трябва да минат жив тест на реална страница —
> особено `set-constant` timing при document_start срещу реален анти-адблок сайт.

Източници: github.com/gorhill/uBlock/wiki (Resources-Library, Procedural-cosmetic-filters,
Static-filter-syntax) · uBOL FAQ.
