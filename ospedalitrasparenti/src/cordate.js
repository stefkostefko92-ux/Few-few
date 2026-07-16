// „Cordate di offerenti" — най-емблематичният сигнал за евентуален картел в
// поръчките: двойки фирми, които СИСТЕМАТИЧНО се явяват ЗАЕДНО в конкурентни гари,
// където ЕДНАТА почти винаги печели, а ДРУГАТА почти винаги губи (cover bidding /
// ротация на оферти — OECD Guidelines for Fighting Bid Rigging).
//
// Кръстосва ДВА ANAC датасета (поточно): aggiudicatari (кой печели) + partecipanti
// (кой се е явил) — само за здравните конкурентни гари (health-cig-cf.tsv).
//
// ⚠️ ИНДИКАТОР, НЕ ДОКАЗАТЕЛСТВО. Съвпадането е статистическо; може да е законно
// (тесен пазар, ATI, малко играчи). Проверка → Antitrust/AGCM, Registro Imprese.
// GDPR: назовават се САМО 11-цифрени P.IVA (юридически лица); физически лица (16
// знака) се изключват по конструкция.
//
// Изход: data/cordate.json.

// @ts-check
import { join } from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { RAW_DIR, DATA_DIR } from './lib/paths.js';
import { eSocietaDiCapitali } from './coi.js';

/**
 * @typedef {object} Gara гара за анализа на cordate
 * @property {Set<string>|string[]|undefined} winners победители (per лот)
 * @property {string[]} parts участници (CF)
 * @property {number} [importo]
 * @property {string} [auth] възложител (CF)
 */

const ANAC_DIR = join(RAW_DIR, 'anac');
const GARA_CATS = new Set(['competitiva', 'negoziata']); // само реални състезателни гари
/** @param {string|undefined} s @returns {string} */
const unq = (s) => (s ? s.replace(/^"/, '').replace(/"$/, '').trim() : '');
/** @param {string} cf @returns {boolean} */
const isAzienda = (cf) => /^[0-9]{11}$/.test(cf); // юр. лице (P.IVA) — за назоваване
// Роли на РАГРУПИРАНА оферта (ATI/консорциум/авалимент): това са ПАРТНЬОРИ в една
// оферта, не отделни конкуренти → изключват се, иначе даваме фалшиви „cordate".
const RUOLO_RAGGR = /MANDANT|MANDATARI|CONSORZI|ASSOCIAT|CAPOGRUPPO|AUSILIARI|SUBAPPALT|COOPTAT/i;

// Прагове (тестваеми)
const SOGLIA_INSIEME = 5; // минимум съвместни явявания
const MIN_VITTORIE = 3; // победителят е печелил поне толкова от съвместните
const MAX_PART = 15; // гари с повече участници = широки търгове, не картел → пропускат се

/**
 * @param {string} zipPath
 * @param {(cols: string[]) => void} onRow
 * @returns {Promise<void>}
 */
function streamZip(zipPath, onRow) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath]);
    child.on('error', reject);
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let first = true, closed = false;
    /** @type {number|null} */
    let code = null;
    const done = () => { if (closed && code !== null) (code === 0 ? resolve() : reject(new Error(`unzip ${zipPath} код ${code}`))); };
    rl.on('line', (line) => { if (first) { first = false; return; } onRow(line.split(';')); });
    child.on('close', (c) => { code = c; done(); });
    rl.on('close', () => { closed = true; done(); });
    child.stderr.resume();
  });
}

/**
 * Чист анализ: масив от гари { winners:Set|Array, parts:[cf…], importo, auth } →
 * cordate. „Печели" = членство във winners (ВСИЧКИ победители на гарата, per лот —
 * така многолотовите гари, разделени между фирми, не дават фалшив картел).
 * Формира само двойки от юридически лица (P.IVA). Връща подредени cordate.
 * @param {Gara[]} gare
 * @param {{ soglia?: number, minVittorie?: number, maxPart?: number }} [opts]
 */
export function analizzaCordate(gare, { soglia = SOGLIA_INSIEME, minVittorie = MIN_VITTORIE, maxPart = MAX_PART } = {}) {
  /** @type {Map<string, { co: number, winA: number, winB: number, val: number, auth: Set<string> }>} */
  const pair = new Map(); // "a|b" (a<b) → {co, winA, winB, val, auth:Set}
  /** @param {string} a @param {string} b */
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const g of gare) {
    const parts = [...new Set(g.parts.filter(isAzienda))];
    if (parts.length < 2 || parts.length > maxPart) continue;
    const win = g.winners instanceof Set ? g.winners : new Set(g.winners || []);
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        const lo = a < b ? a : b, hi = a < b ? b : a;
        const k = `${lo}|${hi}`;
        let p = pair.get(k);
        if (!p) { p = { co: 0, winA: 0, winB: 0, val: 0, auth: new Set() }; pair.set(k, p); }
        p.co++;
        p.val += g.importo || 0;
        if (g.auth) p.auth.add(g.auth);
        if (win.has(lo)) p.winA++;
        if (win.has(hi)) p.winB++;
      }
    }
  }
  /** @type {Array<{ vincitoreCf: string, coprCf: string, insieme: number, vinteDalVincitore: number, valore: number, nAuth: number }>} */
  const cordate = [];
  for (const [k, p] of pair) {
    if (p.co < soglia) continue;
    const [lo, hi] = k.split('|');
    // cover bidding: единият печели ≥MIN, другият НИКОГА (в съвместните гари)
    /** @type {string|null} */
    let vinc = null;
    /** @type {string|null} */
    let copr = null;
    let vinte = 0;
    if (p.winA >= minVittorie && p.winB === 0) { vinc = lo; copr = hi; vinte = p.winA; }
    else if (p.winB >= minVittorie && p.winA === 0) { vinc = hi; copr = lo; vinte = p.winB; }
    if (!vinc || !copr) continue;
    cordate.push({
      vincitoreCf: vinc, coprCf: copr,
      insieme: p.co, vinteDalVincitore: vinte,
      valore: Math.round(p.val), nAuth: p.auth.size,
    });
  }
  // ранг: по съвместни явявания, после стойност
  cordate.sort((a, b) => b.insieme - a.insieme || b.valore - a.valore);
  return cordate;
}

/**
 * „Vincitore ricorrente" — доминиране: фирма печели много висок дял от конкурентните
 * гари, в които участва при СЪЩИЯ възложител. Групира по фирма (домини при N възложителя).
 * Вход: гари { winners:Set, parts:[cf…], auth }. Само P.IVA юр. лица.
 */
/**
 * @param {Gara[]} gare
 * @param {{ minGare?: number, minWinRate?: number }} [opts]
 */
export function analizzaVincitori(gare, { minGare = 6, minWinRate = 0.8 } = {}) {
  /** @type {Map<string, { part: number, won: number, val: number }>} */
  const rel = new Map(); // `${auth}|${cf}` → {part, won, val}
  for (const g of gare) {
    if (!g.auth) continue;
    const win = g.winners instanceof Set ? g.winners : new Set(g.winners || []);
    for (const cf of new Set(g.parts.filter(isAzienda))) {
      const k = `${g.auth}|${cf}`;
      let r = rel.get(k);
      if (!r) { r = { part: 0, won: 0, val: 0 }; rel.set(k, r); }
      r.part++;
      if (win.has(cf)) { r.won++; r.val += g.importo || 0; }
    }
  }
  /** @type {Map<string, { domini: number, gareTot: number, vinteTot: number, valore: number }>} */
  const perForn = new Map(); // cf → {domini, gareTot, vinteTot, valore}
  for (const [k, r] of rel) {
    if (r.part < minGare || r.won / r.part < minWinRate) continue;
    const cf = k.slice(k.indexOf('|') + 1);
    let f = perForn.get(cf);
    if (!f) { f = { domini: 0, gareTot: 0, vinteTot: 0, valore: 0 }; perForn.set(cf, f); }
    f.domini++; f.gareTot += r.part; f.vinteTot += r.won; f.valore += r.val;
  }
  return [...perForn.entries()]
    .map(([cf, f]) => ({ cf, ...f, winRate: f.gareTot ? f.vinteTot / f.gareTot : 0, valore: Math.round(f.valore) }))
    .sort((a, b) => b.domini - a.domini || b.vinteTot - a.vinteTot);
}

async function main() {
  const tsvPath = join(ANAC_DIR, 'health-cig-cf.tsv');
  await stat(tsvPath).catch(() => { throw new Error('няма health-cig-cf.tsv — пусни първо `npm run fetch:appalti`'); });
  /** @type {Map<string, { auth: string, importo: number }>} */
  const cigInfo = new Map();
  for (const line of (await readFile(tsvPath, 'utf8')).split('\n')) {
    if (!line) continue;
    const [cig, cf, cat, importo] = line.split('\t');
    if (GARA_CATS.has(cat)) cigInfo.set(cig, { auth: cf, importo: Number(importo) || 0 });
  }
  console.log(`Здравни конкурентни гари: ${cigInfo.size.toLocaleString('it-IT')}`);

  // 1) ВСИЧКИ победители per CIG (per лот) — само за конкурентните
  /** @type {Map<string, Set<string>>} */
  const winnersByCig = new Map(); // cig → Set(cf)
  /** @type {Map<string, string>} */
  const cfDen = new Map(); // cf → denominazione (за назоваване)
  await streamZip(join(ANAC_DIR, 'aggiudicatari.zip'), (c) => {
    const cig = unq(c[0]);
    if (!cigInfo.has(cig)) return;
    const cf = unq(c[2]);
    if (!isAzienda(cf)) return;
    let s = winnersByCig.get(cig);
    if (!s) { s = new Set(); winnersByCig.set(cig, s); }
    s.add(cf);
    if (!cfDen.has(cf)) cfDen.set(cf, unq(c[3]));
  });
  console.log(`Победители за ${winnersByCig.size.toLocaleString('it-IT')} гари.`);

  // 2) участници per CIG (само конкурентни с известен победител)
  /** @type {Map<string, Set<string>>} */
  const partByCig = new Map(); // cig → Set(cf)
  await streamZip(join(ANAC_DIR, 'partecipanti.zip'), (c) => {
    const cig = unq(c[0]);
    if (!cigInfo.has(cig) || !winnersByCig.has(cig)) return;
    if (RUOLO_RAGGR.test(unq(c[1]))) return; // партньор в обща оферта, не конкурент
    const cf = unq(c[2]);
    if (!isAzienda(cf)) return; // само P.IVA юр. лица (GDPR + смисъл)
    let s = partByCig.get(cig);
    if (!s) { s = new Set(); partByCig.set(cig, s); }
    s.add(cf);
    if (!cfDen.has(cf)) cfDen.set(cf, unq(c[3]));
  });
  console.log(`Участници събрани за ${partByCig.size.toLocaleString('it-IT')} гари.`);

  // GDPR: назоваваме и формираме двойки САМО за società di capitali (SPA/SRL/coop/
  // consorzio…). 11-цифрен P.IVA НЕ гарантира юр. лице — ditte individuali го имат и
  // денонимацията им често е ИМЕ НА ФИЗИЧЕСКО ЛИЦЕ. eSocietaDiCapitali (от coi.js)
  // проверява правната форма по денонимация → изключва ditte individuali/SNC/SAS.
  /** @type {Set<string>} */
  const societa = new Set();
  for (const [cf, den] of cfDen) if (eSocietaDiCapitali(den)) societa.add(cf);

  // 3) сглобяване на гарите за анализа (участници = само società di capitali;
  // победителите остават пълни, за да е коректно „кой е спечелил")
  /** @type {Gara[]} */
  const gare = [];
  for (const [cig, parts] of partByCig) {
    const info = cigInfo.get(cig);
    if (!info) continue;
    gare.push({ winners: winnersByCig.get(cig), parts: [...parts].filter((cf) => societa.has(cf)), importo: info.importo, auth: info.auth });
  }
  const cordate = analizzaCordate(gare);
  // обогатяване с имена + примери (за топ 60)
  const top = cordate.slice(0, 60).map((c) => ({
    ...c,
    vincitoreDen: cfDen.get(c.vincitoreCf) || c.vincitoreCf,
    coprDen: cfDen.get(c.coprCf) || c.coprCf,
  }));
  // vincitore ricorrente (доминиране при възложител)
  const vincitori = analizzaVincitori(gare).slice(0, 30).map((v) => ({
    ...v, den: cfDen.get(v.cf) || v.cf,
  }));
  console.log(`Vincitori ricorrenti: ${vincitori.length} (топ: ${vincitori[0] ? vincitori[0].domini + ' домини, ' + (vincitori[0].winRate * 100).toFixed(0) + '% win-rate' : '—'})`);

  await writeFile(join(DATA_DIR, 'cordate.json'), JSON.stringify({
    generatoIl: new Date().toISOString(),
    fonte: 'ANAC — aggiudicatari + partecipanti (dati.anticorruzione.it), gare sanitarie competitive 2023–2025',
    nota: 'Coppie di imprese che concorrono spesso insieme dove una vince e l’altra non vince mai: indicatore di possibile cover bidding, NON prova. Solo persone giuridiche (P.IVA). Verifica: AGCM/Antitrust, Registro Imprese.',
    soglie: { insieme: SOGLIA_INSIEME, minVittorie: MIN_VITTORIE, maxPartecipanti: MAX_PART },
    totaleCordate: cordate.length,
    cordate: top,
    vincitori,
  }, null, 2) + '\n');
  console.log(`Готово → data/cordate.json: ${cordate.length} cordate (топ ${top.length} с имена)`);
  if (top[0]) console.log(`  най-силна: ${top[0].insieme} гари заедно, победи ${top[0].vinteDalVincitore}, стойност ${(top[0].valore / 1e6).toFixed(1)} mln`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error('Грешка:', err); process.exitCode = 1; });
}
