# The Best Ads Block — `adblock/`

Chrome extension (Manifest V3) за блокиране на реклами. Част от моно-репото на
Carbon Stealth; няма общ код с другите продукти.

- **Стек:** vanilla JS (без билд стъпка), `declarativeNetRequest` + content scripts.
- **Домейн:** самостоятелно разширение · публикува се в Chrome Web Store.
- **Език:** UI е на английски (глобална аудитория); коментарите/комитите на BG.

## Структура

```
manifest.json           MV3 конфигурация (v3.7.0)
background.js           service worker — рулсети, allowlist, статистики, съобщения
theme.js                прилага Carbon Stealth / светла тема
content.js / .css       козметично скриване + Smart Detection (евристика)
meta.js                 Facebook / Instagram sponsored постове
cookies.js / .css       затваряне на cookie/consent банери (вкл. Shadow DOM)
antiadblock.js / .css   махане на "disable adblocker" стени
picker.js / .css        element picker (ръчно скриване)
youtube_loader.js       инжектира youtube_main в MAIN world (с bypass fallback)
youtube_main.js         MAIN world — маха рекламните полета от player отговора
youtube_skip.js         auto-skip + enforcement fallback (видеото винаги зарежда)
youtube.css             скрива рекламните UI елементи на YouTube
rules/                  declarativeNetRequest статични правила (248)
popup/ · options/       UI (popup + настройки)
icons/ · _locales/      икони · локализация
tools/                  генератори на правила/икони + `package.sh` (билд на .zip)
store/ · docs/          store графики + листинг/submission текстове
```

## Качествен гейт (преди „готово")

```
node -c *.js popup/*.js options/*.js         # syntax на всички скриптове
python3 -c "import json; json.load(...)"     # валиден manifest/rules/locale
bash tools/package.sh                         # билд + самопроверка на пакета
```

## Инварианти (не чупи)

- **Единствена цел** (Web Store): блокиране на реклами/тракери. Без remote code,
  без мрежови заявки — всички правила са вградени статично.
- YouTube: **не** блокираме `googlevideo.com` и не пипаме `/player` заявката;
  само махаме рекламните полета от отговора. Ако акаунт е флагнат и YouTube
  откаже възпроизвеждане, `youtube_loader` прави еднократен bypass reload, за да
  зареди видеото (с реклами) вместо празен плейър.
- Всички `chrome.*.on*.addListener` се регистрират **синхронно на top level** в
  service worker-а.
- Smart Detection крие само cross-origin iframe с точен IAB рекламен размер —
  консервативно, за да няма false positives.
