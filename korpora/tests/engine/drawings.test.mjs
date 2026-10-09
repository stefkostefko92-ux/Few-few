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
import { PAPER, STYLE, frame } from '../../engine/drawing-kit.js';
import { partHoles } from '../../engine/drill.js';

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

test('on a drilling map a filled circle is a through hole and nothing else, as the legend says', () => {
  // the fill comes from the class: d-thru fills (grey, or orange with d-key), d-key and d-hole are outlines
  assert.match(STYLE, /\.d-key\{fill:none;/);
  assert.match(STYLE, /\.d-key\.d-thru\{fill:rgba/);
  assert.match(STYLE, /\.d-hole\{fill:none;/);
  let blindKey = 0;
  for (const type of TYPE_ORDER) {
    const model = buildModel({ type });
    for (const p of drawingParts(model)) {
      const svg = drawingPart(model, meta, p.id);
      assert.ok(svg.includes('пълните кръгове са проходни, оранжевите са за обков'), `${type} ${p.id}: legend`);
      // the main view draws its holes first, in the order of the hole table
      const holes = partHoles(p).filter((h) => !h.mark);
      const classes = [...svg.matchAll(/<circle class="([^"]+)"/g)].slice(0, holes.length).map((m) => m[1].split(' '));
      holes.forEach((h, i) => {
        assert.equal(classes[i].includes('d-thru'), h.through, `${type} ${p.id}: hole ${h.no} (${h.kind}, Ø${h.d} × ${h.depth}) drawn ${classes[i].join(' ')}`);
        if (classes[i].includes('d-key') && !h.through) blindKey += 1;
      });
      // the enlarged hinge cup is blind too: an outline, not a filled circle
      const cup = holes.find((h) => h.kind === 'cup');
      if (cup) assert.ok(svg.includes(`<circle class="d-key" cx=`) && !new RegExp(`<circle class="[^"]*d-thru[^"]*" cx="[^"]+" cy="[^"]+" r="${cup.d / 2}"/>`).test(svg), `${type} ${p.id}: cup detail drawn filled`);
    }
  }
  assert.ok(blindKey > 0, 'no blind hardware hole was checked');
});

test('the title block cuts a long owner to its cell instead of running into the drawing number', () => {
  const owner = 'Мебелна работилница Иванов и синове ЕООД'; // 40 characters, the cell takes 30
  const svg = frame('Врата', { ...meta, owner }, 10, 2, 5, 'ПДЧ 18 · Бяло');
  assert.ok(!svg.includes(owner), 'the whole owner is printed');
  assert.ok(svg.includes(`>${owner.slice(0, 29)}…</text>`), 'the owner is not cut to 30 characters');
  assert.ok(frame('Врата', { ...meta, owner: 'Carbon Stealth VCC' }, 10, 2, 5, 'ПДЧ').includes('>Carbon Stealth VCC</text>'), 'a short owner is cut');
});

test('the drawings use the faces the site and the brochure load, not a font nobody serves', () => {
  const base = readFileSync(new URL('../../public/css/base.css', import.meta.url), 'utf8');
  const brochure = readFileSync(new URL('../../print/build-brochure.ts', import.meta.url), 'utf8');
  const served = new Set([...base.matchAll(/@font-face\s*\{[^}]*font-family:\s*'([^']+)'/g)].map((m) => m[1]));
  assert.ok(served.has('Geologica') && served.has('JetBrains Mono'), `faces in base.css: ${[...served]}`);
  const firsts = [...STYLE.matchAll(/font(?:-family)?:[^;}']*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(firsts.length > 5, 'no font in STYLE');
  for (const face of new Set(firsts)) {
    assert.ok(served.has(face), `STYLE asks for '${face}', which public/css/base.css does not serve`);
    assert.ok(brochure.includes(`face('${face}'`), `STYLE asks for '${face}', which the brochure does not embed`);
  }
});
