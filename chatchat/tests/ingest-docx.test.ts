import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractDocx, htmlSections } from '../src/ingest/docx.js';
import { DOCX_MIME, detectOoxml, formatOfMime, XLSX_MIME } from '../src/ingest/formats.js';
import { extractLog } from '../src/ingest/log.js';
import { parseCsv, parseManifest } from '../src/ingest/manifest.js';
import { IngestFailure } from '../src/ingest/types.js';
import { detectKnowledgeMime, detectMime } from '../src/services/filetype.js';
import { makePdf } from './file-fixtures.js';
import { buildZip, makeDocx, makeXlsx, pngHeader } from './ingest-fixtures.js';

/**
 * DOCX (заглавия → раздели), логове (redactPii, тавани), разпознаване на формата по съдържанието
 * и манифестът на пакета (§4.1).
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

describe('DOCX → раздели', () => {
  test('заглавие 1/2 започва раздел (стил с италиански id), таблица → редове „клетка | клетка“', async () => {
    const bytes = makeDocx([
      { text: 'Manuale LTX-500' },
      { style: 'Titolo1', text: 'Installazione' },
      { text: 'Montare il quadro.' },
      { style: 'Titolo3', text: 'Dettaglio' },
      {
        table: [
          ['Morsetto', 'Funzione'],
          ['X3', 'Catena sicurezze'],
        ],
      },
      { style: 'Titolo2', text: 'Errori' },
      { text: 'E37 — porta aperta.' },
    ]);
    const out = await extractDocx(bytes);
    assert.equal(out.format, 'docx');
    assert.deepEqual(
      out.pages.map((p) => [p.page, p.section ?? null, p.text]),
      [
        [1, null, 'Manuale LTX-500'],
        [
          2,
          'Installazione',
          'Installazione\n\nMontare il quadro.\n\nDettaglio\n\nMorsetto | Funzione\n\nX3 | Catena sicurezze',
        ],
        [3, 'Errori', 'Errori\n\nE37 — porta aperta.'],
      ],
    );
  });

  test('HTML на mammoth: изброявания, нов ред, същности', () => {
    const sections = htmlSections('<p>a &amp; b<br />c</p><ul><li>uno</li></ul><h1>T</h1><p>x</p>');
    assert.deepEqual(sections, [
      { blocks: ['a & b\nc', '• uno'] },
      { title: 'T', blocks: ['T', 'x'] },
    ]);
  });

  test('повреден/враждебен DOCX: бомба, без document.xml, празен, не-ZIP', async () => {
    const bomb = buildZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: Buffer.alloc(4_000_000), declaredSize: 50 },
    ]);
    assert.equal(await failure(() => extractDocx(bomb)), 'ingest.err.archiveBomb');
    const noDoc = buildZip([{ name: '[Content_Types].xml', data: '<Types/>' }]);
    assert.equal(await failure(() => extractDocx(noDoc)), 'ingest.err.archiveInvalid');
    assert.equal(await failure(() => extractDocx(makeDocx([]))), 'ingest.err.emptyDocument');
    assert.equal(await failure(() => extractDocx(Buffer.from('PK'))), 'ingest.err.archiveInvalid');
  });
});

describe('логове', () => {
  test('ред по ред с маскирани лични данни; раздел = обхватът на редовете', () => {
    const text = [
      '2026-10-09 10:00 E37 porta aperta',
      '',
      '2026-10-09 10:01 tecnico mario.rossi@example.com tel +39 333 123 4567',
      `2026-10-09 10:02 ${'x'.repeat(3000)}`,
    ].join('\n');
    const out = extractLog(Buffer.from(text), 'text/plain');
    assert.equal(out.pages.length, 1);
    const page = out.pages[0];
    assert.equal(page?.section, '1–4');
    assert.match(page?.text ?? '', /E37 porta aperta/);
    assert.doesNotMatch(page?.text ?? '', /mario\.rossi|333 123/);
    assert.match(page?.text ?? '', /\[email\]/);
    assert.ok((page?.text.length ?? 0) < 3000, 'дългият ред е отрязан до MAX_LOG_LINE');
  });

  test('JSON масив → един елемент на ред; невалиден UTF-8 → провал; празен → провал', async () => {
    const json = extractLog(Buffer.from('[{"code":"E37"},{"code":"E38"}]'), 'application/json');
    assert.equal(json.pages[0]?.text, '{"code":"E37"}\n\n{"code":"E38"}');
    assert.equal(
      await failure(() => extractLog(Buffer.from([0xff, 0xfe, 0x00]), 'text/plain')),
      'ingest.err.textInvalid',
    );
    assert.equal(
      await failure(() => extractLog(Buffer.from('\n\n'), 'text/plain')),
      'ingest.err.emptyDocument',
    );
  });

  test('над 200 реда → няколко страници', () => {
    const many = Array.from({ length: 450 }, (_, i) => `riga ${i + 1}`).join('\n');
    const out = extractLog(Buffer.from(many), 'text/plain');
    assert.deepEqual(
      out.pages.map((p) => p.section),
      ['1–200', '201–400', '401–450'],
    );
  });
});

describe('формат по съдържанието (§4.1)', () => {
  test('PDF, DOCX, XLSX, PNG, текст — да; макроси, HEIC, друг ZIP, двоично — не', () => {
    assert.equal(detectKnowledgeMime(makePdf([['x']])), 'application/pdf');
    assert.equal(detectKnowledgeMime(makeDocx([{ text: 'a' }])), DOCX_MIME);
    assert.equal(detectKnowledgeMime(makeXlsx([{ name: 'a', rows: [['x']] }])), XLSX_MIME);
    assert.equal(detectKnowledgeMime(pngHeader(10, 10)), 'image/png');
    assert.equal(detectKnowledgeMime(Buffer.from('2026 E37\n2026 E38\n')), 'text/plain');
    const docm = makeDocx([{ text: 'a' }], [{ name: 'word/vbaProject.bin', data: 'x' }]);
    assert.equal(detectOoxml(docm), 'macro');
    assert.equal(detectKnowledgeMime(docm), null);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic0000', 'latin1')]);
    assert.equal(detectKnowledgeMime(heic), null);
    assert.equal(detectKnowledgeMime(buildZip([{ name: 'a.txt', data: 'x' }])), null);
    assert.equal(detectKnowledgeMime(Buffer.from([0x00, 0x01, 0x02])), null);
    // Разговорите остават с тесния списък: DOCX като DOCUMENT в разговор — не.
    assert.equal(detectMime('DOCUMENT', makeDocx([{ text: 'a' }])), null);
    assert.equal(formatOfMime(DOCX_MIME), 'docx');
    assert.equal(formatOfMime('application/zip'), null);
  });
});

describe('манифест', () => {
  test('CSV с ; и кавички; правилото за приложимост от плоските колони; имената се изчистват', () => {
    assert.deepEqual(parseCsv('a;b\n"x;1";"y ""q"""\n'), [
      ['a', 'b'],
      ['x;1', 'y "q"'],
    ]);
    const parsed = parseManifest({
      format: 'csv',
      text: 'file,code,revision,productModel,fwMin,safetyRelevant\nman.pdf,MAN-1,B,LTX-500,4.0,si\nsch.docx,SCH-1,A,LTX-500,,no\n',
    });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.rows.get('man.pdf'), {
      code: 'MAN-1',
      revision: 'B',
      safetyRelevant: true,
      applicability: [{ productModel: 'LTX-500', fwMin: '4.0' }],
    });
    assert.deepEqual(parsed.rows.get('sch.docx')?.applicability, [
      { productModel: 'LTX-500', allFirmware: true },
    ]);
  });

  test('JSON; повторено име, ред без файл, не-масив → проблем по ред; „__proto__“ не замърсява', () => {
    const bad = parseManifest({
      format: 'json',
      text: JSON.stringify([{ file: 'a.pdf' }, { file: 'a.pdf' }, { code: 'X' }, 5]),
    });
    assert.deepEqual(bad.ok ? [] : bad.issues, [
      { row: 2, reason: 'duplicate_file' },
      { row: 3, reason: 'no_file' },
      { row: 4, reason: 'not_object' },
    ]);
    assert.equal(parseManifest({ format: 'json', text: '{"a":1}' }).ok, false);
    const proto = parseManifest({ format: 'json', text: '[{"file":"__proto__","code":"X"}]' });
    assert.ok(proto.ok);
    assert.equal(({} as Record<string, unknown>).code, undefined);
  });
});
