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
src/build-site.js        dataset + segnalazioni + forensics + appalti → site/ (италиански сайт, SVG + hbars)
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
- `data/appalti.json` е по избор за `build-site.js` (ако липсва — разделите Appalti се крият).
- Сайтът е **на италиански**, self-contained (inline CSS/SVG/JS, нула външни ресурси —
  добро за CSP/Netlify), theme-aware (light/dark). Publish dir = `site/`.
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
