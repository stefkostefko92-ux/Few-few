// Персоналът на здравните ведомства (Conto Annuale, RGS/MEF през BDAP CKAN):
// per ente — общ персонал, лекари, гъвкав труд (срочни/агенционни) — и
// националният тренд на гъвкавия труд („medici a gettone" темата).
//
// Join към нашите болници: по „Codice Ente BDAP" (общ ключ със CE модела) —
// точен, без fuzzy matching. Ведомствата извън нашия периметър (агенции и т.н.)
// се пропускат мълчаливо.
//
// Вход (свалени в data/raw/nuovi/): occupazione-<год>.csv (Dati analitici per
// Ente), flessibile-storico.csv (комparto-ниво, по години).
// Изход: data/personale.json.

// @ts-check
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseCsv } from './lib/csv.js';
import { readJson, writeJson, curlDownloadToFile } from './lib/http.js';
import { DATA_DIR, RAW_DIR, ROOT } from './lib/paths.js';

const NUOVI_DIR = join(RAW_DIR, 'nuovi');
// 2023 е последната ПЪЛНА годишна колекция (2024 в BDAP е още частична —
// свършва по азбучен ред преди „UNITA' SANITARIE LOCALI", проверено).
const OCC_ANNO = 2023;
const OCC_URL = 'https://bdap-opendata.rgs.mef.gov.it/SpodCkanApi/api/3/datastore/dump/21f79855-dbca-4a52-9833-d55986543724.csv';
const FLESS_URL = 'https://bdap-opendata.rgs.mef.gov.it/SpodCkanApi/api/3/datastore/dump/a647f1cb-4857-41ab-a923-f5971d4f3ea3.csv';

/** @param {string|number|undefined} v @returns {number} */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * @typedef {object} OccEnte агрегат за ведомство
 * @property {string} bdap
 * @property {string} denominazione
 * @property {number} totale
 * @property {number} medici
 * @property {number} flessibili
 */

/**
 * Агрегира редовете на occupazione (само SANITA') per Codice Ente BDAP.
 * @param {Record<string, string>[]} rows
 * @returns {Map<string, OccEnte>}
 */
export function aggregaOccupazione(rows) {
  /** @type {Map<string, OccEnte>} */
  const perBdap = new Map();
  for (const r of rows) {
    if (!/SANITA/i.test(r['Descrizione Comparto'] || '')) continue;
    const bdap = r['Codice Ente BDAP'] || '';
    if (!bdap) continue;
    let g = perBdap.get(bdap);
    if (!g) {
      g = { bdap, denominazione: r['Descrizione Ente'] || '', totale: 0, medici: 0, flessibili: 0 };
      perBdap.set(bdap, g);
    }
    // колоните-бройки са дизюнктни категории персонал (ж/м × вид договор)
    const stabili =
      num(r['Numero Dipendenti Donne Tempo Pieno']) + num(r['Numero Dipendenti Uomini Tempo Pieno']) +
      num(r['Numero Dipendenti Donne Part time Inf. 50%']) + num(r['Numero Dipendenti Uomini Part time Inf. 50%']) +
      num(r['Numero Dipendenti Donne Part time Sup. 50%']) + num(r['Numero Dipendenti Uomini Part time Sup. 50%']);
    const flessibili =
      num(r['Numero Dipendenti Donne Tempo Determinato']) + num(r['Numero Dipendenti Uomini Tempo Determinato']) +
      num(r['Numero Dipendenti Donne Formazione Lavoro']) + num(r['Numero Dipendenti Uomini Formazione Lavoro']) +
      num(r['Numero Dipendenti Donne Lavoro Interinale']) + num(r['Numero Dipendenti Uomini Lavoro Interinale']) +
      num(r['Numero Dipendenti Donne Lavoro Socialmente Utile']) + num(r['Numero Dipendenti Uomini Lavoro Socialmente Utile']);
    g.totale += stabili + flessibili;
    g.flessibili += flessibili;
    if (/MEDICI/i.test(r['Descrizione Categoria'] || '')) g.medici += stabili + flessibili;
  }
  return perBdap;
}

async function main() {
  await readJson(join(ROOT, 'config.json')).catch(() => ({})); // пази форма̀та на скриптовете
  const anno = OCC_ANNO;

  // 0) свали при липса (идемпотентно, като другите fetch скриптове)
  const occFile = join(NUOVI_DIR, `occupazione-${anno}.csv`);
  await curlDownloadToFile(OCC_URL, occFile).catch(() => {});
  await curlDownloadToFile(FLESS_URL, join(NUOVI_DIR, 'flessibile-storico.csv')).catch(() => {});

  // 1) карта Codice Ente BDAP → наш 6-цифрен код (от суровия CE)
  const ce = parseCsv(await readFile(join(RAW_DIR, 'bdap', `ce-${anno}.csv`), 'utf8'), { separator: ';' });
  /** @type {Map<string, string>} */
  const bdap2cod = new Map();
  for (const r of ce) {
    const bdap = r['Codice Ente BDAP'] || '';
    const cod = `${r['Codice Regione'] || ''}${(r['Codice Ente SSN'] || '').padStart(3, '0')}`;
    if (bdap && cod.length === 6 && !cod.endsWith('000') && !cod.endsWith('999')) bdap2cod.set(bdap, cod);
  }

  // 2) occupazione per ente
  const occ = parseCsv(await readFile(occFile, 'utf8'), { separator: ';' });
  const perBdap = aggregaOccupazione(occ);
  /** @type {Record<string, { totale: number, medici: number, flessibili: number, quotaFlessibili: number }>} */
  const perEnte = {};
  let nazionale = { totale: 0, medici: 0, flessibili: 0, enti: 0 };
  for (const g of perBdap.values()) {
    nazionale.totale += g.totale;
    nazionale.medici += g.medici;
    nazionale.flessibili += g.flessibili;
    nazionale.enti++;
    const cod = bdap2cod.get(g.bdap);
    if (cod) perEnte[cod] = { totale: Math.round(g.totale), medici: Math.round(g.medici), flessibili: Math.round(g.flessibili), quotaFlessibili: g.totale ? g.flessibili / g.totale : 0 };
  }

  // 3) национален тренд на гъвкавия труд (комparto SANITA')
  const fless = parseCsv(await readFile(join(NUOVI_DIR, 'flessibile-storico.csv'), 'utf8'), { separator: ';' });
  const flessibileStorico = fless
    .filter((r) => /SANITA/i.test(r['Descrizione Comparto'] || ''))
    .map((r) => ({
      anno: Number(r['Anno Rilevazione']),
      determinato: num(r['Numero Dipendenti Tempo Determinato']),
      interinale: num(r['Numero Dipendenti Contratto Interinale']),
    }))
    .filter((r) => Number.isFinite(r.anno))
    .sort((a, b) => a.anno - b.anno);

  await writeJson(join(DATA_DIR, 'personale.json'), {
    generatoIl: new Date().toISOString(),
    anno,
    fonte: 'Conto Annuale (RGS/MEF) via BDAP open data — Occupazione complessiva per ente + Lavoro flessibile storico',
    nota: 'Numero di dipendenti (teste) al 31/12, comparto Sanità. «Flessibili» = tempo determinato + formazione lavoro + interinale + LSU. Il lavoro somministrato tramite cooperative/agenzie esterne (i «medici a gettone» appaltati) NON è qui: passa per i contratti di servizi, non per il Conto Annuale.',
    nazionale: {
      totale: Math.round(nazionale.totale),
      medici: Math.round(nazionale.medici),
      flessibili: Math.round(nazionale.flessibili),
      enti: nazionale.enti,
      collegati: Object.keys(perEnte).length,
    },
    flessibileStorico,
    perEnte,
  });
  console.log(`Готово: ${nazionale.enti} здравни ведомства (${Object.keys(perEnte).length} свързани), ${Math.round(nazionale.totale).toLocaleString('it-IT')} служители → data/personale.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
