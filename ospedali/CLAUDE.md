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
src/build-report.js      парсва всичко → reports/ (index.md, <регион>/<код>-<име>.md, dati-chiave.csv)
src/lib/                 http (retry/кеш/curl), csv (парсер + ит. числа), paths
```

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
- `data/raw/` е в `.gitignore` (стотици MB); `data/*.json` и `reports/` се комитват.
