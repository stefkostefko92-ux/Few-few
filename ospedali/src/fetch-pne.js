// PNE — Programma Nazionale Esiti (AGENAS, per il Ministero della Salute).
// Извлича РИСК-НАГЛАСЕНИ клинични резултати per болница от недокументирания
// JSON API на PNE и ги СВЕЖДА до РЕГИОНАЛНИ агрегати за подбрани индикатори.
// Кръстоската „харчи много И лекува зле" се прави на регионално ниво в сайта
// (страницата получава разхода на глава отделно).
//
// ⚠️ ЛИЦЕНЗ: PNE няма изричен open-data лиценз. Данните са публични (AGENAS за
// Мин. Здраве), но за да сме законово чисти НЕ препубликуваме суровата таблица
// (~349k реда). Съхраняваме и показваме САМО производни РЕГИОНАЛНИ агрегати за
// шепа подбрани индикатори + изрична атрибуция и връзка към първоизточника.
//
// ⚠️ API-то е КРЕХКО (Azure App Gateway пред backend):
//  - Реалният backend е на път `/pne/…`; `/api/pne/…` връща SPA обвивката (HTML),
//    а НЕ JSON — затова пазим се от не-JSON отговор и го третираме като грешка.
//  - size е капнат на 2000; `unpaged=true` на /valori → 504; много бързи заявки
//    убиват целия backend (502/504). Затова: пагинираме БАВНО (една заявка на
//    ~1.8s), retry с експоненциално изчакване (3,6,12,24s; до 5 опита), НИКОГА
//    паралелно, и кешираме всяка сурова страница в data/raw/pne/ (идемпотентно).
//    Ако страница упорито дава 5xx — пропускаме я и броим липсата (graceful).
//
// Изход: data/pne.json — производни агрегати, провенанс и покритие.

// @ts-check
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { writeJson } from './lib/http.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';

const BASE = 'https://pne.agenas.it/pne';
const EDIZIONE_UUID = '59c174f9-1ffa-4c5e-9277-ecaba6debc64';
const EDIZIONE = '2025';
const SIZE = 2000; // капът на API-то
const RAW_PNE = join(RAW_DIR, 'pne');

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) ospedali-trasparenti/0.1 (open data ETL; https://carbonstealth.eu)';

// 2-цифрен ISTAT код (водещите 2 цифри на 8-цифрения „codice" на структурата,
// който е SDO кодът) → нашия ключ на регион (както в build-site REGIONI и SDO).
// Внимание: 04 = Trentino-Alto Adige (Bolzano + Trento заедно) → „taa".
/** @type {Record<string, string>} */
const ISTAT2KEY = {
  '01': '010', '02': '020', '03': '030', '04': 'taa', '05': '050',
  '06': '060', '07': '070', '08': '080', '09': '090', '10': '100',
  '11': '110', '12': '120', '13': '130', '14': '140', '15': '150',
  '16': '160', '17': '170', '18': '180', '19': '190', '20': '200',
};

// ---- Подбрани индикатори (мачваме по codice-подсказка и/или регекс на descr) --
// tipoMigliore: „basso" = по-ниска стойност е по-добра (смъртност, дял цезарови);
//               „alto"  = по-висока стойност е по-добра (навременна операция).
// Регексите са широки, за да устоят на дребни разлики в официалните описания;
// избираме ПЪРВИЯ съвпадащ индикатор и логваме кой точно (codice+descr).
const SELEZIONE = [
  {
    chiave: 'cesarei',
    tipoMigliore: 'basso',
    unita: '%',
    codiceHint: ['37'],
    re: /tagli[oa]\s+cesare|cesare[oi]\s+primar/i,
  },
  {
    chiave: 'femore48',
    tipoMigliore: 'alto',
    unita: '%',
    codiceHint: ['640'],
    re: /(femore|collo\s+del\s+femore).*(48\s*or|entro\s+48)|(48\s*or|entro\s+48).*femore/i,
  },
  {
    chiave: 'mortalitaIma',
    tipoMigliore: 'basso',
    unita: '%',
    codiceHint: [],
    re: /mortalit.*(infarto|\bima\b|miocard)/i,
  },
  {
    chiave: 'mortalitaIctus',
    tipoMigliore: 'basso',
    unita: '%',
    codiceHint: [],
    re: /mortalit.*ictus/i,
  },
  {
    chiave: 'mortalitaScompenso',
    tipoMigliore: 'basso',
    unita: '%',
    codiceHint: [],
    re: /mortalit.*scompenso/i,
  },
  {
    chiave: 'colecistectomia',
    tipoMigliore: 'alto',
    unita: '%',
    codiceHint: ['28'],
    re: /colecistectomi.*laparoscop|laparoscop.*colecistectomi/i,
  },
];

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** Число от клетка на API-то (толерира италианска запетая и низ). */
/** @param {unknown} v @returns {number|null} */
export function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * GET към PNE API с бавни повторни опити. Пази се от 5xx И от SPA-обвивката
 * (HTML вместо JSON, което Azure връща при паднал backend). Хвърля при провал
 * след `tentativi` опита.
 */
/** @param {string} url @param {{ tentativi?: number }} [opts] */
async function fetchPneJson(url, { tentativi = 5 } = {}) {
  let ultimo;
  for (let i = 0; i < tentativi; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(90_000),
        redirect: 'follow',
      });
      const txt = await res.text();
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (txt.trimStart().startsWith('<')) {
        // HTML вместо JSON → SPA обвивка / gateway страница → backend не отговаря
        throw new Error('отговор не е JSON (SPA/gateway — backend недостъпен)');
      }
      return JSON.parse(txt);
    } catch (err) {
      ultimo = err;
      if (i === tentativi - 1) break;
      const wait = 3000 * 2 ** i; // 3s, 6s, 12s, 24s
      console.warn(`  опит ${i + 1}/${tentativi} неуспешен (${err instanceof Error ? err.message : String(err)}); чакам ${wait}ms`);
      await sleep(wait);
    }
  }
  throw ultimo;
}

/** Съдържанието на страничен или unpaged отговор като масив. */
/** @param {any} j @returns {any[]} */
function comeArray(j) {
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.content)) return j.content;
  return [];
}

/** Малък речник с кеш на диска (идемпотентно). */
/** @param {string} nome @param {string} url */
async function getDizionario(nome, url) {
  const file = join(RAW_PNE, `${nome}.json`);
  try {
    const st = await stat(file);
    if (st.size > 0) return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // няма кеш — теглим
  }
  const j = await fetchPneJson(url);
  await writeJson(file, j);
  return j;
}

/** Една страница /valori с кеш на диска. Връща { data, cached }. */
/** @param {number} pagina */
async function getPaginaValori(pagina) {
  const file = join(RAW_PNE, `page-${pagina}.json`);
  try {
    const st = await stat(file);
    if (st.size > 0) return { data: JSON.parse(await readFile(file, 'utf8')), cached: true };
  } catch {
    // няма кеш — теглим
  }
  const url = `${BASE}/valori?edizione=${EDIZIONE_UUID}&page=${pagina}&size=${SIZE}`;
  const j = await fetchPneJson(url);
  await writeJson(file, j);
  return { data: j, cached: false };
}

/**
 * ЧИСТА, тествана регионална агрегация за ЕДИН индикатор.
 *
 *   valori            — редове { indicatore:{id}, struttura:{id},
 *                                valore:{ n, perc, perc_adj, tipo } }
 *   strutturaRegione  — Map|обект: struttura.id → ключ на региона
 *   indicatoreScelto  — { id, codice, descr, chiave, tipoMigliore, unita }
 *
 * За всеки регион смята РЕГИОНАЛНА претеглена по обем (n) средна на perc_adj
 * (при липсващо n — проста средна). Пропуска редове без регион или без стойност.
 * Връща per регион { valore, nStrutture, volume } + национална средна и мета.
 */
/** @param {any[]} valori @param {any} strutturaRegione @param {any} indicatoreScelto */
export function aggregaRegione(valori, strutturaRegione, indicatoreScelto) {
  /** @param {any} id */
  const reg = (id) =>
    typeof strutturaRegione?.get === 'function' ? strutturaRegione.get(id) : strutturaRegione?.[id];

  /** @type {Record<string, any>} */
  const acc = {}; // key → { num, den, nStrutture, volume }
  let nNum = 0;
  let nDen = 0;
  let nStr = 0;
  let nVol = 0;

  for (const v of valori) {
    if (!v || !v.indicatore || v.indicatore.id !== indicatoreScelto.id) continue;
    const sid = v.struttura && v.struttura.id;
    const key = sid != null ? reg(sid) : undefined;
    if (!key) continue;
    const val = v.valore || {};
    const p = val.perc_adj != null ? toNum(val.perc_adj) : toNum(val.perc);
    if (p == null) continue;
    const n = toNum(val.n);
    const w = n != null && n > 0 ? n : 1; // без обем → проста средна (тежест 1)

    const g = acc[key] || (acc[key] = { num: 0, den: 0, nStrutture: 0, volume: 0 });
    g.num += p * w;
    g.den += w;
    g.nStrutture += 1;
    g.volume += n != null && n > 0 ? n : 0;

    nNum += p * w;
    nDen += w;
    nStr += 1;
    nVol += n != null && n > 0 ? n : 0;
  }

  /** @type {Record<string, any>} */
  const perRegione = {};
  for (const [key, g] of Object.entries(acc)) {
    perRegione[key] = {
      valore: g.den ? g.num / g.den : null,
      nStrutture: g.nStrutture,
      volume: g.volume,
    };
  }

  return {
    codice: indicatoreScelto.codice,
    descr: indicatoreScelto.descr,
    chiave: indicatoreScelto.chiave,
    tipoMigliore: indicatoreScelto.tipoMigliore,
    unita: indicatoreScelto.unita,
    perRegione,
    nazionale: { valore: nDen ? nNum / nDen : null, nStrutture: nStr, volume: nVol },
  };
}

/** Съпоставя SELEZIONE спрямо речника с индикатори; връща избраните (мета + id). */
/** @param {any[]} indicatori */
export function scegliIndicatori(indicatori) {
  /** @type {any[]} */
  const scelti = [];
  for (const sel of SELEZIONE) {
    const cand = indicatori.find((/** @type {any} */ ind) => {
      const cod = String(ind.codice ?? '').trim();
      const descr = String(ind.descr ?? '');
      if (sel.codiceHint.includes(cod) && sel.re.test(descr)) return true;
      return sel.re.test(descr);
    });
    if (cand) {
      scelti.push({
        id: cand.id,
        codice: String(cand.codice ?? sel.chiave),
        descr: String(cand.descr ?? ''),
        chiave: sel.chiave,
        tipoMigliore: sel.tipoMigliore,
        unita: sel.unita,
      });
    } else {
      console.warn(`  ⚠️ не намерих индикатор за „${sel.chiave}" (${sel.re})`);
    }
  }
  return scelti;
}

async function main() {
  console.log('PNE (AGENAS) — теглене на речници…');
  const indicatori = comeArray(
    await getDizionario('indicatori', `${BASE}/indicatori?edizione=${EDIZIONE_UUID}&unpaged=true`)
  );
  await sleep(1800);
  const strutture = comeArray(
    await getDizionario('strutture', `${BASE}/strutture?edizione=${EDIZIONE_UUID}&unpaged=true`)
  );
  console.log(`  индикатори: ${indicatori.length}, структури: ${strutture.length}`);

  // струкtura.id (UUID) → ключ на регион (през 8-цифрения codice → ISTAT2)
  /** @type {Map<any, string>} */
  const strutturaRegione = new Map();
  let mappate = 0;
  for (const s of strutture) {
    const cod = String(s.codice ?? '').trim();
    const key = cod.length >= 2 ? ISTAT2KEY[cod.slice(0, 2)] : undefined;
    if (key && s.id != null) {
      strutturaRegione.set(s.id, key);
      mappate++;
    }
  }
  console.log(`  структури, мапнати към регион: ${mappate}/${strutture.length}`);

  const scelti = scegliIndicatori(indicatori);
  if (scelti.length === 0) throw new Error('нито един подбран индикатор не съвпадна — прекратявам');
  console.log('  подбрани индикатори:');
  for (const s of scelti) console.log(`    [${s.codice}] ${s.chiave}: ${s.descr}`);
  const selectedIds = new Set(scelti.map((s) => s.id));

  // ---- Бавна пагинация на /valori, филтрирана до подбраните индикатори ----
  // Пазим САМО редовете на подбраните индикатори (шепа хиляди) → нищожна памет
  // и никаква препубликация на суровата таблица.
  /** @type {any[]} */
  const valoriScelti = [];
  let pagineLette = 0;
  let pagineFallite = 0;
  /** @type {number|null} */
  let totalElements = null;
  /** @type {number|null} */
  let totalPages = null;

  // Първа страница: учи totalPages/totalElements.
  try {
    const { data, cached } = await getPaginaValori(0);
    totalElements = data.totalElements ?? null;
    totalPages = data.totalPages ?? null;
    for (const r of comeArray(data)) if (r?.indicatore && selectedIds.has(r.indicatore.id)) valoriScelti.push(r);
    pagineLette++;
    if (!cached) await sleep(1800);
  } catch (err) {
    console.error(`  ⚠️ страница 0 не се зареди (${err instanceof Error ? err.message : String(err)}) — не мога да науча обема; спирам пагинацията`);
    pagineFallite++;
  }

  if (totalPages != null) {
    console.log(`  /valori: totalElements=${totalElements}, totalPages=${totalPages} — пагинирам бавно…`);
    for (let p = 1; p < totalPages; p++) {
      try {
        const { data, cached } = await getPaginaValori(p);
        for (const r of comeArray(data)) if (r?.indicatore && selectedIds.has(r.indicatore.id)) valoriScelti.push(r);
        pagineLette++;
        if (p % 20 === 0) console.log(`    …страница ${p}/${totalPages} (събрани редове: ${valoriScelti.length})`);
        if (!cached) await sleep(1800);
      } catch (err) {
        // упорит 5xx → пропускаме страницата (graceful degradation)
        console.warn(`    ⚠️ пропускам страница ${p}: ${err instanceof Error ? err.message : String(err)}`);
        pagineFallite++;
        await sleep(1800);
      }
    }
  }

  // ---- Агрегация per индикатор ----
  /** @type {Record<string, any>} */
  const perRegione = {};
  /** @type {Record<string, any>} */
  const nazionale = {};
  /** @type {any[]} */
  const indicatoriOut = [];
  for (const ind of scelti) {
    const agg = aggregaRegione(valoriScelti, strutturaRegione, ind);
    indicatoriOut.push({
      codice: ind.codice,
      chiave: ind.chiave,
      descr: ind.descr,
      tipoMigliore: ind.tipoMigliore,
      unita: ind.unita,
    });
    nazionale[ind.codice] = { valore: agg.nazionale.valore, nStrutture: agg.nazionale.nStrutture };
    for (const [key, g] of Object.entries(agg.perRegione)) {
      (perRegione[key] || (perRegione[key] = {}))[ind.codice] = g;
    }
  }

  const out = {
    generatoIl: new Date().toISOString(),
    fonte: 'AGENAS — Programma Nazionale Esiti (PNE), edizione 2025',
    url: 'https://pne.agenas.it/',
    licenza:
      'Fonte pubblica AGENAS; nessuna licenza aperta esplicita — dati aggregati per regione, non ripubblicazione integrale.',
    edizione: EDIZIONE,
    indicatori: indicatoriOut,
    perRegione,
    nazionale,
    copertura: {
      totalElements,
      totalPages,
      pagineLette,
      pagineFallite,
      struttureTotali: strutture.length,
      struttureMappate: mappate,
      indicatoriTrovati: scelti.length,
      indicatoriRichiesti: SELEZIONE.length,
      righeSelezionate: valoriScelti.length,
    },
  };

  await writeJson(join(DATA_DIR, 'pne.json'), out);

  console.log('\nГотово → data/pne.json');
  console.log(
    `  покритие: страници ${pagineLette}/${totalPages ?? '?'} (пропуснати ${pagineFallite}), ` +
      `структури ${mappate}/${strutture.length}, индикатори ${scelti.length}/${SELEZIONE.length}`
  );
  for (const ind of indicatoriOut) {
    const naz = nazionale[ind.codice];
    const nReg = Object.values(perRegione).filter((r) => r[ind.codice]).length;
    console.log(
      `  ${ind.chiave.padEnd(20)} naz=${naz?.valore == null ? '—' : naz.valore.toFixed(1)}%  региони=${nReg}`
    );
  }
  if (pagineFallite > 0 || (totalPages != null && pagineLette < totalPages)) {
    console.warn(
      '  ⚠️ ЧАСТИЧНО: част от страниците липсват — регионалните средни са върху наличните структури.'
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
