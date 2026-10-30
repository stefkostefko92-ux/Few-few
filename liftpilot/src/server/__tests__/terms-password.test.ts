// The owner accepting a new version of the terms (round 48): the four confirmations and the current password — the
// specific approval of the clauses (arts. 1341–1342 c.c.) is signed with it, not a bare tick. Without the password, or
// with a wrong one, nothing is accepted; the tries have their own count per user. The acceptance and its record (with
// the SHA-256 of the clauses shown and their articles) are written in one transaction. An owner who accepted the
// version in force with a bare tick approves the clauses once more, alone, with the password (approveClausesAction).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

const PASSWORD = 'Titolare2026sicura';
let me: { id: string; role: string; companyId: string; mustChangePassword: boolean } | null = null;
/** the owners in the database: their terms and when they approved the clauses with the password */
const rows = new Map<string, { termsVersion: string | null; clausesApprovedAt: Date | null }>();
const updates: Record<string, unknown>[] = [], audits: { action: string; meta?: Record<string, unknown>; tx?: boolean }[] = [];

const user = {
  findUnique: async ({ where }: { where: { id: string } }) => {
    const r = rows.get(where.id);
    return where.id === me?.id ? { passwordHash: `h:${PASSWORD}`, termsVersion: r?.termsVersion ?? null, clausesApprovedAt: r?.clausesApprovedAt ?? null } : null;
  },
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    updates.push(data);
    rows.set(where.id, { termsVersion: String(data.termsVersion), clausesApprovedAt: data.clausesApprovedAt as Date });
    return data;
  },
  updateMany: async ({ where, data }: { where: { id: string; termsVersion: string; clausesApprovedAt: null }; data: { clausesApprovedAt: Date } }) => {
    const r = rows.get(where.id);
    if (!r || r.termsVersion !== where.termsVersion || r.clausesApprovedAt !== null) return { count: 0 };
    updates.push(data);
    r.clausesApprovedAt = data.clausesApprovedAt;
    return { count: 1 };
  },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: { user, $transaction: async (fn: (tx: { user: typeof user }) => unknown) => fn({ user }) } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => me } });
mock.module(src('lib/audit.ts'), { namedExports: {
  audit: async (a: { action: string; meta?: Record<string, unknown> }) => { audits.push(a); },
  auditTx: async (_tx: unknown, a: { action: string; meta?: Record<string, unknown> }) => { audits.push({ ...a, tx: true }); },
} });
mock.module(src('lib/password.ts'), { namedExports: { verifyPassword: async (pw: string, hash: string) => hash === `h:${pw}` } });
// the terms' text (next-intl, not loadable under react-server) is not what these tests are about: its hashes are stand-ins
mock.module(src('lib/legal-text.ts'), { namedExports: {
  legalSha256: () => 'sha-terms', clausesProof: () => ({ clausesSha256: 'sha-clauses', clauseArticles: [4, 6, 7, 8, 10, 12, 13, 15] }),
} });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });

const { acceptTermsAction, approveClausesAction } = await import(src('server/terms-actions.ts'));
const { TERMS_VERSION } = await import(src('lib/legal.ts'));

async function accept(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ accept: 'on', business: 'on', drafts: 'on', clauses: 'on', locale: 'it', ...fields })) fd.set(k, v);
  return acceptTermsAction({}, fd);
}
async function approve(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ clauses: 'on', locale: 'it', ...fields })) fd.set(k, v);
  return approveClausesAction({}, fd);
}
const owner = (id: string) => ({ id, role: 'OWNER', companyId: `c-${id}`, mustChangePassword: false });

test('the terms are accepted only with the four confirmations and the current password', async () => {
  me = owner('owner1');
  rows.set('owner1', { termsVersion: '4', clausesApprovedAt: null });
  assert.deepEqual(await accept({}), { error: 'termsPasswordRequired', fields: ['password'] });
  assert.deepEqual(await accept({ password: 'AltraPassword2026' }), { error: 'termsWrongPassword', fields: ['password'] });
  assert.deepEqual(await accept({ password: PASSWORD, clauses: '' }), { error: 'consentRequired', fields: ['clauses'] });
  assert.deepEqual(await accept({ clauses: '' }), { error: 'consentRequired', fields: ['clauses', 'password'] }, 'the empty password marked too');
  assert.equal(updates.length + audits.length, 0, 'nothing accepted');
  assert.deepEqual(await accept({ password: PASSWORD }), { ok: true });
  assert.equal(updates[0]?.termsVersion, TERMS_VERSION);
  assert.ok(updates[0]?.clausesApprovedAt instanceof Date, 'the account keeps when the clauses were approved');
  const record = audits.find((a) => a.action === 'TERMS_ACCEPTED');
  assert.equal(record?.tx, true, 'written in the transaction of the acceptance');
  assert.deepEqual(record?.meta?.consents, ['accept', 'business', 'drafts', 'clauses']);
  assert.equal(record?.meta?.clausesVia, 'password');
  assert.equal(record?.meta?.clausesSha256, 'sha-clauses');
  assert.deepEqual(record?.meta?.clauseArticles, [4, 6, 7, 8, 10, 12, 13, 15]);
  assert.match(String(record?.meta?.clausesApprovedAt), /^\d{4}-\d\d-\d\dT/);
});

test('only the owner, and the password tries have their own count per user', async () => {
  me = { id: 'tecnico1', role: 'TECHNICIAN', companyId: 'c1', mustChangePassword: false };
  assert.deepEqual(await accept({ password: PASSWORD }), { error: 'unauthorized' });
  assert.deepEqual(await approve({ password: PASSWORD }), { error: 'unauthorized' });
  me = owner('owner2');
  for (let i = 0; i < 8; i++) assert.equal((await accept({ password: 'Sbagliata2026x' })).error, 'termsWrongPassword', `try ${i}`);
  assert.deepEqual(await accept({ password: PASSWORD }), { error: 'rateLimited' }, 'even the right one, once the tries are used up');
  assert.deepEqual(await approve({ password: PASSWORD }), { error: 'rateLimited' }, 'one count for both: the same password');
});

test('the clauses approved once more, alone, with the password: an owner who accepted the version in force with a tick', async () => {
  me = owner('owner3');
  rows.set('owner3', { termsVersion: TERMS_VERSION, clausesApprovedAt: null });
  updates.length = 0; audits.length = 0;
  assert.deepEqual(await approve({ clauses: '', password: PASSWORD }), { error: 'consentRequired', fields: ['clauses'] });
  assert.deepEqual(await approve({ clauses: '' }), { error: 'consentRequired', fields: ['clauses', 'password'] });
  assert.deepEqual(await approve({}), { error: 'termsPasswordRequired', fields: ['password'] }, 'an empty password is a field to fill');
  assert.deepEqual(await approve({ password: 'AltraPassword2026' }), { error: 'termsWrongPassword', fields: ['password'] });
  assert.equal(updates.length + audits.length, 0, 'nothing approved');
  assert.deepEqual(await approve({ password: PASSWORD }), { ok: true });
  assert.ok(rows.get('owner3')?.clausesApprovedAt instanceof Date);
  const record = audits.find((a) => a.action === 'CLAUSES_APPROVED');
  assert.equal(record?.tx, true);
  assert.equal(record?.meta?.version, TERMS_VERSION);
  assert.equal(record?.meta?.clausesVia, 'password');
  assert.equal(record?.meta?.clausesSha256, 'sha-clauses');
  assert.deepEqual(record?.meta?.clauseArticles, [4, 6, 7, 8, 10, 12, 13, 15]);
  // asked once: approved already, nothing more is written
  assert.deepEqual(await approve({ password: PASSWORD }), { ok: true });
  assert.equal(audits.filter((a) => a.action === 'CLAUSES_APPROVED').length, 1);
});

test('an owner bound by an earlier version approves the clauses with the new terms, not alone', async () => {
  me = owner('owner4');
  rows.set('owner4', { termsVersion: '4', clausesApprovedAt: null });
  audits.length = 0;
  assert.deepEqual(await approve({ password: PASSWORD }), { error: 'unauthorized' });
  assert.equal(rows.get('owner4')?.clausesApprovedAt, null);
  assert.equal(audits.length, 0);
});
