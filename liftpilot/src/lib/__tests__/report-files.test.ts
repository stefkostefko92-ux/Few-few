// The documents as files (round 37): every PDF says its language (/Lang it-IT: the relazione, the drawing set and the
// order are in Italian) and is dated as its record — a calculation's or a design's saving, a set's issue —, never the
// download; two downloads of the same record are the same bytes (the PDFs, the order's Word document and its pictures);
// no document writes the moment it was downloaded, and no download on the server reads the clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PRESETS } from '@/calc/presets';
import { deriveLift, newLift } from '../lift';
import { liftAdvice } from '../lift/advice';
import { collaudoOf } from '../lift/collaudo';
import { valueMarks } from '../lift/marks';
import { buildOrder, type OrderInput } from '../order/build';
import { toDocx } from '../order/docx';
import { designRoom } from '../order/drawings';
import { designOrder } from '../order/machine';
import { buildReport } from '../report/build';
import type { ReportDoc } from '../report/model';
import { rendererInput } from '../report/payload';
import { buildTavole } from '../tavole/build';

const AT = new Date('2026-09-30T08:00:00Z');
const project = { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: null };

const report = (): ReportDoc => buildReport({
  calc: { id: 'cmtest0001', label: null, createdAt: AT, sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: 'Mario Rossi' },
  project, company: 'Ditta di prova', values: PRESETS.B, reviews: [],
});

const tavole = () => {
  const L = newLift(), d = deriveLift(L);
  return buildTavole({ values: d.values, layout: d.layout, plant: {}, marks: valueMarks(L.auto, d, d.bottom, d.collaudo), project,
    company: { name: 'Ditta di prova', logo: null }, set: { number: '26-001', issuedAt: AT, author: 'LP', revisions: [] } });
};

const order = (): OrderInput => {
  const L = newLift(), d = deriveLift(L), o = designOrder(L, liftAdvice(L), d);
  assert.ok(o);
  return {
    company: 'Ditta di prova', companyCity: 'Milano', logo: null, author: 'Mario Bianchi', project,
    record: { kind: 'design', id: 'cmtestorder01', sha256: 'a'.repeat(64), createdAt: AT, label: null },
    order: o, room: designRoom(L, d, o.machine, o.recorded), collaudo: collaudoOf(L.calc),
  };
};

test('il documento va al renderer con la data del record (meta.created), il disegno senza cambiare', () => {
  const doc = report(), json: unknown = JSON.parse(rendererInput(doc, AT));
  assert.ok(typeof json === 'object' && json !== null && 'meta' in json);
  assert.deepEqual(json, { ...doc, meta: { ...doc.meta, created: '2026-09-30T08:00:00.000Z' } });
  // without a date (the pictures of the Word document) the document as it is
  assert.equal(rendererInput(doc), JSON.stringify(doc));
  // the set's document keeps its own meta: the date never enters what its hash covers
  const set = tavole().doc;
  assert.ok(!('created' in set.meta));
});

test('nessun documento scrive il momento dello scaricamento: la relazione, la relazione tecnica, l’ordine', () => {
  const kv = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows.map(([k]) => k) : []));
  assert.ok(!kv(report()).includes('Documento generato il'));
  assert.ok(kv(report()).includes('Data del calcolo'));
  // built twice, the same document: nothing in it comes from the clock
  assert.deepEqual(report(), report());
  // the order is dated as its record
  const o = buildOrder(order());
  assert.ok(o.blocks.some((b) => b.t === 'sub' && b.text.startsWith('Milano, 30 settembre 2026')));
  assert.equal(o.meta.footer, 'LiftPilot · bozza del 30 settembre 2026');
  // the technical relazione's source writes no download date either (its record is the survey)
  const src = readFileSync(path.join(process.cwd(), 'src', 'lib', 'report', 'tecnica.ts'), 'utf8');
  assert.ok(!src.includes('Documento generato il') && !src.includes('generatedAt'));
});

test('lo scaricamento sul server non legge l’orologio: le date sono quelle dei record', () => {
  const files = ['server/project-export.ts', 'server/room-export.ts', 'server/set-cad.ts', 'server/order-export.ts', 'server/drawing-pdf.ts',
    'app/api/calculations/[id]/relazione/route.ts', 'app/api/shaft-designs/[id]/dxf/route.ts', 'app/api/drawing-sets/[id]/pdf/route.ts'];
  for (const f of files) {
    const src = readFileSync(path.join(process.cwd(), 'src', f), 'utf8');
    assert.ok(!/new Date\(\)|Date\.now\(/.test(src), f);
  }
});

test('l’ordine in Word: le stesse parti e gli stessi byte a ogni scaricamento, datato come il record', async () => {
  const doc = buildOrder(order()), a = toDocx(doc, AT);
  await new Promise((r) => setTimeout(r, 1100));
  assert.ok(Buffer.from(a).equals(Buffer.from(toDocx(buildOrder(order()), AT))));
  const core = Buffer.from(a).toString('latin1');
  assert.ok(core.includes('<dcterms:created xsi:type="dcterms:W3CDTF">2026-09-30T08:00:00Z</dcterms:created>'));
  assert.ok(core.includes('<dcterms:modified xsi:type="dcterms:W3CDTF">2026-09-30T08:00:00Z</dcterms:modified>'));
});

// The renderers when Python with ReportLab (and Pillow for the pictures) is present (the production image has them).
const python = process.env.PYTHON_BIN ?? 'python3';
const run = (script: string, input: string): Buffer => {
  const out = spawnSync(python, [path.join(process.cwd(), 'report', script)], {
    input, maxBuffer: 1 << 28, env: { ...process.env, REPORT_FONT_DIR: process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu' },
  });
  assert.equal(out.status, 0, out.stderr?.toString());
  return out.stdout;
};
const has = (module: string): boolean => spawnSync(python, ['-c', `import ${module}`], { encoding: 'utf8' }).status === 0;

test('PDF in italiano (/Lang it-IT), datato come il record, gli stessi byte a ogni scaricamento: relazione, ordine, tavole', async (t) => {
  if (!has('reportlab')) { t.skip('python3 con reportlab non disponibile'); return; }
  for (const [name, script, doc] of [['relazione', 'relazione.py', report()], ['ordine', 'relazione.py', buildOrder(order())], ['tavole', 'tavole.py', tavole().doc]] as const) {
    const a = run(script, rendererInput(doc, AT));
    // a later download: the clock moved on
    await new Promise((r) => setTimeout(r, 1100));
    const b = run(script, rendererInput(doc, AT)), s = a.toString('latin1');
    assert.ok(a.equals(b), `${name}: gli stessi byte`);
    assert.match(s, /\/Lang \(it-IT\)/, name);
    assert.match(s, /\/CreationDate \(D:20260930080000\+00'00'\)/, name);
    assert.match(s, /\/ModDate \(D:20260930080000\+00'00'\)/, name);
    // another record, another date (and another /ID)
    const c = run(script, rendererInput(doc, new Date('2026-10-01T08:00:00Z'))).toString('latin1');
    assert.match(c, /\/CreationDate \(D:20261001080000\+00'00'\)/, name);
    assert.notEqual(c.match(/\/ID\s*\[<([0-9a-f]+)>/i)?.[1], s.match(/\/ID\s*\[<([0-9a-f]+)>/i)?.[1], `${name}: /ID`);
  }
});

test('le immagini dell’ordine in Word: gli stessi PNG a ogni scaricamento', (t) => {
  if (!has('PIL')) { t.skip('python3 con Pillow non disponibile'); return; }
  const doc = buildOrder(order()), a = run('raster.py', rendererInput(doc)), b = run('raster.py', rendererInput(doc));
  assert.ok(a.length > 1000 && a.equals(b));
});
