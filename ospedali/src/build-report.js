// Генерира подробен отчет (Markdown) за всяка публична здравна структура от SSN:
//  – финансови показатели по години от CE моделите (приходи, разходи, персонал, резултат);
//  – баланс от SP моделите (актив, пасив, нетно имущество, задължения);
//  – оперативен профил от анаграфиката на Министерството на здравеопазването
//    (легла, персонал, приеми — за болничните предприятия и президиите на ASL).
// Изход: reports/<регион>/<код>-<име>.md + reports/index.md + reports/dati-chiave.csv.

import { join } from 'node:path';
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { parseCsv } from './lib/csv.js';
import { readJson } from './lib/http.js';
import { RAW_DIR, REPORTS_DIR, ANAGRAFICA_FILE } from './lib/paths.js';

const BDAP_DIR = join(RAW_DIR, 'bdap');

// Показатели от CE — по код на счетоводната позиция, с резервно
// разпознаване по описание (кодовете се менят между версиите на модела).
const CE_INDICATORS = [
  { key: 'contributi', label: 'Вноски за дейността (A.1)', codes: ['AA0010'], re: /^a\.1\)\s*contributi in c\/esercizio/i },
  { key: 'valoreProduzione', label: 'Общо приходи от дейността (A)', codes: ['AZ9999'], re: /^totale valore della produzione/i },
  { key: 'costiProduzione', label: 'Общо разходи за дейността (B)', codes: ['BZ9999'], re: /^totale costi della produzione/i },
  { key: 'costoPersonale', label: 'Разходи за персонал', codes: ['BA2080'], re: /^totale costo del personale/i },
  { key: 'ammortamenti', label: 'Амортизации', codes: ['BA2560'], re: /^totale ammortamenti/i },
  { key: 'risultatoEsercizio', label: 'Финансов резултат за годината', codes: ['ZZ9999'], re: /^risultato di esercizio/i },
];

// Показатели от SP (баланса).
const SP_INDICATORS = [
  { key: 'totaleAttivo', label: 'Общо актив', codes: ['AZZ999'], re: /totale attivo/i },
  { key: 'patrimonioNetto', label: 'Нетно имущество', codes: ['PAZ999'], re: /^a\) patrimonio netto/i },
  { key: 'debiti', label: 'Задължения', codes: ['PDZ999'], re: /^d\) debiti/i },
];

// Компоненти на актива — много структури не подават реда „D) TOTALE ATTIVO“
// и тогава той се изчислява като A + B + C (без задбалансовите conti d'ordine).
const SP_ATTIVO_COMPONENTS = [
  { key: '_immobilizzazioni', codes: ['AAZ999'], re: /^a\) immobilizzazioni/i },
  { key: '_attivoCircolante', codes: ['ABZ999'], re: /^b\) attivo circolante/i },
  { key: '_rateiAttivi', codes: ['ACZ999'], re: /^c\) ratei e risconti attivi/i },
];

const fmtEuro = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 });

function euro(v) {
  return v == null ? '—' : `${fmtEuro.format(Math.round(v))} €`;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Чете една CSV колона независимо от вариациите в имената на заглавията. */
function col(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined) return row[n];
  }
  return undefined;
}

/** Тип структура според кода на ente в SSN. */
function tipoEnte(codEnte, anagrafica) {
  if (anagrafica) return anagrafica.tipo || 'Болнично предприятие (AO/AOU/IRCCS)';
  const n = Number(codEnte);
  if (n >= 900) return 'Друга структура от SSN (напр. Azienda Zero/ESTAR)';
  return 'Местна здравна единица (ASL) с болнични президии';
}

async function loadBdapCsv(file) {
  const text = await readFile(join(BDAP_DIR, file), 'utf8');
  return parseCsv(text, { separator: ';' });
}

function matchIndicator(indicators, code, desc) {
  for (const ind of indicators) {
    if (ind.codes.includes(code) || ind.re.test(desc)) return ind.key;
  }
  return null;
}

async function main() {
  const anagrafica = await readJson(ANAGRAFICA_FILE);
  const aziendeByCod = new Map(anagrafica.aziende.map((a) => [a.codice, a]));
  const struttureByCod = new Map(anagrafica.strutture.map((s) => [s.codice, s]));

  const files = (await readdir(BDAP_DIR)).filter((f) => /^(ce|sp)-\d{4}\.csv$/.test(f)).sort();
  if (files.length === 0) throw new Error('няма свалени CE/SP файлове — пусни `npm run fetch:finanze`');

  // enti: код → { codice, regione, denominazione, serie: Map<anno, {…}>, ceUltimo, spUltimo }
  const enti = new Map();
  let ultimoAnnoCe = 0;

  for (const file of files) {
    const kind = file.startsWith('ce') ? 'CE' : 'SP';
    const anno = Number(file.match(/(\d{4})/)[1]);
    if (kind === 'CE') ultimoAnnoCe = Math.max(ultimoAnnoCe, anno);
    console.log(`Чета ${file}…`);
    const rows = await loadBdapCsv(file);
    for (const r of rows) {
      const codReg = (col(r, 'Codice Regione') || '').padStart(3, '0');
      const codEnte = (col(r, 'Codice Ente SSN', 'Codice Ente') || '').padStart(3, '0');
      // 000 = централизирано регионално управление (GSA), 999 = консолидиран
      // регионален отчет — не са болници и се пропускат.
      if (codEnte === '000' || codEnte === '999') continue;
      const codice = codReg + codEnte;
      const desc = col(r, 'Descrizione Voce Contabile') || '';
      const codeVoce = col(r, 'Codice Voce Contabile') || '';
      const importo = Number(col(r, 'Importo Totale'));
      if (!Number.isFinite(importo)) continue;

      let ente = enti.get(codice);
      if (!ente) {
        ente = {
          codice,
          codReg,
          codEnte,
          regione: (col(r, 'Descrizione Regione') || '').trim(),
          denominazione: (col(r, 'Descrizione Ente') || '').trim(),
          serie: new Map(),
          ceUltimo: [],
          ceUltimoAnno: 0,
          spUltimo: [],
          spUltimoAnno: 0,
        };
        enti.set(codice, ente);
      }
      // името от най-новата година печели
      if (kind === 'CE' && anno >= ultimoAnnoCe) {
        ente.denominazione = (col(r, 'Descrizione Ente') || ente.denominazione).trim();
      }

      let y = ente.serie.get(anno);
      if (!y) {
        y = {};
        ente.serie.set(anno, y);
      }
      const indicators =
        kind === 'CE' ? CE_INDICATORS : [...SP_INDICATORS, ...SP_ATTIVO_COMPONENTS];
      const key = matchIndicator(indicators, codeVoce, desc);
      if (key) y[key] = importo;

      // подробните редове от последната година, за която структурата е отчела
      if (kind === 'CE') {
        if (anno > ente.ceUltimoAnno) {
          ente.ceUltimoAnno = anno;
          ente.ceUltimo = [];
        }
        if (anno === ente.ceUltimoAnno) ente.ceUltimo.push({ code: codeVoce, desc: desc.trim(), importo });
      } else if (kind === 'SP') {
        if (anno > ente.spUltimoAnno) {
          ente.spUltimoAnno = anno;
          ente.spUltimo = [];
        }
        if (anno === ente.spUltimoAnno) ente.spUltimo.push({ code: codeVoce, desc: desc.trim(), importo });
      }
    }
  }
  console.log(`${enti.size} структури с финансови данни; последна CE година: ${ultimoAnnoCe}`);

  // Дописване на „Общо актив“ там, където редът-тотал липсва в източника.
  for (const ente of enti.values()) {
    for (const y of ente.serie.values()) {
      if (y.totaleAttivo == null) {
        const parts = SP_ATTIVO_COMPONENTS.map((c) => y[c.key]).filter((v) => v != null);
        if (parts.length > 0) y.totaleAttivo = parts.reduce((s, v) => s + v, 0);
      }
      for (const c of SP_ATTIVO_COMPONENTS) delete y[c.key];
    }
  }

  await rm(REPORTS_DIR, { recursive: true, force: true });
  await mkdir(REPORTS_DIR, { recursive: true });

  // CSV с ключовите показатели за машинна обработка
  const csvLines = [
    'codice;regione;denominazione;anno;' +
      [...CE_INDICATORS, ...SP_INDICATORS].map((i) => i.key).join(';'),
  ];

  const byRegion = new Map();
  for (const ente of [...enti.values()].sort((a, b) => a.codice.localeCompare(b.codice))) {
    if (!byRegion.has(ente.regione)) byRegion.set(ente.regione, []);
    byRegion.get(ente.regione).push(ente);
    for (const [anno, y] of [...ente.serie.entries()].sort((a, b) => a[0] - b[0])) {
      csvLines.push(
        [
          ente.codice,
          ente.regione,
          `"${ente.denominazione.replaceAll('"', '""')}"`,
          anno,
          ...[...CE_INDICATORS, ...SP_INDICATORS].map((i) => y[i.key] ?? ''),
        ].join(';')
      );
    }
  }

  const indexLines = [
    '# Публични здравни структури в Италия — финансови отчети',
    '',
    `Генерирано автоматично на ${new Date().toISOString().slice(0, 10)} от официални open data:`,
    '',
    '- **BDAP Open Data (RGS/MEF)** — модели CE (отчет за приходите и разходите) и SP (баланс) на структурите от SSN;',
    '- **dati.salute.gov.it** — анаграфика на болничните структури (легла, персонал, приеми).',
    '',
    `Обхванати години: вижте \`config.json\`. Последна годишна CE рилевация: **${ultimoAnnoCe}**.`,
    '',
  ];

  let written = 0;
  for (const [regione, lista] of [...byRegion.entries()].sort()) {
    const regSlug = `${lista[0].codReg}-${slugify(regione)}`;
    await mkdir(join(REPORTS_DIR, regSlug), { recursive: true });
    indexLines.push(`## ${regione}`, '');
    indexLines.push('| Структура | Тип | Приходи (посл. г.) | Резултат (посл. г.) | Отчет |');
    indexLines.push('|---|---|---:|---:|---|');
    for (const ente of lista) {
      const anag = aziendeByCod.get(ente.codice);
      const fileName = `${ente.codice}-${slugify(ente.denominazione)}.md`;
      // последната година, за която има данни от CE (не само от SP)
      const anniCe = [...ente.serie.entries()].filter(([, y]) => y.valoreProduzione != null);
      const last = anniCe.length > 0 ? anniCe.sort((a, b) => a[0] - b[0]).at(-1)[1] : {};
      indexLines.push(
        `| ${ente.denominazione} | ${tipoEnte(ente.codEnte, anag)} | ${euro(last.valoreProduzione)} | ${euro(last.risultatoEsercizio)} | [${ente.codice}](${regSlug}/${fileName}) |`
      );
      await writeFile(join(REPORTS_DIR, regSlug, fileName), renderEnte(ente, anag, struttureByCod, anagrafica));
      written++;
    }
    indexLines.push('');
  }

  await writeFile(join(REPORTS_DIR, 'index.md'), indexLines.join('\n') + '\n');
  await writeFile(join(REPORTS_DIR, 'dati-chiave.csv'), csvLines.join('\n') + '\n');
  console.log(`Готово: ${written} отчета + index.md + dati-chiave.csv → ${REPORTS_DIR}`);
}

/** Markdown отчет за една структура. */
function renderEnte(ente, anag, struttureByCod, anagrafica) {
  const L = [];
  L.push(`# ${ente.denominazione}`);
  L.push('');
  L.push(`- **Код (регион + структура):** \`${ente.codice}\``);
  L.push(`- **Регион:** ${ente.regione}`);
  L.push(`- **Тип:** ${tipoEnte(ente.codEnte, anag)}`);
  if (anag) {
    if (anag.comune) L.push(`- **Град:** ${anag.comune} (${anag.provincia})`);
    if (anag.indirizzo) L.push(`- **Адрес:** ${anag.indirizzo}`);
  }
  L.push(
    '- **Източници:** [BDAP Open Data — CE/SP на структурите от SSN](https://openbdap.rgs.mef.gov.it/it/SSN/Analizza), [dati.salute.gov.it — анаграфика](https://www.dati.salute.gov.it/)'
  );
  L.push('');

  // Оперативен профил
  const own = struttureByCod.get(ente.codice);
  const presidi = anagrafica.strutture.filter(
    (s) => s.codiceRegione === ente.codReg && s.codiceAsl === ente.codEnte && s.codice !== ente.codice
  );
  const opRows = own ? [own] : presidi;
  if (opRows.length > 0) {
    L.push(`## Оперативен профил (модел HSP, ${opRows[0].anno} г.)`);
    L.push('');
    L.push('| Болница | Легла | Персонал | в т.ч. лекари | Приеми | Леглодни |');
    L.push('|---|---:|---:|---:|---:|---:|');
    for (const s of opRows) {
      L.push(
        `| ${s.denominazione} (${s.comune}) | ${num(s.postiLetto)} | ${num(s.personale)} | ${num(s.medici)} | ${num(s.ricoveri)} | ${num(s.giornateDegenza)} |`
      );
    }
    L.push('');
  }

  // Времеви ред на ключовите показатели
  L.push('## Финансови показатели по години (CE/SP)');
  L.push('');
  const anni = [...ente.serie.keys()].sort((a, b) => a - b);
  L.push('| Година | ' + [...CE_INDICATORS, ...SP_INDICATORS].map((i) => i.label).join(' | ') + ' |');
  L.push('|---' + '|---:'.repeat(CE_INDICATORS.length + SP_INDICATORS.length) + '|');
  for (const anno of anni) {
    const y = ente.serie.get(anno);
    L.push(
      `| ${anno} | ` +
        [...CE_INDICATORS, ...SP_INDICATORS].map((i) => euro(y[i.key])).join(' | ') +
        ' |'
    );
  }
  L.push('');

  // Подробен CE за последната година: раздели и редове до второ ниво
  if (ente.ceUltimo.length > 0) {
    L.push(`## Подробен отчет за приходите и разходите (${ente.ceUltimoAnno} г.)`);
    L.push('');
    L.push('| Позиция | Сума |');
    L.push('|---|---:|');
    for (const v of ente.ceUltimo) {
      if (!isDetailLine(v.desc) || v.importo === 0) continue;
      L.push(`| ${v.desc.replaceAll('|', '\\|')} | ${euro(v.importo)} |`);
    }
    L.push('');
  }

  // Баланс за последната SP година
  if (ente.spUltimo.length > 0) {
    L.push(`## Баланс (${ente.spUltimoAnno} г.)`);
    L.push('');
    L.push('| Позиция | Сума |');
    L.push('|---|---:|');
    for (const v of ente.spUltimo) {
      if (!isTopLevelSp(v.desc) || v.importo === 0) continue;
      L.push(`| ${v.desc.replaceAll('|', '\\|')} | ${euro(v.importo)} |`);
    }
    L.push('');
  }

  L.push('---');
  L.push(
    '*Автоматично генериран отчет от официалните данни на Ragioneria Generale dello Stato (модели CE/SP на SSN) и Министерството на здравеопазването на Италия. Сумите са в евро, по консолидираните годишни отчети (consuntivo).*'
  );
  L.push('');
  return L.join('\n');
}

/** Ред до второ ниво („A.1)“, „B.2.A)“) или обобщаващ ред. */
function isDetailLine(desc) {
  const d = desc.trim();
  if (/^[A-Z]\)(\s|$)/.test(d)) return true; // раздел: A) ...
  if (/^[A-Z]\.\d+\)(\s|$)/i.test(d)) return true; // A.1) ...
  if (/^[A-Z]\.\d+\.[A-Z]\)(\s|$)/i.test(d)) return true; // A.1.A) ...
  if (/^totale/i.test(d)) return true;
  if (/^risultato/i.test(d)) return true;
  return false;
}

/** Топ ниво на баланса: „A) …“ раздели и тотали. */
function isTopLevelSp(desc) {
  const d = desc.trim();
  return /^[A-G]\)\s/.test(d) || /totale/i.test(d);
}

function num(v) {
  return v == null ? '—' : fmtNum.format(v);
}

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
