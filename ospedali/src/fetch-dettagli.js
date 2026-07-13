// Пълен опис на договорите за всяка свързана болница — „маниакален детайл“:
// за всеки CIG (лот) — предмет, дата, сума, вид процедура, CPV категория и
// ИЗПЪЛНИТЕЛ (свързан от aggiudicatari по CIG). Всичко проверимо до договора.
//
// GDPR: изпълнители физически лица (личен CF, 16 знака) не се назовават.
//
// Изход: data/contratti/<codice>.json (масив договори, подредени по сума).

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

const execFileAsync = promisify(execFile);
const ANAC_DIR = join(RAW_DIR, 'anac');
const OUT_DIR = join(DATA_DIR, 'contratti');

const unq = (s) => (s ? s.replace(/^"/, '').replace(/"$/, '').trim() : '');
const isAzienda = (cf) => /^[0-9]{11}$/.test(cf);

async function main() {
  const config = await readJson(join(ROOT, 'config.json'));
  const anni = config.anacAnni || [2023, 2024];

  // 1) Кои болници са свързани (cf → codice)
  const { enti } = await loadDataset();
  const appalti = await readJson(join(DATA_DIR, 'appalti.json'));
  const { byCf } = matchAutoritaEnti(
    enti.map((e) => ({ codice: e.codice, denominazione: e.denominazione, regione: e.regione })),
    appalti.autorita.map((a) => ({ cf: a.cf, den: a.den, reg: a.reg }))
  );
  const targetCf = new Set(byCf.keys());
  console.log(`Свързани болници: ${targetCf.size}. Извличам договорите им…`);

  // 2) Договорите на тези възложители (per cig, дедуп) от месечните CIG файлове
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
            oggetto: fixMojibake(r.oggetto_lotto || r.oggetto_gara || '').slice(0, 300),
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
    rec.fornitore = isAzienda(cf) ? fixMojibake(unq(c[3])) : 'Operatore individuale (persona fisica)';
    rec.fornitoreAzienda = isAzienda(cf);
    rec.fornitoreCf = isAzienda(cf) ? cf : null; // само юридически лица се профилират
  });

  // 4) Групиране по болница и запис
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const perCodice = new Map();
  for (const rec of perCig.values()) {
    if (!perCodice.has(rec.codice)) perCodice.set(rec.codice, []);
    const { codice, ...row } = rec;
    void codice;
    perCodice.get(rec.codice).push(row);
  }
  let totRighe = 0;
  const indice = {};
  for (const [codice, list] of perCodice) {
    list.sort((a, b) => b.importo - a.importo);
    await writeJson(join(OUT_DIR, `${codice}.json`), list);
    indice[codice] = { contratti: list.length, valore: list.reduce((s, r) => s + r.importo, 0) };
    totRighe += list.length;
  }
  await writeJson(join(DATA_DIR, 'contratti-indice.json'), { generatoIl: new Date().toISOString(), anni, totali: totRighe, perBolnica: perCodice.size, indice });
  console.log(`Готово: ${totRighe} договора за ${perCodice.size} болници → ${OUT_DIR}/`);
}

function streamZip(zipPath, onRow) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath]);
    child.on('error', reject);
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let first = true;
    let closed = false;
    let code = null;
    const done = () => {
      if (closed && code !== null) (code === 0 ? resolve() : reject(new Error(`unzip ${zipPath} код ${code}`)));
    };
    rl.on('line', (line) => {
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
