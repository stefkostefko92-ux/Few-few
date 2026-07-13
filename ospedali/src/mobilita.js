// Mobilità sanitaria — „да се лекуваш извън региона си": колко плаща всеки
// регион за лечение на своите граждани другаде. НЕ иска нови данни: CE моделът
// (който вече имаме) съдържа разходните редове „Extraregione".
//
// ЧЕСТНА РАМКА (важно): CE-то дава чисто само ПАСИВНАТА страна (разходите
// навън), по два канала: „da pubblico (Extraregione)" (към публични структури
// на други региони) и „da privato … extraregione" (към частни структури извън
// региона). АКТИВНАТА страна (AA0450) е частичен изглед — компенсационните
// потоци минават отчасти през GSA под други кодове — затова НЕ представяме
// „салдо", а само добре дефинираните разходи навън + частичната актива с
// изрична уговорка. Пасивата е листови кодове; интрарегионалните се изключват.
//
// Изход: data/mobilita.json (per регион: passivaPubblico/Privato/Tot + attivaParziale).

import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { parseCsv } from './lib/csv.js';
import { writeJson } from './lib/http.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';

const BDAP_DIR = join(RAW_DIR, 'bdap');
const COD_ATTIVA = 'AA0450';
const RE_EXTRA = /extraregion/i;
const RE_INTRA = /intraregionale/i;
const RE_PRIVATO = /da privato/i;
// „per cittadini non residenti … (mobilità attiva in compensazione)" е разходът
// на региона-ПРИЕМНИК към собствените му частни структури за ЧУЖДИ пациенти —
// обратната посока. НЕ е „наши граждани навън" → изключва се от пасивата.
const RE_NON_RESIDENTI = /non residenti|mobilita'?\s*attiva/i;

/** Листов ли е кодът? Родител е, ако друго съвпаднало описание продължава номера му. */
function eFoglia(descr, tutteDescr) {
  const num = (descr.match(/^([A-Z](?:\.\d+)*(?:\.[A-Z])?(?:\.\d+)*)\)/) || [])[1];
  if (!num) return true;
  return !tutteDescr.some((d) => d !== descr && d.startsWith(num + '.'));
}

export function analizzaMobilita(rows) {
  // пасивните листови кодове, разделени по канал
  const descrPerCod = new Map();
  for (const r of rows) {
    const cod = r['Codice Voce Contabile'] || '';
    if (!cod.startsWith('BA')) continue;
    const d = r['Descrizione Voce Contabile'] || '';
    if (RE_EXTRA.test(d) && !RE_INTRA.test(d) && !RE_NON_RESIDENTI.test(d)) descrPerCod.set(cod, d);
  }
  const descrizioni = [...descrPerCod.values()];
  const foglie = new Map([...descrPerCod.entries()].filter(([, d]) => eFoglia(d, descrizioni)));

  const perRegione = new Map();
  for (const r of rows) {
    const codEnte = (r['Codice Ente SSN'] || '').padStart(3, '0');
    if (codEnte === '999') continue; // консолидираният дублира
    const cod = r['Codice Voce Contabile'] || '';
    const attiva = cod === COD_ATTIVA;
    const passiva = foglie.has(cod);
    if (!attiva && !passiva) continue;
    const imp = Number(r['Importo Totale']);
    if (!Number.isFinite(imp)) continue;
    const codReg = r['Codice Regione'] || '';
    let g = perRegione.get(codReg);
    if (!g) {
      g = { codReg, regione: r['Descrizione Regione'] || codReg, passivaPubblico: 0, passivaPrivato: 0, attivaParziale: 0 };
      perRegione.set(codReg, g);
    }
    if (attiva) g.attivaParziale += imp;
    else if (RE_PRIVATO.test(foglie.get(cod))) g.passivaPrivato += imp;
    else g.passivaPubblico += imp;
  }
  const regioni = [...perRegione.values()]
    .map((g) => ({ ...g, passivaTot: g.passivaPubblico + g.passivaPrivato }))
    .sort((a, b) => b.passivaTot - a.passivaTot);
  return {
    regioni,
    totPassiva: regioni.reduce((s, g) => s + g.passivaTot, 0),
    totAttivaParziale: regioni.reduce((s, g) => s + g.attivaParziale, 0),
    codiciPassiva: [...foglie.keys()].sort(),
  };
}

async function main() {
  const files = (await readdir(BDAP_DIR)).filter((f) => /^ce-\d{4}\.csv$/.test(f)).sort();
  const perAnno = {};
  let ultimo = null;
  for (const file of files.slice(-3)) {
    const anno = Number(file.match(/(\d{4})/)[1]);
    const rows = parseCsv(await readFile(join(BDAP_DIR, file), 'utf8'), { separator: ';' });
    const res = analizzaMobilita(rows);
    perAnno[anno] = { regioni: res.regioni, totPassiva: res.totPassiva, totAttivaParziale: res.totAttivaParziale };
    ultimo = { anno, ...res };
    console.log(`${anno}: разходи навън ${(res.totPassiva / 1e9).toFixed(2)} млрд (pubblico+privato), актива (частична) ${(res.totAttivaParziale / 1e9).toFixed(2)} млрд`);
  }
  await writeJson(join(DATA_DIR, 'mobilita.json'), {
    generatoIl: new Date().toISOString(),
    nota: 'Passiva = somma delle voci di costo CE foglia con «Extraregione» (canali: da pubblico / da privato), su aziende + GSA (999 escluso) — ben definita. L’attiva (AA0450, ricavi da soggetti pubblici Extraregione) è PARZIALE: parte dei flussi compensativi transita dalla GSA sotto altre voci; per questo non pubblichiamo un «saldo».',
    codiciPassiva: ultimo.codiciPassiva,
    ultimoAnno: ultimo.anno,
    perAnno,
  });
  console.log(`Готово → data/mobilita.json (${ultimo.regioni.length} региона, ${Object.keys(perAnno).length} години)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
