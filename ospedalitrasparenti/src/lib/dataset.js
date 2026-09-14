// @ts-check
// Споделено зареждане на финансовия модел от свалените BDAP CSV файлове.
// Ползва се от build-report.js, analyze.js и build-site.js — един източник на истина.

import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { parseCsv } from './csv.js';
import { readJson } from './http.js';
import { RAW_DIR, ANAGRAFICA_FILE } from './paths.js';

/**
 * @typedef {object} Indicatore дефиниция на счетоводен показател
 * @property {string} key вътрешен ключ
 * @property {string} [label] италиански етикет
 * @property {string} [labelBg] български етикет
 * @property {string[]} codes кодове на позицията в CE/SP
 * @property {RegExp} re резервно разпознаване по описание
 */
/**
 * @typedef {object} ForensicCat форензик разходна категория
 * @property {string} key
 * @property {string} label
 * @property {string[]} codes
 */
/**
 * Годишна серия показатели — стойности по ключ на показателя (в евро).
 * Ключовете идват от CE_INDICATORS/SP_INDICATORS/CE_FORENSICS/CE_RECON;
 * липсващ показател → `undefined` при достъп (пази се от кода с `!= null`).
 * @typedef {Record<string, number>} SerieAnno
 */
/**
 * @typedef {object} VoceRiga подробен ред от CE/SP
 * @property {string} code код на позицията
 * @property {string} desc описание
 * @property {number} importo сума
 */
/**
 * Анаграфичен запис за болнично предприятие (полетата зависят от източника).
 * @typedef {object} AziendaAnag
 * @property {string} codice
 * @property {string} [tipo]
 * @property {string} [comune]
 * @property {string} [provincia]
 * @property {string} [indirizzo]
 */
/**
 * Анаграфичен запис за физическа структура (болница/президиум).
 * @typedef {object} StrutturaAnag
 * @property {string} codice
 * @property {string} [codiceRegione]
 * @property {string} [codiceAsl]
 * @property {string} [denominazione]
 * @property {string} [comune]
 * @property {string} [provincia]
 * @property {string} [tipo]
 * @property {string} [asl]
 * @property {number} [anno]
 * @property {number} [postiLetto]
 * @property {number} [ricoveri]
 * @property {number} [personale]
 * @property {number} [medici]
 * @property {number} [giornateDegenza]
 */
/**
 * @typedef {object} Anagrafica анаграфика от министерството
 * @property {AziendaAnag[]} aziende предприятия по код
 * @property {StrutturaAnag[]} strutture физически структури
 */
/**
 * @typedef {object} Ente болнична структура (SSN) с финансовите ѝ серии
 * @property {string} codice ключ = codice_regione(3) + codice_ente_SSN(3)
 * @property {string} codReg код на региона
 * @property {string} codEnte код на структурата
 * @property {string} regione име на региона
 * @property {string} denominazione име на структурата
 * @property {Map<number, SerieAnno>} serie серии по година
 * @property {VoceRiga[]} ceUltimo подробни CE редове (последна година)
 * @property {number} ceUltimoAnno последна година с CE
 * @property {VoceRiga[]} spUltimo подробни SP редове (последна година)
 * @property {number} spUltimoAnno последна година със SP
 * @property {AziendaAnag|null} [anag] прикачена анаграфика (ако има)
 */

const BDAP_DIR = join(RAW_DIR, 'bdap');

// Показатели от CE — по код на счетоводната позиция, с резервно
// разпознаване по описание (кодовете се менят между версиите на модела).
/** @type {Indicatore[]} */
export const CE_INDICATORS = [
  { key: 'contributi', label: 'Contributi in c/esercizio (A.1)', labelBg: 'Вноски за дейността (A.1)', codes: ['AA0010'], re: /^a\.1\)\s*contributi in c\/esercizio/i },
  { key: 'valoreProduzione', label: 'Valore della produzione (A)', labelBg: 'Общо приходи от дейността (A)', codes: ['AZ9999'], re: /^totale valore della produzione/i },
  { key: 'costiProduzione', label: 'Costi della produzione (B)', labelBg: 'Общо разходи за дейността (B)', codes: ['BZ9999'], re: /^totale costi della produzione/i },
  { key: 'costoPersonale', label: 'Costo del personale', labelBg: 'Разходи за персонал', codes: ['BA2080'], re: /^totale costo del personale/i },
  { key: 'ammortamenti', label: 'Ammortamenti', labelBg: 'Амортизации', codes: ['BA2560'], re: /^totale ammortamenti/i },
  { key: 'risultatoEsercizio', label: 'Risultato di esercizio', labelBg: 'Финансов резултат за годината', codes: ['ZZ9999'], re: /^risultato di esercizio/i },
];

// Показатели от SP (баланса).
/** @type {Indicatore[]} */
export const SP_INDICATORS = [
  { key: 'totaleAttivo', label: 'Totale attivo', labelBg: 'Общо актив', codes: ['AZZ999'], re: /totale attivo/i },
  { key: 'patrimonioNetto', label: 'Patrimonio netto', labelBg: 'Нетно имущество', codes: ['PAZ999'], re: /^a\) patrimonio netto/i },
  { key: 'debiti', label: 'Debiti', labelBg: 'Задължения', codes: ['PDZ999'], re: /^d\) debiti/i },
];

// Разходни категории за форензик анализ („следвай парите“) — векторите, където
// в италианското здравеопазване се концентрират разхищение и корупция.
// Някои категории събират няколко кода (сумират се, не се презаписват).
/** @type {ForensicCat[]} */
export const CE_FORENSICS = [
  { key: 'beni', label: 'Acquisti di beni', codes: ['BA0010'] },
  { key: 'serviziTot', label: 'Acquisti di servizi (totale)', codes: ['BA0390'] },
  { key: 'consulenzeInterinale', label: 'Consulenze, collaborazioni e lavoro interinale', codes: ['BA1350', 'BA1750'] },
  { key: 'serviziNonSanitari', label: 'Servizi non sanitari (pulizia, mensa, riscaldamento…)', codes: ['BA1560'] },
  { key: 'manutenzioni', label: 'Manutenzione e riparazione esternalizzata', codes: ['BA1910'] },
  { key: 'godimentoTerzi', label: 'Godimento di beni di terzi (affitti, noleggi)', codes: ['BA1990'] },
  {
    key: 'prestazioniDaPrivato',
    label: 'Acquisto di prestazioni sanitarie da privati',
    codes: ['BA0850', 'BA0860', 'BA0870', 'BA0880', 'BA0590', 'BA0600', 'BA0610', 'BA0620', 'BA0591', 'BA0601', 'BA0611', 'BA0621'],
  },
];
// Редове за проверка на счетоводната консистентност на CE (не се показват в
// отчетите): позволяват да проверим тъждеството на модела за резултата.
/** @type {{ key: string, codes: string[] }[]} */
export const CE_RECON = [
  { key: '_provOneriFin', codes: ['CZ9999'] }, // C) proventi e oneri finanziari
  { key: '_rettifiche', codes: ['DZ9999'] }, // D) rettifiche di valore att. fin.
  { key: '_straordinari', codes: ['EZ9999'] }, // E) proventi e oneri straordinari
  { key: '_risPrimaImposte', codes: ['XA0000'] }, // risultato prima delle imposte
  { key: '_imposte', codes: ['YZ9999'] }, // Y) totale imposte
];
/** @type {Map<string, string>} */
const RECON_CODE_TO_KEY = new Map();
for (const c of CE_RECON) for (const code of c.codes) RECON_CODE_TO_KEY.set(code, c.key);

/** @type {Map<string, string>} */
const FORENSIC_CODE_TO_KEY = new Map();
for (const c of CE_FORENSICS) for (const code of c.codes) FORENSIC_CODE_TO_KEY.set(code, c.key);

// Компоненти на актива — много структури не подават реда „D) TOTALE ATTIVO“
// и тогава той се изчислява като A + B + C (без задбалансовите conti d'ordine).
/** @type {Indicatore[]} */
const SP_ATTIVO_COMPONENTS = [
  { key: '_immobilizzazioni', codes: ['AAZ999'], re: /^a\) immobilizzazioni/i },
  { key: '_attivoCircolante', codes: ['ABZ999'], re: /^b\) attivo circolante/i },
  { key: '_rateiAttivi', codes: ['ACZ999'], re: /^c\) ratei e risconti attivi/i },
];

/**
 * Чете една CSV колона независимо от вариациите в имената на заглавията.
 * @param {Record<string, string>} row
 * @param {...string} names
 * @returns {string|undefined}
 */
function col(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined) return row[n];
  }
  return undefined;
}

/**
 * @param {Indicatore[]} indicators
 * @param {string} code
 * @param {string} desc
 * @returns {string|null}
 */
function matchIndicator(indicators, code, desc) {
  for (const ind of indicators) {
    if (ind.codes.includes(code) || ind.re.test(desc)) return ind.key;
  }
  return null;
}

/**
 * @param {string} file
 * @returns {Promise<Record<string, string>[]>}
 */
async function loadBdapCsv(file) {
  const text = await readFile(join(BDAP_DIR, file), 'utf8');
  return parseCsv(text, { separator: ';' });
}

/**
 * Зарежда всички структури (enti) с техните годишни серии от показатели, плюс
 * подробните редове CE/SP от последната налична година и анаграфиката.
 * Връща: { enti: Ente[], anagrafica, ultimoAnnoCe }.
 * @returns {Promise<{ enti: Ente[], anagrafica: Anagrafica, ultimoAnnoCe: number }>}
 */
export async function loadDataset() {
  const anagrafica = /** @type {Anagrafica} */ (await readJson(ANAGRAFICA_FILE));
  const aziendeByCod = new Map(anagrafica.aziende.map((a) => [a.codice, a]));

  const files = (await readdir(BDAP_DIR)).filter((f) => /^(ce|sp)-\d{4}\.csv$/.test(f)).sort();
  if (files.length === 0) throw new Error('няма свалени CE/SP файлове — пусни `npm run fetch:finanze`');

  /** @type {Map<string, Ente>} */
  const enti = new Map();
  let ultimoAnnoCe = 0;

  for (const file of files) {
    const kind = file.startsWith('ce') ? 'CE' : 'SP';
    const anno = Number(file.match(/(\d{4})/)?.[1]);
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

      // Форензик + рекон категории (само CE): по код.
      if (kind === 'CE') {
        const fk = FORENSIC_CODE_TO_KEY.get(codeVoce);
        if (fk) y[fk] = (y[fk] || 0) + importo;
        const rk = RECON_CODE_TO_KEY.get(codeVoce);
        if (rk) y[rk] = importo;
      }

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

/**
 * Тип структура според кода на ente в SSN.
 * @param {string} codEnte
 * @param {AziendaAnag|null} [anag]
 * @returns {string}
 */
export function tipoEnte(codEnte, anag) {
  if (anag) return anag.tipo || 'Azienda ospedaliera (AO/AOU/IRCCS)';
  const n = Number(codEnte);
  if (n >= 900) return 'Altra struttura del SSN (es. Azienda Zero/ESTAR)';
  return 'Azienda Sanitaria Locale (ASL) con presìdi ospedalieri';
}

/**
 * Годините с реални CE данни за структурата, сортирани.
 * @param {Ente} ente
 * @returns {number[]}
 */
export function anniConCe(ente) {
  return [...ente.serie.entries()]
    .filter(([, y]) => y.valoreProduzione != null)
    .map(([a]) => a)
    .sort((a, b) => a - b);
}

/**
 * Болничните структури (HSP), които съответстват на този ente (за нормализация).
 * @param {Ente} ente
 * @param {Anagrafica} anagrafica
 * @returns {StrutturaAnag[]}
 */
export function struttureDiEnte(ente, anagrafica) {
  const own = anagrafica.strutture.filter((s) => s.codice === ente.codice);
  if (own.length) return own;
  return anagrafica.strutture.filter(
    (s) => s.codiceRegione === ente.codReg && s.codiceAsl === ente.codEnte
  );
}

/**
 * Сума на леглата за ente (0 → null, за да не делим на нула).
 * @param {Ente} ente
 * @param {Anagrafica} anagrafica
 * @returns {number|null}
 */
export function postiLettoEnte(ente, anagrafica) {
  const s = struttureDiEnte(ente, anagrafica).reduce((n, x) => n + (x.postiLetto || 0), 0);
  return s > 0 ? s : null;
}

/**
 * Сума на приемите за ente.
 * @param {Ente} ente
 * @param {Anagrafica} anagrafica
 * @returns {number|null}
 */
export function ricoveriEnte(ente, anagrafica) {
  const s = struttureDiEnte(ente, anagrafica).reduce((n, x) => n + (x.ricoveri || 0), 0);
  return s > 0 ? s : null;
}
