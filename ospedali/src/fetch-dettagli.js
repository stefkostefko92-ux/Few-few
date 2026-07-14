// Пълен опис на договорите за всяка свързана болница — „маниакален детайл“:
// за всеки CIG (лот) — предмет, дата, сума, вид процедура, CPV категория и
// ИЗПЪЛНИТЕЛ (свързан от aggiudicatari по CIG). Всичко проверимо до договора.
//
// GDPR: изпълнители физически лица (личен CF, 16 знака) не се назовават.
//
// Изход: data/contratti/<codice>.json (масив договори, подредени по сума).

// @ts-check
import { join } from 'node:path';
import { readFile, writeFile, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseCsv, fixMojibake } from './lib/csv.js';
import { readJson, writeJson } from './lib/http.js';
import { RAW_DIR, DATA_DIR, ROOT } from './lib/paths.js';
import { loadDataset } from './lib/dataset.js';
import { matchAutoritaEnti } from './lib/match.js';
import { catProc } from './fetch-appalti.js';
import { eSocietaDiCapitali } from './coi.js';

const execFileAsync = promisify(execFile);
const ANAC_DIR = join(RAW_DIR, 'anac');
const OUT_DIR = join(DATA_DIR, 'contratti');

/** @param {string|undefined} s @returns {string} */
const unq = (s) => (s ? s.replace(/^"/, '').replace(/"$/, '').trim() : '');
/** @param {string} cf @returns {boolean} */
const isAzienda = (cf) => /^[0-9]{11}$/.test(cf);
// GDPR: 11-цифрен P.IVA НЕ гарантира юр. лице (ditte individuali/S.n.c./S.a.s. също
// имат P.IVA + лично име в наименованието). Профилираме/назоваваме САМО società di
// capitali — eSocietaDiCapitali проверява правната форма (както coi.js/cordate.js).
/** @param {string} cf @param {string} den @returns {boolean} */
const forniProfilabile = (cf, den) => isAzienda(cf) && eSocietaDiCapitali(den);

// GDPR (одит на Правния Разбирач): дословният публичен ANAC `oggetto` понякога
// пренася НАИМЕНОВАНИЕ на società di persone (S.n.c./S.a.s.) с ЛИЧНО ИМЕ на
// съдружник вътре в свободния текст — напр. „…DITTA PRESIFARM DI D'ARRIGO
// TOMMASO S.A.S.". Тъй като това е свободен текст, филтърът на структурното поле
// не го хваща и името „изтича" върху ИНДЕКСИРАН профил на капиталово дружество.
// Проектната политика е „физически лица НИКОГА не се назовават" → маскираме
// опашката „DITTA/DI <лично име> … S.A.S./S.N.C." → „(operatore non nominato)".
// Само UPPERCASE фрагменти (личните имена в ANAC са с главни букви) — за да не
// режем описателен текст. Не пипа S.P.A./S.R.L. (капиталови форми).
// „DITTA" е надежден въвеждащ маркер на наименование → безопасен широк, но
// къс (≤80 знака), нежаден прозорец до най-близкото S.A.S./S.N.C. (хваща &, E,
// „& C.", слепено „C.S.A.S.").
const RE_OGG_DITTA =
  /\bDITTA\s+[A-ZÀ-Ù0-9'’.&\- ]{1,80}?\s?S\.?\s?[AN]\.?\s?[SC]\.?(?![A-Z])/g;
// „DI <лично име> … S.A.S./S.N.C." без „DITTA": токенно, тясно (личните имена са
// 2–5 къси думи + евентуални съединители &/E/„C."), за да не режем описателен текст.
const RE_OGG_DI =
  /\bDI\s+[A-ZÀ-Ù'’][A-ZÀ-Ù'’.]+(?:\s+(?:&|E|C\.?|FIGL\w+|[A-ZÀ-Ù'’][A-ZÀ-Ù'’.]+)){0,4}\s?S\.?\s?[AN]\.?\s?[SC]\.?(?![A-Z])/g;
// Именувани физически лица в свободния текст с ПРОФЕСИОНАЛНА ТИТЛА (адвокати,
// нотариуси, професори…): напр. „INCARICO LEGALE AVV. FRANCO ROSSI". Титлата е
// силен маркер → маскираме титла + 1–3 главни думи (името), пазим титлата за
// контекст: „AVV. (nominativo omesso)". Само главни имена → не режем текст.
const RE_OGG_TITOLO =
  /\b((?:AVV|NOT|GEOM|RAG|ARCH|ING|DOTT\.?SSA|DOTT|PROF\.?SSA|PROF|SIG\.?RA|SIG\.?NA|SIG)\.?)\s+[A-ZÀ-Ù][A-ZÀ-Ù'’]+(?:\s+[A-ZÀ-Ù][A-ZÀ-Ù'’]+){0,2}/g;
/** @param {string|null|undefined} txt @returns {string} */
export function sanitizzaOggetto(txt) {
  return String(txt || '')
    .replace(RE_OGG_DITTA, '(operatore non nominato)')
    .replace(RE_OGG_DI, '(operatore non nominato)')
    .replace(RE_OGG_TITOLO, '$1 (nominativo omesso)');
}

async function main() {
  const config = await readJson(join(ROOT, 'config.json'));
  const anni = config.anacAnni || [2023, 2024];

  // 1) Кои болници са свързани (cf → codice)
  const { enti } = await loadDataset();
  const appalti = await readJson(join(DATA_DIR, 'appalti.json'));
  const { byCf } = matchAutoritaEnti(
    enti.map((e) => ({ codice: e.codice, denominazione: e.denominazione, regione: e.regione })),
    appalti.autorita.map((/** @type {any} */ a) => ({ cf: a.cf, den: a.den, reg: a.reg }))
  );
  const targetCf = new Set(byCf.keys());
  console.log(`Свързани болници: ${targetCf.size}. Извличам договорите им…`);

  // 2) Договорите на тези възложители (per cig, дедуп) от месечните CIG файлове
  /** @type {Map<string, any>} */
  const perCig = new Map(); // cig → запис
  for (const anno of anni) {
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const zip = join(ANAC_DIR, `cig_csv_${anno}_${mm}.zip`);
      if (!(await stat(zip).catch(() => null))) continue;
      await execFileAsync('unzip', ['-o', zip, '-d', ANAC_DIR]);
      const csv = join(ANAC_DIR, `cig_csv_${anno}_${mm}.csv`);
      try {
        const rows = parseCsv(await readFile(csv, 'utf8'), { separator: ';' });
        for (const r of rows) {
          const cf = (r.cf_amministrazione_appaltante || '').trim();
          if (!targetCf.has(cf)) continue;
          const cig = (r.cig || '').trim();
          if (!cig || perCig.has(cig)) continue;
          const importo = Number(r.importo_lotto || (String(r.n_lotti_componenti).trim() === '1' ? r.importo_complessivo_gara : 0));
          if (!Number.isFinite(importo) || importo <= 0 || importo > 1_000_000_000) continue;
          perCig.set(cig, {
            cig,
            codice: byCf.get(cf),
            data: (r.data_pubblicazione || `${anno}-${mm}`).slice(0, 10),
            oggetto: sanitizzaOggetto(fixMojibake(r.oggetto_lotto || r.oggetto_gara || '')).slice(0, 300),
            importo: Math.round(importo),
            procedura: (r.tipo_scelta_contraente || '').slice(0, 80),
            categoria: catProc(r.tipo_scelta_contraente),
            cpv: fixMojibake(r.descrizione_cpv || '').slice(0, 120),
            fornitore: null,
            fornitoreCf: null,
            fornitoreAzienda: false,
          });
        }
      } finally {
        await rm(csv, { force: true });
      }
    }
  }
  console.log(`Събрани ${perCig.size} договора. Свързвам изпълнителите…`);

  // 3) Изпълнител на всеки CIG (първи, физическите лица анонимни)
  await streamZip(join(ANAC_DIR, 'aggiudicatari.zip'), (c) => {
    const cig = unq(c[0]);
    const rec = perCig.get(cig);
    if (!rec || rec.fornitore) return;
    const cf = unq(c[2]);
    if (!cf) return;
    const den = fixMojibake(unq(c[3]));
    const az = forniProfilabile(cf, den); // само società di capitali се назовават/профилират
    rec.fornitore = az ? den : 'Operatore individuale (persona fisica)';
    rec.fornitoreAzienda = az;
    rec.fornitoreCf = az ? cf : null;
  });

  // 4) Групиране по болница и запис
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  /** @type {Map<string, any[]>} */
  const perCodice = new Map();
  for (const rec of perCig.values()) {
    if (!perCodice.has(rec.codice)) perCodice.set(rec.codice, []);
    const { codice, ...row } = rec;
    void codice;
    perCodice.get(rec.codice)?.push(row);
  }
  let totRighe = 0;
  /** @type {Record<string, { contratti: number, valore: number }>} */
  const indice = {};
  for (const [codice, list] of perCodice) {
    list.sort((/** @type {any} */ a, /** @type {any} */ b) => b.importo - a.importo);
    await writeJson(join(OUT_DIR, `${codice}.json`), list);
    indice[codice] = { contratti: list.length, valore: list.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.importo, 0) };
    totRighe += list.length;
  }
  await writeJson(join(DATA_DIR, 'contratti-indice.json'), { generatoIl: new Date().toISOString(), anni, totali: totRighe, perBolnica: perCodice.size, indice });
  console.log(`Готово: ${totRighe} договора за ${perCodice.size} болници → ${OUT_DIR}/`);
}

/** @param {string} zipPath @param {(cols: string[]) => void} onRow @returns {Promise<void>} */
function streamZip(zipPath, onRow) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath]);
    child.on('error', reject);
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let first = true;
    let closed = false;
    /** @type {number|null} */
    let code = null;
    const done = () => {
      if (closed && code !== null) (code === 0 ? resolve(undefined) : reject(new Error(`unzip ${zipPath} код ${code}`)));
    };
    rl.on('line', (/** @type {string} */ line) => {
      if (first) {
        first = false;
        return;
      }
      onRow(line.split(';'));
    });
    child.on('close', (c) => {
      code = c;
      done();
    });
    rl.on('close', () => {
      closed = true;
      done();
    });
    child.stderr.resume();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
