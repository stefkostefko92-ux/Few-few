// What the server hands out from the engine: downloads, the landing-page drawing and the project-list size. Runs on
// the base catalog, like a server without data/catalog.json.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import type { Prisma, Project } from '@prisma/client';
import { unzipSync } from 'fflate';
import { engine, loadEngine } from '../src/services/engine.js';
import { buildExport, CncBlockedError } from '../src/services/exports.js';
import { dimensionsText } from '../src/services/furniture.js';
import { landingAssets } from '../src/services/landing-assets.js';

before(() => loadEngine(fileURLToPath(new URL('./no-such-catalog.json', import.meta.url))));

function project(spec: Prisma.JsonObject): Project {
  const at = new Date('2026-10-02T10:00:00Z');
  return {
    id: 'p1',
    userId: 'u1',
    name: 'Кухня',
    type: String(spec.type),
    spec,
    specHash: 'a'.repeat(64),
    createdAt: at,
    updatedAt: at,
  };
}

const files = (body: Buffer) => unzipSync(new Uint8Array(body));
const utf8 = (bytes: Uint8Array | undefined) => Buffer.from(bytes ?? []).toString('utf8');
const sheetOf = (svg: string) => /Лист<\/text><text[^>]*>(\d+\/\d+)</.exec(svg)?.[1];

test('every CSV starts with the UTF-8 BOM (Excel reads Cyrillic only with it)', () => {
  for (const kind of ['cut-list.csv', 'hardware.csv', 'drilling.csv'] as const) {
    const { body } = buildExport(project({ type: 'base' }), 'Тест', kind);
    assert.deepEqual([...body.subarray(0, 3)], [0xef, 0xbb, 0xbf], kind);
  }
});

test('a hinge that has left the catalog blocks CNC instead of drilling for another one', () => {
  const clean = files(buildExport(project({ type: 'base' }), 'Тест', 'cnc.zip').body);
  assert.ok(Object.keys(clean).some((name) => name.endsWith('.nc')));

  const gone = project({ type: 'base', hinge: 'shop:gone' });
  assert.throws(
    () => buildExport(gone, 'Тест', 'cnc.zip'),
    (err: unknown) =>
      err instanceof CncBlockedError && err.reasons.some((r) => r.includes('shop:gone')),
  );
  const zip = files(buildExport(gone, 'Тест', 'project.zip').body);
  assert.ok(!Object.keys(zip).some((name) => name.startsWith('cnc/')));
  assert.match(utf8(zip['README.txt']), /НЕ Е ИЗДАДЕНА[\s\S]*shop:gone/);
  assert.match(utf8(zip['drawings/00-assembly.svg']), /не е за производство/);
});

test('the landing-page door carries the sheet number of the downloaded drawing', () => {
  const door = landingAssets().door;
  assert.ok(door);
  const example = project({ type: 'kitchen', modules: 4, moduleWidth: 600 });
  const zip = files(buildExport(example, 'Тест', 'drawings.zip').body);
  const doorId = engine()
    .buildModel({ type: 'kitchen', modules: 4, moduleWidth: 600 })
    .parts.find((p) => p.role === 'door')?.id;
  const name = Object.keys(zip).find((n) => n.endsWith(`-${doorId}.svg`));
  assert.ok(name);
  assert.equal(sheetOf(door.svg), sheetOf(utf8(zip[name])));
  assert.equal(sheetOf(door.svg)?.split('/')[0], String(Number(name.slice(0, 2))));
});

test('the landing-page legend tells the groove mill from the contour tool', () => {
  const { tools } = landingAssets();
  assert.equal(tools.contour, engine().normalizeSpec({}).tool);
  assert.notEqual(tools.groove, tools.contour);
});

test('the project list shows a wall cabinet with its own height, like the editor', () => {
  const spec = engine().normalizeSpec({ type: 'wall' });
  assert.equal(
    dimensionsText('wall', spec),
    `${String(spec.width)} × ${String(spec.height)} × ${String(spec.depth)} mm`,
  );
});
