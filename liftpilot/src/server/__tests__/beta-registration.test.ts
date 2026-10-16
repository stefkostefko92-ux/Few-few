// The beta by invitation and the clauses at the e-mail link (round 48). REGISTRATION_MODE=invite: without an
// invitation's token, with a bad one or with another address the registration is refused, with a good one it waits with
// the invitation; open: as before, an invitation still recorded. The 5 registrations an hour of one network count only
// the right forms, the wrong ones their own wider count. At the link the specific approval of the clauses is required
// before anything is used, and the invitation is used up with the company: the same invitation never makes two. The
// proof of the approval is written with the company, in its transaction (the SHA-256 of the clauses shown and their
// articles); a registration made under an earlier version of the terms accepts the one in force at the link; one made
// before the beta by invitation makes nothing once the registration is by invitation; an empty password is a field to
// fill, never a bad link.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

interface Pending { id: string; email: string; tokenHash: string; expiresAt: Date; passwordHash: string; name: string; company: string;
  vatNumber: string | null; city: string | null; locale: string; termsVersion: string; termsSha256: string; betaInviteId: string | null; createdAt: Date }
interface Beta { id: string; email: string; tokenHash: string; usedAt: Date | null; expiresAt: Date; companyId: string | null }

interface Owner { id: string; email: string; companyId: string; termsVersion?: string; clausesApprovedAt?: Date | null }
let pendings: Pending[] = [], betas: Beta[] = [], companies: { id: string; name: string }[] = [], users: Owner[] = [];
const audits: { action: string; meta?: Record<string, unknown>; tx?: boolean }[] = [], mails: { to: string; kind: string; token?: string }[] = [];
let mode: 'invite' | 'open' = 'invite', ip = '10.0.0.1';
const waiting: Promise<unknown>[] = [];
const later = (d: number) => new Date(Date.now() + d * 864e5);

type Where = Record<string, unknown>;
const matches = (p: Pending, w: Where): boolean =>
  (w.id === undefined || (typeof w.id === 'string' ? p.id === w.id : (w.id as { in: string[] }).in.includes(p.id)))
  && (w.email === undefined || p.email === w.email) && (w.tokenHash === undefined || p.tokenHash === w.tokenHash);
const db = {
  user: {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => users.find((u) => u.email === where.email || u.id === where.id) ?? null,
    create: async ({ data }: { data: Owner }) => {
      const u = { ...data, id: `u${users.length + 1}`, tokenVersion: 0 };
      users.push(u);
      return u;
    },
    deleteMany: async () => ({ count: 0 }),
  },
  authToken: { findUnique: async () => null },
  pendingRegistration: {
    create: async ({ data }: { data: Omit<Pending, 'id'> }) => { pendings.push({ ...data, id: `p${pendings.length + 1}` }); },
    findMany: async () => [],
    findUnique: async ({ where }: { where: { tokenHash: string } }) => pendings.find((p) => p.tokenHash === where.tokenHash) ?? null,
    deleteMany: async ({ where }: { where: Where }) => {
      const n = pendings.length;
      pendings = pendings.filter((p) => !matches(p, where));
      return { count: n - pendings.length };
    },
  },
  betaInvite: {
    findUnique: async ({ where }: { where: { tokenHash: string } }) => betas.find((b) => b.tokenHash === where.tokenHash) ?? null,
    updateMany: async ({ where, data }: { where: { id: string; usedAt: null }; data: Partial<Beta> }) => {
      const b = betas.find((x) => x.id === where.id && x.usedAt === null);
      if (b) Object.assign(b, data);
      return { count: b ? 1 : 0 };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Beta> }) => Object.assign(betas.find((x) => x.id === where.id) ?? {}, data),
    deleteMany: async () => ({ count: 0 }),
  },
  company: {
    create: async ({ data }: { data: { name: string } }) => { const c = { id: `c${companies.length + 1}`, name: data.name }; companies.push(c); return c; },
    deleteMany: async () => ({ count: 0 }),
  },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: { ...db, $transaction: async (fn: (t: typeof db) => unknown) => fn(db) } } });
mock.module(src('lib/env.ts'), { namedExports: {
  env: () => ({}), publicBaseUrl: () => 'https://liftpilot.example', indexingAllowed: () => false, registrationMode: () => mode,
} });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => null, startSession: async () => {} } });
mock.module(src('lib/mail.ts'), { namedExports: { mailConfigured: () => true } });
mock.module(src('lib/account-mail.ts'), { namedExports: { mailAccount: (to: string, _l: string, m: { kind: string; token?: string }) => { mails.push({ to, ...m }); } } });
mock.module(src('lib/audit.ts'), { namedExports: {
  audit: async (a: { action: string; meta?: Record<string, unknown> }) => { audits.push(a); },
  auditTx: async (_tx: unknown, a: { action: string; meta?: Record<string, unknown> }) => { audits.push({ ...a, tx: true }); },
} });
mock.module(src('lib/password.ts'), { namedExports: {
  hashPassword: async (pw: string) => `h:${pw}`, verifyPassword: async (pw: string, hash: string) => hash === `h:${pw}`, temporaryPassword: () => 'x'.repeat(16),
} });
// the terms' text (next-intl, not loadable under react-server) is not what these tests are about: its hash is a stand-in
mock.module(src('lib/legal-text.ts'), { namedExports: {
  legalSha256: () => 'sha-terms', clausesProof: () => ({ clausesSha256: 'sha-clauses', clauseArticles: [4, 6, 7, 8, 10, 12, 13, 15] }),
} });
mock.module(src('lib/purge.ts'), { namedExports: { purgeStale: async () => {}, pastConfirmDeadline: () => false } });
mock.module(src('lib/billing-config.ts'), { namedExports: { billingConfigured: () => false, billingConfig: () => null } });
mock.module(pkg('next/server'), { namedExports: { after: (fn: () => unknown) => { waiting.push(Promise.resolve().then(fn)); } } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers({ 'x-real-ip': ip }) } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Error(`redirect ${to}`); } } });

const { hashToken } = await import(src('lib/token-hash.ts'));
const { betaInviteInfoAction, registerAction, verifyEmailAction, verifyInfoAction } = await import(src('server/account-actions.ts'));
const { TERMS_VERSION } = await import(src('lib/legal.ts'));
const PASSWORD = 'Ascensore2026sicuro';

/** A beta invitation of `email` with its token. */
function invitation(email: string, letter: string): string {
  const token = letter.repeat(43);
  betas.push({ id: `b${betas.length + 1}`, email, tokenHash: hashToken(token), usedAt: null, expiresAt: later(30), companyId: null });
  return token;
}
async function register(email: string, invito = '', extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ company: 'Ascensori Rossi srl', name: 'Mario Rossi', email, password: PASSWORD, confirm: PASSWORD,
    accept: 'on', business: 'on', drafts: 'on', locale: 'it', invito, ...extra })) fd.set(k, v);
  const answer = await registerAction({}, fd);
  await Promise.all(waiting.splice(0));
  return answer;
}
function reset(m: 'invite' | 'open', at: string): void {
  pendings = []; betas = []; companies = []; users = []; audits.length = 0; mails.length = 0; mode = m; ip = at;
}

test('invite mode: no token, a bad one or another address are refused; a good one waits with its invitation', async () => {
  reset('invite', '10.0.1.1');
  const token = invitation('tester@ditta.example', 'T');
  assert.deepEqual(await register('tester@ditta.example'), { error: 'inviteRequired' });
  assert.deepEqual(await register('tester@ditta.example', 'U'.repeat(43)), { error: 'inviteRequired' });
  assert.deepEqual(await register('tester@ditta.example', 'non-un-token'), { error: 'inviteRequired' });
  assert.deepEqual(await register('altro@ditta.example', token), { error: 'inviteRequired' });
  assert.equal(pendings.length + mails.length, 0, 'nothing waits, no e-mail');
  // the address as the schema reads it (case and spaces) is the invitation's
  assert.deepEqual(await register(' Tester@Ditta.example ', token), { ok: true, message: 'tester@ditta.example' });
  assert.equal(pendings.length, 1);
  assert.equal(pendings[0]?.betaInviteId, betas[0]?.id);
  assert.deepEqual(mails.map((m) => m.kind), ['verify']);
  // a used or expired invitation opens nothing
  const beta = betas[0];
  assert.ok(beta);
  beta.usedAt = new Date();
  assert.deepEqual(await register('tester@ditta.example', token), { error: 'inviteRequired' });
  beta.usedAt = null; beta.expiresAt = new Date(Date.now() - 1000);
  assert.deepEqual(await register('tester@ditta.example', token), { error: 'inviteRequired' });
});

test('the link of an invitation (its fragment): the page learns the invited address, nothing for a link that is not good', async () => {
  reset('invite', '10.0.6.1');
  const token = invitation('letto@ditta.example', 'L');
  assert.equal(await betaInviteInfoAction(token), 'letto@ditta.example');
  assert.equal(await betaInviteInfoAction('M'.repeat(43)), null, 'unknown');
  assert.equal(await betaInviteInfoAction('nulla'), null, 'malformed');
  assert.equal(await betaInviteInfoAction(''), null, 'none');
  assert.equal(await betaInviteInfoAction({ token }), null, 'anything but a string');
  const beta = betas[0];
  assert.ok(beta);
  beta.expiresAt = new Date(Date.now() - 1000);
  assert.equal(await betaInviteInfoAction(token), null, 'past its end');
  beta.expiresAt = later(30); beta.usedAt = new Date();
  assert.equal(await betaInviteInfoAction(token), null, 'used');
  assert.equal(pendings.length + mails.length, 0, 'reading a link changes nothing');
  // its own count: 40 reads of one network in a quarter of an hour, then nothing — and the registration is untouched
  beta.usedAt = null;
  for (let i = 0; i < 32; i++) await betaInviteInfoAction(token);
  assert.equal(await betaInviteInfoAction(token), 'letto@ditta.example', 'the 40th');
  assert.equal(await betaInviteInfoAction(token), null, 'past the count');
  assert.equal((await register('letto@ditta.example', token)).ok, true, 'the registration keeps its own count');
});

test('open mode: as before without a token; a good invitation is still recorded', async () => {
  reset('open', '10.0.2.1');
  assert.deepEqual(await register('libero@ditta.example'), { ok: true, message: 'libero@ditta.example' });
  assert.equal(pendings[0]?.betaInviteId, null);
  const token = invitation('invitato@ditta.example', 'V');
  assert.equal((await register('invitato@ditta.example', token)).ok, true);
  assert.equal(pendings[1]?.betaInviteId, betas[0]?.id);
  // another address with somebody's link: registered like anyone, the invitation untouched
  assert.equal((await register('terzo@ditta.example', token)).ok, true);
  assert.equal(pendings[2]?.betaInviteId, null);
});

test('rate limits: wrong forms do not use up the 5 registrations an hour, and have their own count', async () => {
  reset('open', '10.0.3.1');
  for (let i = 0; i < 8; i++) assert.equal((await register(`x${i}@ditta.example`, '', { password: 'corta' })).error, 'weakPassword', `wrong form ${i}`);
  for (let i = 0; i < 5; i++) assert.equal((await register(`ok${i}@ditta.example`)).ok, true, `right form ${i}`);
  assert.deepEqual(await register('sesto@ditta.example'), { error: 'rateLimitedHour' });
  // the wrong forms of another network: 30 an hour, then the hour's message
  ip = '10.0.3.2';
  for (let i = 0; i < 30; i++) assert.equal((await register(`y${i}@ditta.example`, '', { accept: '' })).error, 'consentRequired');
  assert.deepEqual(await register('y@ditta.example', '', { accept: '' }), { error: 'rateLimitedHour' });
  // during the beta a form without its invitation counts as a wrong one, never against the 5
  reset('invite', '10.0.3.3');
  for (let i = 0; i < 6; i++) assert.equal((await register(`z${i}@ditta.example`)).error, 'inviteRequired');
  const token = invitation('z@ditta.example', 'W');
  assert.equal((await register('z@ditta.example', token)).ok, true);
});

/** The link of the newest registration e-mail to `to`. */
const linkOf = (to: string): string => mails.filter((m) => m.to === to && m.kind === 'verify').at(-1)?.token ?? '';
async function verify(token: string, password: string, clauses: '' | 'on', accept: '' | 'on' = '') {
  const fd = new FormData();
  fd.set('token', token); fd.set('password', password); fd.set('clauses', clauses); fd.set('accept', accept); fd.set('locale', 'it');
  return verifyEmailAction({}, fd).catch((e: Error) => e.message);
}

test('at the link: the clauses approved with the password make the company and use up the invitation', async () => {
  reset('invite', '10.0.4.1');
  const invite = invitation('firma@ditta.example', 'F');
  await register('firma@ditta.example', invite);
  const link = linkOf('firma@ditta.example');
  assert.equal(await verifyInfoAction(link), 'registration');
  assert.equal(await verifyInfoAction('G'.repeat(43)), 'invalid');
  assert.equal(await verifyInfoAction({ token: link }), 'invalid', 'anything but a string');
  // without the approval nothing is checked nor used
  assert.deepEqual(await verify(link, PASSWORD, ''), { error: 'consentRequired', fields: ['clauses'] });
  assert.equal(pendings.length, 1);
  assert.equal(companies.length, 0);
  assert.deepEqual(await verify(link, 'AltraPassword2026', 'on'), { error: 'verifyWrongPassword', fields: ['password'] });
  assert.equal(pendings.length, 1, 'a wrong password uses nothing');
  assert.equal(await verify(link, PASSWORD, 'on'), 'redirect /it/app');
  assert.deepEqual(companies.map((c) => c.name), ['Ascensori Rossi srl']);
  assert.ok(betas[0]?.usedAt instanceof Date);
  assert.equal(betas[0]?.companyId, companies[0]?.id);
  const registered = audits.find((a) => a.action === 'USER_REGISTERED');
  assert.deepEqual(registered?.meta?.consents, ['accept', 'business', 'drafts']);
  assert.equal(registered?.meta?.clausesVia, 'email-link+password');
  assert.match(String(registered?.meta?.clausesApprovedAt), /^\d{4}-\d\d-\d\dT/);
  // the proof is written in the transaction that makes the company (auditTx), with what was approved
  assert.equal(registered?.tx, true, 'USER_REGISTERED inside the transaction');
  assert.equal(audits.find((a) => a.action === 'EMAIL_VERIFIED')?.tx, true);
  assert.equal(registered?.meta?.clausesSha256, 'sha-clauses');
  assert.deepEqual(registered?.meta?.clauseArticles, [4, 6, 7, 8, 10, 12, 13, 15]);
  assert.equal(registered?.meta?.terms, TERMS_VERSION);
  assert.equal(registered?.meta?.registeredTerms, undefined, 'registered under the version in force');
  assert.ok(users[0]?.clausesApprovedAt instanceof Date, 'the account keeps when the clauses were approved');
  assert.equal(users[0]?.termsVersion, TERMS_VERSION);
  assert.equal(await verify(link, PASSWORD, 'on').then((r) => (typeof r === 'string' ? r : r.error)), 'invalidLink', 'the link once');
});

test('one company per invitation: a second registration with the invitation already used makes nothing', async () => {
  reset('invite', '10.0.5.1');
  const invite = invitation('due@ditta.example', 'D');
  await register('due@ditta.example', invite);
  const first = linkOf('due@ditta.example');
  // a second registration waiting with the same invitation (made before the first was confirmed); its own address so
  // that the first confirmation does not drop it with the others of the address
  await register('due@ditta.example', invite);
  const other = pendings[1];
  assert.ok(other);
  other.email = 'due-bis@ditta.example';
  const second = linkOf('due@ditta.example');
  assert.notEqual(first, second);
  assert.equal(await verify(first, PASSWORD, 'on'), 'redirect /it/app');
  assert.deepEqual(await verify(second, PASSWORD, 'on'), { error: 'invalidLink' });
  assert.equal(companies.length, 1, 'one company');
  assert.equal(users.length, 1, 'one owner');
});

test('the password at the link: empty is a field to fill, never a bad link; only a bad link is called one', async () => {
  reset('invite', '10.0.7.1');
  await register('vuota@ditta.example', invitation('vuota@ditta.example', 'E'));
  const link = linkOf('vuota@ditta.example');
  assert.deepEqual(await verify(link, '', 'on'), { error: 'verifyPasswordRequired', fields: ['password'] });
  assert.deepEqual(await verify(link, '', ''), { error: 'consentRequired', fields: ['clauses', 'password'] });
  assert.deepEqual(await verify(link, 'x'.repeat(201), 'on'), { error: 'verifyWrongPassword', fields: ['password'] });
  assert.equal(pendings.length, 1, 'nothing used');
  assert.equal(companies.length, 0);
  assert.deepEqual(await verify('non-un-token', '', 'on'), { error: 'invalidLink' });
  assert.deepEqual(await verify('H'.repeat(43), '', 'on'), { error: 'invalidLink' }, 'a well-formed link that is not good');
  assert.equal(await verify(link, PASSWORD, 'on'), 'redirect /it/app', 'the same link still works');
});

test('a registration made under an earlier version accepts the terms in force at the link, with the clauses', async () => {
  reset('invite', '10.0.8.1');
  await register('vecchia@ditta.example', invitation('vecchia@ditta.example', 'K'));
  const pending = pendings[0];
  assert.ok(pending);
  pending.termsVersion = '4'; pending.termsSha256 = 'sha-v4';
  const link = linkOf('vecchia@ditta.example');
  assert.equal(await verifyInfoAction(link), 'registrationNewTerms', 'the page asks the terms in force too');
  assert.deepEqual(await verify(link, PASSWORD, 'on'), { error: 'consentRequired', fields: ['accept'] });
  assert.deepEqual(await verify(link, PASSWORD, ''), { error: 'consentRequired', fields: ['accept', 'clauses'] });
  assert.equal(companies.length, 0, 'nothing made without them');
  assert.equal(await verify(link, PASSWORD, 'on', 'on'), 'redirect /it/app');
  assert.equal(users[0]?.termsVersion, TERMS_VERSION, 'the version in force, not the registration\'s');
  const meta = audits.find((a) => a.action === 'USER_REGISTERED')?.meta;
  assert.equal(meta?.terms, TERMS_VERSION);
  assert.equal(meta?.sha256, 'sha-terms', 'the SHA-256 of the text in force');
  assert.equal(meta?.registeredTerms, '4');
  assert.equal(meta?.registeredSha256, 'sha-v4');
  assert.equal(meta?.termsAcceptedVia, 'email-link+password');
});

test('invitation mode: a registration made before it (no invitation) makes no company, and nothing is used', async () => {
  reset('open', '10.0.9.1');
  await register('prima@ditta.example');
  const link = linkOf('prima@ditta.example');
  assert.equal(pendings[0]?.betaInviteId, null);
  mode = 'invite';
  assert.equal(await verifyInfoAction(link), 'inviteOnly');
  assert.deepEqual(await verify(link, PASSWORD, 'on'), { error: 'registrationInviteOnly' });
  assert.equal(pendings.length, 1, 'the registration waits untouched');
  assert.equal(companies.length + users.length, 0, 'no company, no account');
  // the registration open again: the same link makes it
  mode = 'open';
  assert.equal(await verifyInfoAction(link), 'registration');
  assert.equal(await verify(link, PASSWORD, 'on'), 'redirect /it/app');
});
