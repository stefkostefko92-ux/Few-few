// The owner accepting a new version of the terms (round 48): the four confirmations and the current password — the
// specific approval of the clauses (arts. 1341–1342 c.c.) is signed with it, not a bare tick. Without the password, or
// with a wrong one, nothing is accepted; the tries have their own count per user.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

const PASSWORD = 'Titolare2026sicura';
let me: { id: string; role: string; companyId: string; mustChangePassword: boolean } | null = null;
const updates: Record<string, unknown>[] = [], audits: { action: string; meta?: Record<string, unknown> }[] = [];

mock.module(src('lib/db.ts'), { namedExports: { prisma: { user: {
  findUnique: async ({ where }: { where: { id: string } }) => (where.id === me?.id ? { passwordHash: `h:${PASSWORD}` } : null),
  update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; },
} } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => me } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: { action: string; meta?: Record<string, unknown> }) => { audits.push(a); } } });
mock.module(src('lib/password.ts'), { namedExports: { verifyPassword: async (pw: string, hash: string) => hash === `h:${pw}` } });
// the terms' text (next-intl, not loadable under react-server) is not what these tests are about: its hash is a stand-in
mock.module(src('lib/legal-text.ts'), { namedExports: { legalSha256: () => 'sha-terms' } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });

const { acceptTermsAction } = await import(src('server/terms-actions.ts'));
const { TERMS_VERSION } = await import(src('lib/legal.ts'));

async function accept(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ accept: 'on', business: 'on', drafts: 'on', clauses: 'on', locale: 'it', ...fields })) fd.set(k, v);
  return acceptTermsAction({}, fd);
}

test('the terms are accepted only with the four confirmations and the current password', async () => {
  me = { id: 'owner1', role: 'OWNER', companyId: 'c1', mustChangePassword: false };
  assert.deepEqual(await accept({}), { error: 'termsPasswordRequired', fields: ['password'] });
  assert.deepEqual(await accept({ password: 'AltraPassword2026' }), { error: 'termsWrongPassword', fields: ['password'] });
  assert.deepEqual(await accept({ password: PASSWORD, clauses: '' }), { error: 'consentRequired', fields: ['clauses'] });
  assert.equal(updates.length + audits.length, 0, 'nothing accepted');
  assert.deepEqual(await accept({ password: PASSWORD }), { ok: true });
  assert.equal(updates[0]?.termsVersion, TERMS_VERSION);
  const meta = audits.find((a) => a.action === 'TERMS_ACCEPTED')?.meta;
  assert.deepEqual(meta?.consents, ['accept', 'business', 'drafts', 'clauses']);
  assert.equal(meta?.clausesVia, 'password');
  assert.match(String(meta?.clausesApprovedAt), /^\d{4}-\d\d-\d\dT/);
});

test('only the owner, and the password tries have their own count per user', async () => {
  me = { id: 'tecnico1', role: 'TECHNICIAN', companyId: 'c1', mustChangePassword: false };
  assert.deepEqual(await accept({ password: PASSWORD }), { error: 'unauthorized' });
  me = { id: 'owner2', role: 'OWNER', companyId: 'c2', mustChangePassword: false };
  for (let i = 0; i < 8; i++) assert.equal((await accept({ password: 'Sbagliata2026x' })).error, 'termsWrongPassword', `try ${i}`);
  assert.deepEqual(await accept({ password: PASSWORD }), { error: 'rateLimited' }, 'even the right one, once the tries are used up');
});
