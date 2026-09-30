// The calculation report: complete, in order, without holes; and the renderer turns it into a PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PRESETS } from '@/calc/presets';
import { compute } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import { buildReport } from '../report/build';
import type { ReportDoc } from '../report/model';

const input = (k: 'A' | 'B' | 'C') => ({
  calc: { id: 'cmtest0001', label: 'offerta 1', createdAt: new Date('2026-09-30T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: 'Mario Rossi' },
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: null },
  company: 'Ditta di prova', values: PRESETS[k], generatedAt: new Date('2026-09-30T09:00:00Z'),
  reviews: [{ name: 'Ing. Bianchi', role: 'ENGINEER' as const, note: null, createdAt: new Date('2026-09-30T08:30:00Z') }],
});
const texts = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => {
  switch (b.t) {
    case 'kv': return b.rows.flat();
    case 'grid': return [...b.head, ...b.rows.flat()];
    case 'list': return b.items;
    case 'sign': return b.labels;
    default: return [b.text];
  }
});

test('relazione degli esempi A, B, C: sezioni numerate, una riga per verifica, nessun buco', () => {
  for (const k of ['A', 'B', 'C'] as const) {
    const doc = buildReport(input(k));
    const heads = doc.blocks.filter((b) => b.t === 'h2').map((b) => (b.t === 'h2' ? b.text : ''));
    heads.forEach((h, j) => assert.match(h, new RegExp(`^${j + 1}\\. `), `${k}: ${h}`));
    assert.ok(doc.blocks.some((b) => b.t === 'box' && b.text.startsWith('BOZZA DA VERIFICARE E FIRMARE')), `${k}: avviso di bozza`);
    const ctx = readInputs(PRESETS[k]), res = compute(ctx.I, ctx.N);
    const checks = doc.blocks.find((b) => b.t === 'grid' && b.head.includes('Riferimento'));
    assert.ok(checks && checks.t === 'grid' && checks.rows.length === res.checks.length, `${k}: righe delle verifiche`);
    const all = texts(doc);
    assert.ok(all.every((x) => typeof x === 'string'), `${k}: solo testi`);
    for (const bad of ['undefined', 'NaN', '[object Object]']) assert.ok(!all.some((x) => x.includes(bad)), `${k}: «${bad}» nel testo`);
    assert.ok(doc.blocks.some((b) => b.t === 'sign'), `${k}: firma`);
    assert.equal(doc.meta.code, `SHA-256 ${'f'.repeat(64)}`);
  }
});

test('sostituzione con adeguamenti UNI 10411-1, impianto nuovo con UCMP', () => {
  const hasHead = (doc: ReportDoc, s: string): boolean => doc.blocks.some((b) => b.t === 'h2' && b.text.includes(s));
  assert.ok(hasHead(buildReport(input('B')), 'UNI 10411-1'));
  assert.ok(!hasHead(buildReport(input('A')), 'UNI 10411-1'));
});

// PDF with the renderer when Python and ReportLab are present (the production image has them).
test('il renderer produce un PDF', (t) => {
  const probe = spawnSync(process.env.PYTHON_BIN ?? 'python3', ['-c', 'import reportlab'], { encoding: 'utf8' });
  if (probe.status !== 0) { t.skip('python3 con reportlab non disponibile'); return; }
  const out = spawnSync(process.env.PYTHON_BIN ?? 'python3', [path.join(process.cwd(), 'report', 'relazione.py')], {
    input: JSON.stringify(buildReport(input('B'))), maxBuffer: 1 << 26,
    env: { ...process.env, REPORT_FONT_DIR: process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu' },
  });
  assert.equal(out.status, 0, out.stderr?.toString());
  assert.equal(out.stdout.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(out.stdout.length > 20000);
});
