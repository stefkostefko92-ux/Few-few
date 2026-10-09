// The CNC tab of the editor (editor/render-cnc.js) on stand-in elements: the file names it shows are the names in
// cnc.zip, sheet by sheet. Runs on the base catalog, like a server without data/catalog.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import type { Project } from '@prisma/client';
import { unzipSync } from 'fflate';
import { engine, loadEngine } from '../src/services/engine.js';
import { buildExport } from '../src/services/exports.js';
import { browserGlobals, editorModule } from './editor-modules.js';

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
