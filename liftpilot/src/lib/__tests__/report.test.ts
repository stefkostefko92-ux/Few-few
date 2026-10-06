// The calculation report: complete, in order, without holes; and the renderer turns it into a PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PRESETS } from '@/calc/presets';
import { compute } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import { SHAFT_ENGINE_VERSION, defaultInputs, shaftSnapshot, type ShaftInputs } from '@/shaft';
import { readFileSync } from 'node:fs';
import { mirrorRopes } from '@/lib/present/analysis';
import { ADVICE_MODELS, valuesAdvice } from '@/lib/lift/advice';
import { buildReport } from '../report/build';
import type { ReportDoc } from '../report/model';
import type { ReportDesign } from '../report/shaft';

const input = (k: 'A' | 'B' | 'C') => ({
  calc: { id: 'cmtest0001', label: 'offerta 1', createdAt: new Date('2026-09-30T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: 'Mario Rossi' },
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: null },
  company: 'Ditta di prova', values: PRESETS[k], generatedAt: new Date('2026-09-30T09:00:00Z'),
  reviews: [{ name: 'Ing. Bianchi', role: 'ENGINEER' as const, note: null, createdAt: new Date('2026-09-30T08:30:00Z') }],
});
const design = (inputs: ShaftInputs): ReportDesign => ({
  id: 'cmdesign01', label: 'rilievo', createdAt: new Date('2026-09-29T16:00:00Z'), sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION,
  profileId: 'IT-2026.1', author: 'Mario Rossi', layout: shaftSnapshot(inputs).layout,
  source: { file: 'pianta.dwg', sha256: 'a'.repeat(64), format: 'dwg', version: 'AC1032', units: 'mm', mmPerUnit: 1, point: [5800, 4600], angle: 0,
    rays: { right: 800, left: 800, up: 900, down: 850 }, door: 'down' },
});
const texts = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => {
  switch (b.t) {
    case 'kv': return b.rows.flat();
    case 'grid': return [...b.head, ...b.rows.flat()];
    case 'list': return b.items;
    case 'sign': return b.labels;
    case 'plan': return [b.scale, ...b.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : []))];
    case 'letterhead': return [...b.from, ...b.to];
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

test('valori riempiti dal software: massa della cabina stimata, geometria dal vano, argano proposto', () => {
  const plain = texts(buildReport(input('A')));
  const doc = buildReport({ ...input('A'), marks: { pEstimate: true, geometry: ['L0', 'dx'], machineProposed: true } }), all = texts(doc);
  assert.ok(doc.blocks.some((b) => b.t === 'box' && b.text.startsWith('MASSA DELLA CABINA STIMATA. La massa della cabina P = 700 kg')), 'avviso');
  assert.ok(all.includes('700 kg — stima del software, da sostituire con la massa reale'), 'riga della massa');
  assert.ok(all.some((x) => x.endsWith('(L0 dal progetto del vano)')) && all.some((x) => x.endsWith('(dx dal progetto del vano; h dal basamento o dal telaio del rinvio, salvo se inserita a mano)')), 'geometria dal vano');
  assert.ok(all.some((x) => x.startsWith('Argano proposto dal dimensionamento del software')), 'argano proposto');
  assert.ok(all.some((x) => x.startsWith('⚠ Massa della cabina: è la stima del software (1,1 × portata')), 'valori da verificare');
  for (const v of ['Massa della cabina non inserita', 'Fune oltre la corsa (L0)', 'Distanza orizzontale della puleggia di rinvio (dx)', 'Macchina proposta']) assert.ok(all.includes(v), v);
  // the bottom-machine height is not used by this layout (A: deflector on top)
  assert.ok(!all.includes('Macchina in basso: altezza fino alle pulegge in alto (Hv)'));
  for (const x of ['STIMATA', 'stima del software', 'dal progetto del vano', 'Argano proposto', 'Massa della cabina non inserita']) {
    assert.ok(!plain.some((y) => y.includes(x)), `senza segni: «${x}»`);
  }
});

test('sostituzione con adeguamenti UNI 10411-1, impianto nuovo con UCMP', () => {
  const hasHead = (doc: ReportDoc, s: string): boolean => doc.blocks.some((b) => b.t === 'h2' && b.text.includes(s));
  assert.ok(hasHead(buildReport(input('B')), 'UNI 10411-1'));
  assert.ok(!hasHead(buildReport(input('A')), 'UNI 10411-1'));
});

test('calcolo da un progetto del vano: pianta in scala, verifiche in pianta, voci del vano, avviso sulla portata', () => {
  const base = input('B'), Q = readInputs(PRESETS.B).I.Q;
  const heads = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => (b.t === 'h2' ? [b.text.replace(/^\d+\. /, '')] : []));
  const same = buildReport({ ...base, design: design({ ...defaultInputs(1600, 1750), Q }) });
  const h = heads(same);
  assert.equal(h[h.indexOf("Dati dell'impianto") + 1], 'Vano e cabina');
  assert.deepEqual(heads(buildReport(base)).filter((x) => x === 'Vano e cabina'), []);
  const plan = same.blocks.find((b) => b.t === 'plan');
  assert.ok(plan && plan.t === 'plan' && plan.shapes.length > 100 && /^Scala 1:(10|20|25|50) /.test(plan.scale), 'pianta in scala');
  assert.ok(plan.shapes.some((s) => s.t === 'text' && s.text === '1600 Vano piano "0"'), 'quota del vano');
  // inside its box, as wide as the report's text frame
  for (const s of plan.shapes) {
    const pts = s.t === 'line' ? [s.a, s.b] : s.t === 'path' ? s.pts : s.t === 'text' ? [s.at] : s.t === 'circle' || s.t === 'arc' ? [s.c] : [];
    for (const [x, y] of pts) assert.ok(x >= -0.5 && x <= plan.w + 0.5 && y >= -0.5 && y <= plan.h + 0.5, `forma fuori dal riquadro: ${x}, ${y}`);
  }
  assert.ok(same.drawing && same.drawing.patterns.concrete.shapes.length > 0, 'colori e retino del disegno');
  const L = shaftSnapshot({ ...defaultInputs(1600, 1750), Q }).layout;
  const checks = same.blocks.find((b) => b.t === 'grid' && b.rows.some((r) => r[0] === 'Gioco tra le soglie'));
  assert.ok(checks && checks.t === 'grid' && checks.rows.length === L.checks.length && checks.rows.every((r) => r[4]), 'una riga per verifica, con riferimento');
  assert.ok(checks.rows.some((r) => r[0] === 'Superficie entro la portata' && r[4].startsWith('UNI EN 81-20:2020, 5.4.2.1')), 'riferimento della superficie');
  const all = texts(same);
  for (const bad of ['undefined', 'NaN', '[object Object]']) assert.ok(!all.some((x) => x.includes(bad)), `«${bad}» nel testo`);
  assert.ok(all.includes('Superficie utile massima della cabina per portata'), 'voce del vano nella tabella delle voci');
  assert.ok(!all.includes('Edifici residenziali nuovi: cabina e porta minime'), 'solo il caso di accessibilità scelto');
  assert.ok(all.includes('a'.repeat(64)) && all.includes('e'.repeat(64)), 'impronte del disegno e del progetto');
  const mismatch = (doc: ReportDoc): boolean => doc.blocks.some((b) => b.t === 'box' && b.text.startsWith('La portata del calcolo'));
  assert.ok(!mismatch(same));
  assert.ok(mismatch(buildReport({ ...base, design: design({ ...defaultInputs(1600, 1750), Q: Q + 75 }) })));
});

test('carta intestata, argano riconosciuto dal catalogo, argano consigliato fra SICOR e Montanari', () => {
  const logo = { mime: 'image/png' as const, data: readFileSync(path.join(process.cwd(), 'public', 'img', 'liftpilot-logo-480.png')).toString('base64') };
  const advice = valuesAdvice(PRESETS.A), first = advice.best[0];
  assert.ok(first);
  // the calculator's values of the advice's first: the relazione names the machine
  const doc = buildReport({ ...input('A'), values: mirrorRopes({ ...PRESETS.A, ...first.values }), companyCity: 'Milano', logo, advice });
  const head = doc.blocks[0];
  assert.ok(head?.t === 'letterhead' && head.logo === 'logo' && head.from.join(' ') === 'Ditta di prova Milano');
  assert.equal(doc.drawing?.images.logo?.data, logo.data);
  const machine = doc.blocks.find((b) => b.t === 'kv' && b.rows[0]?.[0] === 'Costruttore e modello');
  assert.ok(machine?.t === 'kv' && machine.rows[0]?.[1].startsWith(`${first.brand} ${first.model} (preso dal catalogo nel calcolatore`));
  assert.ok(texts(doc).some((x) => x.startsWith('Dal catalogo del costruttore: rapporto di riduzione')), 'what is the maker\'s, what the sizing\'s');
  assert.ok(!texts(doc).some((x) => x.includes('non su un catalogo')), 'no note of a grid proposal for a catalogue machine');
  // the same values without the name taken: recognised by its values
  const { n_model: _taken, ...unnamed } = mirrorRopes({ ...PRESETS.A, ...first.values });
  void _taken;
  const known = buildReport({ ...input('A'), values: unnamed, advice }).blocks.find((b) => b.t === 'kv' && b.rows[0]?.[0] === 'Costruttore e modello');
  assert.ok(known?.t === 'kv' && known.rows[0]?.[1].startsWith(`${first.brand} ${first.model} (riconosciuto dal catalogo`));
  const sec = doc.blocks.findIndex((b) => b.t === 'h2' && b.text.endsWith('Confronto degli argani SICOR e Montanari (informativo)'));
  assert.ok(sec > 0);
  const grid = doc.blocks.slice(sec).find((b) => b.t === 'grid');
  assert.ok(grid?.t === 'grid' && grid.rows.length === advice.candidates.length && grid.rows[0]?.[0] === `1. ★ ${first.brand} ${first.model}`);
  assert.ok(texts(doc).some((x) => x.startsWith(`Perché ${first.brand} ${first.model}`)), 'il perché del primo');
  // the models whose catalogue does not take the installation, named
  const left = ADVICE_MODELS.filter((m) => !advice.candidates.some((c) => c.brand === m.brand && c.model === m.model));
  assert.ok(left.length > 0 && left.length + advice.candidates.length === ADVICE_MODELS.length);
  const note = texts(doc).find((x) => x.startsWith('Esclusi prima del calcolo'));
  assert.ok(note && left.every((m) => note.includes(m.model)), 'gli esclusi');
  // values that are no catalogue machine's: no name; no advice given: no section
  const plain = buildReport(input('A'));
  assert.ok(!plain.blocks.some((b) => b.t === 'kv' && b.rows[0]?.[0] === 'Costruttore e modello'));
  assert.ok(!plain.blocks.some((b) => b.t === 'h2' && b.text.includes('Confronto degli argani')));
});

// PDF with the renderer when Python and ReportLab are present (the production image has them).
test('il renderer produce un PDF', (t) => {
  const probe = spawnSync(process.env.PYTHON_BIN ?? 'python3', ['-c', 'import reportlab'], { encoding: 'utf8' });
  if (probe.status !== 0) { t.skip('python3 con reportlab non disponibile'); return; }
  const out = spawnSync(process.env.PYTHON_BIN ?? 'python3', [path.join(process.cwd(), 'report', 'relazione.py')], {
    input: JSON.stringify(buildReport({ ...input('B'), design: design(defaultInputs(1600, 1750)) })), maxBuffer: 1 << 26,
    env: { ...process.env, REPORT_FONT_DIR: process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu' },
  });
  assert.equal(out.status, 0, out.stderr?.toString());
  assert.equal(out.stdout.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(out.stdout.length > 20000);
});
