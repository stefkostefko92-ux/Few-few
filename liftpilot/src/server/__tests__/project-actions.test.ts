// A new installation (src/server/project-actions.ts createProjectAction) has no kind (round 45: its type of intervention
// is its «Calcolo argano»'s): it opens straight on «Calcolo argano» for whoever makes the calculations (calc:create —
// the Progettista, the Tecnico) and on the installation's page for whoever only creates installations; an old `kind`
// sent is ignored; without impianti:create nothing is created. Always in the user's company, with its audit row; the
// upgrade of a replacement to a whole project is gone.
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
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: Row) => { audited.push(a); }, auditTx: async (_tx: unknown, a: Row) => { audited.push(a); } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => session } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Redirect(to); } } });

const signIn = (over: Row = {}) => { session = { id: 'u1', role: 'ENGINEER', companyId: 'c1', mustChangePassword: false, readOnly: false, ...over }; };
const form = (extra: Row = {}) => {
  const f = new FormData();
  f.set('locale', 'it'); f.set('name', 'Condominio Verdi'); f.set('city', 'Milano');
  for (const [k, v] of Object.entries(extra)) f.set(k, String(v));
  return f;
};
/** Where the action ends: a redirect, or the form's state when it stays on the page. */
async function create(extra: Row = {}): Promise<string | Row> {
  const { createProjectAction } = await import(src('server/project-actions.ts'));
  try { return await createProjectAction({}, form(extra)); } catch (e) { if (e instanceof Redirect) return e.to; throw e; }
}

beforeEach(() => { created.length = 0; audited.length = 0; signIn(); });

test('il Progettista e il Tecnico: il nuovo impianto si apre sul Calcolo argano, senza tipo né modulo', async () => {
  assert.equal(await create(), '/it/app/projects/p1/calc');
  signIn({ role: 'TECHNICIAN' });
  // an old form's module is ignored
  assert.equal(await create({ kind: 'FULL' }), '/it/app/projects/p2/calc');
  assert.deepEqual(created.map((c) => [c.companyId, c.createdById, 'kind' in c]), [['c1', 'u1', false], ['c1', 'u1', false]]);
  assert.deepEqual(audited.map((a) => [a.action, a.entityId, a.meta]), [['PROJECT_CREATED', 'p1', undefined], ['PROJECT_CREATED', 'p2', undefined]]);
});

test('il calcolo tolto dall’azienda: l’impianto si apre sulla sua pagina', async () => {
  signIn({ role: 'TECHNICIAN', caps: capsOf('TECHNICIAN', [{ role: 'TECHNICIAN', capability: 'calc:create', granted: false }]) });
  assert.equal(await create(), '/it/app/projects/p1');
});

test('senza impianti:create (il Commerciale) o in sola lettura: nessun impianto', async () => {
  signIn({ role: 'SALES' });
  assert.deepEqual(await create(), { error: 'forbidden' });
  signIn({ readOnly: true });
  assert.deepEqual(await create(), { error: 'forbidden' });
  assert.equal(created.length + audited.length, 0);
});

test('dati non validi: nessun impianto; il passaggio a progetto completo non c’è più', async () => {
  assert.deepEqual(await create({ name: '' }), { error: 'invalidFields', fields: ['name'] });
  assert.equal(created.length, 0);
  const actions = await import(src('server/project-actions.ts'));
  assert.equal('upgradeProjectAction' in actions, false);
});
