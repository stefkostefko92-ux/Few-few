import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../src/paths.js';
import { loadEngine } from '../src/services/engine.js';
import { furnitureLineup } from '../src/services/furniture-lineup.js';
import { landingAssets } from '../src/services/landing-assets.js';

before(() => loadEngine(fileURLToPath(new URL('./no-such-catalog.json', import.meta.url))));

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');

test('Bulgarian locl letter shapes are off wherever a font is declared: site, brochure, maintenance page, drawings', () => {
  const rule = /:lang\(bg\) \*[^{]*\{[^}]*font-feature-settings:\s*'locl' 0 !important/;
  for (const file of ['public/css/base.css', 'print/brochure.css', 'deploy/nginx/maintenance.html'])
    assert.match(read(file), rule, file);
  assert.match(read('engine/drawing-kit.js'), /svg\.rdw\{[^}]*font-feature-settings:'locl' 0/);
});

test('the read-out of the stage wraps on a phone instead of running out of the frame', () => {
  const css = read('public/css/site-stage.css');
  const phone = /@media \(max-width: 479px\) \{([\s\S]*?)\n\}\n/.exec(css)?.[1] ?? '';
  assert.match(phone, /\.stage-hud dd \{[^}]*white-space: normal/);
  assert.match(phone, /\.stage-hud dl \{[^}]*grid-template-columns: 1fr/);
});

test('every furniture drawing is cropped to its own height: no empty strip above the shorter pieces', () => {
  for (const group of furnitureLineup()) {
    const tallest = Math.min(...group.items.map((item) => item.top));
    assert.equal(tallest, 0, `${group.group}: the tallest piece fills the row`);
    for (const item of group.items) {
      assert.ok(item.top >= 0 && item.top < group.rowHeight, `${group.group}: top`);
    }
  }
});

test('the labels on the sheet drawing are small and sit above the router path', () => {
  const { svg } = landingAssets().sheet;
  const sizes = [...svg.matchAll(/class="pid"/g)].length;
  assert.ok(sizes > 0);
  for (const m of svg.matchAll(/font-size="([\d.]+)" class="pid"/g))
    assert.ok(Number(m[1]) >= 32 && Number(m[1]) <= 64, `label size ${m[1]}`);
  assert.ok(
    svg.indexOf('class="paths"') < svg.indexOf('class="pid"'),
    'labels are drawn after the path',
  );
  assert.ok(svg.lastIndexOf('class="pid"') < svg.indexOf('class="hole'), 'holes stay on top');
});
