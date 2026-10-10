// The report route of a saved calculation, end to end over the download rules: the file name from the project, the
// attachment headers, another company's calculation is "not found", the sign-in and the rate come before any work.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PRESETS } from '@/calc/presets';
import { ENGINE_VERSION, snapshotOf } from '@/calc/snapshot';
import { snapshotHash } from '@/lib/snapshot-hash';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

const snap = snapshotOf(PRESETS.B);
const created = new Date('2026-10-02T08:00:00Z');
const row = (companyId: string) => ({
  id: 'calc1', companyId, label: null, inputs: snap.values, sha256: snapshotHash(snap), engineVersion: ENGINE_VERSION, profileId: snap.profile, createdAt: created,
  collaudo: null, shaftDesign: null, liftDesign: null, reviews: [], user: { name: 'Mario' },
  project: { name: 'Via Ä Roma 12', address: null, city: null, province: null, plantNumber: null, client: null },
});

let user: Record<string, unknown> | null = null;
let rendered = 0;
const audits: unknown[] = [];
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  calculation: { findFirst: async ({ where }: { where: { id: string; companyId: string } }) => (where.id === 'calc1' && where.companyId === 'c-own' ? row('c-own') : null) },
  company: { findUnique: async () => ({ name: 'Ditta', city: null, logo: null }) },
} } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: unknown) => { audits.push(a); } } });
class RendererBusy extends Error {}
mock.module(src('lib/report/render.ts'), { namedExports: {
  renderPdf: async () => { rendered++; return Buffer.from('%PDF-fake'); }, RendererBusy, busyResponse: () => new Response('busy', { status: 503 }),
} });

const signedIn = (id: string, companyId = 'c-own', role = 'TECHNICIAN') => ({ id, role, companyId, companyName: 'Ditta', mustChangePassword: false, readOnly: false });
const ask = async (id = 'calc1') => {
  const { GET } = await import(src('app/api/calculations/[id]/relazione/route.ts'));
  return GET(new Request('http://x/api'), { params: Promise.resolve({ id }) }) as Promise<Response>;
};

test('il proprio calcolo: allegato con il nome del progetto e della data, privato', async () => {
  user = signedIn('r-ok');
  const r = await ask();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'application/pdf');
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="relazione-di-calcolo-via-a-roma-12-2026-10-02.pdf"');
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(audits.length, 1, 'il download è nel registro');
});

test('il calcolo di un’altra ditta: 404, nessun documento, nessun registro', async () => {
  user = signedIn('r-other', 'c-other');
  const before = { rendered, audits: audits.length };
  const r = await ask();
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual({ rendered, audits: audits.length }, before);
});

test('un id non valido: 404', async () => {
  user = signedIn('r-bad');
  assert.equal((await ask('../etc')).status, 404);
});

test('senza sessione: 401 prima di ogni lavoro', async () => {
  user = null;
  const before = rendered;
  assert.equal((await ask()).status, 401);
  assert.equal(rendered, before);
});

test('la 31ª richiesta in 10 minuti: 429', async () => {
  user = signedIn('r-limit');
  for (let i = 0; i < 30; i++) assert.equal((await ask()).status, 200, `richiesta ${i + 1}`);
  assert.equal((await ask()).status, 429);
});
