// After a conflict (the project was saved elsewhere) the work on screen becomes a new project: the form for a new
// project, then the editor's save over the version the new project was created with (editor/rescue.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorModule } from './editor-modules.js';

interface RescueModule {
  copyName(name: string): string;
  saveAsCopy(options: { spec: object; name: string; csrf: string }): Promise<string | null>;
}
const { copyName, saveAsCopy } = await editorModule<RescueModule>('rescue.js', [
  'copyName',
  'saveAsCopy',
]);

interface Call {
  url: string;
  init: RequestInit | undefined;
}

// a followed redirect: the answer carries the address it ended on
function landed(url: string, body: string): Response {
  const res = new Response(body, { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(res, 'url', { value: `http://127.0.0.1${url}` });
  return res;
}
const editorPage = (updatedAt: string) =>
  `<main id="main"></main><script type="application/json" id="boot">{"id":"p2","updatedAt":"${updatedAt}"}</script>`;

test('a copy is named as the project list names one and keeps to the 80 characters of a name', () => {
  assert.equal(copyName('Кухня'), 'Кухня (2)');
  const long = 'я'.repeat(80);
  assert.equal(copyName(long).length, 80);
  assert.ok(copyName(long).endsWith(' (2)'));
});

test('the work on screen is saved into a new project, over the version it was created with', async (t) => {
  const calls: Call[] = [];
  t.mock.method(globalThis, 'fetch', (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (init?.method === 'POST') return Promise.resolve(landed('/app/p/p2', editorPage('v7')));
    return Promise.resolve(Response.json({ hash: 'h', name: 'Кухня (2)', updatedAt: 'v8' }));
  });
  const spec = { type: 'kitchen', modules: 5 };
  assert.equal(await saveAsCopy({ spec, name: 'Кухня', csrf: 'tok' }), '/app/p/p2');
  const form = new URLSearchParams(String(calls[0]?.init?.body));
  assert.deepEqual(
    [calls[0]?.url, form.get('_csrf'), form.get('type'), form.get('name')],
    ['/app/projects', 'tok', 'kitchen', 'Кухня (2)'],
  );
  assert.equal(calls[1]?.url, '/app/api/projects/p2');
  assert.equal(new Headers(calls[1]?.init?.headers).get('x-csrf-token'), 'tok');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    spec,
    name: 'Кухня (2)',
    base: 'v7',
  });
});

test('a refused new project (the cap, an ended plan) is null and nothing is saved', async (t) => {
  const calls: Call[] = [];
  t.mock.method(globalThis, 'fetch', (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(landed('/app', '<main id="main"></main>'));
  });
  assert.equal(await saveAsCopy({ spec: { type: 'base' }, name: 'Шкаф', csrf: 'tok' }), null);
  assert.equal(calls.length, 1);
});
