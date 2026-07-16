# Supreme AdBlock — `adblock/`

Chrome extension (Manifest V3) за блокиране на реклами. Част от моно-репото на
Carbon Stealth; няма общ код с другите продукти.

- **Стек:** vanilla JS (без билд стъпка), `declarativeNetRequest` + content scripts.
- **Домейн:** самостоятелно разширение · публикува се в Chrome Web Store.
- **Език:** UI е на английски (глобална аудитория); коментарите/комитите на BG.

## Структура

```
manifest.json           MV3 конфигурация (v4.0.1)
background.js           service worker — рулсети, allowlist, статистики, съобщения
theme.js                прилага Carbon Stealth / светла тема
content.js / .css       козметика (вкл. процедурни селектори) + Smart Detection
cosmetic_generic.css    EasyList генерична козметика (гейтната с html[data-tbab-on])
meta.js                 Facebook / Instagram sponsored постове
cookies.js / .css       затваряне на cookie/consent банери (вкл. Shadow DOM)
antiadblock.js / .css   махане на "disable adblocker" стени
picker.js / .css        element picker (ръчно скриване) + zapper (еднократно)
scriptlets/             scriptlet engine (##+js): engine.js (clean-room код) +
                        list.txt (данни) → main.js (пече се от build_scriptlets.mjs;
                        регистрира се в MAIN world при document_start)
youtube_loader.js       инжектира youtube_main в MAIN world (с bypass fallback)
youtube_main.js         MAIN world — маха рекламните полета от player отговора
youtube_skip.js         auto-skip + enforcement fallback (видеото винаги зарежда)
youtube.css             скрива рекламните UI елементи на YouTube
rules/                  DNR статични правила: ad_rules + youtube_rules +
                        easylist/easyprivacy/urlhaus/removeparam (билднати от
                        tools/build_filters.mjs) + козметичен bundle + counts
popup/ · options/       UI (popup + настройки)
icons/ · _locales/      икони · локализация
tools/                  build_filters.mjs (EasyList→DNR) + генератори + package.sh
store/ · docs/          store графики + листинг/submission текстове
```

## Качествен гейт (преди „готово")

```
node -c *.js popup/*.js options/*.js tools/*.mjs   # syntax на всички скриптове
python3 -c "import json; json.load(...)"     # валиден manifest/rules/locale
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
  `scriptlets/main.js`. Никакви scriptlet-и не идват от мрежата и не се eval-ват.
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
