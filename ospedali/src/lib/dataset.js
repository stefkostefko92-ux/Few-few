// Споделено зареждане на финансовия модел от свалените BDAP CSV файлове.
// Ползва се от build-report.js, analyze.js и build-site.js — един източник на истина.

import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { parseCsv } from './csv.js';
import { readJson } from './http.js';
import { RAW_DIR, ANAGRAFICA_FILE } from './paths.js';

const BDAP_DIR = join(RAW_DIR, 'bdap');

// Показатели от CE — по код на счетоводната позиция, с резервно
// разпознаване по описание (кодовете се менят между версиите на модела).
export const CE_INDICATORS = [
  { key: 'contributi', label: 'Contributi in c/esercizio (A.1)', labelBg: 'Вноски за дейността (A.1)', codes: ['AA0010'], re: /^a\.1\)\s*contributi in c\/esercizio/i },
  { key: 'valoreProduzione', label: 'Valore della produzione (A)', labelBg: 'Общо приходи от дейността (A)', codes: ['AZ9999'], re: /^totale valore della produzione/i },
  { key: 'costiProduzione', label: 'Costi della produzione (B)', labelBg: 'Общо разходи за дейността (B)', codes: ['BZ9999'], re: /^totale costi della produzione/i },
  { key: 'costoPersonale', label: 'Costo del personale', labelBg: 'Разходи за персонал', codes: ['BA2080'], re: /^totale costo del personale/i },
  { key: 'ammortamenti', label: 'Ammortamenti', labelBg: 'Амортизации', codes: ['BA2560'], re: /^totale ammortamenti/i },
  { key: 'risultatoEsercizio', label: 'Risultato di esercizio', labelBg: 'Финансов резултат за годината', codes: ['ZZ9999'], re: /^risultato di esercizio/i },
];

// Показатели от SP (баланса).
export const SP_INDICATORS = [
  { key: 'totaleAttivo', label: 'Totale attivo', labelBg: 'Общо актив', codes: ['AZZ999'], re: /totale attivo/i },
  { key: 'patrimonioNetto', label: 'Patrimonio netto', labelBg: 'Нетно имущество', codes: ['PAZ999'], re: /^a\) patrimonio netto/i },
  { key: 'debiti', label: 'Debiti', labelBg: 'Задължения', codes: ['PDZ999'], re: /^d\) debiti/i },
];

// Компоненти на актива — много структури не подават реда „D) TOTALE ATTIVO“
// и тогава той се изчислява като A + B + C (без задбалансовите conti d'ordine).
const SP_ATTIVO_COMPONENTS = [
  { key: '_immobilizzazioni', codes: ['AAZ999'], re: /^a\) immobilizzazioni/i },
  { key: '_attivoCircolante', codes: ['ABZ999'], re: /^b\) attivo circolante/i },
  { key: '_rateiAttivi', codes: ['ACZ999'], re: /^c\) ratei e risconti attivi/i },
];

/** Чете една CSV колона независимо от вариациите в имената на заглавията. */
function col(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined) return row[n];
  }
  return undefined;
}

function matchIndicator(indicators, code, desc) {
  for (const ind of indicators) {
    if (ind.codes.includes(code) || ind.re.test(desc)) return ind.key;
  }
  return null;
}

async function loadBdapCsv(file) {
  const text = await readFile(join(BDAP_DIR, file), 'utf8');
  return parseCsv(text, { separator: ';' });
}

/**
 * Зарежда всички структури (enti) с техните годишни серии от показатели, плюс
 * подробните редове CE/SP от последната налична година и анаграфиката.
 * Връща: { enti: Ente[], anagrafica, ultimoAnnoCe }.
 */
export async function loadDataset() {
  const anagrafica = await readJson(ANAGRAFICA_FILE);
  const aziendeByCod = new Map(anagrafica.aziende.map((a) => [a.codice, a]));

  const files = (await readdir(BDAP_DIR)).filter((f) => /^(ce|sp)-\d{4}\.csv$/.test(f)).sort();
  if (files.length === 0) throw new Error('няма свалени CE/SP файлове — пусни `npm run fetch:finanze`');

  const enti = new Map();
  let ultimoAnnoCe = 0;

  for (const file of files) {
    const kind = file.startsWith('ce') ? 'CE' : 'SP';
    const anno = Number(file.match(/(\d{4})/)[1]);
    if (kind === 'CE') ultimoAnnoCe = Math.max(ultimoAnnoCe, anno);
    const rows = await loadBdapCsv(file);
    for (const r of rows) {
      const codReg = (col(r, 'Codice Regione') || '').padStart(3, '0');
      const codEnte = (col(r, 'Codice Ente SSN', 'Codice Ente') || '').padStart(3, '0');
      // 000 = централизирано регионално управление (GSA), 999 = консолидиран
      // регионален отчет — не са болници и се пропускат.
      if (codEnte === '000' || codEnte === '999') continue;
      const codice = codReg + codEnte;
      const desc = col(r, 'Descrizione Voce Contabile') || '';
      const codeVoce = col(r, 'Codice Voce Contabile') || '';
      const importo = Number(col(r, 'Importo Totale'));
      if (!Number.isFinite(importo)) continue;

      let ente = enti.get(codice);
      if (!ente) {
        ente = {
          codice,
          codReg,
          codEnte,
          regione: (col(r, 'Descrizione Regione') || '').trim(),
          denominazione: (col(r, 'Descrizione Ente') || '').trim(),
          serie: new Map(),
          ceUltimo: [],
          ceUltimoAnno: 0,
          spUltimo: [],
          spUltimoAnno: 0,
        };
        enti.set(codice, ente);
      }
      if (kind === 'CE' && anno >= ultimoAnnoCe) {
        ente.denominazione = (col(r, 'Descrizione Ente') || ente.denominazione).trim();
      }

      let y = ente.serie.get(anno);
      if (!y) {
        y = {};
        ente.serie.set(anno, y);
      }
      const indicators = kind === 'CE' ? CE_INDICATORS : [...SP_INDICATORS, ...SP_ATTIVO_COMPONENTS];
      const key = matchIndicator(indicators, codeVoce, desc);
      if (key) y[key] = importo;

      if (kind === 'CE') {
        if (anno > ente.ceUltimoAnno) {
          ente.ceUltimoAnno = anno;
          ente.ceUltimo = [];
        }
        if (anno === ente.ceUltimoAnno) ente.ceUltimo.push({ code: codeVoce, desc: desc.trim(), importo });
      } else if (kind === 'SP') {
        if (anno > ente.spUltimoAnno) {
          ente.spUltimoAnno = anno;
          ente.spUltimo = [];
        }
        if (anno === ente.spUltimoAnno) ente.spUltimo.push({ code: codeVoce, desc: desc.trim(), importo });
      }
    }
  }

  // Дописване на „Общо актив“ там, където редът-тотал липсва в източника.
  for (const ente of enti.values()) {
    for (const y of ente.serie.values()) {
      if (y.totaleAttivo == null) {
        const parts = SP_ATTIVO_COMPONENTS.map((c) => y[c.key]).filter((v) => v != null);
        if (parts.length > 0) y.totaleAttivo = parts.reduce((s, v) => s + v, 0);
      }
      for (const c of SP_ATTIVO_COMPONENTS) delete y[c.key];
    }
    // прикачваме анаграфиката (болнично предприятие), ако има
    ente.anag = aziendeByCod.get(ente.codice) || null;
  }

  return {
    enti: [...enti.values()].sort((a, b) => a.codice.localeCompare(b.codice)),
    anagrafica,
    ultimoAnnoCe,
  };
}

/** Тип структура според кода на ente в SSN. */
export function tipoEnte(codEnte, anag) {
  if (anag) return anag.tipo || 'Azienda ospedaliera (AO/AOU/IRCCS)';
  const n = Number(codEnte);
  if (n >= 900) return 'Altra struttura del SSN (es. Azienda Zero/ESTAR)';
  return 'Azienda Sanitaria Locale (ASL) con presìdi ospedalieri';
}

/** Годините с реални CE данни за структурата, сортирани. */
export function anniConCe(ente) {
  return [...ente.serie.entries()]
    .filter(([, y]) => y.valoreProduzione != null)
    .map(([a]) => a)
    .sort((a, b) => a - b);
}
