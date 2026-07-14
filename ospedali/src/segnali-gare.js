// „Semafori delle gare" — процедурни red-flag индикатори за поръчките на здравните
// възложители, изчислени от суровите CIG датасети (месечните ANAC ZIP-ове) и от
// aggiudicazioni. Всеки е ИНДИКАТОР ЗА РИСК, НЕ доказателство.
//
// От CIG:
//   • termine breve   — твърде кратък срок за оферти (гара „по мярка")
//   • frazionamento    — ≥3 преки възлагания за същия CPV в кратък прозорец (заобикаля търг)
//   • sotto soglia UE  — стойност точно под прага за задължителна ЕС-публикация
// От aggiudicazioni (добавя се в отделен проход, ако архивът е наличен):
//   • ribasso zero     — победа с ~0% отстъпка в конкурентна гара
//   • invitati ma unico— канят мнозина, оферта подава един
//   • subappalto        — дял договори с деклариран подизпълнител
//
// Филтрира по health-cig-cf.tsv (същите здравни CIG като останалата част на сайта).
// Изход: data/segnali-gare.json.

import { join } from 'node:path';
import { readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseCsv } from './lib/csv.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';

const execFileAsync = promisify(execFile);
const ANAC_DIR = join(RAW_DIR, 'anac');
const ANAC2 = join(RAW_DIR, 'anac2');
const ANNI = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

// Праг за ЕС-публикация (forniture/servizi, обикновени сектори) по двугодишни линии
// (Reg. 2017/2365: 2018-19=221k; 2019/1828: 2020-21=214k; 2021/1952: 2022-23=215k;
// 2023/2495: 2024-25=221k).
export function sogliaUE(anno) {
  return anno >= 2024 ? 221_000 : anno >= 2022 ? 215_000 : anno >= 2020 ? 214_000 : 221_000;
}
// „Точно под прага" = в лентата [-8%, праг); за сравнение и лентата [праг, +8%).
export function bandaSottoSoglia(importo, anno) {
  const s = sogliaUE(anno);
  if (importo >= s * 0.92 && importo < s) return 'sotto';
  if (importo >= s && importo < s * 1.08) return 'sopra';
  return null;
}
// Кратък срок за оферти (дни между публикация и краен срок).
export function termineBreve(giorni) {
  return Number.isFinite(giorni) && giorni >= 0 && giorni <= 10;
}

/**
 * Клъстери на раздробяване: за подадени преки възлагания (един възложител, един
 * CPV-раздел), сортирани по дата — плъзгащ прозорец от `window` дни с ≥3 възлагания
 * и обща сума над `soglia` (всяко поотделно под прага). Връща брой клъстери и сума.
 */
export function clusterFrazionamento(diretti, { window = 30, soglia = 40_000 } = {}) {
  const arr = diretti.filter((d) => d.importo > 0 && d.importo < soglia).sort((a, b) => a.t - b.t);
  let cluster = 0, valore = 0, i = 0;
  while (i < arr.length) {
    // Максимален прозорец, започващ от i: включи ВСИЧКИ възлагания в рамките на
    // `window` дни от arr[i] (не спирай на 3-тото — иначе 4-то/5-то в същия
    // прозорец се изпускат и valore подценява).
    let j = i;
    while (j + 1 < arr.length && arr[j + 1].t - arr[i].t <= window * 86400000) j++;
    const n = j - i + 1;
    if (n >= 3) {
      let s = 0;
      for (let k = i; k <= j; k++) s += arr[k].importo;
      if (s > soglia) {
        cluster++; valore += s;
        i = j + 1; // непокриващи се клъстери (без двойно броене)
        continue;
      }
    }
    i++;
  }
  return { cluster, valore: Math.round(valore) };
}

function emptyAuth(den) {
  return { den, competN: 0, termineBreveN: 0, sottoN: 0, sopraN: 0, direttiN: 0, frazCluster: 0, frazValore: 0 };
}

async function processaCig(cigCat) {
  const perAuth = new Map(); // cf → auth agg
  const naz = { competN: 0, termineBreveN: 0, sottoN: 0, sopraN: 0 };
  const direttiPer = new Map(); // `${cf}|${cpv2}` → [{t, importo}]
  const cfDen = new Map();

  for (const anno of ANNI) {
    for (let m = 1; m <= 12; m++) {
      const zip = join(ANAC_DIR, `cig_csv_${anno}_${String(m).padStart(2, '0')}.zip`);
      if (!(await stat(zip).catch(() => null))) continue;
      await execFileAsync('unzip', ['-o', zip, '-d', ANAC_DIR]);
      const csv = join(ANAC_DIR, `cig_csv_${anno}_${String(m).padStart(2, '0')}.csv`);
      try {
        const rows = parseCsv(await readFile(csv, 'utf8'), { separator: ';' });
        for (const r of rows) {
          const cig = (r.cig || '').trim();
          const cat = cigCat.get(cig);
          if (!cat) continue; // не е здравна поръчка
          const cf = (r.cf_amministrazione_appaltante || '').trim();
          if (!cfDen.has(cf)) cfDen.set(cf, r.denominazione_amministrazione_appaltante || cf);
          let a = perAuth.get(cf);
          if (!a) { a = emptyAuth(cfDen.get(cf)); perAuth.set(cf, a); }
          const unLotto = (r.n_lotti_componenti || '').trim() === '1';
          const importo = Number(r.importo_lotto || (unLotto ? r.importo_complessivo_gara : 0)) || 0;

          // termine breve (само конкурентни/договаряни с публикация)
          if (cat === 'competitiva' || cat === 'negoziata') {
            a.competN++; naz.competN++;
            const pub = Date.parse(r.data_pubblicazione), sca = Date.parse(r.data_scadenza_offerta);
            if (Number.isFinite(pub) && Number.isFinite(sca)) {
              const g = (sca - pub) / 86400000;
              if (termineBreve(g)) { a.termineBreveN++; naz.termineBreveN++; }
            }
          }
          // sotto soglia UE
          const banda = bandaSottoSoglia(importo, anno);
          if (banda === 'sotto') { a.sottoN++; naz.sottoN++; }
          else if (banda === 'sopra') { a.sopraN++; naz.sopraN++; }
          // раздробяване: събираме преките по cf+cpv-раздел
          if (cat === 'diretto') {
            a.direttiN++;
            const cpv2 = (r.cod_cpv || '').trim().slice(0, 2);
            const t = Date.parse(r.data_pubblicazione);
            if (cpv2 && Number.isFinite(t) && importo > 0) {
              const k = `${cf}|${cpv2}`;
              let lst = direttiPer.get(k);
              if (!lst) { lst = []; direttiPer.set(k, lst); }
              lst.push({ t, importo });
            }
          }
        }
      } finally {
        await rm(csv, { force: true });
      }
    }
  }

  // клъстери на раздробяване
  let frazNaz = 0, frazValNaz = 0;
  for (const [k, lst] of direttiPer) {
    const cf = k.slice(0, k.indexOf('|'));
    const { cluster, valore } = clusterFrazionamento(lst);
    if (cluster > 0) {
      const a = perAuth.get(cf);
      if (a) { a.frazCluster += cluster; a.frazValore += valore; }
      frazNaz += cluster; frazValNaz += valore;
    }
  }

  return { perAuth, naz, frazNaz, frazValNaz, cfDen };
}

// ---------- aggiudicazioni: ribasso zero, invitati ma unico, subappalto ----------
async function* righe(file) {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) { if (first) { first = false; continue; } if (line) yield line; }
}
function splitQ(line) {
  const out = []; let cell = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ';') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell); return out;
}

async function processaAggiudicazioni(cigCat, perAuth, cigAuthCf) {
  const file = join(ANAC2, 'aggiudicazioni_csv.csv');
  if (!(await stat(file).catch(() => null))) return null;
  const naz = { competOff: 0, ribassoZero: 0, negoz: 0, invitatiUnico: 0, agg: 0, subappalto: 0 };
  for (const auth of perAuth.values()) Object.assign(auth, { ribassoCompN: 0, ribassoZeroN: 0, invitatiUnicoN: 0, subappaltoN: 0, aggN: 0 });
  for await (const line of righe(file)) {
    const cig = (line.match(/^"([^"]*)"/) || [])[1];
    if (!cig) continue;
    const cat = cigCat.get(cig);
    if (!cat) continue;
    const cf = cigAuthCf.get(cig);
    const a = cf ? perAuth.get(cf) : null;
    const f = splitQ(line);
    if (!(f[2] || '').toUpperCase().includes('AGGIUDICATA')) continue;
    naz.agg++; if (a) a.aggN++;
    const off = parseInt(f[9], 10) || parseInt(f[5], 10);
    const rib = Number((f[8] || '').replace(',', '.'));
    // ribasso zero: конкурентна с ≥2 оферента и ribasso ≤0.5%
    if ((cat === 'competitiva' || cat === 'negoziata') && Number.isFinite(off) && off >= 2) {
      naz.competOff++; if (a) a.ribassoCompN++;
      if (Number.isFinite(rib) && rib <= 0.5) { naz.ribassoZero++; if (a) a.ribassoZeroN++; }
    }
    // invitati ma unico: negoziata с ≥3 поканени и ≤1 оферент
    const inv = parseInt(f[15], 10);
    if (cat === 'negoziata' && Number.isFinite(inv) && inv >= 3 && Number.isFinite(off) && off <= 1) {
      naz.negoz++; naz.invitatiUnico++; if (a) a.invitatiUnicoN++;
    }
    // subappalto
    if ((f[10] || '').toLowerCase() === 'true') { naz.subappalto++; if (a) a.subappaltoN++; }
  }
  return naz;
}

async function main() {
  const tsv = join(ANAC_DIR, 'health-cig-cf.tsv');
  await stat(tsv).catch(() => { throw new Error('няма health-cig-cf.tsv — пусни `npm run fetch:appalti`'); });
  const cigCat = new Map();
  const cigAuthCf = new Map();
  for (const line of (await readFile(tsv, 'utf8')).split('\n')) {
    if (!line) continue;
    const [cig, cf, cat] = line.split('\t');
    cigCat.set(cig, cat);
    cigAuthCf.set(cig, cf);
  }
  console.log(`Здравни CIG: ${cigCat.size.toLocaleString('it-IT')}`);

  const { perAuth, naz, frazNaz, frazValNaz } = await processaCig(cigCat);
  console.log(`CIG обработени: termine breve ${naz.termineBreveN}/${naz.competN}, sotto-soglia ${naz.sottoN}, frazionamento ${frazNaz} клъстера`);

  const aggNaz = await processaAggiudicazioni(cigCat, perAuth, cigAuthCf);
  if (aggNaz) console.log(`Aggiudicazioni: ribasso≤0.5% ${aggNaz.ribassoZero}/${aggNaz.competOff}, invitati-unico ${aggNaz.invitatiUnico}, subappalto ${aggNaz.subappalto}/${aggNaz.agg}`);

  // топ възложители per сигнал (с достатъчна база)
  const auths = [...perAuth.values()];
  const topBy = (fn, minBase, keyBase) =>
    auths.filter((a) => a[keyBase] >= minBase).map((a) => ({ den: a.den, ...fn(a) }))
      .filter((x) => x.quota > 0).sort((a, b) => b.quota - a.quota).slice(0, 12);

  const out = {
    generatoIl: new Date().toISOString(),
    fonte: 'ANAC — BDNCP: CIG mensili + aggiudicazioni (CC BY / CC BY-SA 4.0), committenti sanitari 2019–2025',
    nota: 'Indicatori di rischio sulle procedure di gara. Ogni segnale è un INDICATORE, non una prova: possono esistere spiegazioni lecite (urgenza reale, mercati di nicchia, esigenze cliniche).',
    nazionale: {
      termineBreve: { n: naz.termineBreveN, base: naz.competN, quota: naz.competN ? naz.termineBreveN / naz.competN : null },
      sottoSoglia: { sotto: naz.sottoN, sopra: naz.sopraN, rapporto: naz.sopraN ? naz.sottoN / naz.sopraN : null },
      frazionamento: { cluster: frazNaz, valore: frazValNaz },
      ribassoZero: aggNaz ? { n: aggNaz.ribassoZero, base: aggNaz.competOff, quota: aggNaz.competOff ? aggNaz.ribassoZero / aggNaz.competOff : null } : null,
      invitatiUnico: aggNaz ? { n: aggNaz.invitatiUnico, base: aggNaz.negoz } : null,
      subappalto: aggNaz ? { n: aggNaz.subappalto, base: aggNaz.agg, quota: aggNaz.agg ? aggNaz.subappalto / aggNaz.agg : null } : null,
    },
    topTermineBreve: topBy((a) => ({ n: a.termineBreveN, quota: a.competN ? a.termineBreveN / a.competN : 0 }), 20, 'competN'),
    topSottoSoglia: topBy((a) => ({ n: a.sottoN, quota: a.sottoN }), 3, 'sottoN').map((x) => ({ den: x.den, n: x.n, quota: x.n })),
    topFrazionamento: auths.filter((a) => a.frazCluster > 0).map((a) => ({ den: a.den, cluster: a.frazCluster, valore: a.frazValore })).sort((a, b) => b.cluster - a.cluster).slice(0, 12),
    topRibassoZero: aggNaz ? topBy((a) => ({ n: a.ribassoZeroN, quota: a.ribassoCompN ? a.ribassoZeroN / a.ribassoCompN : 0 }), 15, 'ribassoCompN') : [],
  };
  await writeFile(join(DATA_DIR, 'segnali-gare.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('Готово → data/segnali-gare.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error('Грешка:', err); process.exitCode = 1; });
}
