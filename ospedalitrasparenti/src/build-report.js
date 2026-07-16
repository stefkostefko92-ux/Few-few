// Генерира подробен отчет (Markdown) за всяка публична здравна структура от SSN:
//  – финансови показатели по години от CE моделите (приходи, разходи, персонал, резултат);
//  – баланс от SP моделите (актив, пасив, нетно имущество, задължения);
//  – оперативен профил от анаграфиката на Министерството на здравеопазването.
// Изход: reports/<регион>/<код>-<име>.md + reports/index.md + reports/dati-chiave.csv.

// @ts-check
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { REPORTS_DIR } from './lib/paths.js';
import { loadDataset, tipoEnte, anniConCe, CE_INDICATORS, SP_INDICATORS } from './lib/dataset.js';
import { slugify } from './lib/format.js';

/** @typedef {import('./lib/dataset.js').Ente} Ente */
/** @typedef {import('./lib/dataset.js').Anagrafica} Anagrafica */
/** @typedef {import('./lib/dataset.js').StrutturaAnag} StrutturaAnag */

const fmtEuro = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 });

/** @param {number|null|undefined} v @returns {string} */
function euro(v) {
  return v == null ? '—' : `${fmtEuro.format(Math.round(v))} €`;
}
/** @param {number|null|undefined} v @returns {string} */
function num(v) {
  return v == null ? '—' : fmtNum.format(v);
}

async function main() {
  const { enti, anagrafica, ultimoAnnoCe } = await loadDataset();
  const struttureByCod = new Map(anagrafica.strutture.map((s) => [s.codice, s]));
  console.log(`${enti.length} структури с финансови данни; последна CE година: ${ultimoAnnoCe}`);

  await rm(REPORTS_DIR, { recursive: true, force: true });
  await mkdir(REPORTS_DIR, { recursive: true });

  const csvLines = [
    'codice;regione;denominazione;anno;' +
      [...CE_INDICATORS, ...SP_INDICATORS].map((i) => i.key).join(';'),
  ];

  /** @type {Map<string, Ente[]>} */
  const byRegion = new Map();
  for (const ente of enti) {
    if (!byRegion.has(ente.regione)) byRegion.set(ente.regione, []);
    byRegion.get(ente.regione)?.push(ente);
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
    `Последна годишна CE рилевация: **${ultimoAnnoCe}**.`,
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
      const fileName = `${ente.codice}-${slugify(ente.denominazione)}.md`;
      const anni = anniConCe(ente);
      const last = anni.length > 0 ? ente.serie.get(anni[anni.length - 1]) : undefined;
      indexLines.push(
        `| ${ente.denominazione} | ${tipoEnte(ente.codEnte, ente.anag)} | ${euro(last?.valoreProduzione)} | ${euro(last?.risultatoEsercizio)} | [${ente.codice}](${regSlug}/${fileName}) |`
      );
      await writeFile(join(REPORTS_DIR, regSlug, fileName), renderEnte(ente, struttureByCod, anagrafica));
      written++;
    }
    indexLines.push('');
  }

  await writeFile(join(REPORTS_DIR, 'index.md'), indexLines.join('\n') + '\n');
  await writeFile(join(REPORTS_DIR, 'dati-chiave.csv'), csvLines.join('\n') + '\n');
  console.log(`Готово: ${written} отчета + index.md + dati-chiave.csv → ${REPORTS_DIR}`);
}

/**
 * Markdown отчет за една структура.
 * @param {Ente} ente
 * @param {Map<string, StrutturaAnag>} struttureByCod
 * @param {Anagrafica} anagrafica
 * @returns {string}
 */
function renderEnte(ente, struttureByCod, anagrafica) {
  const anag = ente.anag;
  /** @type {string[]} */
  const L = [];
  L.push(`# ${ente.denominazione}`, '');
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

  const own = struttureByCod.get(ente.codice);
  const presidi = anagrafica.strutture.filter(
    (s) => s.codiceRegione === ente.codReg && s.codiceAsl === ente.codEnte && s.codice !== ente.codice
  );
  const opRows = own ? [own] : presidi;
  if (opRows.length > 0) {
    L.push(`## Оперативен профил (модел HSP, ${opRows[0].anno} г.)`, '');
    L.push('| Болница | Легла | Персонал | в т.ч. лекари | Приеми | Леглодни |');
    L.push('|---|---:|---:|---:|---:|---:|');
    for (const s of opRows) {
      L.push(
        `| ${s.denominazione} (${s.comune}) | ${num(s.postiLetto)} | ${num(s.personale)} | ${num(s.medici)} | ${num(s.ricoveri)} | ${num(s.giornateDegenza)} |`
      );
    }
    L.push('');
  }

  L.push('## Финансови показатели по години (CE/SP)', '');
  const anni = [...ente.serie.keys()].sort((a, b) => a - b);
  L.push('| Година | ' + [...CE_INDICATORS, ...SP_INDICATORS].map((i) => i.labelBg).join(' | ') + ' |');
  L.push('|---' + '|---:'.repeat(CE_INDICATORS.length + SP_INDICATORS.length) + '|');
  for (const anno of anni) {
    const y = ente.serie.get(anno);
    L.push(`| ${anno} | ` + [...CE_INDICATORS, ...SP_INDICATORS].map((i) => euro(y?.[i.key])).join(' | ') + ' |');
  }
  L.push('');

  if (ente.ceUltimo.length > 0) {
    L.push(`## Подробен отчет за приходите и разходите (${ente.ceUltimoAnno} г.)`, '');
    L.push('| Позиция | Сума |');
    L.push('|---|---:|');
    for (const v of ente.ceUltimo) {
      if (!isDetailLine(v.desc) || v.importo === 0) continue;
      L.push(`| ${v.desc.replaceAll('|', '\\|')} | ${euro(v.importo)} |`);
    }
    L.push('');
  }

  if (ente.spUltimo.length > 0) {
    L.push(`## Баланс (${ente.spUltimoAnno} г.)`, '');
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

/** Ред до второ ниво („A.1)“, „B.2.A)“) или обобщаващ ред. @param {string} desc @returns {boolean} */
function isDetailLine(desc) {
  const d = desc.trim();
  if (/^[A-Z]\)(\s|$)/.test(d)) return true;
  if (/^[A-Z]\.\d+\)(\s|$)/i.test(d)) return true;
  if (/^[A-Z]\.\d+\.[A-Z]\)(\s|$)/i.test(d)) return true;
  if (/^totale/i.test(d)) return true;
  if (/^risultato/i.test(d)) return true;
  return false;
}

/** Топ ниво на баланса: „A) …“ раздели и тотали. @param {string} desc @returns {boolean} */
function isTopLevelSp(desc) {
  const d = desc.trim();
  return /^[A-G]\)\s/.test(d) || /totale/i.test(d);
}

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
