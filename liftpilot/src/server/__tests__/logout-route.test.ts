// «Esci» as a plain form POST (src/app/api/logout/route.ts): from the application's own pages the session ends (the
// database and the cookie), the activity log says LOGOUT, and the browser goes to the sign-in page with a GET (303);
// from another site nothing happens.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

let user: Record<string, unknown> | null = null;
let ended = 0;
const audits: Record<string, unknown>[] = [];
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user, endSession: async () => { ended++; } } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: Record<string, unknown>) => { audits.push(a); } } });

const post = async (headers: Record<string, string>): Promise<Response> => {
  const { POST } = await import(src('app/api/logout/route.ts'));
  return POST(new Request('http://localhost:3252/api/logout', { method: 'POST', headers })) as Promise<Response>;
};
const OWN = { host: 'localhost:3252', origin: 'http://localhost:3252', 'sec-fetch-site': 'same-origin' };

test('from the application: the session ends, LOGOUT in the log, 303 to the sign-in page', async () => {
  user = { id: 'u1', companyId: 'c1' };
  const r = await post(OWN);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('Location'), '/it/login');
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.equal(ended, 1);
  assert.deepEqual(audits.at(-1), { companyId: 'c1', userId: 'u1', action: 'LOGOUT', entity: 'User', entityId: 'u1' });
});

test('already signed out: the cookie still goes, nothing in the log, the sign-in page', async () => {
  user = null;
  const before = audits.length;
  const r = await post(OWN);
  assert.equal(r.status, 303);
  assert.equal(ended, 2);
  assert.equal(audits.length, before);
});

test('from another site: 403, the session stays', async () => {
  user = { id: 'u1', companyId: 'c1' };
  const before = { ended, audits: audits.length };
  assert.equal((await post({ host: 'localhost:3252', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post({ host: 'localhost:3252', 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.deepEqual({ ended, audits: audits.length }, before);
});
