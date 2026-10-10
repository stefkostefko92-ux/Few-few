// Drawings: the assembly and the drilling maps of representative parts of every type are well-formed SVG
// with no broken numbers, and carry the drawing metadata: the sheet numbers of the downloads and the red
// „not for production“ line on a model with errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerFixtures } from './fixtures.mjs';
import { buildModel } from '../../engine/model.js';
import { TYPE_ORDER } from '../../engine/types.js';
import { drawingAssembly } from '../../engine/drawing-assembly.js';
import { drawingPart, drawingParts, drawingSheets } from '../../engine/drawing-part.js';
import { PAPER, STYLE } from '../../engine/drawing-kit.js';

registerFixtures();
const meta = { product: 'Korpora', hash: 'a'.repeat(64), owner: 'Carbon Stealth VCC', date: '2026-10-02' };

/** A small well-formedness check: every opened tag is closed in order (no XML parser in Node). */
function assertWellFormed(svg, label) {
  assert.match(svg, /^<svg[\s>]/, `${label}: does not start with <svg`);
  assert.ok(svg.trimEnd().endsWith('</svg>'), `${label}: does not end with </svg>`);
  assert.ok(!/NaN|undefined|Infinity/.test(svg), `${label}: broken number`);
  const body = svg.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `${label}: </${name}> closes the wrong tag`);
    else stack.push(name);
  }
  assert.equal(stack.length, 0, `${label}: unclosed tags ${stack.join(',')}`);
}

for (const type of TYPE_ORDER) {
  test(`${type}: assembly and part drawings`, () => {
    const model = buildModel({ type });
    const assembly = drawingAssembly(model, meta);
    assertWellFormed(assembly, `${type} assembly`);
    assert.ok(assembly.includes('AAAAAAAA'), `${type}: drawing number from the hash`);
    const pick = (role) => model.parts.find((p) => p.role === role);
    for (const part of ['door', 'side', 'partition', 'drawer-front', 'bed-rail', 'bed-head'].map(pick).filter(Boolean)) {
      assertWellFormed(drawingPart(model, meta, part.id), `${type} ${part.id}`);
    }
  });
}

test('what frames a drawing on a page has the paper colour of the drawing', () => {
  assert.ok(STYLE.includes(`.d-paper{fill:${PAPER}}`), 'the drawing paper comes from PAPER');
  for (const file of ['public/css/base.css', 'print/brochure.css']) {
    const css = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(css, new RegExp(`--drawing-paper: ${PAPER};`), `${file}: --drawing-paper is not ${PAPER}`);
  }
});

test('the title block numbers every sheet as drawings.zip does; a part without a sheet gets none', () => {
  const model = buildModel({ type: 'kitchen' });
  const parts = drawingParts(model);
  const n = parts.length + 1;
  assert.ok(drawingAssembly(model, meta).includes(`>1/${n}</text>`), 'assembly: sheet 1/n');
  parts.forEach((p, i) => {
    const svg = drawingPart(model, meta, p.id);
    assert.ok(svg.includes(`>${i + 2}/${n}</text>`) && svg.includes(`>AAAAAAAA-${i + 2}</text>`), `${p.id}: sheet ${i + 2}/${n}`);
  });
  const back = model.parts.find((p) => p.role === 'back');
  assert.ok(back, 'the kitchen has an HDF back');
  const svg = drawingPart(model, meta, back.id);
  assert.ok(svg.includes('>AAAAAAAA</text>') && svg.includes('>—</text>') && !/>\d+\/\d+<\/text>/.test(svg), 'a part without a sheet of its own');
});

test('every drawing of a model with errors carries the red „not for production“ line', () => {
  const bad = buildModel({ type: 'tv', width: 2600, columns: 2, tvFronts: 'doors' });
  assert.ok(bad.warnings.some((w) => w.level === 'error'), 'the model has no error');
  const door = bad.parts.find((p) => p.role === 'door');
  for (const svg of [drawingAssembly(bad, meta), drawingPart(bad, meta, door.id)]) {
    assert.ok(svg.includes('class="d-alert"') && svg.includes('не е за производство'), 'missing the red line');
  }
  const good = buildModel({ type: 'tv' });
  assert.ok(!good.warnings.some((w) => w.level === 'error'), 'the default model has an error');
  for (const svg of [drawingAssembly(good, meta), drawingPart(good, meta, good.parts[0].id)]) assert.ok(!svg.includes('class="d-alert"'), 'red line on a good model');
});

test('sheet numbers: 1 is the assembly, then every drawing part in order', () => {
  for (const type of TYPE_ORDER) {
    const model = buildModel({ type });
    const { count, parts } = drawingSheets(model);
    assert.deepEqual(parts.map((s) => s.part), drawingParts(model), type);
    assert.deepEqual(parts.map((s) => s.no), parts.map((_, i) => i + 2), type);
    assert.equal(count, parts.length + 1, type);
  }
});
