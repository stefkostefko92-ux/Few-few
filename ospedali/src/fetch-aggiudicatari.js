// Дълбок форензик слой върху обществените поръчки: свързва CIG-овете на здравните
// възложители с ДВА големи ANAC датасета (поточно, без да ги пише на диска):
//   – aggiudicatari  → КОЙ печели парите (изпълнители), концентрация, repeat-winner;
//   – partecipanti   → колко кандидати е имало → ТЪРГОВЕ С ЕДИН ОФЕРЕНТ.
//
// Нужен е data/raw/anac/health-cig-cf.tsv (от fetch-appalti) с cig→cf/категория/сума.
//
// ВАЖНО: единствен оферент, концентрация и повтарящ се победител са ИНДИКАТОРИ за
// проверка, не доказателства. Може да са законни (монопол, патент, малък пазар).
//
// Изход: data/aggiudicatari.json.

import { join } from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { RAW_DIR, DATA_DIR } from './lib/paths.js';

const ANAC_DIR = join(RAW_DIR, 'anac');
const OUT_FILE = join(DATA_DIR, 'aggiudicatari.json');
const GARA_CATS = new Set(['competitiva', 'negoziata', 'negoziataSenza']);

// Тези датасети ограждат всяко поле в кавички — махаме ги.
const unq = (s) => (s ? s.replace(/^"/, '').replace(/"$/, '').trim() : '');

/** Поточно чете zip със system unzip -p и подава редовете (split по ';'). */
function streamZip(zipPath, onRow) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath]);
    child.on('error', reject);
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let first = true;
    rl.on('line', (line) => {
      if (first) {
        first = false;
        return;
      } // заглавен ред
      onRow(line.split(';'));
    });
    rl.on('close', resolve);
    child.stderr.resume();
  });
}

async function main() {
  // 1) cig → { cf, cat, importo } за здравните поръчки
  const tsvPath = join(ANAC_DIR, 'health-cig-cf.tsv');
  await stat(tsvPath).catch(() => {
    throw new Error('няма health-cig-cf.tsv — пусни първо `npm run fetch:appalti`');
  });
  const cigInfo = new Map();
  for (const line of (await readFile(tsvPath, 'utf8')).split('\n')) {
    if (!line) continue;
    const [cig, cf, cat, importo] = line.split('\t');
    cigInfo.set(cig, { cf, cat, importo: Number(importo) || 0 });
  }
  console.log(`Заредени ${cigInfo.size} здравни CIG-а.`);

  // 2) aggiudicatari → изпълнители по възложител (стойност веднъж на CIG)
  const perAuth = new Map(); // cf_auth → { forn: Map(cfForn→{den,valore,n}), valore }
  const fornNaz = new Map(); // cf_forn → { den, valore, n } (национално)
  const seenWinnerCig = new Set();
  let aggRighe = 0;
  await streamZip(join(ANAC_DIR, 'aggiudicatari.zip'), (c) => {
    const cig = unq(c[0]);
    const info = cigInfo.get(cig);
    if (!info) return;
    if (seenWinnerCig.has(cig)) return; // стойността на CIG се брои веднъж
    seenWinnerCig.add(cig);
    const cfForn = unq(c[2]);
    const den = unq(c[3]);
    if (!cfForn) return;
    aggRighe++;
    let a = perAuth.get(info.cf);
    if (!a) {
      a = { forn: new Map(), valore: 0 };
      perAuth.set(info.cf, a);
    }
    let f = a.forn.get(cfForn);
    if (!f) {
      f = { den, valore: 0, n: 0 };
      a.forn.set(cfForn, f);
    }
    f.valore += info.importo;
    f.n++;
    a.valore += info.importo;
    let g = fornNaz.get(cfForn);
    if (!g) {
      g = { den, valore: 0, n: 0 };
      fornNaz.set(cfForn, g);
    }
    g.valore += info.importo;
    g.n++;
  });
  console.log(`Aggiudicatari: ${aggRighe} връзки, ${perAuth.size} възложителя с изпълнители.`);

  // 3) partecipanti → брой различни кандидати на CIG (само за „гара“ категориите)
  const cigPart = new Map(); // cig → { firstCf, multi }
  await streamZip(join(ANAC_DIR, 'partecipanti.zip'), (c) => {
    const cig = unq(c[0]);
    const info = cigInfo.get(cig);
    if (!info || !GARA_CATS.has(info.cat)) return;
    const cf = unq(c[2]);
    if (!cf) return;
    let p = cigPart.get(cig);
    if (!p) {
      cigPart.set(cig, { firstCf: cf, multi: false });
    } else if (!p.multi && cf !== p.firstCf) {
      p.multi = true;
    }
  });
  // единствен оферент на възложител
  const singleByAuth = new Map(); // cf_auth → { gare, unico }
  for (const [cig, p] of cigPart) {
    const info = cigInfo.get(cig);
    if (!info) continue;
    let s = singleByAuth.get(info.cf);
    if (!s) {
      s = { gare: 0, unico: 0 };
      singleByAuth.set(info.cf, s);
    }
    s.gare++;
    if (!p.multi) s.unico++;
  }
  console.log(`Partecipanti: ${cigPart.size} гари с кандидати.`);

  // 4) сглобяване per възложител
  const perCf = {};
  for (const [cf, a] of perAuth) {
    const forn = [...a.forn.entries()]
      .map(([cfForn, f]) => ({ cf: cfForn, den: f.den, valore: Math.round(f.valore), n: f.n }))
      .sort((x, y) => y.valore - x.valore);
    const top1 = forn[0];
    const s = singleByAuth.get(cf);
    perCf[cf] = {
      valoreAggiudicato: Math.round(a.valore),
      nFornitori: forn.length,
      top1Quota: a.valore > 0 && top1 ? top1.valore / a.valore : null,
      topFornitori: forn.slice(0, 5),
      gareConPartecipanti: s ? s.gare : 0,
      gareUnicoOfferente: s ? s.unico : 0,
      quotaUnicoOfferente: s && s.gare > 0 ? s.unico / s.gare : null,
    };
  }

  const fornitoriNazionali = [...fornNaz.entries()]
    .map(([cf, f]) => ({ cf, den: f.den, valore: Math.round(f.valore), n: f.n }))
    .sort((x, y) => y.valore - x.valore)
    .slice(0, 40);

  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        generatoIl: new Date().toISOString(),
        fonte: 'ANAC — aggiudicatari + partecipanti (dati.anticorruzione.it), incrociati con i CIG sanitari',
        note: 'Unico offerente, concentrazione dei fornitori e vincitori ricorrenti sono indicatori, non prove.',
        autoritaConDati: Object.keys(perCf).length,
        fornitoriNazionali,
        perCf,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Готово: изпълнители за ${Object.keys(perCf).length} възложителя → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
