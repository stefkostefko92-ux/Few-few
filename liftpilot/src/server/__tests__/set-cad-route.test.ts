// The CAD files of an issued drawing set over the download rules: only DXF or DWG, another company's set is "not
// found", the sign-in and the rate come before any work, nothing is drawn or audited for a refused request.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

let user: Record<string, unknown> | null = null;
let lookups = 0;
const audits: unknown[] = [];
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  // no stored set of this company: every lookup is "not found" (another company's id among them)
  drawingSet: { findFirst: async () => { lookups++; return null; } },
} } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: unknown) => { audits.push(a); } } });

const signedIn = (id: string, companyId = 'c-own', role = 'TECHNICIAN') => ({ id, role, companyId, companyName: 'Ditta', mustChangePassword: false, readOnly: false });
const ask = async (format: string, id = 'cmuzcb2tz001x7do03nkvjbfb') => {
  const { GET } = await import(src('app/api/drawing-sets/[id]/[format]/route.ts'));
  return GET(new Request('http://x/api'), { params: Promise.resolve({ id, format }) }) as Promise<Response>;
};

test('un formato che non è DXF o DWG, o un id non valido: 404 senza cercare la serie', async () => {
  user = signedIn('s-format');
  const before = lookups;
  for (const f of ['pdf', 'svg', '../dxf', 'DXF']) assert.equal((await ask(f)).status, 404, f);
  assert.equal((await ask('dxf', '../etc')).status, 404);
  assert.equal(lookups, before);
});

test('la serie di un’altra ditta: 404, nessun registro', async () => {
  user = signedIn('s-other', 'c-other');
  const before = audits.length;
  for (const f of ['dxf', 'dwg']) {
    const r = await ask(f);
    assert.equal(r.status, 404, f);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(audits.length, before);
});

test('senza sessione: 401 prima di ogni lavoro', async () => {
  user = null;
  const before = lookups;
  assert.equal((await ask('dwg')).status, 401);
  assert.equal(lookups, before);
});

test('la 31ª richiesta in 10 minuti: 429', async () => {
  user = signedIn('s-limit');
  for (let i = 0; i < 30; i++) assert.equal((await ask('dxf')).status, 404, `richiesta ${i + 1}`);
  assert.equal((await ask('dxf')).status, 429);
});
