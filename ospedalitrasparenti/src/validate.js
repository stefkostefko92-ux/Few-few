// Одит и възпроизводимост: проверки за консистентност + провенанс на входа.
// Прави пайплайна проверим — резултатите могат да се сверят и възпроизведат.
//
//  1) Счетоводна консистентност на CE (тъждествата на модела за резултата);
//  2) Здравноразумни проверки (несъстоятелни отрицателни/липсващи стойности);
//  3) Покритие (колко структури имат CE/SP/анаграфика/ANAC/изпълнители);
//  4) Провенанс: размер, SHA-256 и брой редове на входните файлове.
//
// Изход: data/validazione.json (+ отчет на конзолата).

// @ts-check
import { join } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { loadDataset, anniConCe } from './lib/dataset.js';
import { matchAutoritaEnti } from './lib/match.js';
import { readJson, writeJson } from './lib/http.js';
import { RAW_DIR, DATA_DIR, ANAGRAFICA_FILE } from './lib/paths.js';

/** @typedef {import('./lib/dataset.js').SerieAnno} SerieAnno */

/** @param {number} v @returns {number} */
const TOLL = (v) => Math.max(1000, Math.abs(v) * 0.001); // толеранс: 1000€ или 0.1%

/**
 * Проверка на тъждествата на CE модела за една година.
 * @param {SerieAnno} y
 * @returns {boolean|null}
 */
function ceIdentita(y) {
  if (y.valoreProduzione == null || y.costiProduzione == null) return null;
  const checks = [];
  if (y._risPrimaImposte != null) {
    const calc = y.valoreProduzione - y.costiProduzione + (y._provOneriFin || 0) + (y._rettifiche || 0) + (y._straordinari || 0);
    checks.push(Math.abs(calc - y._risPrimaImposte) <= TOLL(y._risPrimaImposte));
  }
  if (y._risPrimaImposte != null && y.risultatoEsercizio != null) {
    const calc = y._risPrimaImposte - (y._imposte || 0);
    checks.push(Math.abs(calc - y.risultatoEsercizio) <= TOLL(y.risultatoEsercizio));
  }
  if (!checks.length) return null;
  return checks.every(Boolean);
}

/**
 * @param {string} path
 * @returns {Promise<{ bytes: number, sha256: string, righe: number }>}
 */
async function fileProvenance(path) {
  const st = await stat(path);
  const hash = createHash('sha256');
  let righe = 0;
  await new Promise((res, rej) => {
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    rl.on('line', (l) => {
      righe++;
      hash.update(l);
    });
    rl.on('close', res);
    rl.on('error', rej);
  });
  return { bytes: st.size, sha256: hash.digest('hex').slice(0, 16), righe };
}

async function main() {
  const { enti, anagrafica, ultimoAnnoCe } = await loadDataset();

  // 1) Счетоводна консистентност на CE
  let ceTot = 0;
  let cePass = 0;
  /** @type {Array<{ codice: string, anno: number }>} */
  const ceFail = [];
  for (const e of enti) {
    for (const [anno, y] of e.serie) {
      const ok = ceIdentita(y);
      if (ok == null) continue;
      ceTot++;
      if (ok) cePass++;
      else if (ceFail.length < 20) ceFail.push({ codice: e.codice, anno });
    }
  }

  // 2) Здравноразумни проверки
  const sanita = { valoreNegativo: 0, costiNegativi: 0, deficitOltreRicavi: 0, debitiNegativi: 0 };
  for (const e of enti) {
    for (const [, y] of e.serie) {
      if (y.valoreProduzione != null && y.valoreProduzione < 0) sanita.valoreNegativo++;
      if (y.costiProduzione != null && y.costiProduzione < 0) sanita.costiNegativi++;
      if (y.valoreProduzione > 0 && y.risultatoEsercizio != null && y.risultatoEsercizio < -y.valoreProduzione)
        sanita.deficitOltreRicavi++;
      if (y.debiti != null && y.debiti < 0) sanita.debitiNegativi++;
    }
  }

  // 3) Покритие
  const struttureByCod = new Map(anagrafica.strutture.map((s) => [s.codice, s]));
  const aziendeByCod = new Map(anagrafica.aziende.map((a) => [a.codice, a]));
  const appalti = await readJson(join(DATA_DIR, 'appalti.json')).catch(() => null);
  const aggiu = await readJson(join(DATA_DIR, 'aggiudicatari.json')).catch(() => null);
  let matchCov = null;
  if (appalti) {
    const { byCodice } = matchAutoritaEnti(
      enti.map((e) => ({ codice: e.codice, denominazione: e.denominazione, regione: e.regione })),
      appalti.autorita.map((/** @type {{ cf: string, den: string, reg: string }} */ a) => ({ cf: a.cf, den: a.den, reg: a.reg }))
    );
    matchCov = byCodice;
  }
  const copertura = {
    entiTotali: enti.length,
    conCE: enti.filter((e) => anniConCe(e).length > 0).length,
    conSP: enti.filter((e) => [...e.serie.values()].some((y) => y.patrimonioNetto != null)).length,
    conAnagrafe: enti.filter((e) => aziendeByCod.has(e.codice) || struttureByCod.has(e.codice)).length,
    conAppaltiANAC: matchCov ? matchCov.size : 0,
    /** @type {number|null} */
    conAggiudicatari: null,
  };
  // conAggiudicatari: колко свързани болници имат и данни за изпълнители
  if (matchCov && aggiu) {
    let n = 0;
    for (const cf of matchCov.values()) if (aggiu.perCf[cf]) n++;
    copertura.conAggiudicatari = n;
  }

  // 4) Провенанс на входните файлове
  /** @type {Array<{ file: string, bytes: number, sha256: string, righe: number|null }>} */
  const provenance = [];
  const bdapDir = join(RAW_DIR, 'bdap');
  for (const f of (await readdir(bdapDir).catch(() => [])).filter((f) => f.endsWith('.csv')).sort()) {
    provenance.push({ file: `bdap/${f}`, ...(await fileProvenance(join(bdapDir, f))) });
  }
  const saluteDir = join(RAW_DIR, 'salute');
  for (const f of (await readdir(saluteDir).catch(() => [])).filter((f) => f.endsWith('.csv')).sort()) {
    provenance.push({ file: `salute/${f}`, ...(await fileProvenance(join(saluteDir, f))) });
  }
  const anacDir = join(RAW_DIR, 'anac');
  for (const f of ['aggiudicatari.zip', 'partecipanti.zip']) {
    const p = join(anacDir, f);
    const ex = await stat(p).catch(() => null);
    if (ex) provenance.push({ file: `anac/${f}`, bytes: ex.size, sha256: '(zip)', righe: null });
  }

  const out = {
    generatoIl: new Date().toISOString(),
    ultimoAnnoCe,
    consistenzaCE: {
      identitaVerificate: ceTot,
      superate: cePass,
      quotaSuperata: ceTot ? cePass / ceTot : null,
      fallite: ceFail,
      nota: 'Verifica interna: risultato prima imposte = A − B ± C ± D ± E; risultato = risultato prima imposte − imposte.',
    },
    sanita,
    copertura,
    provenance,
  };
  await writeJson(join(DATA_DIR, 'validazione.json'), out);
  console.log(
    `CE консистентност: ${cePass}/${ceTot} (${(100 * cePass / ceTot).toFixed(2)}%). ` +
      `Покритие ANAC: ${copertura.conAppaltiANAC}/${copertura.entiTotali}, изпълнители: ${copertura.conAggiudicatari}. ` +
      `Провенанс: ${provenance.length} входни файла. → data/validazione.json`
  );
  if (sanita.valoreNegativo || sanita.costiNegativi || sanita.debitiNegativi)
    console.warn('Внимание: несъстоятелни стойности:', sanita);
}

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
