// ANAC aggiudicazioni + фази на изпълнение — обогатяване на поръчките с това,
// което cig датасетът НЕ носи: реален БРОЙ ОФЕРЕНТИ (offerente unico по-точно от
// оценката ни), среден RIBASSO (отстъпка), критерий за възлагане, и ЗАКЪСНЕНИЯ
// (proroghe от fine-contratto, забавени SAL от stati-avanzamento).
//
// Данните са огромни (aggiudicazioni ~760 MB разопаковано) → четем поточно
// (readline), извличаме cig евтино и обработваме само редовете, чийто CIG е в
// нашия здравен набор (health-cig-cf.tsv). Счупените от вградени нови редове
// фрагменти не съвпадат с валиден CIG → безобидни (както fetch-aggiudicatari).
//
// Изход: data/aggiudicazioni.json.

import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { writeJson } from './lib/http.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';

const ANAC2 = join(RAW_DIR, 'anac2');
const HEALTH_TSV = join(RAW_DIR, 'anac', 'health-cig-cf.tsv');

// TODO(замразено): полетата долу се четат ПОЗИЦИОННО по индекс (f[2], f[3], f[5],
// f[8], f[9]) вместо по име на колона от хедъра. По-устойчиво би било splitQuoted
// на хедъра → карта {име→индекс} и достъп по име (както dataset.js за CE/SP). НЕ го
// сменяй сега: изходът data/aggiudicazioni.json е замразен launch данни и всяка
// разлика в подредбата на колоните на ANAC би променила резултата.
/** Разделя ред „a";"b";"c" на полета, зачитайки кавичките (без вградени нови редове). */
function splitQuoted(line) {
  const out = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ';') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}

/** Бърз евтин прочит на първото поле (cig) без пълен парс. */
function primoCig(line) {
  if (line[0] !== '"') return null;
  const end = line.indexOf('"', 1);
  return end > 1 ? line.slice(1, end) : null;
}

/** Категория на критерия за възлагане. */
export function classificaCriterio(s) {
  const u = (s || '').toUpperCase();
  if (u.includes('MINOR PREZZO') || u.includes('PREZZO PIU') || u.includes('PREZZO PIÙ') || u.includes('MASSIMO RIBASSO')) return 'prezzo';
  if (u.includes('VANTAGGIOSA') || u.includes('QUALIT')) return 'qualita';
  return 'altro';
}

async function* righe(file) {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; } // header
    if (line) yield line;
  }
}

/** Зарежда cig → категория (от нашата процедурна класификация) за здравните CIG. */
async function caricaHealth() {
  const cat = new Map();
  for await (const line of righe(HEALTH_TSV)) {
    const [cig, , categoria] = line.split('\t');
    if (cig) cat.set(cig, categoria || 'altro');
  }
  return cat;
}

const distr = () => ({ 1: 0, 2: 0, 3: 0, '4+': 0 });
function pushDistr(d, n) {
  if (n >= 4) d['4+']++;
  else if (n >= 1) d[n]++;
}
function mediana(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  const cat = await caricaHealth();
  console.log(`здравни CIG: ${cat.size.toLocaleString('it-IT')}`);

  // --- aggiudicazioni ---
  const CATS = ['diretto', 'negoziataSenza', 'competitiva', 'quadro', 'negoziata', 'altro'];
  const naz = { nAgg: 0, conOfferenti: 0, unOfferente: 0, distribuzione: distr(), criterio: { prezzo: 0, qualita: 0, altro: 0 } };
  const perCat = {};
  for (const c of CATS) perCat[c] = { n: 0, conOfferenti: 0, unOfferente: 0 };
  const ribassiComp = []; // ribasso само за конкурентни процедури (diretto = винаги 0)
  const aggFile = join(ANAC2, 'aggiudicazioni_csv.csv');
  if (await stat(aggFile).catch(() => null)) {
    for await (const line of righe(aggFile)) {
      const cig = primoCig(line);
      if (!cig || !cat.has(cig)) continue;
      const f = splitQuoted(line);
      const esito = (f[2] || '').toUpperCase();
      if (!esito.includes('AGGIUDICATA')) continue; // само реално възложени
      naz.nAgg++;
      const categoria = cat.get(cig);
      const pc = perCat[categoria] || perCat.altro;
      pc.n++;
      // брой оференти: num_imprese_offerenti (idx9), падни на numero_offerte_ammesse (idx5)
      let off = parseInt(f[9], 10);
      if (!Number.isFinite(off) || off <= 0) off = parseInt(f[5], 10);
      if (Number.isFinite(off) && off >= 1) {
        naz.conOfferenti++;
        pc.conOfferenti++;
        pushDistr(naz.distribuzione, off);
        if (off === 1) { naz.unOfferente++; pc.unOfferente++; }
      }
      // ribasso (%) — само за конкурентни/договаряни (при diretto е 0 по дефиниция)
      const rib = Number((f[8] || '').replace(',', '.'));
      if ((categoria === 'competitiva' || categoria === 'negoziata') && Number.isFinite(rib) && rib > 0 && rib <= 100) {
        ribassiComp.push(rib);
      }
      naz.criterio[classificaCriterio(f[3])]++;
    }
  }
  naz.quotaUnOfferente = naz.conOfferenti ? naz.unOfferente / naz.conOfferenti : null;
  naz.ribassoCompMediano = mediana(ribassiComp);
  naz.ribassoCompMedio = ribassiComp.length ? ribassiComp.reduce((a, b) => a + b, 0) / ribassiComp.length : null;
  naz.nRibassoComp = ribassiComp.length;
  for (const c of CATS) {
    const p = perCat[c];
    p.quotaUnOfferente = p.conOfferenti ? p.unOfferente / p.conOfferenti : null;
  }

  // --- fine-contratto: proroghe ---
  const fine = { n: 0, conProroga: 0, giorniProroga: [] };
  const fineFile = join(ANAC2, 'fine-contratto_csv.csv');
  if (await stat(fineFile).catch(() => null)) {
    for await (const line of righe(fineFile)) {
      const cig = primoCig(line);
      if (!cig || !cat.has(cig)) continue;
      const f = splitQuoted(line);
      fine.n++;
      const g = parseInt(f[8], 10); // giorni_proroga
      if (Number.isFinite(g) && g > 0) { fine.conProroga++; fine.giorniProroga.push(g); }
    }
  }

  // --- stati-avanzamento: забавени SAL ---
  const sal = { nSal: 0, inRitardo: 0, scostamenti: [] };
  const salFile = join(ANAC2, 'stati-avanzamento_csv.csv');
  if (await stat(salFile).catch(() => null)) {
    for await (const line of righe(salFile)) {
      const cig = primoCig(line);
      if (!cig || !cat.has(cig)) continue;
      const f = splitQuoted(line);
      sal.nSal++;
      const flag = (f[2] || '').toUpperCase();
      const scost = parseInt(f[5], 10); // n_giorni_scostamento
      const ritardo = flag.includes('RITARD') || (Number.isFinite(scost) && scost > 0);
      if (ritardo) sal.inRitardo++;
      if (Number.isFinite(scost)) sal.scostamenti.push(scost);
    }
  }

  const out = {
    generatoIl: new Date().toISOString(),
    fonte: 'ANAC — BDNCP: aggiudicazioni, fine-contratto, stati-avanzamento (CC BY-SA 4.0)',
    url: 'https://dati.anticorruzione.it/opendata',
    nota: 'Обогатяване на здравните CIG (2023–2025) с брой оференти, ribasso, критерий и закъснения. „Un offerente" не е доказателство за нередност.',
    aggiudicazioni: {
      nAgg: naz.nAgg,
      conOfferenti: naz.conOfferenti,
      unOfferente: naz.unOfferente,
      quotaUnOfferente: naz.quotaUnOfferente,
      distribuzione: naz.distribuzione,
      ribassoCompMediano: naz.ribassoCompMediano,
      ribassoCompMedio: naz.ribassoCompMedio,
      nRibassoComp: naz.nRibassoComp,
      criterio: naz.criterio,
      perCategoria: perCat,
    },
    ritardi: {
      fineContratto: {
        n: fine.n,
        conProroga: fine.conProroga,
        quotaProroga: fine.n ? fine.conProroga / fine.n : null,
        giorniProrogaMediano: mediana(fine.giorniProroga),
      },
      statiAvanzamento: {
        nSal: sal.nSal,
        inRitardo: sal.inRitardo,
        quotaRitardo: sal.nSal ? sal.inRitardo / sal.nSal : null,
        scostamentoMediano: mediana(sal.scostamenti),
      },
    },
  };
  await writeJson(join(DATA_DIR, 'aggiudicazioni.json'), out);
  console.log(
    `aggiudicazioni: ${naz.nAgg.toLocaleString('it-IT')} възложени, ` +
    `un offerente ${naz.quotaUnOfferente != null ? (naz.quotaUnOfferente * 100).toFixed(1) + '%' : '—'}, ` +
    `ribasso comp. mediano ${naz.ribassoCompMediano != null ? naz.ribassoCompMediano.toFixed(1) + '%' : '—'}`
  );
  console.log(
    `ritardi: proroghe ${out.ritardi.fineContratto.quotaProroga != null ? (out.ritardi.fineContratto.quotaProroga * 100).toFixed(1) + '%' : '—'} ` +
    `(${fine.n} chiusure), SAL in ritardo ${out.ritardi.statiAvanzamento.quotaRitardo != null ? (out.ritardi.statiAvanzamento.quotaRitardo * 100).toFixed(1) + '%' : '—'} (${sal.nSal} SAL)`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
