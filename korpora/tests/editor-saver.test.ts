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
  problem?: string | null;
}
interface Saver {
  isDirty(): boolean;
  showState(): void;
  save(explicit?: boolean): Promise<boolean>;
  token(): string;
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
    onProblem?: (kind: string) => void;
  }): Saver;
}

const TEXT = {
  saving: 'Записва се…',
  unsaved: 'Незаписано',
  saved: 'Записано',
  saveFailed: 'Не успя',
  notSaved: 'Не е записано',
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
  const problems: string[] = [];
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
    onProblem: (kind) => problems.push(kind),
  });
  return { state, saver, calls, name, label, error, problems };
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

test('a 409 stops every later save: nothing is overwritten unseen, and the reason is shown again', async (t) => {
  const conflict = () =>
    Promise.resolve(
      Response.json({ error: 'Променен е другаде', code: 'app.errors.conflict' }, { status: 409 }),
    );
  const { state, saver, calls, problems, label } = setup(t, conflict, { hash: 'h2' });
  assert.equal(await saver.save(), false);
  assert.equal(state.conflict, true);
  assert.deepEqual(problems, ['conflict'], 'the editor offers a copy, not a bare message');
  assert.deepEqual([label.textContent, label.dataset.state], [TEXT.notSaved, 'error']);
  state.hash = 'h3';
  assert.equal(await saver.save(), false);
  assert.equal(calls.length, 1, 'no second write after the conflict');
  assert.deepEqual(problems, ['conflict', 'conflict'], 'Save says why again instead of nothing');
  assert.equal(state.savedAt, 'v1');
});

// the stand-in window of browserGlobals: a reload would be scheduled on its setTimeout
const browserWindow = (globalThis as unknown as { window: { setTimeout: typeof setTimeout } })
  .window;

// the editor page of the project as the server sends it to a signed-in person: its token is the session's
const editorPage = (token: string) =>
  new Response(`<main class="editor" id="main" data-csrf="${token}"></main>`, {
    headers: { 'content-type': 'text/html' },
  });
const signInPage = () => {
  const res = new Response('<form action="/login"></form>', {
    headers: { 'content-type': 'text/html' },
  });
  Object.defineProperty(res, 'redirected', { value: true });
  return res;
};

test('a lost sign-in keeps the work: no reload, and after a new sign-in Save writes with its token', async (t) => {
  let signedIn = false;
  const timers = t.mock.method(browserWindow, 'setTimeout');
  const { state, saver, calls, problems, label } = setup(
    t,
    (call, n, now) => {
      if (!call.init?.method)
        return Promise.resolve(signedIn ? editorPage('token-2') : signInPage());
      if (!signedIn) return Promise.resolve(Response.json({ code: 'login' }, { status: 401 }));
      const sentToken = new Headers(call.init.headers).get('x-csrf-token');
      return sentToken === 'token-2'
        ? saved(call, n, now)
        : Promise.resolve(Response.json({ code: 'error.csrf' }, { status: 403 }));
    },
    { hash: 'h2' },
  );
  assert.equal(await saver.save(), false);
  assert.deepEqual([problems, state.problem], [['session'], 'session']);
  assert.deepEqual([label.textContent, label.dataset.state], [TEXT.notSaved, 'error']);
  assert.equal(timers.mock.callCount(), 0, 'the page is not reloaded: what is on screen stays');
  assert.equal(state.hash, 'h2');
  signedIn = true; // in another tab
  assert.equal(await saver.save(), true);
  const puts = calls.filter((c) => c.init?.method === 'PUT');
  assert.equal(new Headers(puts.at(-1)?.init?.headers).get('x-csrf-token'), 'token-2');
  assert.deepEqual(sent(puts.at(-1)), { spec: { type: 'base' }, name: 'Кухня', base: 'v1' });
  assert.deepEqual([state.problem, state.savedHash, saver.token()], [null, 'h2', 'token-2']);
  assert.deepEqual([label.textContent, label.dataset.state], [TEXT.saved, 'saved']);
});

test('an ended plan says so and does not reload the page', async (t) => {
  const timers = t.mock.method(browserWindow, 'setTimeout');
  const { saver, problems, state } = setup(
    t,
    () =>
      Promise.resolve(
        Response.json({ error: 'Plan ended', code: 'app.errors.planExpired' }, { status: 402 }),
      ),
    { hash: 'h2' },
  );
  assert.equal(await saver.save(), false);
  assert.deepEqual([problems, state.problem], [['plan'], 'plan']);
  assert.equal(timers.mock.callCount(), 0);
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
