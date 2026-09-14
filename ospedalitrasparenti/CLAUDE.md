# CLAUDE.md — ospedalitrasparenti/

Ospedali Trasparenti — ETL за финансите на публичните болници в Италия.
Извлича официални open data (BDAP/MEF CKAN + dati.salute.gov.it) и генерира
Markdown отчет за всяка структура от SSN. Виж `README.md` за източниците.

## Стек и стил

- Plain **Node ≥20, ESM**, нула зависимости (вграден `fetch`, `node:test`).
- Стил като `treydar/`/`medqr/`: коментари на български, малки модули.
- Числа: BDAP CSV е машинен формат (`Number()`); мин. на здравеопазването е
  италиански формат → `parseItalianNumber()` от `src/lib/csv.js`.

## Quality gate (задължителен преди commit)

```bash
npm run lint   # node --check на всички src файлове
npm test       # node --test test/*.test.js
# Типова проверка (строг @ts-check; TS/@types се теглят само за проверката, БЕЗ да
# влизат в package.json — runtime остава нула зависимости). CI я налага на Node 22:
npm i --no-save typescript@5.7 @types/node && npx tsc --allowJs --checkJs --noEmit \
  --strict --module NodeNext --skipLibCheck --target ES2022 --types node \
  src/*.js src/lib/*.js src/render/*.js server/*.js server/lib/*.js
```

Целият `src/`+`server/` е под строг `@ts-check` + JSDoc (0 `@ts-ignore`). Типовете на
data моделите живеят в `src/lib/models.js` (само JSDoc typedef, не влиза в билда).

## Архитектура

```
src/fetch-catalogo.js    CKAN package_list → кеш data/raw/bdap-pkgs/ → data/catalogo-bdap.json
src/fetch-anagrafica.js  dati.salute CSV (през curl! WAF реже Node fetch) → data/anagrafica.json
src/fetch-finanze.js     CE/SP CSV по години → data/raw/bdap/{ce,sp}-<год>.csv
src/lib/dataset.js       ЕДИНСТВЕН източник за модела: parsва CSV → enti[] (серии + анаграфика)
src/build-report.js      dataset → reports/ (index.md, <регион>/<код>-<име>.md, dati-chiave.csv)
src/analyze.js           dataset → счетоводни правила → data/segnalazioni.json (тестваем: analizzaEnte)
src/forensics.js         dataset + сурови CE → системен дефицит (GSA) + разходни аномалии → data/forensics.json
src/fetch-appalti.js     ANAC CIG месечно (кеш data/raw/anac/) → агрегати по регион+CF → data/appalti.json
                         (+ frazionamento/proroga + карта health-cig-cf.tsv за следващата стъпка)
src/fetch-aggiudicatari.js  поточно (unzip -p, 0.8+1GB) свързва CIG→изпълнители/участници →
                         доставчици, концентрация, търг с 1 оферент → data/aggiudicatari.json
src/fetch-dettagli.js    per болница ВСЕКИ договор (CIG/дата/предмет/сума/процедура/CPV/изпълнител)
                         → data/contratti/<codice>.json (gitignore); build-site → site/contratti/<codice>.csv
src/coi.js               двойки болница↔доставчик → флагове rotazione/dipendenza/esclusiva → data/coi.json
                         (analizzaCoppie е чист/тестваем; само fornitoreCf ≠ null → GDPR по конструкция)
src/validate.js          CE консистентност + покритие + провенанс (SHA-256) → data/validazione.json
── нови източници (вълна all-11; всеки по избор — build-site крие раздела без данни) ──
src/fetch-popolazione.js ISTAT SDMX (Accept хедър!) → data/popolazione.json (ключ=codice_regione) — pro-capite
src/fetch-apparecchiature.js dati.salute (динамичен дневен линк) → data/apparecchiature.json (dotazione, БЕЗ година)
src/fetch-sdo.js         dati.salute SDO 2022 → data/sdo.json (обеми/изписвания per структура+регион)
src/fetch-aggiudicazioni.js ANAC aggiudicazioni+fine+SAL (поточно, 0.9GB, филтър по health-cig-cf.tsv) →
                         data/aggiudicazioni.json (брой оференти, ribasso конкурентни, закъснения)
src/fetch-ted.js         TED API (JSON, POST, eForms 2023+) → data/ted.json (offerente unico UE)
src/fetch-perlapa.js     PerlaPA bulk CSV (~50MB/год) → data/consulenze.json (АГРЕГАТ, без имена на лица!)
src/fetch-pnrr-salute.js OpenPNRR (117MB, филтър M6) → data/pnrr-salute.json (Missione 6 per регион)
src/fetch-siope.js       BDAP CKAN SIOPE (per регион) → data/siope.json (каса, месечни потоци, dic/media)
src/fetch-pne.js         AGENAS PNE API (бавно, backoff; лиценз непотвърден → само регионални агрегати) → data/pne.json
src/cordate.js           aggiudicatari+partecipanti (поточно) → двойки „cover bidding" (заедно, едната
                         винаги печели, другата никога) → data/cordate.json. Изключва ATI (ruolo), брои
                         ВСИЧКИ победители per лот (иначе многолотовите дават фалшив картел); само P.IVA юр. лица
src/build-site.js        dataset + segnalazioni + forensics + appalti + aggiudicatari → site/
                         (main() + home/strutture/struttura/segnalazioni/metodologia; старите
                         тежки render-и са изнесени в src/render/*.js — appalti, fornitori,
                         regioni, inchiesta, legal)
src/render/              изнесени render модули (виж по-горе); всеки връща HTML стринг
src/lib/                 http (retry/кеш/curl + ZIP magic-byte валидация), csv, dataset,
                         format, site-ui, site-shared (споделени helpers/константи +
                         setDataSnapshot), stats (median/percentile/robustZ — единствен
                         източник), enti-ssn (HEALTH/NOT_HEALTH), match (болница↔ANAC), paths
```

- `dataset.js` е единственият парсер — **не дублирай** зареждането в новите скриптове.
- `analyze.js` изнася `analizzaEnte(ente, ctx)` + `derivati/median/percentile` за unit тест;
  `main()` се пуска само при директно стартиране (`import.meta.url === file://argv[1]`).
- `build-site.js` зависи от `data/segnalazioni.json` И `data/forensics.json` → пусни
  `analyze` и `forensics` преди `site` (или направо `npm run build`).
- `forensics.js`: „система“ чете суровите CE директно (нужни са 000/999, които
  `dataset.js` изключва); разходните категории идват от `CE_FORENSICS` в `dataset.js`
  (многокодови категории се **сумират**). Изнася median/percentile/robustZ за тест.
- Форензик флаг = дял над 90-и персентил И robust z>2 И материален (≥1 mln €), или
  +60% годишна експлозия (>2 mln €). Формулировките казват „pista, non prova".
- ANAC (`fetch-appalti.js`): CIG данните са месечни ZIP (WAF иска браузърски UA → curl);
  теглим в кеш, разархивираме, парсваме (quote-aware!), трием CSV за диск. Категории на
  процедурите в `catProc`; „senza gara" = diretto + negoziataSenza (БЕЗ рамковите quadro).
- Свързване болница↔ANAC (`lib/match.js`) е по ИМЕ (няма CF crosswalk) → строг матч:
  ядро на името (без типовата фраза) + регион + уникалност. Точност > покритие —
  по-добре несвързана, отколкото грешно приписана поръчка. Регионалният изглед не иска матч.
- `data/appalti.json` и `data/aggiudicatari.json` са по избор за `build-site.js`
  (ако липсват — съответните раздели се крият).
- `fetch-aggiudicatari.js`: **внимание с CIG кавичките** — aggiudicatari/partecipanti
  ограждат всяко поле в `"…"`, а cig датасетът не → задължителен `unq()` при join.
  Обработва се поточно (readline над `unzip -p`); филтрирането по health-CIG прави
  разбитите от вградени нови редове фрагменти безобидни (не съвпадат). Иска
  `--max-old-space-size=4096` (виж npm script).
- Сайтът е **на италиански**, self-contained (inline CSS/SVG/JS, нула външни ресурси —
  добро за CSP/Netlify), theme-aware (light/dark). Publish dir = `site/`.
- `config.json → siteUrl` включва откриваемостта: canonical + OG/Twitter meta,
  JSON-LD, `sitemap.xml`, `robots.txt` (празен siteUrl → всичко се пропуска, само
  релативни адреси). `page()` приема `canonical`/`jsonld`; подстраниците
  (struttura/regione/fornitore) подават свой `canonical`. `setSiteUrl()` в `site-ui.js`.
- **IndexNow:** `config.indexNowKey` → `build-site` генерира `site/<key>.txt`;
  `src/indexnow.js` (`npm run indexnow`) чете `sitemap.xml` и POST-ва URL-ите към
  `api.indexnow.org` (Bing/Yandex/Seznam). Вградено в `deploy_ospedali` — тича ВИНАГИ
  след деплой. Google не поддържа IndexNow → пасивно (sitemap+robots) + еднократна
  верификация в Search Console от собственика (виж `deploy/DEPLOY.md`).
- Профили на изпълнителите: `pIvaValida` (11 цифри, не всички еднакви, контролна
  цифра) пази от боклучави CF; физически лица (16 знака) НЕ се профилират (GDPR).
- Регионите: `REGIONI` в `build-site.js` (ключ=файл; `istat`=код за картата;
  `prefissi`=codice_regione от финансите; `anac`=имена за join). Трентино обединява
  041+042 → ключ `taa`. Картата е **истинска географска** (choropleth) — граници от
  `src/lib/italia-geo.js` (**генериран асет** от `scripts/gen-geo.mjs`: проектира и
  опростява ISTAT geojson, CC BY 4.0). Пресметни наново само при смяна на границите.
- Сигналите са **индикатори, не обвинения** — формулировките го казват изрично.

## Реквизити на титуляря (проверени от carbonstealth.eu/contatti, 2026-07)

**Carbon Stealth VCC** · ЕИК/VAT **BG208725180** · седалище **ul. Samuil 3,
2670 Bobov Dol, Bulgaria** · **info@carbonstealth.eu** · тел. +39 379 296 9699
(IT) / +359 877 414 874 (BG). Попълнени в `config.json → titolare` (импресум,
privacy, rettifiche). **Не питай собственика повторно за тях.**
Хостинг: **Hetzner Online GmbH, Нюрнберг (ЕС)** — `config.hosting`; без
трансфер извън ЕС → privacy не изисква DPF/SCC клауза. VPS-аджията ползва
същия модел деплой като другите продукти (виж deploy/README.md).

## Админ сервиз — `server/`

Лек Node сервиз (**нула зависимости**, само `node:http`/`node:crypto`) пред
статичния сайт: обслужва `site/`, брои **анонимно** посещенията и дава **админ
панел** (`/admin`, парола) с реален брояч + превключватели за скриване на
страници. `npm run serve`. Деплой (systemd + Nginx + TLS) → `server/DEPLOY.md`.

- `server/server.js` — HTTP сервиз (статика + броене + инжектиране на hide-CSS + 404 за скрити).
- `server/lib/analytics.js` — анонимен брояч (без IP/бисквитки; дневна ротираща сол в паметта → само агрегати на диска). `Contatore`, чисти: `applicaVista`/`hashVisitatore`.
- `server/lib/auth.js` — scrypt парола + HMAC подписана сесийна бисквитка (чисти, тествани).
- `server/lib/visibility.js` — скрити страници → 404 + `hideCss` крие връзките (моментално, обратимо, без ре-билд). `PROTETTE` (index/legal/privacy/…) НЕ се крият.
- `server/lib/config.js` — тайни от env / `server/.env` (mode 600). `server/.state/` (брояч+видимост) и `server/.env` са в `.gitignore`.
- Скрива по ИМЕ на файл (`cordate.html`) → важи и за root, и за дълбоките (`../cordate.html`).
- `data/*.json` на сайта се пазят в git; **рънтайм състоянието на сервиза — не**.

## Капани

- **HEALTH/NOT_HEALTH regex (SSN възложители) вече е DRY** — единствен източник
  `src/lib/enti-ssn.js` (+ helper `eEnteSanitario(nome)`), импортиран във
  `fetch-appalti.js`, `storico.js`, `fetch-perlapa.js`. Промяна се прави само там.
  NOT_HEALTH изключва ИНПС/ИНАИЛ/previdenza (иначе „ISTITUTO NAZIONALE“ ги улавя като
  здравни). НЕ изключвай INMP (мигрантско здраве — легитимно). Промяна на регекса
  мести замразените данни → пусни ETL наново и провери числата.

- `package_search` на BDAP CKAN връща 0 — каталогът се сканира целият и се
  кешира; **не трий** `data/raw/bdap-pkgs/` без нужда (30 мин повторно теглене).
- Ente ключ = `codice_regione(3) + codice_ente_SSN(3)` — съвпада с
  „Codice struttura“ от анаграфиката на министерството.
- Кодове `000`/`999` = регионални сметки (GSA/консолидация), не болници — скипват се.
- CE има колона „Tipo Rilevazione“, SP няма — парсването е по имена на колони,
  никога по позиции.
- Старите години (2012–2015) ползват други кодове на позициите — показателите се
  разпознават и по описание (regex), не само по код.
- `data/raw/` е в `.gitignore` (стотици MB); `data/*.json`, `reports/` и `site/` се комитват
  (сайтът зависи от суровите CSV, които не са в git → трябва да е готов в репото, за да се разгръща).
