// TED — Tenders Electronic Daily (официалният вестник на ЕС за над-праговите
// търгове). Независима кръстосана проверка на сигнала „gara a offerente unico"
// (търг с един кандидат): ANAC ни го дава само частично, а TED публикува реалния
// брой получени оферти per лот за EU-търговете в италианското здравеопазване.
//
// Източник: POST https://api.ted.europa.eu/v3/notices/search (JSON, без auth).
// Дърпаме две CPV фамилии — 33* (медицинско оборудване/фарма) и 85* (здравни
// услуги) — за възложители в Италия (ITA), само contract-award notices
// (can-standard), само notices с поне един отчетен брой оферти, от 2023 нататък
// (началото на eForms ерата — преди това полето „брой оферти" не е структурирано).
//
// ⚠️ GDPR: НЕ съхраняваме и НЕ показваме имена на изпълнители (winner). Работим
// само с АГРЕГАТИ и брой оференти. Дори buyer-name не искаме — не ни трябва.
//
// ⚠️ Семантика на полето „брой оферти": TED връща ДВА подравнени масива —
// `received-submissions-type-code` (тип на броенето) и
// `received-submissions-type-val` (стойност). Един notice има по един такъв
// запис на лот на тип. Типът `tenders` = ОБЩ брой получени оферти за лота;
// останалите (`t-sme`, `t-esubm`, `t-verif-inad`, `part-req`…) са подмножества
// или друг етап и НЕ бива да се сумират (иначе се брои двойно). Затова броим само
// записите с код `tenders` и стойност > 0.
//
// Изход: data/ted.json.

import { join } from 'node:path';
import { writeJson } from './lib/http.js';
import { DATA_DIR } from './lib/paths.js';

const API_URL = 'https://api.ted.europa.eu/v3/notices/search';
const CPV_FAMIGLIE = ['33', '85']; // 33* оборудване/фарма, 85* здравни услуги
const DA_DATA = '20230101'; // eForms ерата — по-рано няма структуриран брой оферти
const FIELDS = [
  'publication-number',
  'received-submissions-type-val',
  'received-submissions-type-code',
  'classification-cpv',
  'result-value-notice',
  'publication-date',
];
const PAGE = 250; // максимум per заявка
const PAUSA_MS = 400; // fair-usage пауза между заявките

/** Кодове, които се броят като „получени оферти" (общият брой per лот). */
const CODICE_OFFERTE = 'tenders';

/**
 * Разгъва един notice до масив от броеве на офертите per лот. Взима само
 * подравнените записи с код `tenders` и положителна стойност (0 = нула оферти,
 * т.е. пуст търг — не е „един кандидат", затова се изключва).
 */
function offertePerLotto(notice) {
  const codes = notice['received-submissions-type-code'] || [];
  const vals = notice['received-submissions-type-val'] || [];
  const out = [];
  for (let i = 0; i < codes.length; i++) {
    if (codes[i] !== CODICE_OFFERTE) continue;
    const v = Number(vals[i]);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/** Категоризира брой оферти в кофите на разпределението. */
function bucket(n) {
  return n >= 4 ? '4+' : String(n);
}

/** Пресмята агрегатите за подаден списък notices (чист, тестваем). */
function aggregaGruppo(notices) {
  const distribuzione = { 1: 0, 2: 0, 3: 0, '4+': 0 };
  let nLotti = 0;
  let unOfferente = 0;
  let valore = 0;
  for (const nt of notices) {
    const lotti = offertePerLotto(nt);
    if (lotti.length === 0) continue; // notice без реален брой оферти — извън обхвата
    for (const n of lotti) {
      nLotti++;
      distribuzione[bucket(n)]++;
      if (n === 1) unOfferente++;
    }
    const v = Number(nt['result-value-notice']);
    if (Number.isFinite(v) && v > 0) valore += v;
  }
  return {
    nLotti,
    unOfferente,
    quotaUnOfferente: nLotti ? unOfferente / nLotti : null,
    distribuzione: {
      1: distribuzione[1],
      2: distribuzione[2],
      3: distribuzione[3],
      '4+': distribuzione['4+'],
    },
    valore,
  };
}

/** Дали notice принадлежи на CPV фамилия (2-цифрен префикс). */
function inFamiglia(notice, fam) {
  const cpv = notice['classification-cpv'] || [];
  return cpv.some((c) => String(c).startsWith(fam));
}

/**
 * Основната агрегация. Приема (дедупнати) notices и връща националните агрегати
 * плюс разбивка по CPV фамилия. Чиста функция — цялата логика е тестваема.
 */
export function aggrega(notices) {
  // Период: обхваща само notices, които реално са допринесли лотове.
  let da = null;
  let a = null;
  for (const nt of notices) {
    if (offertePerLotto(nt).length === 0) continue;
    const d = String(nt['publication-date'] || '').slice(0, 10);
    if (!d) continue;
    if (da === null || d < da) da = d;
    if (a === null || d > a) a = d;
  }
  const perCpv = {};
  for (const fam of CPV_FAMIGLIE) {
    perCpv[fam] = aggregaGruppo(notices.filter((nt) => inFamiglia(nt, fam)));
  }
  return {
    periodo: { da, a },
    nazionale: aggregaGruppo(notices),
    perCpv,
  };
}

/** POST към TED API с повторни опити и експоненциално изчакване при 5xx/мрежа. */
async function postJson(body, { retries = 4, timeoutMs = 120_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return res.json();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const waitMs = 1500 * 2 ** attempt;
      console.warn(`  повторен опит ${attempt + 1}/${retries} след ${waitMs}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/** Пагинира изцяло една CPV фамилия през ITERATION режима. */
async function scaricaFamiglia(fam) {
  const query =
    `classification-cpv IN (${fam}*) AND buyer-country IN (ITA) AND ` +
    `notice-type IN (can-standard) AND received-submissions-type-val > 0 AND ` +
    `publication-date >= ${DA_DATA}`;
  const notices = [];
  let token = null;
  let totale = null;
  for (let pagina = 1; ; pagina++) {
    const body = {
      query,
      fields: FIELDS,
      limit: PAGE,
      scope: 'ALL',
      paginationMode: 'ITERATION',
      ...(token ? { iterationNextToken: token } : {}),
    };
    const j = await postJson(body);
    const batch = j.notices || [];
    notices.push(...batch);
    totale = j.totalNoticeCount ?? totale;
    token = j.iterationNextToken || null;
    console.log(`  CPV ${fam}*: страница ${pagina} → ${batch.length} (общо ${notices.length}/${totale ?? '?'})`);
    if (!token || batch.length === 0) break;
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
  return notices;
}

async function main() {
  const perPubblicazione = new Map(); // publication-number → notice (дедуп между фамилиите)
  for (const fam of CPV_FAMIGLIE) {
    const notices = await scaricaFamiglia(fam);
    for (const nt of notices) {
      const id = nt['publication-number'];
      if (id && !perPubblicazione.has(id)) perPubblicazione.set(id, nt);
    }
  }
  const notices = [...perPubblicazione.values()];
  const dati = aggrega(notices);

  await writeJson(join(DATA_DIR, 'ted.json'), {
    generatoIl: new Date().toISOString(),
    fonte: 'TED — Tenders Electronic Daily (UE, riuso libero, Dec. 2011/833/UE)',
    url: 'https://ted.europa.eu/',
    nota:
      'Copre solo le gare sopra-soglia UE dell’era eForms (~2023 in poi): è un ' +
      'campione degli ultimi ~2 anni, non la storia completa. Il numero di offerte ' +
      'per lotto è quello dichiarato nei bandi di aggiudicazione (codice «tenders»). ' +
      'Integra i dati ANAC (che coprono anche il sotto-soglia), non li sostituisce.',
    ...dati,
  });

  const n = dati.nazionale;
  console.log(
    `Готово → data/ted.json | ${notices.length} notices, ${n.nLotti} лота, ` +
      `un offerente ${n.unOfferente} (${((n.quotaUnOfferente || 0) * 100).toFixed(1)}%) | ` +
      `distribuzione 1:${n.distribuzione['1']} 2:${n.distribuzione['2']} 3:${n.distribuzione['3']} 4+:${n.distribuzione['4+']}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
