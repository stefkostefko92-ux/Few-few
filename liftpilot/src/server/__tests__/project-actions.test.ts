// A new installation (src/server/project-actions.ts createProjectAction) opens straight on its work for whoever fills
// that module's form — the replacement's calculator (calc:create), a whole project's one form (progetto:edit) — and on
// the installation's page for whoever only creates installations (the Tecnico's whole project, round 42); without
// impianti:create nothing is created. Always in the user's company, with its audit row.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { capsOf } from '@/lib/rbac';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

type Row = Record<string, unknown>;
class Redirect extends Error { constructor(readonly to: string) { super(`redirect ${to}`); } }

const created: Row[] = [], audited: Row[] = [];
let session: Row | null = null;
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  project: { create: async ({ data }: { data: Row }) => { created.push(data); return { id: `p${created.length}`, ...data }; } },
} } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: Row) => { audited.push(a); } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => session } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Redirect(to); } } });

const signIn = (over: Row = {}) => { session = { id: 'u1', role: 'ENGINEER', companyId: 'c1', mustChangePassword: false, readOnly: false, ...over }; };
const form = (kind: string) => {
  const f = new FormData();
  f.set('locale', 'it'); f.set('kind', kind); f.set('name', 'Condominio Verdi'); f.set('city', 'Milano');
  return f;
};
/** Where the action ends: a redirect, or the form's state when it stays on the page. */
async function create(kind: string): Promise<string | Row> {
  const { createProjectAction } = await import(src('server/project-actions.ts'));
  try { return await createProjectAction({}, form(kind)); } catch (e) { if (e instanceof Redirect) return e.to; throw e; }
}

beforeEach(() => { created.length = 0; audited.length = 0; signIn(); });

test('il Progettista: la sostituzione si apre sul calcolo, il progetto intero sul suo modulo', async () => {
  assert.equal(await create('REPLACEMENT'), '/it/app/projects/p1/calc');
  assert.equal(await create('FULL'), '/it/app/projects/p2/progetto');
  assert.deepEqual(created.map((c) => [c.kind, c.companyId, c.createdById]), [['REPLACEMENT', 'c1', 'u1'], ['FULL', 'c1', 'u1']]);
  assert.deepEqual(audited.map((a) => [a.action, a.entityId]), [['PROJECT_CREATED', 'p1'], ['PROJECT_CREATED', 'p2']]);
});

test('il Tecnico: la sostituzione sul calcolo, il progetto intero (lo disegna un collega) sulla pagina dell’impianto', async () => {
  signIn({ role: 'TECHNICIAN' });
  assert.equal(await create('REPLACEMENT'), '/it/app/projects/p1/calc');
  assert.equal(await create('FULL'), '/it/app/projects/p2');
  assert.equal(created.length, 2);
});

test('il calcolo tolto dall’azienda: anche la sostituzione si apre sulla pagina dell’impianto', async () => {
  signIn({ role: 'TECHNICIAN', caps: capsOf('TECHNICIAN', [{ role: 'TECHNICIAN', capability: 'calc:create', granted: false }]) });
  assert.equal(await create('REPLACEMENT'), '/it/app/projects/p1');
});

test('senza impianti:create (il Commerciale) o in sola lettura: nessun impianto', async () => {
  signIn({ role: 'SALES' });
  assert.deepEqual(await create('FULL'), { error: 'forbidden' });
  signIn({ readOnly: true });
  assert.deepEqual(await create('FULL'), { error: 'forbidden' });
  assert.equal(created.length + audited.length, 0);
});

test('modulo non valido: nessun impianto', async () => {
  assert.deepEqual(await create('ALTRO'), { error: 'invalidFields', fields: ['kind'] });
  assert.equal(created.length, 0);
});
