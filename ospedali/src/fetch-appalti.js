// Изтегля обществените поръчки (CIG) от ANAC — dati.anticorruzione.it — за
// избраните години, филтрира здравните възложители и агрегира:
//   – по регион (за сравнение, 100% надеждно, без свързване по име);
//   – по възложител (codice fiscale) — за свързване с болниците по-късно.
//
// Ключов сигнал: делът на стойността, възложена БЕЗ конкуренция
// („affidamento diretto“ + „procedura negoziata senza pubblicazione“), извън
// рамковите споразумения/конвенции (които са предварително състезани).
//
// Данните са месечни ZIP файлове (~6 MB); теглим ги в кеш и обработваме един по
// един, като триём разархивирания CSV, за да пестим диск.
//
// Изход: data/appalti.json.

import { join } from 'node:path';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseCsv } from './lib/csv.js';
import { curlDownloadToFile, writeJson, readJson } from './lib/http.js';
import { RAW_DIR, DATA_DIR, ROOT } from './lib/paths.js';
import { HEALTH, NOT_HEALTH } from './lib/enti-ssn.js';

const execFileAsync = promisify(execFile);
const ANAC_DIR = join(RAW_DIR, 'anac');
const APPALTI_FILE = join(DATA_DIR, 'appalti.json');
const BASE = 'https://dati.anticorruzione.it/opendata/download/dataset';
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' };

// HEALTH/NOT_HEALTH regex-ите живеят в src/lib/enti-ssn.js (споделени с
// storico.js и fetch-perlapa.js). Тук са ЗАМРАЗЕНИ launch данни — не пипай.

/** Категория на процедурата: конкурентна / рамково / пряко / договаряне без обявление. */
export function catProc(t) {
  const u = (t || '').toUpperCase();
  if (u.includes('ADESIONE AD ACCORDO QUADRO') || u.includes('CONVENZIONE')) return 'quadro';
  if (u.startsWith('AFFIDAMENTO DIRETTO')) return 'diretto';
  if (u.includes('NEGOZIATA SENZA')) return 'negoziataSenza';
  if (
    u.includes('APERTA') || u.includes('RISTRETTA') || u.includes('PROCEDURA DI GARA') ||
    u.includes('CON PREVIA INDIZIONE') || u.includes('DIALOGO') || u.includes('CONFRONTO COMPETITIVO') ||
    u.includes('COMPETITIVA CON NEGOZIAZIONE')
  ) return 'competitiva';
  if (u.includes('NEGOZIATA')) return 'negoziata';
  return 'altro';
}
const CATS = ['competitiva', 'quadro', 'diretto', 'negoziataSenza', 'negoziata', 'altro'];

function emptyAgg() {
  const cat = {};
  for (const c of CATS) cat[c] = { n: 0, importo: 0 };
  // band40/band140 = преки възлагания точно под праговете (frazionamento);
  // prorogaN = удължавания/подновявания без нов търг
  return { n: 0, importo: 0, cat, urgenzaN: 0, pnrrImporto: 0, band40: 0, band140: 0, prorogaN: 0 };
}
const PROROGA = /\bPROROG|\bRINNOV|\bPROSECUZION|\bESTENSION/i;
function addTo(agg, categoria, importo, urgenza, pnrr, oggetto) {
  agg.n++;
  agg.importo += importo;
  agg.cat[categoria].n++;
  agg.cat[categoria].importo += importo;
  if (urgenza) agg.urgenzaN++;
  if (pnrr) agg.pnrrImporto += importo;
  if (categoria === 'diretto') {
    if (importo >= 35_000 && importo < 40_000) agg.band40++;
    if (importo >= 130_000 && importo < 140_000) agg.band140++;
  }
  if (oggetto && PROROGA.test(oggetto)) agg.prorogaN++;
}
/** Дял на СТОЙНОСТТА без реална конкуренция (пряко + договаряне без обявление). */
function quotaSenzaGara(agg) {
  if (agg.importo <= 0) return null;
  return (agg.cat.diretto.importo + agg.cat.negoziataSenza.importo) / agg.importo;
}
/** Дял по БРОЙ договори (устойчив на аномални суми — основен показател). */
function quotaSenzaGaraNum(agg) {
  if (agg.n <= 0) return null;
  return (agg.cat.diretto.n + agg.cat.negoziataSenza.n) / agg.n;
}

// Записи с абсурдна стойност (напр. пряко възлагане за милиарди) са грешки в
// източника и се изхвърлят, за да не изкривяват стойностните агрегати.
const IMPORTO_MAX_VALIDO = 1_000_000_000;

async function processMonth(anno, mese, regionale, autorita, seenCig, cigCf) {
  const mm = String(mese).padStart(2, '0');
  const zipName = `cig_csv_${anno}_${mm}.zip`;
  const zipPath = join(ANAC_DIR, zipName);
  const url = `${BASE}/cig-${anno}/filesystem/${zipName}`;
  let fresh;
  try {
    fresh = await curlDownloadToFile(url, zipPath, { headers: UA, timeoutSec: 240, expectZip: true });
  } catch (err) {
    console.warn(`  пропускам ${anno}-${mm} (сваляне): ${err.message}`);
    return -1; // провал → брои се, за да не мине за тих 0
  }
  // Разархивирането може да гръмне при повреден/отрязан ZIP → не проваляй целия
  // пробег, а изтрий боклучавия кеш, отчети провала и продължи със следващия месец.
  try {
    await execFileAsync('unzip', ['-o', zipPath, '-d', ANAC_DIR]);
  } catch (err) {
    console.warn(`  пропускам ${anno}-${mm} (разархивиране): ${err.message}`);
    await rm(zipPath, { force: true });
    return -1;
  }
  const csvPath = join(ANAC_DIR, `cig_csv_${anno}_${mm}.csv`);
  let righe = 0;
  try {
    const rows = parseCsv(await readFile(csvPath, 'utf8'), { separator: ';' });
    for (const r of rows) {
      const den = r.denominazione_amministrazione_appaltante || '';
      const denU = den.toUpperCase();
      if (!HEALTH.test(denU) || NOT_HEALTH.test(denU)) continue;
      // дедупликация: един CIG (лот) се брои веднъж, дори да се преповтаря
      // в delta ъпдейти през месеците
      const cig = (r.cig || '').trim();
      if (cig) {
        if (seenCig.has(cig)) continue;
        seenCig.add(cig);
      }
      // При многолотова гара importo_complessivo_gara е стойността на ЦЯЛАТА гара —
      // не бива да пада на нея per лот (би броила N пъти). Fallback само при 1 лот.
      const unLotto = (r.n_lotti_componenti || '').trim() === '1';
      const importo = Number(r.importo_lotto || (unLotto ? r.importo_complessivo_gara : 0));
      if (!Number.isFinite(importo) || importo <= 0 || importo > IMPORTO_MAX_VALIDO) continue;
      const categoria = catProc(r.tipo_scelta_contraente);
      const urgenza = (r.FLAG_URGENZA || '').trim() === '1';
      const pnrr = (r.FLAG_PNRR_PNC || '').trim() === '1';
      const oggetto0 = r.oggetto_lotto || r.oggetto_gara || '';
      const regK = (r.sezione_regionale || '').replace('SEZIONE REGIONALE ', '').trim() || 'ND';
      if (!regionale[regK]) regionale[regK] = emptyAgg();
      addTo(regionale[regK], categoria, importo, urgenza, pnrr, oggetto0);

      const cf = (r.cf_amministrazione_appaltante || '').trim();
      if (!cf) continue;
      // за свързване с изпълнителите/участниците: cig → cf, категория, сума
      if (cig) cigCf.set(cig, `${cf}\t${categoria}\t${Math.round(importo)}`);
      let a = autorita[cf];
      if (!a) {
        a = { cf, den, reg: regK, ...emptyAgg(), top: [] };
        autorita[cf] = a;
      }
      addTo(a, categoria, importo, urgenza, pnrr, oggetto0);
      // топ договори по стойност (пазим до 10)
      if (a.top.length < 10 || importo > a.top[a.top.length - 1].importo) {
        a.top.push({
          oggetto: oggetto0.slice(0, 180),
          importo,
          procedura: r.tipo_scelta_contraente || '',
          categoria,
          cpv: r.descrizione_cpv || '',
          data: r.data_pubblicazione || `${anno}-${mm}`,
        });
        a.top.sort((x, y) => y.importo - x.importo);
        if (a.top.length > 10) a.top.length = 10;
      }
      righe++;
    }
  } finally {
    await rm(csvPath, { force: true }); // пестим диск
  }
  console.log(`  ${anno}-${mm}: ${fresh ? 'свалено' : 'кеш'}, здравни редове ${righe}`);
  return righe;
}

async function main() {
  const config = await readJson(join(ROOT, 'config.json'));
  const anni = config.anacAnni || [2023, 2024];
  await mkdir(ANAC_DIR, { recursive: true });

  const regionale = {};
  const autorita = {};
  const seenCig = new Set();
  const cigCf = new Map(); // cig → cf на здравния възложител (за aggiudicatari/partecipanti)
  let totale = 0;
  let falliti = 0; // месеци, които не се свалиха/разархивираха (частичен агрегат)
  for (const anno of anni) {
    console.log(`Anno ${anno}…`);
    for (let m = 1; m <= 12; m++) {
      const r = await processMonth(anno, m, regionale, autorita, seenCig, cigCf);
      if (r < 0) falliti++;
      else totale += r;
    }
  }

  // Записваме картата CIG→CF/категория/сума за следващата стъпка (изпълнители/участници)
  const cigCfLines = [];
  for (const [cig, rest] of cigCf) cigCfLines.push(`${cig}\t${rest}`);
  await writeFile(join(ANAC_DIR, 'health-cig-cf.tsv'), cigCfLines.join('\n') + '\n');

  // Финализиране: изчисляваме дяловете и подреждаме
  const regList = Object.entries(regionale)
    .map(([reg, a]) => ({ reg, ...summary(a) }))
    .sort((x, y) => y.importo - x.importo);
  const autList = Object.values(autorita)
    .filter((a) => a.importo > 0)
    .map((a) => ({ cf: a.cf, den: a.den, reg: a.reg, ...summary(a), top: a.top }))
    .sort((x, y) => y.importo - x.importo);

  // Националното се сумира от РЕГИОНАЛНОТО (пълно, вкл. редове без CF), за да се
  // равнява с регионалния изглед; per-възложител остава подмножество (само с CF).
  const nazionale = emptyAgg();
  for (const a of Object.values(regionale)) {
    nazionale.n += a.n;
    nazionale.importo += a.importo;
    nazionale.urgenzaN += a.urgenzaN;
    nazionale.pnrrImporto += a.pnrrImporto;
    nazionale.band40 += a.band40;
    nazionale.band140 += a.band140;
    nazionale.prorogaN += a.prorogaN;
    for (const c of CATS) {
      nazionale.cat[c].n += a.cat[c].n;
      nazionale.cat[c].importo += a.cat[c].importo;
    }
  }

  await writeJson(APPALTI_FILE, {
    generatoIl: new Date().toISOString(),
    anni,
    fonte: 'ANAC — Banca Dati Nazionale dei Contratti Pubblici (dati.anticorruzione.it), CIG > 40.000 €',
    righeSanitarie: totale,
    autoritaSanitarie: autList.length,
    nazionale: summary(nazionale),
    regionale: regList,
    autorita: autList,
  });
  const nz = summary(nazionale);
  console.log(
    `Готово: ${totale} здравни поръчки, ${autList.length} възложителя, ` +
      `${(nz.importo / 1e9).toFixed(1)} mld €; senza gara ${(nz.quotaSenzaGara * 100).toFixed(1)}% → ${APPALTI_FILE}`
  );
  if (falliti > 0) {
    console.warn(
      `⚠ WARN: ${falliti} месец(а) се провали(ха) (сваляне/разархивиране) — ` +
        `агрегатът в ${APPALTI_FILE} е ЧАСТИЧЕН. Провери логовете по-горе и пусни наново.`
    );
  }
}

function summary(a) {
  const cat = {};
  for (const c of CATS) cat[c] = { n: a.cat[c].n, importo: Math.round(a.cat[c].importo) };
  return {
    n: a.n,
    importo: Math.round(a.importo),
    cat,
    urgenzaN: a.urgenzaN,
    pnrrImporto: Math.round(a.pnrrImporto),
    band40: a.band40,
    band140: a.band140,
    prorogaN: a.prorogaN,
    // дял на преките възлагания точно под праговете (индикатор за frazionamento)
    bunchingQuota: a.cat.diretto.n > 0 ? (a.band40 + a.band140) / a.cat.diretto.n : null,
    quotaSenzaGara: quotaSenzaGara(a),
    quotaSenzaGaraNum: quotaSenzaGaraNum(a),
  };
}

// позволяваме повторно ползване без сваляне (за диагностика)
export async function existingAppalti() {
  return readJson(APPALTI_FILE).catch(() => null);
}
export async function listCache() {
  return readdir(ANAC_DIR).catch(() => []);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
