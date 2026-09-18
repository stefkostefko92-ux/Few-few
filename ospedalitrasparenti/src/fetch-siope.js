// SIOPE — реалните КАСОВИ плащания на здравните структури (по икономически код,
// месечно). Служи за независима крос-проверка спрямо счетоводните баланси (CE):
// SIOPE е касова база (кога излизат парите), CE е начисляване. Засича и
// декемврийско „изхарчване по каса" (bunching).
//
// Източник: RGS/MEF — SIOPE, BDAP Open Data (CKAN), лиценз CC BY 3.0.
//   Каталог: package_search?q=siope  → фамилия „SIOPE Movimenti cumulati mensili
//   di Spesa" — по 1 CSV на РЕГИОН × ГОДИНА. Заглавие: „YYYY - Regione - SIOPE …";
//   името на пакета носи региона като „reg<NN>" (reg12 = Lazio) — по-сигурно от
//   join по CF, затова работим на РЕГИОНАЛНО ниво (агрегат на всички здравни enti).
//   Dump: /datastore/dump/<uuid>.csv (HTTPS, ~110 MB/регион).
//
// Особености на файла (инспектирани върху реален dump 2024/2025):
//  - latin1 (ISO-8859), CRLF, разделител „;“, ВСЯКО поле е оградено в кавички.
//  - Колони: Codice/…/Tipologia Ente BDAP; Descrizione Ente BDAP; …;
//    „Anno/Mese calendario" (напр. „2025/03"); Tipologia del Movimento;
//    Codice Titolo CG; Descrizione Titolo CG; „Codice Gestionale Enti Locali"
//    (SIOPE код U####…); Descrizione CG; Popolazione ISTAT; „Importo cumulato".
//  - „Importo cumulato" = year-to-date → месечен ПОТОК = разлика между съседните
//    месеци (декември = годишен тотал). Форуърд-фил при липсващ месец.
//  - Здравни типове (Codice Tipologia Ente BDAP): AS=ASL, AO=Aziende Ospedaliere
//    (вкл. policlinici universitari), IR=IRCCS публични, IZ=IZS. ИЗКЛЮЧВАМЕ
//    RS (REGIONI — GESTIONE SANITARIA / GSA) и CP (GESTIONI CENTRALI PAGAMENTI
//    ENTI SSN): те са регионална консолидация и ДУБЛИРАТ плащанията на аджиендите
//    (проверено: с тях Lazio 2024 = 24,7 mld вместо реалните ~6 mld) — точно както
//    CE изключва GSA сметките 000/999. UN (università) НЕ са болници.

// @ts-check
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fetchJson, curlDownloadToFile, writeJson } from './lib/http.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';

const CKAN = 'https://bdap-opendata.rgs.mef.gov.it/SpodCkanApi/api/3/action';

// Последната ПЪЛНА година (проверено: 2025 носи месеци 01–12 за всички региони;
// 2026 е още частична). Ако RGS публикува нова пълна година — вдигни числото.
const ANNO = 2025;

// 2-цифрен код на региона от SIOPE (reg<NN> в името на пакета) → нашия ключ на
// регион (както REGIONI в build-site.js). reg04 = Trentino-Alto Adige
// (Bolzano+Trento заедно) → „taa".
/** @type {Record<string, string>} */
const REG2KEY = {
  '01': '010', '02': '020', '03': '030', '04': 'taa', '05': '050',
  '06': '060', '07': '070', '08': '080', '09': '090', '10': '100',
  '11': '110', '12': '120', '13': '130', '14': '140', '15': '150',
  '16': '160', '17': '170', '18': '180', '19': '190', '20': '200',
};

// Операционните здравни структури — perimetro за независимата крос-проверка с CE.
const HEALTH_TIPI = new Set(['AS', 'AO', 'IR', 'IZ']);

/** Здравна ли е структурата по код на типа (Codice Tipologia Ente BDAP)? */
/** @param {string|undefined} codiceTipo @returns {boolean} */
export function eSanitario(codiceTipo) {
  return HEALTH_TIPI.has(String(codiceTipo || '').trim());
}

/**
 * Макро-група на икономическия код (SIOPE „Codice Gestionale Enti Locali").
 *  - Farmaci        U2101 Prodotti farmaceutici + U3106 farmaceutica da privati
 *  - Dispositivi    U2112 Dispositivi medici + U2198 altri beni sanitari
 *  - ServiziPrivati U31xx Acquisti di servizi sanitari (без фармацевтиката U3106):
 *                   medicina di base, specialistica, ospedaliera e socio-sanitaria
 *                   da privati/convenzionati
 *  - Personale      U1xxx Competenze, ritenute e contributi del personale
 *  - Altro          останалото (utenze, tributi/IVA/IRAP, trasferimenti, investimenti…)
 */
/** @param {string|undefined} codice @returns {string} */
export function macroDi(codice) {
  const c = String(codice || '').trim().slice(0, 5);
  if (c === 'U2101' || c === 'U3106') return 'Farmaci';
  if (c === 'U2112' || c === 'U2198') return 'Dispositivi';
  if (/^U31/.test(c)) return 'ServiziPrivati';
  if (/^U1/.test(c)) return 'Personale';
  return 'Altro';
}

function macroZero() {
  return { Farmaci: 0, Dispositivi: 0, ServiziPrivati: 0, Personale: 0, Altro: 0 };
}

/**
 * Агрегира касовите плащания (чиста, тествана функция).
 *
 * Вход: `rowsPerRegione` = map ключ-на-регион → масив редове (само здравни enti,
 * една година). Всеки ред е обект с ключове от заглавието на SIOPE CSV:
 *   „Anno/Mese calendario", „Descrizione Ente BDAP",
 *   „Codice Gestionale Enti Locali", „Importo cumulato".
 *
 * Изход:
 *   { anno,
 *     nazionale:  { spesaTotale, perMacro:{…}, mesi:[12 месечни потока], dicSuMedia },
 *     perRegione: { key: { spesaTotale, perMacro:{…}, mesi:[12], dicSuMedia } } }
 *
 * Месечен поток = разлика на кумулативните стойности на съседните месеци, по
 * серия (ente × код) и после сумирано. „dicSuMedia" = декемврийски поток / среден
 * месечен поток — индикатор за декемврийско натрупване по каса.
 */
/** @param {Record<string, Record<string, string>[]>} rowsPerRegione */
export function aggrega(rowsPerRegione) {
  /** @type {Record<string, any>} */
  const perRegione = {};
  const nazMesi = new Array(12).fill(0);
  /** @type {Record<string, number>} */
  const nazMacro = macroZero();
  /** @type {string[]} */
  const incompleti = []; // региони с отрязана/непълна година (изключени от тотала)
  let spesaNaz = 0;
  /** @type {number|null} */
  let anno = null;

  for (const [key, rows] of Object.entries(rowsPerRegione)) {
    // серия = ente|код → кумулативните 12 стойности (null = неотчетен месец)
    /** @type {Map<string, { arr: number[], code: string }>} */
    const series = new Map();
    for (const r of rows) {
      const am = String(r['Anno/Mese calendario'] ?? r.annoMese ?? '');
      const slash = am.indexOf('/');
      if (slash < 0) continue;
      const mese = Number(am.slice(slash + 1));
      if (!(mese >= 1 && mese <= 12)) continue;
      if (anno == null) anno = Number(am.slice(0, slash));
      const imp = Number(r['Importo cumulato'] ?? r.importo);
      if (!Number.isFinite(imp)) continue;
      const ente = String(r['Descrizione Ente BDAP'] ?? r.ente ?? '');
      const code = String(r['Codice Gestionale Enti Locali'] ?? r.codice ?? '').trim().slice(0, 5);
      const sk = `${ente}${code}`;
      let s = series.get(sk);
      if (!s) {
        s = { arr: /** @type {number[]} */ (new Array(12).fill(null)), code };
        series.set(sk, s);
      }
      // при дубликат за същия месец: пазим по-голямата кумулативна стойност
      s.arr[mese - 1] = s.arr[mese - 1] == null ? imp : Math.max(s.arr[mese - 1], imp);
    }

    const mesi = new Array(12).fill(0);
    /** @type {Record<string, number>} */
    const macro = macroZero();
    let spesa = 0;
    for (const { arr, code } of series.values()) {
      // форуърд-фил: липсващ месец = предходната кумулативна (0 преди първия отчет)
      let last = 0;
      for (let m = 0; m < 12; m++) {
        if (arr[m] == null) arr[m] = last;
        last = arr[m];
      }
      // месечен поток = разлика на съседните кумулативни стойности
      let prev = 0;
      for (let m = 0; m < 12; m++) {
        mesi[m] += arr[m] - prev;
        prev = arr[m];
      }
      const tot = arr[11]; // годишният тотал = декемврийската кумулативна
      spesa += tot;
      macro[macroDi(code)] += tot;
    }

    // Пълнота: отрязано от timeout сваляне дава серия с нули след първите месеци.
    // Пълна година = ≥10 месеца с ненулев поток. Непълните → mancanti (не в тотала),
    // за да не показваме подценени числа и нулев декември.
    const mesiConFlusso = mesi.filter((v) => v > 0).length;
    if (mesiConFlusso < 10 || mesi[11] <= 0) {
      incompleti.push(key);
      continue;
    }
    const media = spesa / 12;
    perRegione[key] = {
      spesaTotale: spesa,
      perMacro: macro,
      mesi,
      dicSuMedia: media ? mesi[11] / media : 0,
    };
    for (let m = 0; m < 12; m++) nazMesi[m] += mesi[m];
    for (const k of Object.keys(nazMacro)) nazMacro[k] += macro[k];
    spesaNaz += spesa;
  }

  const mediaNaz = spesaNaz / 12;
  return {
    anno,
    nazionale: {
      spesaTotale: spesaNaz,
      perMacro: nazMacro,
      mesi: nazMesi,
      dicSuMedia: mediaNaz ? nazMesi[11] / mediaNaz : 0,
    },
    perRegione,
    incompleti,
  };
}

// ---------- ETL (само при директно стартиране) ----------

/** Quote-aware разделяне на един CSV ред (маха ограждащите кавички, „" → "). */
/** @param {string} line @param {string} [sep] @returns {string[]} */
function splitCsvLine(line, sep = ';') {
  /** @type {string[]} */
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else if (ch === '"') {
      q = true;
    } else if (ch === sep) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Индекси на нужните колони по име (никога по позиция — вж. капаните в CLAUDE.md). */
/** @param {string[]} header */
function indici(header) {
  return {
    tipo: header.indexOf('Codice Tipologia Ente BDAP'),
    mese: header.indexOf('Anno/Mese calendario'),
    ente: header.indexOf('Descrizione Ente BDAP'),
    cg: header.indexOf('Codice Gestionale Enti Locali'),
    imp: header.indexOf('Importo cumulato'),
  };
}

/**
 * Поточно чете dump-а (latin1), задържа само редовете на здравните структури и
 * връща минимални обекти за `aggrega`. Стриймва ред по ред → без 110 MB в паметта.
 */
/** @param {string} filePath @returns {Promise<Record<string, string>[]>} */
async function leggiRigheSanita(filePath) {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  /** @type {{ tipo: number, mese: number, ente: number, cg: number, imp: number }|null} */
  let idx = null;
  /** @type {Record<string, string>[]} */
  const rows = [];
  for await (const line of rl) {
    if (!line) continue;
    const f = splitCsvLine(line, ';');
    if (idx == null) { idx = indici(f); continue; } // заглавен ред
    if (idx.tipo < 0) break; // неразпознат формат — не рискуваме
    if (!eSanitario(f[idx.tipo])) continue;
    rows.push({
      'Anno/Mese calendario': f[idx.mese],
      'Descrizione Ente BDAP': f[idx.ente],
      'Codice Gestionale Enti Locali': f[idx.cg],
      'Importo cumulato': f[idx.imp],
    });
  }
  return rows;
}

/** Пагинира package_search?q=siope и връща Spesa пакетите за годината (по регион). */
/** @param {number} anno */
async function catalogoSpesa(anno) {
  /** @type {any[]} */
  const packs = [];
  for (let start = 0; ; start += 200) {
    const j = await fetchJson(`${CKAN}/package_search?q=siope&rows=200&start=${start}`, { timeoutMs: 120_000 });
    const res = (j && j.result && j.result.results) || [];
    packs.push(...res);
    if (res.length < 200) break;
  }
  /** @type {Array<{ key: string, title: string, url: string }>} */
  const out = [];
  for (const p of packs) {
    if (!/SIOPE Movimenti cumulati mensili di Spesa$/.test(p.title || '')) continue;
    const my = String(p.title).match(/^(\d{4}) /);
    if (!my || Number(my[1]) !== anno) continue;
    const rm = String(p.name || '').match(/reg(\d{1,2})/);
    if (!rm) continue;
    const key = REG2KEY[rm[1].padStart(2, '0')];
    if (!key) continue;
    const dump = (p.resources || []).find(
      (/** @type {any} */ r) => (r.format || '').toLowerCase() === 'csv' && /\/datastore\/dump\//.test(r.url || '')
    );
    if (!dump) continue;
    out.push({ key, title: p.title, url: dump.url.replace(/^http:/, 'https:') });
  }
  // при повторни ключове (регионът се среща веднъж) пазим първия
  /** @type {Set<string>} */
  const seen = new Set();
  return out.filter((p) => (seen.has(p.key) ? false : seen.add(p.key)));
}

async function main() {
  console.log(`SIOPE Spesa ${ANNO} — тегля каталога от CKAN…`);
  const pkgs = await catalogoSpesa(ANNO);
  console.log(`  ${pkgs.length}/20 региона в каталога за ${ANNO}`);

  /** @type {Record<string, Record<string, string>[]>} */
  const rowsPerRegione = {};
  /** @type {string[]} */
  const mancanti = [];
  for (const p of pkgs) {
    const file = join(RAW_DIR, 'siope', `${p.key}-${ANNO}.csv`);
    try {
      const fresh = await curlDownloadToFile(p.url, file, { timeoutSec: 900 });
      const rows = await leggiRigheSanita(file);
      await rm(file, { force: true }); // трием суровия CSV (~110 MB) за диск
      rowsPerRegione[p.key] = rows;
      console.log(`  ✓ ${p.key} (${p.title.slice(0, 40)}…): ${rows.length} здравни реда ${fresh ? '' : '(кеш)'}`);
    } catch (err) {
      console.warn(`  ✗ ${p.key} (${p.title}): ${err instanceof Error ? err.message : String(err)}`);
      mancanti.push(p.key);
      await rm(file, { force: true }).catch(() => {});
    }
  }
  // региони изобщо липсващи в каталога
  for (const key of Object.values(REG2KEY)) {
    if (!(key in rowsPerRegione) && !mancanti.includes(key)) mancanti.push(key);
  }

  const { incompleti: _incompleti, ...agg } = aggrega(rowsPerRegione);
  // региони с непълна година (отрязано сваляне) се третират като липсващи
  const tuttiMancanti = [...new Set([...mancanti, ...(_incompleti || [])])];

  await writeJson(join(DATA_DIR, 'siope.json'), {
    generatoIl: new Date().toISOString(),
    fonte: 'RGS/MEF — SIOPE (BDAP open data), CC BY 3.0',
    url: 'https://openbdap.rgs.mef.gov.it/',
    licenza: 'CC BY 3.0',
    perimetro:
      'Aziende sanitarie operative (ASL, aziende ospedaliere, IRCCS pubblici, IZS). ' +
      'Esclusi la gestione sanitaria accentrata (GSA) e i pagamenti centrali SSN per evitare doppi conteggi.',
    ...agg,
    regioniMancanti: tuttiMancanti,
  });

  const n = agg.nazionale;
  const quotaFarm = n.spesaTotale ? n.perMacro.Farmaci / n.spesaTotale : 0;
  console.log(
    `\nГотово → data/siope.json (${agg.anno}): ` +
      `спеса по каса ${(n.spesaTotale / 1e9).toFixed(1)} mld €, ` +
      `фармацевтика ${(quotaFarm * 100).toFixed(1)}%, ` +
      `dic/media национ. ${n.dicSuMedia.toFixed(2)}× ` +
      `(${Object.keys(agg.perRegione).length} региона${mancanti.length ? `, липсват: ${mancanti.join(',')}` : ''})`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
