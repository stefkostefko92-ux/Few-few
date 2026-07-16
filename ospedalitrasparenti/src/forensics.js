// „Follow the money“ — форензик слой върху детайлните разходни редове на CE.
//
// Две части:
//  1) SISTEMA — разбива мита „всяка болница е на минус“: съпоставя резултата на
//     предприятията с регионалната Gestione Sanitaria Accentrata (GSA, код 000) и
//     консолидирания резултат (999), по години; показва истинския дефицит.
//  2) INDAGINE — за всяко предприятие извлича разходите по рискови категории
//     (доставки, услуги, консултации/наемен труд, изнесени услуги, наеми, покупка
//     на услуги от частни), нормализира ги (на легло и като дял от разходите),
//     сравнява с националните връстници (медиана, 90-и персентил, robust z-score)
//     и вдига флагове за отклонения и за годишни експлозии.
//
// ВАЖНО: отклонение ≠ кражба. Това насочва проверката, не обвинява. Високите
// консултации/частни услуги може да са законни (недостиг на персонал, изнесени
// услуги). Но точно там гледат одиторите и Corte dei conti.
//
// Изход: data/forensics.json.

// @ts-check
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { parseCsv } from './lib/csv.js';
import { readJson, writeJson } from './lib/http.js';
import { RAW_DIR, DATA_DIR } from './lib/paths.js';
import {
  loadDataset,
  tipoEnte,
  anniConCe,
  postiLettoEnte,
  ricoveriEnte,
  CE_FORENSICS,
} from './lib/dataset.js';
// median/percentile/robustZ са изнесени в общ модул (DRY) — реекспортват се в
// края на файла за обратна съвместимост с тестовете.
import { median, percentile, robustZ } from './lib/stats.js';

/** @typedef {import('./lib/dataset.js').Ente} Ente */
/** @typedef {import('./lib/dataset.js').SerieAnno} SerieAnno */
/**
 * @typedef {object} CatCell разходна категория за едно предприятие
 * @property {number} valore
 * @property {number} quotaCosti дял от разходите
 * @property {number|null} perLetto на легло
 * @property {number} [quotaPersonale] дял от персонала (само consulenzeInterinale)
 */
/**
 * @typedef {object} Metrica метрики на предприятие (последна година)
 * @property {string} codice
 * @property {string} denominazione
 * @property {string} regione
 * @property {string} tipo
 * @property {string} classe
 * @property {string} peer
 * @property {number} anno
 * @property {number} costiProduzione
 * @property {number|null} costoPersonale
 * @property {number|null} postiLetto
 * @property {number|null} ricoveri
 * @property {Record<string, CatCell>} cat
 */
/**
 * @typedef {object} ForFlag форензик флаг
 * @property {string} categoria
 * @property {string} tipo
 * @property {string} label
 * @property {number} valore
 * @property {string} testo
 * @property {number|null} z
 */
/**
 * Бенчмарк за група/нация — хетерогенен речник: категорийни ключове носят
 * статистики, а `_`-ключовете — общи числа. Оттам широкият индекс.
 * @typedef {{ _n?: number, _consPersMediana?: number|null, _consPersP90?: number|null, [k: string]: any }} Bench
 */

const BDAP_DIR = join(RAW_DIR, 'bdap');
const FORENSICS_FILE = join(DATA_DIR, 'forensics.json');

// Клас на структурата за справедливо сравнение „връстник с връстник“.
/**
 * @param {Ente} ente
 * @returns {string}
 */
function classeTipo(ente) {
  const n = Number(ente.codEnte);
  if (ente.anag || (n >= 901 && n <= 989)) return 'ospedaliera'; // AO/AOU/IRCCS
  if (n === 900 || n >= 990) return 'altro'; // Azienda Zero/ESTAR/centrali
  return 'territoriale'; // ASL с президии
}
/**
 * @param {number} costi
 * @returns {string}
 */
function bucketDimensione(costi) {
  if (costi < 100e6) return '<100M';
  if (costi < 500e6) return '100-500M';
  if (costi < 1e9) return '500M-1G';
  return '>1G';
}

// Абсолютен праг на материалност: под този размер не вдигаме шум.
const SOGLIA_MATERIALITA = 1_000_000;
/** @param {string} s @returns {string} */
const scopeLabel = (s) => (s === 'gruppo' ? 'di aziende simili' : 'nazionale');

/**
 * Чист флаг-двигател за едно предприятие спрямо неговия бенчмарк (peer или
 * национален): отклонения по дял (over-P90 И robust z>2 И материален), висок дял
 * консултации/наемен труд спрямо персонала и силна зависимост от частни доставчици.
 * Годишните експлозии се смятат отделно (`flagsEsplosione`), защото искат серия.
 * `pbench` = бенчмаркът за групата на `m`; ctx: { scope, consMedianaPers, consP90Pers }.
 * Поведението е ТОЧНО както в предишния inline вариант в main().
 * @param {Metrica} m
 * @param {Bench} pbench
 * @param {{ scope?: string, consMedianaPers?: number|null, consP90Pers?: number|null }} [ctx]
 * @returns {ForFlag[]}
 */
export function flagsBenchmark(m, pbench, ctx = {}) {
  const { scope = 'nazionale', consMedianaPers = null, consP90Pers = null } = ctx;
  /** @type {ForFlag[]} */
  const flags = [];
  const sl = scopeLabel(scope);
  for (const c of CE_FORENSICS) {
    const cell = m.cat[c.key];
    if (!cell || cell.valore < SOGLIA_MATERIALITA) continue;
    const b = pbench[c.key];
    const zQuota = robustZ(cell.quotaCosti, b.quotaMediana, b.quotaMad);
    const overP90 = b.quotaP90 != null && cell.quotaCosti > b.quotaP90;
    if (overP90 && zQuota != null && zQuota > 2) {
      flags.push({
        categoria: c.key,
        tipo: 'outlier_quota',
        label: c.label,
        valore: Math.round(cell.valore),
        testo:
          `${c.label}: ${fmtEur(cell.valore)} = ${pct(cell.quotaCosti)} dei costi, contro una mediana ${sl} del ` +
          `${pct(b.quotaMediana)} (oltre il 90° percentile del gruppo di confronto).`,
        z: round1(zQuota),
      });
    }
  }
  // висок дял консултации/наемен труд спрямо персонала
  const ci = m.cat.consulenzeInterinale;
  const consP90 = pbench._consPersP90 ?? consP90Pers;
  const consMed = pbench._consPersMediana ?? consMedianaPers;
  if (ci && ci.quotaPersonale != null && ci.valore >= SOGLIA_MATERIALITA && ci.quotaPersonale > Math.max(0.2, consP90 ?? 0)) {
    flags.push({
      categoria: 'consulenzeInterinale',
      tipo: 'consulenze_su_personale',
      label: 'Consulenze e lavoro interinale sproporzionati',
      valore: Math.round(ci.valore),
      testo:
        `Consulenze, collaborazioni e interinale pari al ${pct(ci.quotaPersonale)} del costo del personale ` +
        `(${fmtEur(ci.valore)}); mediana ${sl} ${pct(consMed)}. Possibile aggiramento delle assunzioni.`,
      z: null,
    });
  }
  // висока зависимост от частни доставчици
  const pv = m.cat.prestazioniDaPrivato;
  if (pv && pv.valore >= SOGLIA_MATERIALITA) {
    const b = pbench.prestazioniDaPrivato;
    if (b.quotaP90 != null && pv.quotaCosti > b.quotaP90) {
      flags.push({
        categoria: 'prestazioniDaPrivato',
        tipo: 'dipendenza_privato',
        label: 'Forte dipendenza da erogatori privati',
        valore: Math.round(pv.valore),
        testo:
          `Acquisto di prestazioni sanitarie da privati per ${fmtEur(pv.valore)} = ${pct(pv.quotaCosti)} dei costi ` +
          `(oltre il 90° percentile nazionale).`,
        z: null,
      });
    }
  }
  return flags;
}

/**
 * Годишни експлозии на разход за едно предприятие: за всяка категория — скок
 * >60% спрямо предходната година И над +2 mln € абсолютно. `rec` носи .cat/.anno;
 * `prev` е серийният ред за предходната година; `annoPrec` е самата предходна
 * година (само за текста). Поведението е ТОЧНО както в предишния inline вариант.
 * @param {{ cat: Record<string, CatCell>, anno: number }} rec
 * @param {SerieAnno} prev
 * @param {number} annoPrec
 * @returns {ForFlag[]}
 */
export function flagsEsplosione(rec, prev, annoPrec) {
  /** @type {ForFlag[]} */
  const flags = [];
  for (const c of CE_FORENSICS) {
    const now = rec.cat[c.key]?.valore;
    const before = prev[c.key];
    if (now == null || before == null || before <= 0) continue;
    const g = (now - before) / before;
    if (g > 0.6 && now - before > 2_000_000) {
      flags.push({
        categoria: c.key,
        tipo: 'esplosione_annua',
        label: `Esplosione di spesa: ${c.label}`,
        valore: Math.round(now),
        testo:
          `${c.label} +${pct(g)} in un anno: da ${fmtEur(before)} (${annoPrec}) a ${fmtEur(now)} (${rec.anno}).`,
        z: null,
      });
    }
  }
  return flags;
}

/**
 * @typedef {object} SistemaAnno системен резултат за една година
 * @property {number} anno
 * @property {number} aziende
 * @property {number} aziendeInPerdita
 * @property {number} aziendeInUtile
 * @property {number} risultatoAziende
 * @property {number} risultatoGSA
 * @property {number} risultatoConsolidato
 * @property {number} risultatoSistema
 */

/**
 * Част 1: разбор на системния дефицит директно от суровите CE файлове.
 * @returns {Promise<Record<string, SistemaAnno>>}
 */
async function analizzaSistema() {
  const files = (await readdir(BDAP_DIR)).filter((f) => /^ce-\d{4}\.csv$/.test(f)).sort();
  /** @type {Record<string, SistemaAnno>} */
  const perAnno = {};
  for (const file of files) {
    const anno = Number(file.match(/(\d{4})/)?.[1]);
    const rows = parseCsv(await readFile(join(BDAP_DIR, file), 'utf8'), { separator: ';' });
    let aziende = 0;
    let aziendeNeg = 0;
    let risAziende = 0;
    let risGsa = 0;
    let risCons = 0;
    for (const r of rows) {
      if ((r['Codice Voce Contabile'] || '') !== 'ZZ9999') continue;
      const cod = (r['Codice Ente SSN'] || r['Codice Ente'] || '').padStart(3, '0');
      const imp = Number(r['Importo Totale']);
      if (!Number.isFinite(imp)) continue;
      if (cod === '000') risGsa += imp;
      else if (cod === '999') risCons += imp;
      else {
        aziende++;
        risAziende += imp;
        if (imp < 0) aziendeNeg++;
      }
    }
    perAnno[anno] = {
      anno,
      aziende,
      aziendeInPerdita: aziendeNeg,
      aziendeInUtile: aziende - aziendeNeg,
      risultatoAziende: Math.round(risAziende),
      risultatoGSA: Math.round(risGsa),
      risultatoConsolidato: Math.round(risCons),
      // „истински“ системен резултат: предприятия + GSA (регионалното покритие)
      risultatoSistema: Math.round(risAziende + risGsa),
    };
  }
  return perAnno;
}

async function main() {
  const { enti, anagrafica, ultimoAnnoCe } = await loadDataset();
  const sistema = await analizzaSistema();

  // ---- Метрики на последната година за всяко предприятие ----
  /** @type {Metrica[]} */
  const metriche = [];
  for (const ente of enti) {
    const anni = anniConCe(ente);
    if (!anni.length) continue;
    const anno = anni[anni.length - 1];
    const y = ente.serie.get(anno);
    if (!y) continue;
    const costi = y.costiProduzione;
    if (!costi || costi <= 0) continue;
    const letti = postiLettoEnte(ente, anagrafica);
    const ricoveri = ricoveriEnte(ente, anagrafica);
    const classe = classeTipo(ente);
    /** @type {Metrica} */
    const m = {
      codice: ente.codice,
      denominazione: ente.denominazione,
      regione: ente.regione,
      tipo: tipoEnte(ente.codEnte, ente.anag),
      classe,
      peer: `${classe}|${bucketDimensione(costi)}`,
      anno,
      costiProduzione: costi,
      costoPersonale: y.costoPersonale ?? null,
      postiLetto: letti,
      ricoveri,
      cat: {},
    };
    for (const c of CE_FORENSICS) {
      const v = y[c.key];
      if (v == null) continue;
      m.cat[c.key] = {
        valore: v,
        quotaCosti: v / costi, // дял от разходите
        perLetto: letti ? v / letti : null,
      };
    }
    // консултации/наемен труд като дял от персонала
    if (m.cat.consulenzeInterinale && y.costoPersonale > 0) {
      m.cat.consulenzeInterinale.quotaPersonale = m.cat.consulenzeInterinale.valore / y.costoPersonale;
    }
    metriche.push(m);
  }

  // ---- Разпределения по категория: национално + по група-връстници ----
  /**
   * @param {Metrica[]} subset
   * @returns {Bench}
   */
  const buildBench = (subset) => {
    /** @type {Bench} */
    const b = { _n: subset.length };
    for (const c of CE_FORENSICS) {
      const quote = /** @type {number[]} */ (subset.map((m) => m.cat[c.key]?.quotaCosti).filter((v) => v != null));
      const perLetto = /** @type {number[]} */ (subset.map((m) => m.cat[c.key]?.perLetto).filter((v) => v != null));
      const medQ = median(quote);
      b[c.key] = {
        label: c.label,
        quotaMediana: medQ,
        quotaP90: percentile(quote, 90),
        quotaMad: median(quote.map((v) => Math.abs(v - (medQ ?? 0)))),
        perLettoMediana: median(perLetto),
        perLettoP90: percentile(perLetto, 90),
      };
    }
    const cq = /** @type {number[]} */ (subset.map((m) => m.cat.consulenzeInterinale?.quotaPersonale).filter((v) => v != null));
    b._consPersMediana = median(cq);
    b._consPersP90 = percentile(cq, 90);
    return b;
  };
  const bench = buildBench(metriche); // национален (fallback)
  /** @type {Map<string, Metrica[]>} */
  const gruppi = new Map();
  for (const m of metriche) {
    if (!gruppi.has(m.peer)) gruppi.set(m.peer, []);
    gruppi.get(m.peer)?.push(m);
  }
  /** @type {Record<string, Bench>} */
  const benchGruppo = {};
  for (const [g, arr] of gruppi) benchGruppo[g] = buildBench(arr);
  const MIN_PEER = 8; // под този размер групата е нестабилна → национален бенчмарк
  /** @param {Metrica} m */
  const benchFor = (m) => {
    const g = benchGruppo[m.peer];
    return g && (g._n ?? 0) >= MIN_PEER ? { b: g, scope: 'gruppo' } : { b: bench, scope: 'nazionale' };
  };
  const consMedianaPers = bench._consPersMediana;
  const consP90Pers = bench._consPersP90;

  // ---- Флагове за всяко предприятие (чистата логика е в `flagsBenchmark`) ----
  /** @type {Array<Metrica & { flags: ForFlag[] }>} */
  const perEnte = [];
  for (const m of metriche) {
    const { b: pbench, scope } = benchFor(m); // peer или национален
    const flags = flagsBenchmark(m, pbench, { scope, consMedianaPers, consP90Pers });
    // годишните експлозии се добавят в отделна обиколка по-долу (нужна е серията)
    perEnte.push({ ...m, flags });
  }

  // ---- Годишни експлозии (нужен е достъп до серията) ----
  const enteByCod = new Map(enti.map((e) => [e.codice, e]));
  for (const rec of perEnte) {
    const ente = enteByCod.get(rec.codice);
    if (!ente) continue;
    const anni = anniConCe(ente);
    const i = anni.indexOf(rec.anno);
    if (i < 1) continue;
    const prev = ente.serie.get(anni[i - 1]);
    if (!prev) continue;
    rec.flags.push(...flagsEsplosione(rec, prev, anni[i - 1]));
  }

  // ---- Класации (league tables) ----
  const conLetti = perEnte.filter((m) => m.postiLetto);
  const classifiche = {
    consulenzeSuPersonale: topBy(
      perEnte.filter((m) => m.cat.consulenzeInterinale?.quotaPersonale != null && m.cat.consulenzeInterinale.valore >= SOGLIA_MATERIALITA),
      (m) => m.cat.consulenzeInterinale.quotaPersonale ?? 0,
      (m) => ({ valore: m.cat.consulenzeInterinale.valore, extra: m.cat.consulenzeInterinale.quotaPersonale ?? 0 })
    ),
    beniPerLetto: topBy(conLetti.filter((m) => m.cat.beni?.perLetto), (m) => m.cat.beni.perLetto ?? 0, (m) => ({ valore: m.cat.beni.valore, extra: m.cat.beni.perLetto ?? 0 })),
    serviziNonSanitariPerLetto: topBy(conLetti.filter((m) => m.cat.serviziNonSanitari?.perLetto), (m) => m.cat.serviziNonSanitari.perLetto ?? 0, (m) => ({ valore: m.cat.serviziNonSanitari.valore, extra: m.cat.serviziNonSanitari.perLetto ?? 0 })),
    godimentoTerzi: topBy(perEnte.filter((m) => m.cat.godimentoTerzi?.valore >= SOGLIA_MATERIALITA), (m) => m.cat.godimentoTerzi.quotaCosti, (m) => ({ valore: m.cat.godimentoTerzi.valore, extra: m.cat.godimentoTerzi.quotaCosti })),
    dipendenzaPrivato: topBy(perEnte.filter((m) => m.cat.prestazioniDaPrivato?.valore >= SOGLIA_MATERIALITA), (m) => m.cat.prestazioniDaPrivato.quotaCosti, (m) => ({ valore: m.cat.prestazioniDaPrivato.valore, extra: m.cat.prestazioniDaPrivato.quotaCosti })),
  };

  const conFlag = perEnte.filter((m) => m.flags.length > 0);
  conFlag.sort((a, b) => b.flags.length - a.flags.length || (b.cat.consulenzeInterinale?.valore || 0) - (a.cat.consulenzeInterinale?.valore || 0));

  const out = {
    generatoIl: new Date().toISOString(),
    ultimoAnnoCe,
    sistema: {
      perAnno: sistema,
      nota:
        'Il risultato delle aziende è in gran parte compensato dalla Gestione Sanitaria Accentrata regionale (GSA, ' +
        'codice 000): il disavanzo “vero” del sistema è aziende + GSA. Non tutte le aziende sono in perdita.',
    },
    categorie: CE_FORENSICS.map((c) => ({ key: c.key, label: c.label })),
    benchmark: bench,
    benchmarkConsulenze: { medianaSuPersonale: consMedianaPers, p90SuPersonale: consP90Pers },
    classifiche,
    entiConFlag: conFlag.length,
    totaleFlag: perEnte.reduce((s, m) => s + m.flags.length, 0),
    peerGruppi: Object.fromEntries([...gruppi.entries()].map(([g, arr]) => [g, arr.length])),
    enti: perEnte.map((m) => ({
      codice: m.codice,
      denominazione: m.denominazione,
      regione: m.regione,
      classe: m.classe,
      peer: m.peer,
      anno: m.anno,
      costiProduzione: Math.round(m.costiProduzione),
      postiLetto: m.postiLetto,
      cat: Object.fromEntries(
        Object.entries(m.cat).map(([k, v]) => [
          k,
          { valore: Math.round(v.valore), quotaCosti: v.quotaCosti, perLetto: v.perLetto ? Math.round(v.perLetto) : null, quotaPersonale: v.quotaPersonale ?? null },
        ])
      ),
      flags: m.flags,
    })),
  };
  await writeJson(FORENSICS_FILE, out);

  const s2024 = sistema[ultimoAnnoCe];
  console.log(
    `Готово: система ${ultimoAnnoCe} — предприятия ${s2024.aziendeInPerdita}/${s2024.aziende} на загуба, ` +
      `резултат предприятия ${eurMld(s2024.risultatoAziende)}, GSA ${eurMld(s2024.risultatoGSA)}, ` +
      `система ${eurMld(s2024.risultatoSistema)}.`
  );
  console.log(`Форензик флагове: ${out.totaleFlag} за ${out.entiConFlag} предприятия → ${FORENSICS_FILE}`);
}

/**
 * @template {{ codice: string, denominazione: string, regione: string }} T
 * @param {T[]} arr
 * @param {(m: T) => number} keyFn
 * @param {(m: T) => { valore: number, extra: number }} extraFn
 * @param {number} [n]
 */
function topBy(arr, keyFn, extraFn, n = 20) {
  return arr
    .map((m) => ({ codice: m.codice, denominazione: m.denominazione, regione: m.regione, valoreMetrica: keyFn(m), ...extraFn(m) }))
    .sort((a, b) => b.valoreMetrica - a.valoreMetrica)
    .slice(0, n);
}

const fmtEurI = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPctI = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 });
/** @param {number|null|undefined} v @returns {string} */
function fmtEur(v) {
  return v == null ? '—' : fmtEurI.format(Math.round(v));
}
/** @param {number|null|undefined} v @returns {string} */
function pct(v) {
  return v == null ? '—' : fmtPctI.format(v);
}
/** @param {number|null|undefined} v @returns {number|null} */
function round1(v) {
  return v == null ? null : Math.round(v * 10) / 10;
}
/** @param {number} v @returns {string} */
function eurMld(v) {
  return (v / 1e9).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' mld €';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}

export { median, percentile, robustZ, analizzaSistema };
