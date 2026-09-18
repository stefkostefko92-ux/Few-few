# Déjà — публикуване в Chrome Web Store (стъпка по стъпка)

Всичко, което трябва за подаването, е в репото. Този файл е чеклистът; текстовете
за copy-paste са в **`store/LISTING.md`**.

## 0. Какво е готово (нула работа)

| Артефакт | Къде |
|---|---|
| Пакет за качване | `npm run zip` → `release/deja-<версия>.zip` (Chrome) · `npm run zip:firefox` → Firefox |
| Store icon 128×128 | `icons/icon128.png` |
| Скрийншоти 1280×800 (5 на език, EN + BG) | `store/screenshots/{search,sidepanel,memory,welcome,options}-{en,bg}.png` |
| Промо tile 440×280 (задължителен) | `store/promo/small-tile-440x280.png` |
| Marquee 1400×560 (по избор) | `store/promo/marquee-1400x560.png` |
| Листинг текстове EN/BG, single purpose, обосновка на правата | `store/LISTING.md` |
| Политика за поверителност EN/BG | `server/privacy-en.html` → `/privacy` · `server/privacy.html` → `/privacy-bg` |
| Landing (BG/EN/IT) | `server/` → deja.carbonstealth.eu |

## 1. Преди подаването (еднократно, ~30 мин)

1. **Деплой на `server/`** на deja.carbonstealth.eu (nginx конфигът е в
   `server/nginx.conf`; деплоят е по канона на `deploy/autodeploy.sh`).
   Провери: `curl -I https://deja.carbonstealth.eu/privacy` → **200**. Без жив
   privacy URL CWS отхвърля автоматично.
2. **Developer акаунт**: https://chrome.google.com/webstore/devconsole →
   еднократна такса $5 → верифицирай имейла (`info@carbonstealth.eu` като
   support/contact е добре — той е публичен).
3. **Ръчен тест** на пакета: `chrome://extensions` → Developer mode → Load
   unpacked → `dist/` (или разархивиран ZIP). Провери: 0 warnings в картата на
   разширението; първо търсене на бавна връзка (тегли ~120MB модел еднократно);
   страничен панел (Alt+Shift+S); десен клик върху текст → „запомни“.
4. **Пакетът**: `cd deja && npm ci && npm test && npm run zip` (тестовете искат
   `DEJA_CHROME=/път/до/chrome`). Качва се `release/deja-<версия>.zip`.

## 2. Формулярът в Developer Dashboard

**Package** → Upload new package → `deja-<версия>.zip`.

**Store listing (English — основен):**
- Title / Summary / Description → от `LISTING.md` „EN listing“ (кратко ≤132).
- Category: **Productivity → Tools**. Language: **English**.
- Store icon: `icons/icon128.png`.
- Screenshots: качи петте `*-en.png` **в този ред**: search → sidepanel →
  memory → welcome → options (първият е „главният“ кадър).
- Small promo tile: `store/promo/small-tile-440x280.png`. Marquee: по избор.
- Official URL / Homepage: `https://deja.carbonstealth.eu`. Support URL: същият.
- Add language → **Български** → BG текстовете от `LISTING.md` + `*-bg.png`.
  (Italiano — по желание; landing-ът и UI-ът го имат, listing текст още не.)

**Privacy practices:**
- Single purpose description → „Single purpose“ от `LISTING.md`.
- Permission justification — за ВСЯКО право копирай реда от таблицата в
  `LISTING.md` (content script host access, storage, unlimitedStorage, offscreen,
  alarms, contextMenus, sidePanel, activeTab).
- Are you using remote code? → **No** (WASM е в пакета; моделът е данни, кеширан).
- Data usage → **ОТМЕТНИ** категориите, които Déjà обработва, макар и само
  локално (CWS User Data FAQ Q3: разкриването е задължително „even when data is
  processed or stored locally“): **Web history** (адреси/заглавия на посетени
  страници) и **Website content** (текст на страниците, избрани откъси). Нищо
  друго (без PII, без здравни/финансови/лични съобщения като категория, без
  местоположение, без активност на потребителя извън посетените страници).
- Certifications → отметни и трите (не продаваме/прехвърляме на трети страни;
  не ползваме извън single purpose; не ползваме за кредитоспособност) — верни са.
- Privacy policy URL → `https://deja.carbonstealth.eu/privacy`.

**Distribution:** Public · всички региони · безплатно.

**Submit for review.** Обичайно: часове до няколко дни. Широкият host достъп
(`http(s)://*/*`) може да предизвика ръчен преглед — обосновката е готова.

### Бележка за Data Disclosure (сверена с CWS User Data FAQ, 09.2026)

CWS изисква разкриване на **обработваните** данни, дори когато остават на
устройството (FAQ Q3). Déjà обработва две категории — **Web history** и
**Website content** — изцяло локално (IndexedDB / `storage.session`), без
предаване към нас или трети страни; единствената мрежова заявка е тегленето на
моделни файлове (данни) от Hugging Face, разкрито в политиката. Затова: отметни
двете категории, потвърди трите сертификации, посочи `/privacy`. Правилото от
01.08.2026 за **проактивно разкриване при промяна на практиките** е покрито в
кода: при ъпдейт на версията welcome страницата се отваря с бележка „какво е
ново“ (`onInstalled` → `reason === 'update'`).

## 3. След одобрение

1. Вземи store URL-а (`https://chromewebstore.google.com/detail/<id>`).
2. Смени двата placeholder CTA линка на landing-а (`server/index.html`,
   `en.html`, `it.html` — `https://chrome.google.com/webstore`) и `installUrl` в
   JSON-LD; редеплой.
3. `node tools/seo/indexnow.mjs https://deja.carbonstealth.eu` (правило на репото
   след SEO промяна).
4. Firefox: `npm run zip:firefox` → addons.mozilla.org (виж `firefox/AMO-NOTES.md`;
   иска и source zip заради минифицирания bundle).

## 4. Нова версия (всяка следваща)

`package.json` version → `npm test` → `npm run zip` → Dashboard → Upload new
package → Submit. Версията се щампова в манифеста автоматично от build-а.
Скрийншотите се преснимат само при видима UI промяна (`store/screenshots/`).
