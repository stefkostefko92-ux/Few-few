// SDO — Schede di Dimissione Ospedaliera: обемите на болничната дейност.
// „Колко изписвания прави всяка структура и всеки регион" — суровата мярка на
// натоварването. Служи за нормализация „разход на прием" (при интеграцията
// разходите се подават отделно) и за класация по обем.
//
// Източник: Ministero della Salute — dati.salute.gov.it, отворен файл
// „SDO per tipologia dimissione (aggregata e oscurata)", референтна година 2022
// (SDO изостава ~2 г.). Лиценз IODL 2.0.
//
// Особености на файла (проверени):
//  - UTF-8, CRLF, разделител „;“; но ЦЕЛИЯТ ред е обвит в кавички, а вътрешните
//    кавички са удвоени (`""Codice Istituto""`) → предварителна обработка преди
//    quote-aware parseCsv (махаме водещата/крайната кавичка на реда, ""→").
//  - Числата са в италиански формат с точка за хиляди („10.487" = 10487).
//  - „***" = oscurato (заличена малка стойност за поверителност) → броим като 0.
//  - `Codice Istituto` = 8 цифри; първите 2 = регион по ISTAT (01…20).
//
// Изход: data/sdo.json  { generatoIl, fonte, url, anno, nazionale, perRegione,
//                         perStruttura }.

// @ts-check
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseCsv, parseItalianNumber } from './lib/csv.js';
import { curlDownloadToFile, writeJson } from './lib/http.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';

const URL =
  'https://www.dati.salute.gov.it/sites/default/files/2025-02/' +
  'Open_data_-_SDO_per_tipologia_dimissione_aggregata_e_oscurata_DEF.csv';
const RAW = join(RAW_DIR, 'sdo.csv');

// 2-цифрен код на региона по ISTAT (водещите 2 цифри на Codice Istituto) →
// нашия ключ на регион (както в build-site REGIONI / popolazione.json).
// Внимание: 04 = Trentino-Alto Adige (Bolzano + Trento заедно) → „taa".
/** @type {Record<string, string>} */
const ISTAT2KEY = {
  '01': '010', '02': '020', '03': '030', '04': 'taa', '05': '050',
  '06': '060', '07': '070', '08': '080', '09': '090', '10': '100',
  '11': '110', '12': '120', '13': '130', '14': '140', '15': '150',
  '16': '160', '17': '170', '18': '180', '19': '190', '20': '200',
};

/** Число от клетка на SDO (италиански формат; „***"/празно → 0). */
function num(/** @type {string|undefined} */ v) {
  return parseItalianNumber(v) || 0;
}

/**
 * Обвивката на реда в кавички + удвоените вътрешни кавички чупят прякото
 * parseCsv (цялата глава става един ключ). Затова първо разопаковаме всеки ред:
 * махаме водещата/крайната кавичка и превръщаме „"" → "“, после подаваме на
 * quote-aware parseCsv (разделител „;“).
 */
/** @param {string} raw @returns {Record<string, string>[]} */
export function parseSdoCsv(raw) {
  const q = '"';
  const pre = raw
    .split(/\r?\n/)
    .map((l) => {
      let s = l;
      if (s.startsWith(q) && s.endsWith(q) && s.length >= 2) s = s.slice(1, -1);
      return s.replaceAll(q + q, q);
    })
    .join('\n');
  return parseCsv(pre, { separator: ';' });
}

/**
 * Агрегира редовете на SDO. „dimissioni" = сумата от трите колони (decessi +
 * dimissioni a domicilio + dimissioni verso altra struttura) = общият обем на
 * изписванията на структурата.
 *
 * Връща:
 *   { anno,
 *     nazionale:  { dimissioni, strutture },
 *     perRegione: { key: { dimissioni, strutture, decessi } },
 *     perStruttura: { codice8: { denominazione, dimissioni } } }
 */
/** @param {Record<string, string>[]} rows */
export function aggrega(rows) {
  /** @type {Record<string, { dimissioni: number, strutture: number, decessi: number }>} */
  const perRegione = {};
  /** @type {Record<string, { denominazione: string, dimissioni: number }>} */
  const perStruttura = {};
  let dimissioniTot = 0;
  let strutture = 0;
  /** @type {number|null} */
  let anno = null;

  for (const r of rows) {
    const codice = String(r['Codice Istituto'] || '').trim();
    if (!codice) continue;
    if (anno == null) {
      const a = parseItalianNumber(r['Anno di dimissione']);
      if (a != null) anno = a;
    }
    const decessi = num(r['Num decessi']);
    const domicilio = num(r['Num dimissioni a domicilio']);
    const altra = num(r['Num dimissioni verso altra struttura']);
    const dimissioni = decessi + domicilio + altra;

    dimissioniTot += dimissioni;
    strutture++;

    perStruttura[codice] = {
      denominazione: String(r['Denominazione Istituto'] || '').trim(),
      dimissioni,
    };

    const key = ISTAT2KEY[codice.slice(0, 2)];
    if (key) {
      const g = perRegione[key] || (perRegione[key] = { dimissioni: 0, strutture: 0, decessi: 0 });
      g.dimissioni += dimissioni;
      g.strutture += 1;
      g.decessi += decessi;
    }
  }

  return {
    anno,
    nazionale: { dimissioni: dimissioniTot, strutture },
    perRegione,
    perStruttura,
  };
}

async function main() {
  await curlDownloadToFile(URL, RAW);
  const rows = parseSdoCsv(await readFile(RAW, 'utf8'));
  const agg = aggrega(rows);

  await writeJson(join(DATA_DIR, 'sdo.json'), {
    generatoIl: new Date().toISOString(),
    fonte: 'Ministero della Salute — Schede di Dimissione Ospedaliera (SDO), dati aperti (aggregata e oscurata)',
    url: URL,
    licenza: 'IODL 2.0',
    ...agg,
  });

  const nReg = Object.keys(agg.perRegione).length;
  console.log(
    `Готово → data/sdo.json (${agg.anno}): ${agg.nazionale.strutture} структури, ` +
      `${agg.nazionale.dimissioni.toLocaleString('it-IT')} изписвания, ${nReg} региона`
  );
  // кратко резюме — топ 5 структури по обем
  const top = Object.entries(agg.perStruttura)
    .sort((a, b) => b[1].dimissioni - a[1].dimissioni)
    .slice(0, 5);
  for (const [cod, s] of top) {
    console.log(`  ${cod}  ${s.dimissioni.toLocaleString('it-IT').padStart(8)}  ${s.denominazione}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
