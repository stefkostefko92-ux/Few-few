# `tools/chrome/` — инструменти на Хромаджията

Статични помощници за разширения за Google Chrome (Manifest V3). Не заместват реалното
зареждане в `chrome://extensions` (Load unpacked) или ревюто на Web Store — хващат типичните
MV3 капани и причини за отказ предварително.

## `mv3-lint.mjs`

Линтер за папка на разширение. Чете `manifest.json` и сканира `.js/.mjs/.ts/.html`.

```bash
node tools/chrome/mv3-lint.mjs path/to/extension
```

Маркира:
- `manifest_version` ≠ 3 и MV2 остатъци (`browser_action`, `page_action`, `background.scripts/persistent/page`)
- отдалечен код (CDN `<script src>`, `eval`, `new Function`, отдалечен `import()`) — забранен в MV3
- слаб CSP (`unsafe-inline`, `unsafe-eval`, отдалечен script хост)
- широки `host_permissions` (`<all_urls>`, `*://*/*`) и blocking `webRequest` (премахнат в MV3 → DNR)
- `localStorage` в service worker и възможни слушатели регистрирани в async callback
- чувствителни права без „Purpose" обосновка

Изход: `0` = чисто/само INFO; `1` = има HIGH находки.

**Планирано (M):** `web-ext lint` интеграция (валидна и за Chrome), bundle size budget,
permission-diff между две версии (за да не пълзят правата).

## Изисквания

Node ≥ 20. Без външни зависимости. Опционалното `web-ext` (`npm i -g web-ext`) се ползва само
ако присъства; линтерът работи и без него.
