// PNRR Missione 6 „Salute" — измерим регионален слой върху здравните инвестиции
// на Плана за възстановяване: Case della Comunità, Ospedali di Comunità, COT
// (M6C1) и болнично технологично обновяване (M6C2), регион по регион.
//
// ИЗТОЧНИК: OpenPNRR (Openpolis) върху официалните данни ReGiS на Държавната сметна
// палата — същите данни като italiadomani.gov.it (който е Akamai-блокиран за ботове).
//   progetti.csv           → един ред на проект (финансиране, codice_misura, титуляр)
//   progetti_territori.csv  → progetto_id → територия (ISTAT код + tipologia)
// Лиценз: ODbL 1.0 (атрибуция Openpolis + ReGiS/MEF).
//
// ЧЕСТНА РАМКА (важно): това са ПЛАНИРАНИ/разпределени средства и брой проекти по
// ReGiS — НЕ реален физически напредък на строежите (той варира и се следи от
// самия ReGiS/Italiadomani). Показателят е „indicatore, non prova".
//
// РАЗДЕЛИТЕЛ: запетая. Числата са машинен формат („179000.00") → Number().
// ФИЛТЪР: codice_misura ~ /^M6/ (M6C1 = територия/Case-Ospedali di Comunità/COT;
//         M6C2 = болници: технологии, безопасност, изследвания).
//
// РЕГИОН (документиран прагматичен избор): проектите носят територия в
// progetti_territori.csv с tipologia R(регион)/P(провинция)/CM(метрополен
// град)/C(комуна)/N(национален). Регионът се решава по приоритет:
//   R  → istat_id е 2-цифрен регионален код → директно;
//   P/CM → 3-цифрен код на провинция → PROV_REGIONE;
//   C  → 6-цифрен код на комуна → първите 3 цифри = провинция → PROV_REGIONE.
// Ако проектът покрива РАЗЛИЧНИ региони (или е национален) → брои се САМО
// национално, не се приписва на един регион (за да не се надуват регионалните
// суми). Така perRegione е консервативен и честен; nazionale покрива целия M6.
//
// Изход: data/pnrr-salute.json. Суровите CSV се трият след обработка (диск).

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { curlDownloadToFile, writeJson } from './lib/http.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';

const URL_PROGETTI = 'https://openpnrr.s3.amazonaws.com/media/progetti.csv';
const URL_TERRITORI = 'https://openpnrr.s3.amazonaws.com/media/progetti_territori.csv';
const RAW_PROGETTI = join(RAW_DIR, 'pnrr-progetti.csv');
const RAW_TERRITORI = join(RAW_DIR, 'pnrr-progetti-territori.csv');
const OUT_FILE = join(DATA_DIR, 'pnrr-salute.json');

// ---------- ISTAT провинция (3 цифри) → регион (2 цифри) ----------
// Провинциалните кодове НЕ са непрекъснати по региони → изрична таблица (по-сигурно
// от „първите две цифри"). Обхваща 107-те провинции + отменените сардински кодове.
const PROV_REGIONE = (() => {
  const m = {};
  const set = (reg, ...provs) => provs.forEach((p) => (m[p] = reg));
  set('01', '001', '002', '003', '004', '005', '006', '096', '103'); // Piemonte
  set('02', '007'); // Valle d'Aosta
  set('03', '012', '013', '014', '015', '016', '017', '018', '019', '020', '097', '098', '108'); // Lombardia
  set('04', '021', '022'); // Trentino-Alto Adige (Bolzano/Trento)
  set('05', '023', '024', '025', '026', '027', '028', '029'); // Veneto
  set('06', '030', '031', '032', '093'); // Friuli-Venezia Giulia
  set('07', '008', '009', '010', '011'); // Liguria
  set('08', '033', '034', '035', '036', '037', '038', '039', '040', '099'); // Emilia-Romagna
  set('09', '045', '046', '047', '048', '049', '050', '051', '052', '053', '100'); // Toscana
  set('10', '054', '055'); // Umbria
  set('11', '041', '042', '043', '044', '109'); // Marche
  set('12', '056', '057', '058', '059', '060'); // Lazio
  set('13', '066', '067', '068', '069'); // Abruzzo
  set('14', '070', '094'); // Molise
  set('15', '061', '062', '063', '064', '065'); // Campania
  set('16', '071', '072', '073', '074', '075', '110'); // Puglia
  set('17', '076', '077'); // Basilicata
  set('18', '078', '079', '080', '101', '102'); // Calabria
  set('19', '081', '082', '083', '084', '085', '086', '087', '088', '089'); // Sicilia
  set('20', '090', '091', '092', '095', '111', '104', '105', '106', '107'); // Sardegna (+ отменени)
  return m;
})();

/** ISTAT регион (2 цифри) → нашия ключ ('010'..'200', Трентино='taa'). */
export function regKeyFromIstat2(n2) {
  const n = parseInt(n2, 10);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  if (n === 4) return 'taa';
  return String(n * 10).padStart(3, '0');
}

/** Извежда нашия регионален ключ от един ред територия ({ tipologia, istat_id }). */
export function regKeyDaTerritorio({ tipologia, istat_id }) {
  const t = (tipologia || '').trim().toUpperCase();
  const id = (istat_id || '').trim();
  if (t === 'N' || id === '') return null; // национален / без код
  if (t === 'R') return regKeyFromIstat2(id.padStart(2, '0'));
  // провинция/метрополен град: 3-цифрен код; комуна: 6-цифрен → първите 3 = провинция
  const prov = id.length >= 6 ? id.slice(0, 3) : id.padStart(3, '0');
  const reg = PROV_REGIONE[prov];
  return reg ? regKeyFromIstat2(reg) : null;
}

/** Регионален ключ за цял проект от неговите територии; null ако е много-регионален
 *  или национален (тогава се брои само национално). */
export function risolviRegione(territori) {
  const keys = new Set();
  for (const terr of territori || []) {
    const k = regKeyDaTerritorio(terr);
    if (k) keys.add(k);
  }
  return keys.size === 1 ? [...keys][0] : null;
}

/** Под-компонент на мярката: 'M6C1' / 'M6C2' (или 'M6' при липса на C). */
function subMisura(codiceMisura) {
  const m = /^(M6C\d)/.exec(codiceMisura || '');
  return m ? m[1] : 'M6';
}

/**
 * ЧИСТА, тествана агрегация. `progetti` е масив от { progetto_id, codice_misura,
 * finanziamento_pnrr } (сурови, вкл. не-M6 — филтрират се тук). `territoriByProgetto`
 * е Map<progetto_id, Array<{ tipologia, istat_id }>>.
 * Изход: { nazionale:{ nProgetti, finanziamentoPnrr, perMisura }, perRegione }.
 */
export function aggrega(progetti, territoriByProgetto) {
  const nazionale = { nProgetti: 0, finanziamentoPnrr: 0, perMisura: {} };
  const perRegione = {};
  for (const p of progetti) {
    if (!/^M6/.test(p.codice_misura || '')) continue; // само Missione 6 „Salute"
    const imp = Number(p.finanziamento_pnrr) || 0;
    nazionale.nProgetti++;
    nazionale.finanziamentoPnrr += imp;
    const sub = subMisura(p.codice_misura);
    const bucket = (nazionale.perMisura[sub] ??= { n: 0, importo: 0 });
    bucket.n++;
    bucket.importo += imp;
    const terr = territoriByProgetto.get?.(p.progetto_id) ?? territoriByProgetto[p.progetto_id];
    const key = risolviRegione(terr);
    if (key) {
      const r = (perRegione[key] ??= { nProgetti: 0, finanziamentoPnrr: 0 });
      r.nProgetti++;
      r.finanziamentoPnrr += imp;
    }
  }
  return { nazionale, perRegione };
}

// ---------- Поточно парсване (файловете са ~117MB → readline, не в паметта) ----------

/**
 * Парсва ред от progetti.csv устойчиво на запетаи в свободния текст (titolo,
 * descrizione, denominazione НЕ са кавичкирани навсякъде). Котва: полето
 * `is_in_regis` е точно 'true'/'false'; 12-те финансови полета преди него са
 * фиксирани и без запетаи; progetto_id е първото поле. codice_misura се търси
 * като токен след котвата. Връща { progetto_id, codice_misura, finanziamento_pnrr }.
 */
export function parseProgettoLine(line) {
  const parts = line.split(',');
  let r = -1;
  for (let i = 4; i < parts.length; i++) {
    if (parts[i] === 'true' || parts[i] === 'false') {
      r = i;
      break;
    }
  }
  if (r < 12) return null;
  let cm = null;
  for (let i = r + 1; i < parts.length; i++) {
    if (/^M\dC\d/.test(parts[i])) {
      cm = parts[i];
      break;
    }
  }
  if (!cm) return null;
  return {
    progetto_id: parts[0],
    codice_misura: cm,
    finanziamento_pnrr: Number(parts[r - 12]) || 0,
  };
}

/** Прочита файл ред по ред и вика `onRow(line)` (без заглавния ред). */
function streamLines(filePath, onRow) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
    let first = true;
    rl.on('line', (line) => {
      if (first) {
        first = false;
        return;
      }
      onRow(line);
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
}

async function main() {
  console.log('PNRR Missione 6 (Salute) — OpenPNRR/ReGiS');
  const s1 = await curlDownloadToFile(URL_PROGETTI, RAW_PROGETTI, { timeoutSec: 600 });
  console.log(`  progetti.csv ${s1 ? 'свален' : 'от кеша'}`);
  const s2 = await curlDownloadToFile(URL_TERRITORI, RAW_TERRITORI, { timeoutSec: 600 });
  console.log(`  progetti_territori.csv ${s2 ? 'свален' : 'от кеша'}`);

  // 1) Първи проход: събираме само M6 проектите + техните id-та.
  const progetti = [];
  const m6Ids = new Set();
  await streamLines(RAW_PROGETTI, (line) => {
    if (line.indexOf('M6C') === -1) return; // евтин предфилтър
    const p = parseProgettoLine(line);
    if (!p || !/^M6/.test(p.codice_misura)) return;
    progetti.push(p);
    m6Ids.add(p.progetto_id);
  });
  console.log(`  M6 проекти: ${progetti.length}`);

  // 2) Втори проход: територии само за M6 проектите. Устойчиво от ляво:
  //    id_terr_prg, progetto_id(1), cup, codice_locale, territorio_id, istat_id(5)
  //    … denominazione (може със запетаи) … tipologia (последно поле).
  const territoriByProgetto = new Map();
  await streamLines(RAW_TERRITORI, (line) => {
    const parts = line.split(',');
    if (parts.length < 7) return;
    const pid = parts[1];
    if (!m6Ids.has(pid)) return;
    const terr = { istat_id: parts[5], tipologia: parts[parts.length - 1] };
    const arr = territoriByProgetto.get(pid);
    if (arr) arr.push(terr);
    else territoriByProgetto.set(pid, [terr]);
  });
  console.log(`  M6 проекти с територия: ${territoriByProgetto.size}`);

  // 3) Агрегация.
  const { nazionale, perRegione } = aggrega(progetti, territoriByProgetto);

  const out = {
    generatoIl: new Date().toISOString(),
    fonte: 'OpenPNRR (Openpolis) su dati ReGiS — Missione 6 Salute (ODbL 1.0)',
    url: 'https://openpnrr.it/',
    nazionale,
    perRegione,
  };
  await writeJson(OUT_FILE, out);

  // 4) Триене на суровите CSV (диск).
  await rm(RAW_PROGETTI, { force: true });
  await rm(RAW_TERRITORI, { force: true });

  const nReg = Object.keys(perRegione).length;
  const eur = (v) => (v / 1e9).toLocaleString('it-IT', { maximumFractionDigits: 2 });
  console.log('---');
  console.log(`Общо M6: ${nazionale.nProgetti} проекта · ${eur(nazionale.finanziamentoPnrr)} mld € PNRR`);
  for (const [k, v] of Object.entries(nazionale.perMisura)) {
    console.log(`  ${k}: ${v.n} проекта · ${eur(v.importo)} mld €`);
  }
  console.log(`Приписани регионално: ${nReg} региона`);
  console.log(`Готово → data/pnrr-salute.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
