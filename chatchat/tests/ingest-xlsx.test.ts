import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findErrorTemplate, normalizeHeader } from '../src/ingest/error-template.js';
import { INGEST_LIMITS, IngestFailure } from '../src/ingest/types.js';
import { excelDate, extractXlsx, isDateFormat, readWorkbook } from '../src/ingest/xlsx.js';
import { buildZip, makeXlsx } from './ingest-fixtures.js';

/**
 * XLSX (§4.1, §7.1): листове → таблици като текст (раздел = лист, заглавният ред на всяка
 * „страница“), дати по формата, скрити листове — предупреждение; враждебни книги — провал с код;
 * шаблон за кодове за грешка → валидни редове + предупреждения за невалидните.
 */

const failure = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (err) {
    if (err instanceof IngestFailure) return err.code;
    throw err;
  }
  return 'ok';
};

describe('XLSX → страници', () => {
  test('споделени и inline низове, числа, булеви, дата по стила; раздел = листът', () => {
    const bytes = makeXlsx([
      {
        name: 'Codici',
        rows: [
          ['Codice', 'Descrizione', 'Data'],
          ['E37', 'Porta aperta', 46304],
          ['E38', 'Fotocellula', null],
        ],
        dates: ['C2'],
      },
      {
        name: 'Note',
        rows: [
          ['Valore', 'Attivo'],
          [4.2, true],
        ],
      },
    ]);
    const { extraction } = extractXlsx(bytes);
    assert.equal(extraction.format, 'xlsx');
    assert.deepEqual(
      extraction.pages.map((p) => [p.page, p.section, p.text]),
      [
        [
          1,
          'Codici',
          'Codice | Descrizione | Data\nE37 | Porta aperta | 2026-10-09\nE38 | Fotocellula',
        ],
        [2, 'Note', 'Valore | Attivo\n4.2 | TRUE'],
      ],
    );
  });

  test('над 100 реда → нова страница със заглавния ред отгоре; скрит лист → предупреждение', () => {
    const rows = [
      ['Code', 'Text'],
      ...Array.from({ length: 150 }, (_, i) => [`E${i}`, `riga ${i}`]),
    ];
    const { extraction } = extractXlsx(
      makeXlsx([
        { name: 'Lista', rows },
        { name: 'Segreto', rows: [['x']], hidden: true },
      ]),
    );
    assert.equal(extraction.pages.length, 2);
    assert.ok(extraction.pages[1]?.text.startsWith('Code | Text\nE100 | riga 100'));
    assert.deepEqual(
      extraction.warnings.map((w) => w.code),
      ['ingest.warn.hiddenSheetSkipped'],
    );
  });

  test('дати: формати и серийни номера (1900 и 1904)', () => {
    assert.equal(isDateFormat('dd/mm/yyyy'), true);
    assert.equal(isDateFormat('[h]:mm'), true);
    assert.equal(isDateFormat('0.00'), false);
    assert.equal(isDateFormat('"Totale" #,##0'), false);
    assert.equal(isDateFormat('General'), false);
    assert.equal(excelDate(46304, false), '2026-10-09');
    assert.equal(excelDate(46304.5, false), '2026-10-09 12:00');
    assert.equal(excelDate(44842, true), '2026-10-09');
  });

  test('враждебни/повредени книги: бомба, не-XLSX, без workbook, DOCTYPE, огромен лист', async () => {
    const bomb = buildZip([
      { name: 'xl/workbook.xml', data: Buffer.alloc(3_000_000), declaredSize: 10 },
    ]);
    assert.equal(await failure(() => readWorkbook(bomb)), 'ingest.err.archiveBomb');
    assert.equal(
      await failure(() => readWorkbook(Buffer.from('nope'))),
      'ingest.err.archiveInvalid',
    );
    const noBook = buildZip([{ name: '[Content_Types].xml', data: '<Types/>' }]);
    assert.equal(await failure(() => readWorkbook(noBook)), 'ingest.err.archiveInvalid');
    const xxe = buildZip([
      {
        name: 'xl/workbook.xml',
        data: '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><w/>',
      },
    ]);
    assert.equal(await failure(() => readWorkbook(xxe)), 'ingest.err.archiveInvalid');
    const saved = INGEST_LIMITS.maxCells;
    INGEST_LIMITS.maxCells = 1_000;
    try {
      const huge = makeXlsx([
        { name: 'Big', rows: Array.from({ length: 300 }, (_, i) => [i, i + 1, i + 2, i + 3]) },
      ]);
      assert.equal(await failure(() => readWorkbook(huge)), 'ingest.err.tooManyCells');
    } finally {
      INGEST_LIMITS.maxCells = saved;
    }
    assert.equal(
      await failure(() => extractXlsx(makeXlsx([{ name: 'Vuoto', rows: [] }]))),
      'ingest.err.emptyDocument',
    );
  });
});

describe('XLSX шаблон за кодове за грешка', () => {
  const template = makeXlsx([
    {
      name: 'Codici errore',
      rows: [
        [
          'Codice',
          'Modello',
          'Titolo',
          'Descrizione',
          'Gravità',
          'Sicurezza',
          'FW min',
          'Sintomi',
          'Controlli',
          'Pagina',
        ],
        [
          'e37',
          'LTX-500',
          'Porta aperta',
          'Contatto porta aperto',
          'Guasto',
          'sì',
          '4.0',
          'Cabina ferma',
          '1. Verificare contatto\n[SAFETY_RELEVANT] Misurare tensione',
          3,
        ],
        ['E38', 'LTX-500', 'Fotocellula', 'Fotocellula ostruita', 'avviso', 'no', '', '', '', ''],
        ['E99', '', 'X', 'Senza gravità', '', '', '', '', '', ''],
        ['E40', 'LTX-500', 'FW invertito', 'Intervallo errato', 'critico', '', '5.0', '', '', ''],
      ],
    },
  ]);

  test('заглавията IT/EN/BG се разпознават; тежест и „да“ се превеждат; връзки с клас', () => {
    assert.equal(normalizeHeader('  Gravità '), 'gravita');
    assert.equal(normalizeHeader('Код на грешка'), 'код на грешка');
    const { extraction, sheets } = extractXlsx(template);
    const found = findErrorTemplate(sheets, extraction.pages);
    assert.ok(found);
    assert.equal(found.sheet, 'Codici errore');
    const [e37, e38] = found.rows;
    assert.equal(found.rows.length, 3);
    assert.deepEqual(
      [
        e37?.code,
        e37?.severity,
        e37?.safetyRelevant,
        e37?.fwMin,
        e37?.sourcePage,
        e37?.productModel,
      ],
      ['E37', 'FAULT', true, '4.0', 3, 'LTX-500'],
    );
    assert.deepEqual(e37?.relations, [
      { kind: 'SYMPTOM', text: 'Cabina ferma', actionClass: 'INFORMATIVE' },
      { kind: 'CHECK', text: 'Verificare contatto', actionClass: 'DIAGNOSTIC' },
      { kind: 'CHECK', text: 'Misurare tensione', actionClass: 'SAFETY_RELEVANT' },
    ]);
    assert.deepEqual([e38?.severity, e38?.safetyRelevant, e38?.sheetPage], ['WARNING', false, 1]);
    // Без тежест → невалиден ред (с номера му), не провал на файла.
    assert.deepEqual(found.warnings, [{ code: 'ingest.warn.errorRowInvalid', row: 4 }]);
  });

  test('лист без колоните на шаблона → няма шаблон', () => {
    const { extraction, sheets } = extractXlsx(
      makeXlsx([
        {
          name: 'A',
          rows: [
            ['x', 'y'],
            [1, 2],
          ],
        },
      ]),
    );
    assert.equal(findErrorTemplate(sheets, extraction.pages), null);
  });
});
