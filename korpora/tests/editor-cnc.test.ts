// The CNC tab of the editor (editor/render-cnc.js) on stand-in elements: the file names it shows are the names in
// cnc.zip, sheet by sheet. Runs on the base catalog, like a server without data/catalog.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import type { Project } from '@prisma/client';
import { unzipSync } from 'fflate';
import { engine, loadEngine } from '../src/services/engine.js';
import { buildExport } from '../src/services/exports.js';
import { browserGlobals, editorModule, editorWords } from './editor-modules.js';

interface Element {
  hidden: boolean;
  innerHTML: string;
  textContent: string;
  value: string;
  max: string;
  querySelectorAll(): never[];
  setAttribute(): void;
}
interface CncModule {
  renderCnc(state: Record<string, unknown>, meta: Record<string, string>): void;
}

const elements = new Map<string, Element>();
const element = (sel: string): Element => {
  const found = elements.get(sel);
  if (found) return found;
  const made: Element = {
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    max: '1000',
    querySelectorAll: () => [],
    setAttribute: () => undefined,
  };
  elements.set(sel, made);
  return made;
};

await loadEngine(fileURLToPath(new URL('./no-such-catalog.json', import.meta.url)));
browserGlobals({
  document: { querySelector: element, querySelectorAll: () => [] },
  cancelAnimationFrame: () => undefined,
});
await editorWords();
const { renderCnc } = await editorModule<CncModule>('render-cnc.js', ['renderCnc']);

test('the CNC tab names each sheet’s G-code and DXF as cnc.zip does', () => {
  const spec = { type: 'kitchen', modules: 6 };
  const model = engine().buildModel(spec);
  const nesting = engine().nest(model);
  assert.ok(nesting.sheets.length > 1, 'the example needs more than one sheet');
  const at = new Date('2026-10-02T10:00:00Z');
  const project: Project = {
    id: 'p1',
    userId: 'u1',
    name: 'Кухня',
    type: spec.type,
    spec,
    specHash: 'a'.repeat(64),
    createdAt: at,
    updatedAt: at,
  };
  const zipped = Object.keys(
    unzipSync(new Uint8Array(buildExport(project, 'Тест', 'cnc.zip').body)),
  );
  const meta = { product: 'Korpora', hash: 'a'.repeat(64), owner: 'Тест', date: '2026-10-02' };
  nesting.sheets.forEach((_, i) => {
    renderCnc({ model, spec: model.spec, nesting, blockers: [], sheet: i }, meta);
    const nc = element('#gcode-meta').textContent.split(' · ').at(-1) ?? '';
    const dxf = element('#dxf-meta').textContent.split(' · ').at(-1) ?? '';
    assert.ok(
      zipped.includes(nc),
      `sheet ${i + 1}: the tab shows ${nc}, cnc.zip has ${zipped.join(', ')}`,
    );
    assert.ok(
      zipped.includes(dxf),
      `sheet ${i + 1}: the tab shows ${dxf}, cnc.zip has ${zipped.join(', ')}`,
    );
    assert.equal(
      nc.replace(/\.nc$/, ''),
      dxf.replace(/\.dxf$/, ''),
      `sheet ${i + 1}: G-code and DXF names differ`,
    );
  });
});

interface EstimateModule {
  estimate(g: Record<string, unknown>): { seconds: number; rapid: number; drills: number };
}

test('the time estimate: a GRBL tool change by hand takes a minute, the canned cycle retracts at rapid', async () => {
  const { estimate } = await editorModule<EstimateModule>('render-cnc.js', ['estimate']);
  const tools = [{ id: 'T1', kind: 'drill', d: 5, feed: 2000 }];
  // one Ø5 × 12 hole with G98 G81: 15 mm in at F2000, 17 + 32 mm of rapids inside the control
  const drill = {
    type: 'drill',
    at: [0, 0],
    depth: 12,
    tool: 'T1',
    F: 2000,
    cut: 15,
    slow: 0,
    retract: 49,
  };
  const iso = estimate({ tools, moves: [drill], post: 'iso' });
  assert.ok(
    Math.abs(iso.seconds - (0.45 + (49 / 30000) * 60 + 0.4 + 20)) < 1e-9,
    String(iso.seconds),
  );
  assert.equal(iso.rapid, 49);
  // GRBL: the plunge is a G1 of its own; the drill move counts it, and the manual change with the Z0 touch-off
  const grbl = estimate({
    tools,
    moves: [{ ...drill, retract: 0, slow: 2, cut: 13 }],
    post: 'grbl',
  });
  assert.ok(Math.abs(grbl.seconds - (0.39 + 0.12 + 0.4 + 62)) < 1e-9, String(grbl.seconds));
});
