// The draft order of the machine: the ZIP container (CRC-32, stored entries read back), the order's content (the
// letterhead with the maker's site, machine, bedplate with the diverting pulley, the machine room drawn with the ordered
// machine, the source of the data, blanks), the Word document (its parts, the text escaped, the pictures) and the PDF
// and pictures of the same blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MACHINES } from '@/lib/catalog/machines';
import { defaultLift, deriveLift } from '@/lib/lift';
import { liftAdvice } from '@/lib/lift/advice';
import { collaudoOf } from '@/lib/lift/collaudo';
import { buildOrder, type OrderInput } from '@/lib/order/build';
import { toDocx } from '@/lib/order/docx';
import { designRoom } from '@/lib/order/drawings';
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

const LOGO = { mime: 'image/png' as const, data: readFileSync(path.join(process.cwd(), 'public', 'img', 'liftpilot-logo-480.png')).toString('base64') };

/** The order of the example design with `catalog` chosen (else the advice's first). */
const sample = (catalog: { brand: 'SICOR' | 'Montanari'; model: string } | null, o: Partial<OrderInput> = {}): OrderInput => {
  const L = { ...defaultLift(), ...(catalog ? { catalog } : {}) }, d = deriveLift(L), order = designOrder(L, liftAdvice(L), d);
  assert.ok(order);
  return {
    company: 'Ascensori di prova S.r.l.', companyCity: 'Milano', logo: LOGO, author: 'Mario Bianchi',
    project: { name: 'Condominio Via Roma 12', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 12345' },
    record: { kind: 'design', id: 'cmtestorder01', sha256: 'a'.repeat(64), createdAt: new Date('2026-10-02T08:00:00Z'), label: null },
    order, room: designRoom(L, d, order.machine, order.recorded), collaudo: collaudoOf(L.calc), generatedAt: new Date('2026-10-02T10:00:00Z'), ...o,
  };
};

const texts = (doc: ReportDoc): string => doc.blocks.map((b) => {
  switch (b.t) {
    case 'kv': return b.rows.flat().join(' ');
    case 'grid': return [...b.head, ...b.rows.flat()].join(' ');
    case 'list': return b.items.join(' ');
    case 'sign': return b.labels.join(' ');
    case 'letterhead': return [...b.from, ...b.to].join(' ');
    case 'plan': return b.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])).join(' ');
    default: return b.text;
  }
}).join('\n');

test('bozza d’ordine: carta intestata, argano, basamento con rinvio, locale macchina, fonte dei dati, campi da completare', () => {
  const doc = buildOrder(sample({ brand: 'SICOR', model: 'SH140' })), all = texts(doc);
  for (const s of ['Ascensori di prova S.r.l.', 'Milano, 2 ottobre 2026', 'sicoritaly.com', 'SICOR SH140', 'XTE6026', 'Ø 400 mm', 'UNI EN 81-20:2020, 5.9.2.2', '☐ destra',
    'Prezzo unitario', 'mai nel vano', 'da documenti del costruttore', 'a'.repeat(64)]) assert.ok(all.includes(s), s);
  const head = doc.blocks[0];
  assert.ok(head?.t === 'letterhead' && head.logo === 'logo' && head.from[0] === 'Ascensori di prova S.r.l.');
  assert.equal(doc.drawing?.images.logo?.data, LOGO.data, 'il logo nel modello');
  // the machine room in plan and in section with the machine on the maker's bedplate
  const plans = doc.blocks.filter((b) => b.t === 'plan');
  assert.equal(plans.length, 2);
  assert.ok(doc.blocks.some((b) => b.t === 'h2' && b.text.endsWith('Locale macchina con l’argano')));
  assert.ok(plans.every((b) => b.t === 'plan' && b.w <= 178 && b.h > 20 && b.shapes.length > 50));
  // no comparison with the other maker in an order to a maker; the machine verified in the design: no warning
  assert.ok(!all.includes('Montanari') && !all.includes('Alternative'));
  assert.ok(!doc.blocks.some((b) => b.t === 'box'));
});

test('bozza d’ordine Montanari: il sito del costruttore e i dati dal suo documento', () => {
  const best = liftAdvice(defaultLift()).best.find((c) => c.brand === 'Montanari');
  const src = MACHINES.find((c) => c.brand === 'Montanari' && c.model === best?.model)?.src ?? '';
  assert.ok(best && src.startsWith('D: '));
  // the document the values come from: the range sheet the client supplied or the technical catalogue of 2018
  const docName = src.slice(3, src.indexOf(','));
  const doc = buildOrder(sample({ brand: 'Montanari', model: best.model })), all = texts(doc);
  for (const s of ['montanarigiulio.com', `Montanari ${best.model}`, 'da documenti del costruttore', docName]) assert.ok(all.includes(s), s);
  assert.ok(!all.includes('sicoritaly.com'));
});

test('bozza d’ordine del consigliato: l’avviso in testa, il locale disegnato con l’argano ordinato', () => {
  const o = sample(null);
  assert.ok(!o.order.recorded);
  const doc = buildOrder(o), box = doc.blocks.find((b) => b.t === 'box');
  assert.ok(box && box.t === 'box' && box.text.includes('verifica un argano diverso'));
  assert.equal(doc.blocks.filter((b) => b.t === 'plan').length, 2);
  // no logo, no city: the name alone
  const bare = buildOrder({ ...o, logo: null, companyCity: null }), head = bare.blocks[0];
  assert.ok(head?.t === 'letterhead' && head.logo === null && head.from.length === 1);
});

test('bozza d’ordine con la macchina in basso: nessun locale sopra il vano, come nel fascicolo dei disegni', () => {
  const L0 = defaultLift(), L = { ...L0, calc: { ...L0.calc, layout: 'bottom' as const } }, d = deriveLift(L), order = designOrder(L, liftAdvice(L), d);
  assert.ok(order);
  assert.deepEqual(designRoom(L, d, order.machine, order.recorded), []);
  const doc = buildOrder({ ...sample(null), order, room: [] }), all = texts(doc);
  assert.ok(!doc.blocks.some((b) => b.t === 'plan') && !all.includes('Locale macchina con l’argano') && !all.includes('come nella pianta del locale'));
  // the pulls on its anchors as sheet 1 gives them: at the test with 1,25·Q and with the rated load times the dynamic
  // coefficient (registry albero.sollevamento), the machine's mass deducted
  const a = order.machine.anchor, fmt = (x: number): string => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(x);
  assert.ok(a && a.max > 0, 'tiro verso l’alto sugli ancoraggi');
  assert.ok(all.includes(`${fmt(Math.max(0, a.test))} kg nella prova con 1,25·Q, ${fmt(Math.max(0, a.dyn))} kg con la portata × 2,0`), 'i due tiri');
});

test('bozza d’ordine: la coppia in uscita come la chiedono la proposta e la relazione (il massimo, per eccesso a 10 N·m)', () => {
  const o = sample({ brand: 'SICOR', model: 'SH140' }), mp = o.order.machine.mpMax, all = texts(buildOrder(o));
  const asked = Math.ceil(mp / 10 - 1e-9) * 10;
  assert.ok(asked >= mp && asked - mp < 10);
  assert.ok(all.includes(`≥ ${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(asked)} N·m sull’albero lento`), `${mp} → ${asked}`);
  // above, nothing pulls the anchors up
  assert.equal(o.order.machine.anchor, null);
  assert.ok(!all.includes('tiro sugli ancoraggi'));
});

test('Word: le parti del pacchetto, il testo protetto, il logo e i disegni come immagini', () => {
  const doc = buildOrder(sample({ brand: 'SICOR', model: 'SH140' }, { company: 'Rossi & Figli <Ascensori> "R"\u0001' }));
  const png = (n: number): Uint8Array => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n]);
  const parts = unzip(toDocx(doc, new Date('2026-10-02T10:00:00Z'), [png(1), png(2)]));
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/header1.xml', 'word/footer1.xml',
    'docProps/core.xml', 'word/media/image1.png', 'word/media/image2.png', 'word/media/image3.png']) assert.ok(parts.has(p), p);
  const dec = new TextDecoder(), xml = dec.decode(parts.get('word/document.xml')), rels = dec.decode(parts.get('word/_rels/document.xml.rels'));
  assert.ok(xml.startsWith('<?xml') && xml.includes('<w:body>') && xml.includes('<w:sectPr>'));
  assert.ok(xml.includes('Rossi &amp; Figli &lt;Ascensori&gt; &quot;R&quot;') && !xml.includes('\u0001'), 'testo protetto');
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), 'nessuna & senza entità');
  assert.ok(xml.includes('SICOR SH140') && xml.includes('XTE6026'));
  // the logo first (the company's PNG as it is), then the two views, each with its relationship
  assert.deepEqual(parts.get('word/media/image1.png'), Uint8Array.from(Buffer.from(LOGO.data, 'base64')));
  assert.deepEqual([...parts.get('word/media/image3.png') ?? []], [...png(2)]);
  for (const k of [1, 2, 3]) {
    assert.ok(xml.includes(`r:embed="rIdImg${k}"`) && rels.includes(`Id="rIdImg${k}"`) && rels.includes(`Target="media/image${k}.png"`), `immagine ${k}`);
  }
  assert.ok(dec.decode(parts.get('[Content_Types].xml')).includes('Extension="png"'));
  assert.ok(!xml.includes('disegno nel PDF'));
  assert.ok(dec.decode(parts.get('word/header1.xml')).includes('NUMPAGES'), 'pagina N di M');
  // without the pictures the views stay in the PDF, and the document says so
  assert.ok(dec.decode(unzip(toDocx(doc, new Date())).get('word/document.xml')).includes('disegno nel PDF'));
});

// The PDF and the pictures of the same blocks when Python with ReportLab and Pillow are present (the production image
// has them).
const python = process.env.PYTHON_BIN ?? 'python3';
const run = (script: string, input: string) => spawnSync(python, [path.join(process.cwd(), 'report', script)], {
  input, maxBuffer: 1 << 27, env: { ...process.env, REPORT_FONT_DIR: process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu' },
});

test('bozza d’ordine in PDF, con il logo e i disegni', (t) => {
  if (spawnSync(python, ['-c', 'import reportlab'], { encoding: 'utf8' }).status !== 0) { t.skip('python3 con reportlab non disponibile'); return; }
  const out = run('relazione.py', JSON.stringify(buildOrder(sample({ brand: 'SICOR', model: 'SH140' }))));
  assert.equal(out.status, 0, out.stderr?.toString());
  assert.equal(out.stdout.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('i disegni come immagini PNG a 300 dpi', (t) => {
  if (spawnSync(python, ['-c', 'import PIL'], { encoding: 'utf8' }).status !== 0) { t.skip('python3 con Pillow non disponibile'); return; }
  const doc = buildOrder(sample({ brand: 'SICOR', model: 'SH140' })), out = run('raster.py', JSON.stringify(doc));
  assert.equal(out.status, 0, out.stderr?.toString());
  const list: unknown = JSON.parse(out.stdout.toString('utf8'));
  assert.ok(Array.isArray(list) && list.length === 2);
  const plans = doc.blocks.filter((b) => b.t === 'plan');
  list.forEach((b64: unknown, k) => {
    assert.equal(typeof b64, 'string');
    const png = Buffer.from(String(b64), 'base64'), b = plans[k];
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
    assert.ok(b?.t === 'plan');
    // width and height in the header: the block's millimetres at 300 dpi
    assert.equal(png.readUInt32BE(16), Math.round((b.w * 300) / 25.4));
    assert.equal(png.readUInt32BE(20), Math.round((b.h * 300) / 25.4));
  });
});
