// Технологична обезпеченост на болниците — „grandi apparecchiature sanitarie"
// (Min. Salute, DM 22/04/2014). Голяма диагностична/терапевтична апаратура per
// структура: TAC, РМН, ПЕТ, гама-камери, линейни ускорители, хирургични роботи…
//
// ВАЖНО: датасетът НЯМА година на инсталиране → това е ИНВЕНТАР (какво притежава
// структурата), не възраст. Показваме „обезпеченост", нормализирана на населението,
// не „застаряла техника".
//
// Файлът се регенерира дневно с дата в името (DISPO_GAP_80_<YYYYMMDD>.csv) → линкът
// се открива динамично от страницата на датасета. Порталът има WAF → системен curl.
//
// Изход: data/apparecchiature.json (сурови бройки; pro-capite се смята при билда).

// @ts-check
import { join } from 'node:path';
import { writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { curlText, curlDownloadToFile, writeJson } from './lib/http.js';
import { parseCsv } from './lib/csv.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';

const PAGINA = 'https://www.dati.salute.gov.it/it/dataset/apparecchiature-sanitarie/';
const BASE = 'https://www.dati.salute.gov.it';
const RAW = join(RAW_DIR, 'apparecchiature.csv');

// codice_regione (3 цифри в датасета) → нашия ключ (Трентино 041/042 → 'taa').
/** @type {Record<string, string>} */
const REG_KEY = {
  '010': '010', '020': '020', '030': '030', '041': 'taa', '042': 'taa',
  '050': '050', '060': '060', '070': '070', '080': '080', '090': '090',
  '100': '100', '110': '110', '120': '120', '130': '130', '140': '140',
  '150': '150', '160': '160', '170': '170', '180': '180', '190': '190', '200': '200',
};

// Макро-категории (tipo_apparecchiatura) → етикет + ред за показване.
/** @type {Record<string, string>} */
export const CAT_APP = {
  TAC: 'TC (tomografia computerizzata)',
  RMN: 'Risonanza magnetica',
  PET: 'PET / PET-TC',
  GCC: 'Gamma camere (medicina nucleare)',
  GTT: 'Sistemi TC/gamma camera',
  ACC: 'Acceleratori lineari (radioterapia)',
  ROB: 'Robot chirurgici',
  ANG: 'Angiografi',
  MMI: 'Mammografi',
};
// Групиране за pro-capite таблицата (по-четимо от 9-те кода).
export const GRUPPI_APP = [
  { key: 'TAC', label: 'TC', tipi: ['TAC'] },
  { key: 'RMN', label: 'Risonanza magnetica', tipi: ['RMN'] },
  { key: 'PET', label: 'PET', tipi: ['PET'] },
  { key: 'MEDNUC', label: 'Medicina nucleare (gamma camere)', tipi: ['GCC', 'GTT'] },
  { key: 'ACC', label: 'Acceleratori (radioterapia)', tipi: ['ACC'] },
  { key: 'ROB', label: 'Robot chirurgici', tipi: ['ROB'] },
];

/** Агрегира редовете на апаратурата → национално, per регион, per структура. */
/** @param {Record<string, string>[]} rows */
export function aggrega(rows) {
  /** @type {Record<string, number>} */
  const naz = {};
  /** @type {Record<string, any>} */
  const perRegione = {};
  /** @type {Record<string, any>} */
  const perStruttura = {};
  for (const r of rows) {
    const key = REG_KEY[(r.codice_regione || '').trim()];
    if (!key) continue;
    const tipo = (r.tipo_apparecchiatura || '').trim();
    const n = Number(r.num_apparecchiature || 0) || 0;
    if (n <= 0) continue;
    naz[tipo] = (naz[tipo] || 0) + n;
    (perRegione[key] ||= { tot: 0, cat: {}, strutture: new Set() });
    perRegione[key].tot += n;
    perRegione[key].cat[tipo] = (perRegione[key].cat[tipo] || 0) + n;
    // per структура (6-цифрен код; 8-цифрените стесняваме до водещите 6)
    const cod = (r.codice_struttura || '').trim().slice(0, 6);
    if (cod) {
      (perStruttura[cod] ||= { tot: 0, cat: {} });
      perStruttura[cod].tot += n;
      perStruttura[cod].cat[tipo] = (perStruttura[cod].cat[tipo] || 0) + n;
    }
    perRegione[key].strutture.add(cod);
  }
  for (const k of Object.keys(perRegione)) {
    perRegione[k].strutture = perRegione[k].strutture.size;
  }
  return { naz, perRegione, perStruttura };
}

async function scaricaCsv() {
  if (await stat(RAW).catch(() => null)) return;
  await mkdir(RAW_DIR, { recursive: true });
  const html = await curlText(PAGINA, { timeoutSec: 90 });
  const m = html.match(/\/sites\/default\/files\/[^"']*DISPO_GAP_80[^"']*\.csv/);
  if (!m) throw new Error('не намерих CSV линка на страницата на датасета');
  await curlDownloadToFile(BASE + m[0], RAW, { timeoutSec: 180 });
}

async function main() {
  await scaricaCsv();
  const rows = parseCsv(await readFile(RAW, 'utf8'), { separator: ';' });
  const { naz, perRegione, perStruttura } = aggrega(rows);
  const tot = Object.values(naz).reduce((a, b) => a + b, 0);
  await writeJson(join(DATA_DIR, 'apparecchiature.json'), {
    generatoIl: new Date().toISOString(),
    fonte: 'Ministero della Salute — Grandi apparecchiature sanitarie (DM 22/04/2014), IODL 2.0',
    url: PAGINA,
    nota: 'Inventario tecnologico per struttura (tipo, CND, numero). La fonte non riporta l’anno di installazione: è dotazione, non vetustà.',
    categorie: CAT_APP,
    nazionale: naz,
    perRegione,
    perStruttura,
  });
  console.log(`Готово → data/apparecchiature.json: ${tot} апарата, ${Object.keys(perStruttura).length} структури, ${Object.keys(perRegione).length} региона`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
