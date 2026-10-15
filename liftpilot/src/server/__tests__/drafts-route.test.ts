// The draft kept as the tab is hidden or closed (round 46, src/app/api/drafts/route.ts): from the application's own pages
// only, and — as every other route — the session first: without one the answer is 401 whatever the body (never 400 or
// 413 from reading it), and the action is not called; with one, the action's answer.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

let user: Record<string, unknown> | null = null;
const calls: unknown[] = [];
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user } });
mock.module(src('server/draft-actions.ts'), { namedExports: { saveDraftAction: async (input: unknown) => { calls.push(input); return { ok: true, at: '2026-10-15T10:00:00.000Z' }; } } });

const OWN = { host: 'localhost:3301', origin: 'http://localhost:3301', 'sec-fetch-site': 'same-origin' };
const post = async (body: string, headers: Record<string, string> = OWN): Promise<Response> => {
  const { POST } = await import(src('app/api/drafts/route.ts'));
  return POST(new Request('http://localhost:3301/api/drafts', { method: 'POST', headers, body })) as Promise<Response>;
};

test('senza sessione: 401 qualunque sia il corpo, l’azione non è chiamata', async () => {
  user = null;
  for (const body of ['{"projectId":"p1","scope":"calc","data":{}}', 'not json', 'x'.repeat(400_000)]) {
    const r = await post(body);
    assert.equal(r.status, 401, body.slice(0, 20));
    assert.deepEqual(await r.json(), { ok: false, error: 'unauthorized' });
  }
  assert.equal(calls.length, 0);
});

test('con la sessione: il corpo letto e la risposta dell’azione; da un altro sito 403', async () => {
  user = { id: 'u1', companyId: 'c1' };
  const r = await post('{"projectId":"p1","scope":"calc","data":{"values":{}}}');
  assert.equal(r.status, 200);
  assert.deepEqual(calls.at(-1), { projectId: 'p1', scope: 'calc', data: { values: {} } });
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('{}', { host: 'localhost:3301', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).status, 403);
});
