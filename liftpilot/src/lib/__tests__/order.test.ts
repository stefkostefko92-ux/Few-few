// The draft order of the machine: the ZIP container (CRC-32, stored entries read back), the Word document (its parts,
// the text escaped), the order's content (machine, bedplate with the diverting pulley, blanks, alternatives) and the
// PDF of the same blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { defaultLift } from '@/lib/lift';
import { collaudoOf } from '@/lib/lift/collaudo';
import { buildOrder, type OrderInput } from '@/lib/order/build';
import { toDocx } from '@/lib/order/docx';
import { designOrder } from '@/lib/order/machine';
import { crc32, zipStore } from '@/lib/order/zip';
import type { ReportDoc } from '@/lib/report/model';

/** The entries of a stored ZIP, read from its central directory. */
function unzip(z: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength), dec = new TextDecoder(), out = new Map<string, Uint8Array>();
  const end = z.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50, 'fine della directory');
  let at = v.getUint32(end + 16, true);
  for (let k = 0; k < v.getUint16(end + 10, true); k++) {
    assert.equal(v.getUint32(at, true), 0x02014b50);
    const size = v.getUint32(at + 20, true), nameLen = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true), crc = v.getUint32(at + 16, true);
    const name = dec.decode(z.subarray(at + 46, at + 46 + nameLen));
    assert.equal(v.getUint32(local, true), 0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true), data = z.subarray(start, start + size);
    assert.equal(crc32(data), crc, `${name}: CRC`);
    out.set(name, data);
    at += 46 + nameLen;
  }
  return out;
}

test('ZIP: CRC-32 e voci memorizzate rilette', () => {
  const enc = new TextEncoder();
  assert.equal(crc32(enc.encode('123456789')), 0xcbf43926);
  const z = zipStore([{ name: 'a.txt', data: enc.encode('ciao') }, { name: 'dir/è.xml', data: enc.encode('<x/>') }], new Date('2026-10-02T10:00:00Z'));
  assert.equal(new TextDecoder().decode(z.subarray(0, 2)), 'PK');
  const e = unzip(z);
  assert.deepEqual([...e.keys()], ['a.txt', 'dir/è.xml']);
  assert.equal(new TextDecoder().decode(e.get('dir/è.xml')), '<x/>');
});

const sample = (o: Partial<OrderInput> = {}): OrderInput => {
  const L = { ...defaultLift(), catalog: { brand: 'SICOR' as const, model: 'SH140' } }, order = designOrder(L);
  assert.ok(order);
  return {
    company: 'Ascensori di prova S.r.l.', author: 'Mario Bianchi',
    project: { name: 'Condominio Via Roma 12', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 12345', client: null },
    record: { kind: 'design', id: 'cmtestorder01', sha256: 'a'.repeat(64), createdAt: new Date('2026-10-02T08:00:00Z'), label: null },
    order, collaudo: collaudoOf(L.calc), generatedAt: new Date('2026-10-02T10:00:00Z'), ...o,
  };
};

const texts = (doc: ReportDoc): string => doc.blocks.map((b) => ('text' in b ? b.text : 'rows' in b ? b.rows.flat().join(' ') : 'labels' in b ? b.labels.join(' ') : '')).join('\n');

test('bozza d’ordine: argano, basamento con rinvio, dati dell’impianto, campi da completare', () => {
  const doc = buildOrder(sample()), all = texts(doc);
  for (const s of ['SICOR SH140', 'XTE6026', 'Ø 400 mm', 'UNI EN 81-20:2020, 5.9.2.2', '☐ destra', 'Prezzo unitario', 'mai nel vano', 'a'.repeat(64)]) assert.ok(all.includes(s), s);
  assert.ok(doc.blocks.some((b) => b.t === 'grid' && b.rows.some((r) => r[0]?.startsWith('★ SICOR SH140'))), 'l’argano ordinato fra le alternative');
  assert.ok(!doc.blocks.some((b) => b.t === 'box'), 'l’argano verificato nel progetto: nessun avviso');
  // the advice's first when the design verifies another machine: said at the top
  const L = defaultLift(), advised = designOrder(L);
  assert.ok(advised && !advised.recorded);
  const box = buildOrder(sample({ order: advised })).blocks.find((b) => b.t === 'box');
  assert.ok(box && box.t === 'box' && box.text.includes('verifica un argano diverso'));
});

test('Word: le parti del pacchetto e il testo protetto', () => {
  const doc = buildOrder(sample({ company: 'Rossi & Figli <Ascensori> "R"\u0001' }));
  const parts = unzip(toDocx(doc, new Date('2026-10-02T10:00:00Z')));
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/header1.xml', 'word/footer1.xml', 'docProps/core.xml']) {
    assert.ok(parts.has(p), p);
  }
  const xml = new TextDecoder().decode(parts.get('word/document.xml'));
  assert.ok(xml.startsWith('<?xml') && xml.includes('<w:body>') && xml.includes('<w:sectPr>'));
  assert.ok(xml.includes('Rossi &amp; Figli &lt;Ascensori&gt; &quot;R&quot;') && !xml.includes('\u0001'), 'testo protetto');
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), 'nessuna & senza entità');
  assert.ok(xml.includes('SICOR SH140') && xml.includes('XTE6026'));
  assert.ok(new TextDecoder().decode(parts.get('word/header1.xml')).includes('NUMPAGES'), 'pagina N di M');
});

// The PDF of the same blocks when Python and ReportLab are present (the production image has them).
test('bozza d’ordine in PDF', (t) => {
  const probe = spawnSync(process.env.PYTHON_BIN ?? 'python3', ['-c', 'import reportlab'], { encoding: 'utf8' });
  if (probe.status !== 0) { t.skip('python3 con reportlab non disponibile'); return; }
  const out = spawnSync(process.env.PYTHON_BIN ?? 'python3', [path.join(process.cwd(), 'report', 'relazione.py')], {
    input: JSON.stringify(buildOrder(sample())), maxBuffer: 1 << 26,
    env: { ...process.env, REPORT_FONT_DIR: process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu' },
  });
  assert.equal(out.status, 0, out.stderr?.toString());
  assert.equal(out.stdout.subarray(0, 5).toString('latin1'), '%PDF-');
});
