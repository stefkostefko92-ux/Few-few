// Изтегля разходите за ВЪНШНИ КОНСУЛТАНТИ на публичните администрации от
// PerlaPA — Anagrafe delle Prestazioni (Dipartimento della Funzione Pubblica),
// филтрира здравните структури (SSN) и агрегира по година и по структура.
//
// Рамкиране: „indicatore, non prova“. Това са ЗАКОННИ, задължително публикувани
// incarichi (чл. 15 D.Lgs 33/2013). Висока сума НЕ е нередност сама по себе си —
// е индикатор за зависимост от външен опит.
//
// GDPR: датасетът съдържа ИМЕНА НА ФИЗИЧЕСКИ ЛИЦА (колона „Soggetto Percettore“).
// Изхвърляме я веднага при парсване; изходът е САМО агрегати (суми, брой) — никога
// имена на лица.
//
// Bulk CSV per година: adp-api.perlapa.gov.it (tipoExport=2 = CSV, „;“, UTF-8+BOM).
// Всеки файл ~50 MB → теглим в data/raw/, парсваме и ТРИЕМ (данните са в JSON).
//
// Изход: data/consulenze.json.

import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { parseCsv, parseItalianNumber } from './lib/csv.js';
import { curlDownloadToFile, writeJson } from './lib/http.js';
import { RAW_DIR, DATA_DIR } from './lib/paths.js';

const CONS_FILE = join(DATA_DIR, 'consulenze.json');
const ANNI = [2022, 2023, 2024];
const URL_BASE =
  'https://adp-api.perlapa.gov.it/api/public/incarichi/Consulenti/Export';

// ── Филтър „здравни структури“ (SSN) ────────────────────────────────────────
// ВАЖНО: двата regex-а са КОПИРАНИ ДОСЛОВНО от src/fetch-appalti.js — държим ги
// в синхрон. При промяна тук → промени и там (и обратно).
const HEALTH =
  /AZIENDA (OSPEDALIER|SANITARIA|SOCIO|UNITA|USL|ULSS|PROVINCIALE PER I SERVIZI SANITARI|REGIONALE DELLA SALUTE|LIGURE SANITARIA)|OSPEDALIER|OSPEDALI RIUN|A\.?O\.?U|\bA\.?S\.?L\b|\bA\.?S\.?S\.?T\b|\bA\.?U\.?L\.?S\.?S\b|\bASUR\b|\bASUGI\b|\bASUFC\b|\bAPSS\b|IRCCS|POLICLINICO|ISTITUTO (ONCOLOGICO|NAZIONALE|ORTOPEDICO|TUMORI|NEUROLOGICO)|FONDAZIONE\s+(IRCCS|POLICLINICO|OSPEDAL|ISTITUTO)|ESTAR|ESTAV|SORESA|AZIENDA ZERO|EGAS|ARNAS|ENTE OSPEDALIERO|AGENZIA (DI )?TUTELA DELLA SALUTE|AGENZIA REGIONALE STRATEGICA PER LA SALUTE|A\.?RE\.?S\.?S|\bUNITA'? SANITARIA LOCALE\b|SANITAETSBETRIEB|EMERGENZA SANITARIA|\bAREU\b|\bA\.?LI\.?SA\b|AZIENDA REGIONALE PER LA SALUTE/;
// Изрично изключване на нездравни субекти, случайно уловени от общи думи.
const NOT_HEALTH = /ACQUE|SPORT E SALUTE|ISTITUTO SUPERIORE DI SANIT|\bMINISTERO\b|CARABINIER|\bCOMUNE\b|\bUNIONE\b|BONIFICA|AZIENDA CASA|\bA\.?C\.?E\.?R\b|\bSTART\b|INFORMATICA|VIGILI DEL FUOCO|SOCIETA DELLE FONTI|INPS|INAIL|PREVIDENZA|ASSICURAZIONE CONTRO GLI INFORTUNI|ISTITUTO NAZIONALE PER LA GRAFICA|I\.N\.P\.G\.I|FISICA NUCLEARE|ASTROFISICA|GEOFISICA|VULCANOLOGIA|\bISTAT\b|DOCUMENTAZIONE, INNOVAZIONE|VALUTAZIONE DEL SISTEMA EDUCATIVO|RICERCHE TURISTICHE|ALTA MATEMATICA/;

/** Нормализирано име на структурата: trim + сгъване на интервалите + UPPERCASE. */
function normalizza(nome) {
  return String(nome || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Число от полетата за пари: махаме „€“ и интервали, после италиански парсер. */
function parseEuro(value) {
  return parseItalianNumber(String(value ?? '').replace(/[€\s]/g, ''));
}

/**
 * Агрегира редовете от PerlaPA (чиста, тестваема функция).
 * Вход:  [{ anno:Number, rows:Object[] }] — суровите редове (18 колони).
 * Изход: {
 *   perAnno: { <anno>: { nIncarichi, importo, nEnti } },
 *   perEnte: { <denominazioneNormalizzata>: { nIncarichi, importo, anni:[...] } }
 * }
 * Прилага филтъра HEALTH/NOT_HEALTH сам (по UPPERCASE на „Soggetto Dichiarante“).
 * „importo“ = сума на „Ammontare Erogato“; ако е 0/празно → пада на „Compenso Lordo“.
 * НИКОГА не чете „Soggetto Percettore“ → изходът НЕ съдържа имена на лица.
 */
export function aggrega(rowsPerAnno) {
  const perAnno = {};
  const perEnte = {};
  for (const { anno, rows } of rowsPerAnno) {
    const entiAnno = new Set();
    let nIncarichi = 0;
    let importo = 0;
    for (const r of rows) {
      const den = (r['Soggetto Dichiarante'] || '').trim();
      const denU = den.toUpperCase();
      if (!HEALTH.test(denU) || NOT_HEALTH.test(denU)) continue;
      let a = parseEuro(r['Ammontare Erogato']);
      if (!a) a = parseEuro(r['Compenso Lordo']) || 0;
      const nome = normalizza(den);
      nIncarichi++;
      importo += a;
      entiAnno.add(nome);
      const e = perEnte[nome] || (perEnte[nome] = { nIncarichi: 0, importo: 0, anni: [] });
      e.nIncarichi++;
      e.importo += a;
      if (!e.anni.includes(anno)) e.anni.push(anno);
    }
    perAnno[anno] = { nIncarichi, importo, nEnti: entiAnno.size };
  }
  for (const e of Object.values(perEnte)) e.anni.sort((x, y) => x - y);
  return { perAnno, perEnte };
}

async function main() {
  const rowsPerAnno = [];
  for (const anno of ANNI) {
    const file = join(RAW_DIR, `perlapa-${anno}.csv`);
    const url = `${URL_BASE}?AnnoConferimento=${anno}&tipoExport=2`;
    try {
      // ~50 MB и ~70 s за генериране на сървъра → дълъг таймаут.
      const fresh = await curlDownloadToFile(url, file, { timeoutSec: 360 });
      console.log(`${anno}: ${fresh ? 'изтеглено' : 'от кеша'}`);
    } catch (err) {
      console.warn(`  пропускам ${anno} (сваляне): ${err.message}`);
      continue;
    }
    let rows;
    try {
      rows = parseCsv(await readFile(file, 'utf8'), { separator: ';' });
    } catch (err) {
      console.warn(`  пропускам ${anno} (парсване): ${err.message}`);
      continue;
    }
    // GDPR: махаме имената на физическите лица веднага след парсване.
    for (const r of rows) delete r['Soggetto Percettore'];
    rowsPerAnno.push({ anno, rows });
    // Трием суровия CSV — данните вече са в паметта, после в JSON.
    await rm(file, { force: true });
  }
  if (rowsPerAnno.length === 0) {
    console.error('Няма нито една обработена година — прекратявам.');
    process.exit(1);
  }

  const cons = aggrega(rowsPerAnno);
  const out = {
    generatoIl: new Date().toISOString(),
    fonte: 'Dipartimento Funzione Pubblica — PerlaPA / Anagrafe delle Prestazioni (CC BY 4.0)',
    url: 'https://consulentipubblici.dfp.gov.it/',
    ...cons,
  };
  await writeJson(CONS_FILE, out);

  // ── Резюме ────────────────────────────────────────────────────────────────
  const anni = Object.keys(cons.perAnno).map(Number).sort((a, b) => a - b);
  const totImporto = anni.reduce((s, a) => s + cons.perAnno[a].importo, 0);
  const totIncarichi = anni.reduce((s, a) => s + cons.perAnno[a].nIncarichi, 0);
  const nEnti = Object.keys(cons.perEnte).length;
  console.log('\n── Consulenze SSN (aggregato) ─────────────────────────');
  for (const a of anni) {
    const y = cons.perAnno[a];
    console.log(
      `  ${a}: ${y.nIncarichi.toLocaleString('it-IT')} incarichi · ` +
        `${Math.round(y.importo).toLocaleString('it-IT')} € · ${y.nEnti} enti`
    );
  }
  console.log(
    `  TOTALE: ${totIncarichi.toLocaleString('it-IT')} incarichi · ` +
      `${Math.round(totImporto).toLocaleString('it-IT')} € · ${nEnti} enti distinti`
  );
  console.log(`  → ${CONS_FILE}`);
}

// main() само при директно стартиране (не при import от теста).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
