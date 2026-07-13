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
import { readFile, mkdir, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseCsv } from './lib/csv.js';
import { curlDownloadToFile, writeJson, readJson } from './lib/http.js';
import { RAW_DIR, DATA_DIR, ROOT } from './lib/paths.js';

const execFileAsync = promisify(execFile);
const ANAC_DIR = join(RAW_DIR, 'anac');
const APPALTI_FILE = join(DATA_DIR, 'appalti.json');
const BASE = 'https://dati.anticorruzione.it/opendata/download/dataset';
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' };

// Здравни възложители (по денонимация). Прецизно включване + стеснена FONDAZIONE,
// за да хванем всички регионални варианти (ATS, ARES, APSS, Sanitätsbetrieb, USL…)
// без да вмъкваме нездравни субекти (ACER, Sport e Salute, ISS…).
const HEALTH =
  /AZIENDA (OSPEDALIER|SANITARIA|SOCIO|UNITA|USL|ULSS|PROVINCIALE PER I SERVIZI SANITARI|REGIONALE DELLA SALUTE|LIGURE SANITARIA)|OSPEDALIER|OSPEDALI RIUN|A\.?O\.?U|\bA\.?S\.?L\b|\bA\.?S\.?S\.?T\b|\bA\.?U\.?L\.?S\.?S\b|\bASUR\b|\bASUGI\b|\bASUFC\b|\bAPSS\b|IRCCS|POLICLINICO|ISTITUTO (ONCOLOGICO|NAZIONALE|ORTOPEDICO|TUMORI|NEUROLOGICO)|FONDAZIONE\s+(IRCCS|POLICLINICO|OSPEDAL|ISTITUTO)|ESTAR|ESTAV|SORESA|AZIENDA ZERO|EGAS|ARNAS|ENTE OSPEDALIERO|AGENZIA (DI )?TUTELA DELLA SALUTE|AGENZIA REGIONALE STRATEGICA PER LA SALUTE|A\.?RE\.?S\.?S|\bUNITA'? SANITARIA LOCALE\b|SANITAETSBETRIEB|EMERGENZA SANITARIA|\bAREU\b|\bA\.?LI\.?SA\b|AZIENDA REGIONALE PER LA SALUTE/;
// Изрично изключване на нездравни субекти, случайно уловени от общи думи.
const NOT_HEALTH = /ACQUE|SPORT E SALUTE|ISTITUTO SUPERIORE DI SANIT|\bMINISTERO\b|CARABINIER|\bCOMUNE\b|\bUNIONE\b|BONIFICA|AZIENDA CASA|\bA\.?C\.?E\.?R\b|\bSTART\b|INFORMATICA|VIGILI DEL FUOCO|SOCIETA DELLE FONTI/;

/** Категория на процедурата: конкурентна / рамково / пряко / договаряне без обявление. */
function catProc(t) {
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
  return { n: 0, importo: 0, cat, urgenzaN: 0, pnrrImporto: 0 };
}
function addTo(agg, categoria, importo, urgenza, pnrr) {
  agg.n++;
  agg.importo += importo;
  agg.cat[categoria].n++;
  agg.cat[categoria].importo += importo;
  if (urgenza) agg.urgenzaN++;
  if (pnrr) agg.pnrrImporto += importo;
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

async function processMonth(anno, mese, regionale, autorita, seenCig) {
  const mm = String(mese).padStart(2, '0');
  const zipName = `cig_csv_${anno}_${mm}.zip`;
  const zipPath = join(ANAC_DIR, zipName);
  const url = `${BASE}/cig-${anno}/filesystem/${zipName}`;
  let fresh;
  try {
    fresh = await curlDownloadToFile(url, zipPath, { headers: UA, timeoutSec: 240 });
  } catch (err) {
    console.warn(`  пропускам ${anno}-${mm}: ${err.message}`);
    return 0;
  }
  await execFileAsync('unzip', ['-o', zipPath, '-d', ANAC_DIR]);
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
      const importo = Number(r.importo_lotto || r.importo_complessivo_gara);
      if (!Number.isFinite(importo) || importo <= 0 || importo > IMPORTO_MAX_VALIDO) continue;
      const categoria = catProc(r.tipo_scelta_contraente);
      const urgenza = (r.FLAG_URGENZA || '').trim() === '1';
      const pnrr = (r.FLAG_PNRR_PNC || '').trim() === '1';
      const regK = (r.sezione_regionale || '').replace('SEZIONE REGIONALE ', '').trim() || 'ND';
      if (!regionale[regK]) regionale[regK] = emptyAgg();
      addTo(regionale[regK], categoria, importo, urgenza, pnrr);

      const cf = (r.cf_amministrazione_appaltante || '').trim();
      if (!cf) continue;
      let a = autorita[cf];
      if (!a) {
        a = { cf, den, reg: regK, ...emptyAgg(), top: [] };
        autorita[cf] = a;
      }
      addTo(a, categoria, importo, urgenza, pnrr);
      // топ договори по стойност (пазим до 10)
      if (a.top.length < 10 || importo > a.top[a.top.length - 1].importo) {
        a.top.push({
          oggetto: (r.oggetto_lotto || r.oggetto_gara || '').slice(0, 180),
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
  let totale = 0;
  for (const anno of anni) {
    console.log(`Anno ${anno}…`);
    for (let m = 1; m <= 12; m++) totale += await processMonth(anno, m, regionale, autorita, seenCig);
  }

  // Финализиране: изчисляваме дяловете и подреждаме
  const regList = Object.entries(regionale)
    .map(([reg, a]) => ({ reg, ...summary(a) }))
    .sort((x, y) => y.importo - x.importo);
  const autList = Object.values(autorita)
    .filter((a) => a.importo > 0)
    .map((a) => ({ cf: a.cf, den: a.den, reg: a.reg, ...summary(a), top: a.top }))
    .sort((x, y) => y.importo - x.importo);

  const nazionale = emptyAgg();
  for (const a of Object.values(autorita)) {
    nazionale.n += a.n;
    nazionale.importo += a.importo;
    nazionale.urgenzaN += a.urgenzaN;
    nazionale.pnrrImporto += a.pnrrImporto;
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
