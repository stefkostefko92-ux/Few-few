// The editor's save rules (CLAUDE.md: a save carries the version it was opened on, a 409 never overwrites,
// a download waits for the save), checked on editor/saver.js with a fake fetch and three stand-in fields.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { browserGlobals, editorModule } from './editor-modules.js';

interface SaverState {
  spec: unknown;
  hash: string;
  savedHash: string;
  savedName: string;
  savedAt: string;
  // hardware and decors of the saved project that have left the catalog, until a Save stores the substitute
  drift: string[];
  saving?: boolean;
  conflict?: boolean;
}
interface Saver {
  isDirty(): boolean;
  showState(): void;
  save(explicit?: boolean): Promise<boolean>;
}
interface SaverModule {
  createSaver(options: {
    state: SaverState;
    boot: { id: string };
    csrf: string;
    isReadOnly: () => boolean;
    text: Record<string, string>;
    beforeSave?: () => Promise<void>;
    onSaved?: () => void;
  }): Saver;
}

const TEXT = {
  saving: 'Записва се…',
  unsaved: 'Незаписано',
  saved: 'Записано',
  saveFailed: 'Не успя',
};
const fields: Record<string, object> = {};
// the tab title is written on the stand-in document, as the browser's would be
const doc: { querySelector(sel: string): object | null; title: string } = {
  querySelector: (sel: string) => fields[sel] ?? null,
  title: 'Кухня — Korpora',
};
browserGlobals({ document: doc });
const { createSaver } = await editorModule<SaverModule>('saver.js', ['createSaver']);

interface Call {
  url: string;
  init: RequestInit | undefined;
}
const sent = (call: Call | undefined): Record<string, unknown> =>
  JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(
  t: TestContext,
  respond: (call: Call, n: number, state: SaverState) => Promise<Response>,
  over: Partial<SaverState> = {},
  options: { readOnly?: boolean; beforeSave?: () => Promise<void>; onSaved?: () => void } = {},
) {
  const name = { value: 'Кухня' };
  const label = { textContent: '', dataset: {} as Record<string, string> };
  const error = { hidden: true, textContent: '' };
  Object.assign(fields, { '#project-name': name, '#save-state': label, '#save-error': error });
  const state: SaverState = {
    spec: { type: 'base' },
    hash: 'h1',
    savedHash: 'h1',
    savedName: 'Кухня',
    savedAt: 'v1',
    drift: [],
    ...over,
  };
  const calls: Call[] = [];
  t.mock.method(globalThis, 'fetch', (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call, calls.length, state);
  });
  const saver = createSaver({
    state,
    boot: { id: 'p/1' },
    csrf: 'csrf-token',
    isReadOnly: () => options.readOnly ?? false,
    text: TEXT,
    beforeSave: options.beforeSave,
    onSaved: options.onSaved,
  });
  return { state, saver, calls, name, label, error };
}

// the server answers with the hash of what was sent, which is what is on screen at that moment
const saved = (call: Call, n: number, state: SaverState) =>
  Promise.resolve(
    Response.json({ hash: state.hash, name: sent(call).name, updatedAt: `v${n + 1}` }),
  );

test('unsaved means another model or another name; an emptied name field is not a change', (t) => {
  const { state, saver, name } = setup(t, saved);
  assert.equal(saver.isDirty(), false);
  state.hash = 'h2';
  assert.equal(saver.isDirty(), true);
  state.hash = 'h1';
  name.value = '  Кухня  ';
  assert.equal(saver.isDirty(), false, 'spaces around the name are not a change');
  name.value = '   ';
  assert.equal(saver.isDirty(), false, 'an empty field keeps the saved name');
  name.value = 'Кухня 2';
  assert.equal(saver.isDirty(), true);
});

test('a read-only project is never unsaved and never written', async (t) => {
  const { saver, calls } = setup(t, saved, { hash: 'h2' }, { readOnly: true });
  assert.equal(saver.isDirty(), false);
  assert.equal(await saver.save(), true);
  assert.equal(calls.length, 0);
});

test('a save sends the version it was opened on and takes the new one from the answer', async (t) => {
  const { state, saver, calls, label } = setup(t, saved, { hash: 'h2' });
  assert.equal(await saver.save(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, '/app/api/projects/p%2F1');
  assert.equal(calls[0]?.init?.method, 'PUT');
  assert.equal(new Headers(calls[0]?.init?.headers).get('x-csrf-token'), 'csrf-token');
  assert.deepEqual(sent(calls[0]), { spec: { type: 'base' }, name: 'Кухня', base: 'v1' });
  assert.deepEqual([state.savedHash, state.savedAt, state.saving], ['h2', 'v2', false]);
  assert.deepEqual([label.textContent, label.dataset.state], [TEXT.saved, 'saved']);
  assert.equal(await saver.save(), true);
  assert.equal(calls.length, 1, 'nothing new on screen: no second write');
});

test('a saved new name reaches the tab title and the page heading, as after a reload', async (t) => {
  const heading = { textContent: 'Кухня' };
  const { saver, name } = setup(t, saved);
  fields['#main > h1'] = heading;
  t.after(() => delete fields['#main > h1']);
  name.value = 'Кухня 2';
  assert.equal(await saver.save(), true);
  assert.deepEqual([doc.title, heading.textContent], ['Кухня 2 — Korpora', 'Кухня 2']);
});

test('saves run one after another, and the second is based on the version the first wrote', async (t) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const { state, saver, calls } = setup(
    t,
    async (call, n, now) => {
      const hash = now.hash;
      if (n === 1) await held;
      return Response.json({ hash, name: sent(call).name, updatedAt: `v${n + 1}` });
    },
    { hash: 'h2' },
  );
  const first = saver.save();
  const second = saver.save();
  await tick();
  assert.equal(calls.length, 1, 'the second save waits for the first');
  state.hash = 'h9'; // edited while the first save is on its way
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(calls.length, 2);
  assert.equal(sent(calls[1]).base, 'v2');
  assert.deepEqual([state.savedHash, state.savedAt, saver.isDirty()], ['h9', 'v3', false]);
});

test('a download first runs the pending change (beforeSave), then saves what it produced', async (t) => {
  let pending = '';
  const { state, saver, calls } = setup(
    t,
    saved,
    {},
    {
      beforeSave: async () => {
        if (pending) state.hash = pending;
      },
    },
  );
  assert.equal(await saver.save(), true);
  assert.equal(calls.length, 0, 'nothing pending, nothing written');
  pending = 'h2';
  assert.equal(await saver.save(), true);
  assert.equal(calls.length, 1, 'the debounced change is written before the download');
  assert.equal(state.savedHash, 'h2');
});

test('a substitute for hardware that left the catalog is stored only by an explicit Save', async (t) => {
  let stored = 0;
  const { state, saver, calls, label } = setup(
    t,
    saved,
    { drift: ['Панта: blum_clip_top вече я няма в каталога'] },
    { onSaved: () => (stored += 1) },
  );
  saver.showState();
  assert.deepEqual([label.textContent, label.dataset.state], [TEXT.unsaved, 'dirty']);
  assert.equal(await saver.save(), true, 'a download does not store the substitute');
  assert.equal(calls.length, 0);
  assert.equal(await saver.save(true), true);
  assert.equal(calls.length, 1, 'Save (or Ctrl+S) writes it');
  assert.deepEqual([state.drift, stored], [[], 1]);
  assert.deepEqual([label.textContent, label.dataset.state], [TEXT.saved, 'saved']);
});

test('a 409 stops every later save: nothing is overwritten unseen', async (t) => {
  const conflict = () =>
    Promise.resolve(
      Response.json({ error: 'Променен е другаде', code: 'app.errors.conflict' }, { status: 409 }),
    );
  const { state, saver, calls, error } = setup(t, conflict, { hash: 'h2' });
  assert.equal(await saver.save(), false);
  assert.equal(state.conflict, true);
  assert.deepEqual([error.hidden, error.textContent], [false, 'Променен е другаде']);
  state.hash = 'h3';
  assert.equal(await saver.save(), false);
  assert.equal(calls.length, 1, 'no second write after the conflict');
  assert.equal(state.savedAt, 'v1');
});

test('a failed request is not saved: the error is shown and the label says unsaved', async (t) => {
  const { state, saver, error, label } = setup(t, () => Promise.reject(new TypeError('network')), {
    hash: 'h2',
  });
  assert.equal(await saver.save(), false);
  assert.deepEqual([error.hidden, error.textContent], [false, TEXT.saveFailed]);
  assert.deepEqual([state.saving, state.savedAt], [false, 'v1']);
  assert.deepEqual([label.textContent, label.dataset.state], [TEXT.unsaved, 'dirty']);
});
