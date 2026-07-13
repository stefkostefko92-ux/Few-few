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

const BDAP_DIR = join(RAW_DIR, 'bdap');
const FORENSICS_FILE = join(DATA_DIR, 'forensics.json');

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentile(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
/** Robust z-score чрез медиана и MAD (устойчив на екстремни стойности). */
function robustZ(v, med, mad) {
  if (v == null || med == null || !mad) return null;
  return (v - med) / (1.4826 * mad);
}

/** Част 1: разбор на системния дефицит директно от суровите CE файлове. */
async function analizzaSistema() {
  const files = (await readdir(BDAP_DIR)).filter((f) => /^ce-\d{4}\.csv$/.test(f)).sort();
  const perAnno = {};
  for (const file of files) {
    const anno = Number(file.match(/(\d{4})/)[1]);
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
  const metriche = [];
  for (const ente of enti) {
    const anni = anniConCe(ente);
    if (!anni.length) continue;
    const anno = anni.at(-1);
    const y = ente.serie.get(anno);
    const costi = y.costiProduzione;
    if (!costi || costi <= 0) continue;
    const letti = postiLettoEnte(ente, anagrafica);
    const ricoveri = ricoveriEnte(ente, anagrafica);
    const m = {
      codice: ente.codice,
      denominazione: ente.denominazione,
      regione: ente.regione,
      tipo: tipoEnte(ente.codEnte, ente.anag),
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

  // ---- Национални връстнически разпределения по категория ----
  const bench = {};
  for (const c of CE_FORENSICS) {
    const quote = metriche.map((m) => m.cat[c.key]?.quotaCosti).filter((v) => v != null);
    const perLetto = metriche.map((m) => m.cat[c.key]?.perLetto).filter((v) => v != null);
    const medQ = median(quote);
    const madQ = median(quote.map((v) => Math.abs(v - medQ)));
    const medL = median(perLetto);
    const madL = median(perLetto.map((v) => Math.abs(v - medL)));
    bench[c.key] = {
      label: c.label,
      quotaMediana: medQ,
      quotaP90: percentile(quote, 90),
      quotaMad: madQ,
      perLettoMediana: medL,
      perLettoP90: percentile(perLetto, 90),
      perLettoMad: madL,
    };
  }
  const consQuote = metriche.map((m) => m.cat.consulenzeInterinale?.quotaPersonale).filter((v) => v != null);
  const consMedianaPers = median(consQuote);
  const consP90Pers = percentile(consQuote, 90);

  // ---- Флагове за всяко предприятие ----
  const SOGLIA_MATERIALITA = 1_000_000; // под този абсолют не вдигаме шум
  const perEnte = [];
  for (const m of metriche) {
    const flags = [];
    for (const c of CE_FORENSICS) {
      const cell = m.cat[c.key];
      if (!cell || cell.valore < SOGLIA_MATERIALITA) continue;
      const b = bench[c.key];
      const zQuota = robustZ(cell.quotaCosti, b.quotaMediana, b.quotaMad);
      const overP90 = b.quotaP90 != null && cell.quotaCosti > b.quotaP90;
      if (overP90 && zQuota != null && zQuota > 2) {
        flags.push({
          categoria: c.key,
          tipo: 'outlier_quota',
          label: c.label,
          valore: Math.round(cell.valore),
          testo:
            `${c.label}: ${fmtEur(cell.valore)} = ${pct(cell.quotaCosti)} dei costi, contro una mediana nazionale del ` +
            `${pct(b.quotaMediana)} (oltre il 90° percentile).`,
          z: round1(zQuota),
        });
      }
    }
    // висок дял консултации/наемен труд спрямо персонала
    const ci = m.cat.consulenzeInterinale;
    if (ci && ci.quotaPersonale != null && ci.valore >= SOGLIA_MATERIALITA && ci.quotaPersonale > Math.max(0.2, consP90Pers)) {
      flags.push({
        categoria: 'consulenzeInterinale',
        tipo: 'consulenze_su_personale',
        label: 'Consulenze e lavoro interinale sproporzionati',
        valore: Math.round(ci.valore),
        testo:
          `Consulenze, collaborazioni e interinale pari al ${pct(ci.quotaPersonale)} del costo del personale ` +
          `(${fmtEur(ci.valore)}); mediana nazionale ${pct(consMedianaPers)}. Possibile aggiramento delle assunzioni.`,
        z: null,
      });
    }
    // висока зависимост от частни доставчици
    const pv = m.cat.prestazioniDaPrivato;
    if (pv && pv.valore >= SOGLIA_MATERIALITA) {
      const b = bench.prestazioniDaPrivato;
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
    // годишните експлозии се добавят в отделна обиколка по-долу (нужна е серията)
    perEnte.push({ ...m, flags });
  }

  // ---- Годишни експлозии (нужен е достъп до серията) ----
  const enteByCod = new Map(enti.map((e) => [e.codice, e]));
  for (const rec of perEnte) {
    const ente = enteByCod.get(rec.codice);
    const anni = anniConCe(ente);
    const i = anni.indexOf(rec.anno);
    if (i < 1) continue;
    const prev = ente.serie.get(anni[i - 1]);
    for (const c of CE_FORENSICS) {
      const now = rec.cat[c.key]?.valore;
      const before = prev[c.key];
      if (now == null || before == null || before <= 0) continue;
      const g = (now - before) / before;
      if (g > 0.6 && now - before > 2_000_000) {
        rec.flags.push({
          categoria: c.key,
          tipo: 'esplosione_annua',
          label: `Esplosione di spesa: ${c.label}`,
          valore: Math.round(now),
          testo:
            `${c.label} +${pct(g)} in un anno: da ${fmtEur(before)} (${anni[i - 1]}) a ${fmtEur(now)} (${rec.anno}).`,
          z: null,
        });
      }
    }
  }

  // ---- Класации (league tables) ----
  const conLetti = perEnte.filter((m) => m.postiLetto);
  const classifiche = {
    consulenzeSuPersonale: topBy(
      perEnte.filter((m) => m.cat.consulenzeInterinale?.quotaPersonale != null && m.cat.consulenzeInterinale.valore >= SOGLIA_MATERIALITA),
      (m) => m.cat.consulenzeInterinale.quotaPersonale,
      (m) => ({ valore: m.cat.consulenzeInterinale.valore, extra: m.cat.consulenzeInterinale.quotaPersonale })
    ),
    beniPerLetto: topBy(conLetti.filter((m) => m.cat.beni?.perLetto), (m) => m.cat.beni.perLetto, (m) => ({ valore: m.cat.beni.valore, extra: m.cat.beni.perLetto })),
    serviziNonSanitariPerLetto: topBy(conLetti.filter((m) => m.cat.serviziNonSanitari?.perLetto), (m) => m.cat.serviziNonSanitari.perLetto, (m) => ({ valore: m.cat.serviziNonSanitari.valore, extra: m.cat.serviziNonSanitari.perLetto })),
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
    enti: perEnte.map((m) => ({
      codice: m.codice,
      denominazione: m.denominazione,
      regione: m.regione,
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

function topBy(arr, keyFn, extraFn, n = 20) {
  return arr
    .map((m) => ({ codice: m.codice, denominazione: m.denominazione, regione: m.regione, valoreMetrica: keyFn(m), ...extraFn(m) }))
    .sort((a, b) => b.valoreMetrica - a.valoreMetrica)
    .slice(0, n);
}

const fmtEurI = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPctI = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 });
function fmtEur(v) {
  return v == null ? '—' : fmtEurI.format(Math.round(v));
}
function pct(v) {
  return v == null ? '—' : fmtPctI.format(v);
}
function round1(v) {
  return v == null ? null : Math.round(v * 10) / 10;
}
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
