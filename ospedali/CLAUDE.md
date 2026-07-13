# CLAUDE.md — ospedali/

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
```

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
src/build-site.js        dataset + segnalazioni + forensics + appalti + aggiudicatari → site/
src/lib/                 http (retry/кеш/curl), csv, dataset, format, site-ui, match (болница↔ANAC), paths
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
- Профили на изпълнителите: `pIvaValida` (11 цифри, не всички еднакви, контролна
  цифра) пази от боклучави CF; физически лица (16 знака) НЕ се профилират (GDPR).
- Регионите: `REGIONI` в `build-site.js` (ключ=файл; `istat`=код за картата;
  `prefissi`=codice_regione от финансите; `anac`=имена за join). Трентино обединява
  041+042 → ключ `taa`. Картата е **истинска географска** (choropleth) — граници от
  `src/lib/italia-geo.js` (**генериран асет** от `scripts/gen-geo.mjs`: проектира и
  опростява ISTAT geojson, CC BY 4.0). Пресметни наново само при смяна на границите.
- Сигналите са **индикатори, не обвинения** — формулировките го казват изрично.

## Капани

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
