// Drawings: the assembly and the drilling maps of representative parts of every type are well-formed SVG
// with no broken numbers, and carry the drawing metadata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { buildModel } from '../../engine/model.js';
import { TYPE_ORDER } from '../../engine/types.js';
import { drawingAssembly } from '../../engine/drawing-assembly.js';
import { drawingPart } from '../../engine/drawing-part.js';

registerFixtures();
const meta = { product: 'Rendetto', hash: 'a'.repeat(64), owner: 'Carbon Stealth VCC', date: '2026-10-02' };

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
