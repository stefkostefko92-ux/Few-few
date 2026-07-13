// Извлича анаграфиката на публичните болнични структури от dati.salute.gov.it:
//  1) „Strutture di ricovero pubbliche e equiparate…“ — болници с легла, персонал, приеми;
//  2) „Aziende Ospedaliere, AOU e IRCCS pubblici“ — самостоятелните болнични предприятия.
// Резултат: data/anagrafica.json + сурови CSV в data/raw/salute/.

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { curlDownloadToFile, curlText, writeJson } from './lib/http.js';
import { parseCsv, parseItalianNumber } from './lib/csv.js';
import { RAW_DIR, ANAGRAFICA_FILE } from './lib/paths.js';

const BASE = 'https://www.dati.salute.gov.it';
// Порталът връща 503 на неразпознати клиенти — представяме се като браузър.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
};

const DATASETS = [
  {
    key: 'strutture',
    page: `${BASE}/it/dataset/strutture-di-ricovero-pubbliche-e-equiparate-presenti-nel-territorio-della-asl/`,
  },
  {
    key: 'aziende',
    page: `${BASE}/it/dataset/aziende-ospedaliere-aziende-ospedaliere-universitarie-e-irccs-pubblici-anche-costituiti/`,
  },
];

/** Намира първия CSV ресурс в HTML страницата на датасета. */
function extractCsvUrl(html) {
  const m = html.match(/"(\/sites\/default\/files\/[^"]+\.csv)"/i);
  if (!m) throw new Error('не намерих CSV ресурс в страницата на датасета');
  return BASE + m[1];
}

/** Чете CSV файл, оправяйки латинската кодировка на министерството при нужда. */
async function readCsvFile(path) {
  const buf = await readFile(path);
  let text = buf.toString('utf8');
  if (text.includes('�')) text = buf.toString('latin1');
  return parseCsv(text, { separator: ';' });
}

async function main() {
  const csvPaths = {};
  for (const ds of DATASETS) {
    console.log(`Датасет „${ds.key}“ — търся CSV ресурса…`);
    const html = await curlText(ds.page, { headers: BROWSER_HEADERS });
    const csvUrl = extractCsvUrl(html);
    const path = join(RAW_DIR, 'salute', `${ds.key}.csv`);
    const fresh = await curlDownloadToFile(csvUrl, path, { headers: BROWSER_HEADERS });
    console.log(`  ${fresh ? 'свалено' : 'от кеша'}: ${csvUrl}`);
    csvPaths[ds.key] = path;
  }

  // 1) Болнични структури (модел HSP): по една актуална снимка на структура.
  const struttureRows = await readCsvFile(csvPaths.strutture);
  const strutture = new Map();
  for (const r of struttureRows) {
    const codice = r.codice_struttura;
    if (!codice) continue;
    const anno = Number(r.anno);
    const existing = strutture.get(codice);
    if (existing && existing.anno >= anno) continue;
    strutture.set(codice, {
      codice,
      anno,
      denominazione: r.denominazione_struttura?.trim(),
      comune: r.comune?.trim(),
      provincia: r.sigla_provincia_struttura?.trim(),
      tipo: r['Tipo struttura']?.trim(),
      codiceTipo: r.codice_tipo_struttura?.trim(),
      codiceRegione: r.codice_regione?.trim(),
      regione: r.Regione?.trim(),
      codiceAsl: r.codice_asl?.trim(),
      asl: r.asl?.trim(),
      postiLetto: parseItalianNumber(r.posti_letto_previsti),
      postiLettoUtilizzati: parseItalianNumber(r.posti_letto_utilizzati),
      personale: parseItalianNumber(r.totale_personale),
      medici: parseItalianNumber(r.medici),
      infermieri: parseItalianNumber(r.infermieri),
      ricoveri: parseItalianNumber(r.ricoveri),
      giornateDegenza: parseItalianNumber(r.giornate_degenza),
    });
  }

  // 2) Болнични предприятия (AO/AOU/IRCCS) — актуална снимка на предприятие.
  const aziendeRows = await readCsvFile(csvPaths.aziende);
  const aziende = new Map();
  for (const r of aziendeRows) {
    const codice = r['Codice struttura']?.trim();
    if (!codice) continue;
    const anno = Number(r.Anno);
    const existing = aziende.get(codice);
    if (existing && existing.anno >= anno) continue;
    aziende.set(codice, {
      codice,
      anno,
      codiceAzienda: r['Codice Azienda']?.trim(),
      denominazione: r['Denominazione struttura']?.trim(),
      indirizzo: r.Indirizzo?.trim(),
      comune: r.Comune?.trim(),
      provincia: r['Sigla provincia']?.trim(),
      codiceRegione: r['Codice Regione']?.trim(),
      regione: r['Descrizione Regione']?.trim(),
      tipo: r['Descrizione tipo struttura']?.trim(),
    });
  }

  const out = {
    generatoIl: new Date().toISOString(),
    fonti: DATASETS.map((d) => d.page),
    strutture: [...strutture.values()].sort((a, b) => a.codice.localeCompare(b.codice)),
    aziende: [...aziende.values()].sort((a, b) => a.codice.localeCompare(b.codice)),
  };
  await writeJson(ANAGRAFICA_FILE, out);
  console.log(
    `Готово: ${out.strutture.length} болнични структури, ${out.aziende.length} болнични предприятия → ${ANAGRAFICA_FILE}`
  );
}

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
