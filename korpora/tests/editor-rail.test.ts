// The top of the editor's rail comes from the server (views/app/editor-params.ejs, services/furniture.ts) so the page
// does not jump when the editor starts (CLS): the server's size fields must be the very elements the editor draws
// for a type (editor/params-html.js), and the line under the name the one editor/header.js writes.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { ROOT } from '../src/paths.js';
import { engine, loadEngine, type TypeParam } from '../src/services/engine.js';
import { editorRail } from '../src/services/furniture.js';
import { browserModule } from './editor-modules.js';

interface ParamsModule {
  paramsHtml(params: readonly TypeParam[]): string;
}

before(() => loadEngine(fileURLToPath(new URL('./no-such-catalog.json', import.meta.url))));

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#34;': '"',
  '&#39;': "'",
};
// the same elements: values aside (the server writes the project's), whitespace between tags and entity spelling
const shape = (html: string) =>
  html
    .replace(/<%#[\s\S]*?%>/g, '')
    .replace(/ value="[^"]*"( data-field)/g, '$1')
    .replace(/ value="[^"]*">/g, '>')
    .replace(/ checked/g, '')
    .replace(/&(amp|lt|gt|quot|#34|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/>\s+</g, '><')
    .trim();

test('the server draws the size fields of every type as the editor does', async () => {
  const { paramsHtml } = await browserModule<ParamsModule>('editor/params-html.js', ['paramsHtml']);
  for (const type of engine().typeOrder) {
    const rail = editorRail({ type });
    assert.ok(rail, type);
    const server = await ejs.renderFile(join(ROOT, 'views', 'app', 'editor-params.ejs'), {
      fields: rail.fields,
    });
    assert.equal(shape(server), shape(paramsHtml(engine().typeParams[type] ?? [])), type);
  }
});

test('the server writes the project values and the title line of the editor', () => {
  const rail = editorRail({ type: 'base', width: 750, fronts: 'drawers' });
  assert.ok(rail);
  assert.equal(rail.title, 'Долен шкаф, 750 × 820 × 560 mm');
  assert.equal(rail.fields.find((f) => f.key === 'width')?.value, '750');
  assert.equal(rail.fields.find((f) => f.key === 'fronts')?.value, 'drawers');
  // an unknown type opens as the engine normalizes it, a broken one is left to the editor
  assert.equal(editorRail({ type: 'spaceship' })?.type, 'base');
});
