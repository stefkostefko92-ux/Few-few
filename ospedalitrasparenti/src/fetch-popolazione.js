// Население по региони (ISTAT SDMX) — за pro-capite нормализация на разходите
// и поръчките. Тегли „Popolazione residente al 1° gennaio" през SDMX REST API
// (изисква Accept хедър за CSV — виж бележката) и го свежда до нашите ключове
// на региони. Trentino-Alto Adige (ITDA) съответства на нашия обединен ключ „taa".
//
// Изход: data/popolazione.json  { generatoIl, fonte, anno, regioni: { key: n } }.

// @ts-check
import { join } from 'node:path';
import { curlText, writeJson } from './lib/http.js';
import { parseCsv } from './lib/csv.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';
import { writeFile, mkdir, readFile, stat } from 'node:fs/promises';

// ISTAT ITTER107 (NUTS-стил) → нашите ключове на региони (codice_regione, като в
// build-site REGIONI). ITDA = цял Trentino-Alto Adige (ITD1 Bolzano + ITD2 Trento)
// → нашият обединен ключ „taa".
/** @type {Record<string, string>} */
const ITTER2KEY = {
  ITC1: '010', ITC2: '020', ITC4: '030', ITDA: 'taa', ITD3: '050',
  ITD4: '060', ITC3: '070', ITD5: '080', ITE1: '090', ITE2: '100',
  ITE3: '110', ITE4: '120', ITF1: '130', ITF2: '140', ITF3: '150',
  ITF4: '160', ITF5: '170', ITF6: '180', ITG1: '190', ITG2: '200',
};
const REGIONI_KEYS = Object.values(ITTER2KEY);

const DATAFLOW = 'IT1,22_289_DF_DCIS_POPRES1_1,1.0';
const REF_AREAS = [...Object.keys(ITTER2KEY), 'IT'].join('+');
const URL =
  `https://esploradati.istat.it/SDMXWS/rest/data/${DATAFLOW}/` +
  `A.${REF_AREAS}.JAN.9.TOTAL.99/?startPeriod=2023`;
const ACCEPT = 'application/vnd.sdmx.data+csv;version=1.0.0;labels=both';
const RAW = join(RAW_DIR, 'istat-popolazione-regioni.csv');

/** Кодът ITTER107 стои като „ITC1: Piemonte" (labels=both) — вземаме само кода. */
/** @param {string} cell @returns {string} */
function refAreaCode(cell) {
  return String(cell || '').split(':')[0].trim();
}

/**
 * SDMX-CSV с labels=both слага суфикс към ИМЕТО на колоната („REF_AREA: Territory")
 * и към стойността („ITC1: Piemonte"). Нормализираме ключовете по кода преди „:".
 * @param {Record<string, string>} r @returns {Record<string, string>} */
function normalizza(r) {
  /** @type {Record<string, string>} */
  const o = {};
  for (const [k, v] of Object.entries(r)) o[k.split(':')[0].trim()] = v;
  return o;
}

/** Свежда SDMX-CSV редовете до { key: население } за най-скорошната година. */
/** @param {Record<string, string>[]} rawRows */
export function riduci(rawRows) {
  const rows = rawRows.map(normalizza);
  let annoMax = 0;
  for (const r of rows) {
    const a = Number(r.TIME_PERIOD);
    if (Number.isFinite(a) && a > annoMax) annoMax = a;
  }
  /** @type {Record<string, number>} */
  const regioni = {};
  /** @type {number|null} */
  let italia = null;
  for (const r of rows) {
    if (Number(r.TIME_PERIOD) !== annoMax) continue;
    const code = refAreaCode(r.REF_AREA);
    const val = Number(r.OBS_VALUE);
    if (!Number.isFinite(val)) continue;
    if (code === 'IT') { italia = val; continue; }
    const key = ITTER2KEY[code];
    if (key) regioni[key] = val;
  }
  return { anno: annoMax, regioni, italia };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  if (!(await stat(RAW).catch(() => null))) {
    const csv = await curlText(URL, { headers: { Accept: ACCEPT }, timeoutSec: 120 });
    await writeFile(RAW, csv);
  }
  const rows = parseCsv(await readFile(RAW, 'utf8'), { separator: ',' });
  const { anno, regioni, italia } = riduci(rows);

  const mancanti = REGIONI_KEYS.filter((k) => regioni[k] == null);
  if (mancanti.length) throw new Error(`липсват региони: ${mancanti.join(', ')}`);
  const somma = Object.values(regioni).reduce((a, b) => a + b, 0);
  // Контрол: сборът на 20-те региона трябва да е ~националния тотал (±0,5%).
  if (italia && Math.abs(somma - italia) / italia > 0.005) {
    throw new Error(`сборът ${somma} не пасва на националния ${italia}`);
  }

  await writeJson(join(DATA_DIR, 'popolazione.json'), {
    generatoIl: new Date().toISOString(),
    fonte: 'Istat — Popolazione residente al 1° gennaio (SDMX DCIS_POPRES1), CC BY',
    url: 'https://esploradati.istat.it/',
    anno,
    italia,
    regioni,
  });
  console.log(`Готово → data/popolazione.json (${anno}): ${REGIONI_KEYS.length} региона, Италия ${(italia || somma).toLocaleString('it-IT')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
