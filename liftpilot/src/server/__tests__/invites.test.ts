// The invitations of colleagues (round 30): the owner's answer is the same for an address with an account in another
// company and for an unknown one — the first gets a notice, the second the link — and nobody's account is made until
// the colleague opens the link and chooses the password. An invitation past its end takes a slot again, one address
// gets a few letters an hour, reading links never uses up the tries of accepting one, and accepting leaves the other
// companies' invitations alone.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Prisma } from '@prisma/client';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

interface Invite { id: string; companyId: string; email: string; name: string; role: string; tokenHash: string; expiresAt: Date; locale: string;
  company: { active: boolean } }
const accounts = new Map<string, string>([['taken@other.example', 'c2'], ['mate@c1.example', 'c1']]);
let invites: Invite[] = [];
let created: Record<string, unknown>[] = [];
const mails: { to: string; kind: string }[] = [];
let billing = false;
let userCreateError: Error | null = null;
/** the invitation taken meanwhile by the same link opened twice at once */
let vanish = false;
const live = (i: Invite): boolean => i.expiresAt > new Date();

const tx = {
  $queryRaw: async () => [],
  company: { findUnique: async () => ({ billingExempt: false, subscriptionStatus: null, trialEndsAt: new Date(Date.now() + 864e5), seatPack: 'NONE' }) },
  user: {
    count: async () => 0,
    findUnique: async ({ where }: { where: { email: string } }) => (accounts.has(where.email) ? { companyId: accounts.get(where.email) } : null),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (userCreateError) throw userCreateError;
      created.push(data);
      return { id: `u${created.length}`, tokenVersion: 0, ...data };
    },
  },
  invite: {
    // the slots count the invitations still waiting (lib/invites.ts pendingInvites)
    count: async ({ where }: { where: { companyId: string } }) => invites.filter((i) => i.companyId === where.companyId && live(i)).length,
    findUnique: async ({ where }: { where: { tokenHash: string } }) => invites.find((i) => i.tokenHash === where.tokenHash) ?? null,
    findFirst: async ({ where }: { where: { companyId: string; email: string } }) =>
      invites.find((i) => i.companyId === where.companyId && i.email === where.email && live(i)) ?? null,
    upsert: async ({ create, update }: { create: Omit<Invite, 'id' | 'company'>; update: Partial<Invite> }) => {
      const was = invites.find((i) => i.companyId === create.companyId && i.email === create.email);
      const row = was ? Object.assign(was, update) : { ...create, id: `i${invites.length + 1}`, company: { active: true } };
      if (!was) invites.push(row);
      return { id: row.id };
    },
    deleteMany: async ({ where }: { where: { id: string } }) => {
      if (vanish) { vanish = false; invites = invites.filter((i) => i.id !== where.id); return { count: 0 }; }
      const n = invites.length;
      invites = invites.filter((i) => i.id !== where.id);
      return { count: n - invites.length };
    },
  },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } } });
mock.module(src('lib/auth.ts'), { namedExports: {
  getSessionUser: async () => ({ id: 'owner1', role: 'OWNER', companyId: 'c1', mustChangePassword: false, readOnly: false }),
  startSession: async () => {},
} });
mock.module(src('lib/mail.ts'), { namedExports: { mailConfigured: () => true } });
mock.module(src('lib/account-mail.ts'), { namedExports: { mailAccount: (to: string, _l: string, m: { kind: string }) => { mails.push({ to, kind: m.kind }); } } });
mock.module(src('lib/inactive.ts'), { namedExports: { purgeInactive: async () => ({ told: 0, deleted: 0 }) } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async () => {} } });
// the registrations (and the terms' text they hash) are not what these tests are about
mock.module(src('lib/registrations.ts'), { namedExports: { addPending: async () => {}, confirmPending: async () => ({ ok: false, reason: 'link' }), pendingOf: async () => null } });
mock.module(src('lib/password.ts'), { namedExports: { hashPassword: async () => 'hash', verifyPassword: async () => true, temporaryPassword: () => 'x'.repeat(16) } });
mock.module(src('lib/billing-config.ts'), { namedExports: { billingConfigured: () => billing, billingConfig: () => (billing ? { trialDays: 14 } : null) } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers({ 'x-real-ip': '10.0.0.1' }) } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Error(`redirect ${to}`); } } });

const ask = async (email: string) => {
  const { createUserAction } = await import(src('server/user-actions.ts'));
  const fd = new FormData();
  fd.set('email', email); fd.set('name', 'Collega'); fd.set('role', 'TECHNICIAN'); fd.set('locale', 'it');
  return createUserAction({}, fd);
};

test('an address with an account elsewhere and an unknown one get the same answer; nobody is made', async () => {
  invites = []; created = []; mails.length = 0; billing = false;
  const elsewhere = await ask('taken@other.example'), unknown = await ask('new@nowhere.example');
  assert.deepEqual({ ...elsewhere, message: '' }, { ...unknown, message: '' });
  assert.deepEqual(unknown, { ok: true, pending: true, message: 'new@nowhere.example' });
  assert.equal(created.length, 0, 'no account before the link');
  assert.deepEqual(mails, [{ to: 'taken@other.example', kind: 'inviteExists' }, { to: 'new@nowhere.example', kind: 'invite' }]);
  assert.equal(invites.length, 2, 'both wait in the company, alike');
});

test('a colleague of the same company is told so; inviting an address again replaces its link', async () => {
  invites = []; created = []; mails.length = 0; billing = false;
  assert.deepEqual(await ask('mate@c1.example'), { error: 'emailTaken' });
  await ask('new@nowhere.example');
  const first = invites[0]?.tokenHash;
  await ask('new@nowhere.example');
  assert.equal(invites.length, 1);
  assert.notEqual(invites[0]?.tokenHash, first, 'a new link ends the earlier one');
});

test('without a free slot nothing is invited and the answer is the same for any address', async () => {
  invites = []; created = []; mails.length = 0; billing = true;
  assert.deepEqual(await ask('taken@other.example'), await ask('new@nowhere.example'));
  assert.deepEqual(await ask('new@nowhere.example'), { error: 'noSeats' });
  assert.equal(invites.length + mails.length, 0);
});

const accept = async (token: string) => {
  const { acceptInviteAction } = await import(src('server/account-actions.ts'));
  const fd = new FormData();
  fd.set('token', token); fd.set('next', 'Password12345a'); fd.set('confirm', 'Password12345a'); fd.set('locale', 'it');
  return acceptInviteAction({}, fd);
};

test('the link makes the confirmed account with the role invited and signs in; another company’s invitation of the address stays', async () => {
  const { hashToken } = await import(src('lib/token-hash.ts'));
  const token = 'A'.repeat(43);
  invites = [
    { id: 'i1', companyId: 'c1', email: 'new@nowhere.example', name: 'Collega', role: 'ENGINEER', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 864e5), locale: 'it', company: { active: true } },
    { id: 'i2', companyId: 'c3', email: 'new@nowhere.example', name: 'Altro', role: 'SALES', tokenHash: 'other', expiresAt: new Date(Date.now() + 864e5), locale: 'it', company: { active: true } },
  ];
  created = []; billing = false; userCreateError = null;
  await assert.rejects(accept(token), /redirect \/it\/app/);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.role, 'ENGINEER');
  assert.equal(created[0]?.companyId, 'c1');
  assert.ok(created[0]?.emailVerifiedAt instanceof Date, 'the link proved the address');
  // the other company does not learn that the address joined one: its invitation waits until its end
  assert.deepEqual(invites.map((i) => i.id), ['i2']);
});

test('an ended link, an address taken meanwhile and a company without a free slot make nothing', async () => {
  const { hashToken } = await import(src('lib/token-hash.ts'));
  const token = 'B'.repeat(43);
  const row = (expiresAt: Date): Invite => ({ id: 'i1', companyId: 'c1', email: 'x@nowhere.example', name: 'X', role: 'TECHNICIAN', tokenHash: hashToken(token), expiresAt, locale: 'it', company: { active: true } });
  created = []; billing = false;
  invites = [row(new Date(Date.now() - 1000))];
  assert.deepEqual(await accept(token), { error: 'invalidLink' });
  invites = [row(new Date(Date.now() + 864e5))];
  userCreateError = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
  assert.deepEqual(await accept(token), { error: 'inviteTaken' });
  userCreateError = null; billing = true;
  invites = [row(new Date(Date.now() + 864e5))];
  assert.deepEqual(await accept(token), { error: 'noSeats' });
  assert.equal(created.length, 0);
  assert.equal((await accept('bad')).error, 'invalidLink', 'a malformed link');
});

test('an invitation past its end takes a slot again: without a free one, nothing', async () => {
  invites = [{ id: 'i1', companyId: 'c1', email: 'old@nowhere.example', name: 'X', role: 'TECHNICIAN', tokenHash: 'old', expiresAt: new Date(Date.now() - 1000),
    locale: 'it', company: { active: true } }];
  created = []; mails.length = 0; billing = true;
  assert.deepEqual(await ask('old@nowhere.example'), { error: 'noSeats' });
  assert.equal(invites[0]?.tokenHash, 'old', 'not made to wait again');
  assert.equal(mails.length, 0);
});

test('one address gets three letters an hour: beyond them the answer is the same, no letter, the link sent stays good', async () => {
  invites = []; created = []; mails.length = 0; billing = false;
  const answers = [];
  for (let i = 0; i < 3; i++) answers.push(await ask('often@nowhere.example'));
  const sent = invites[0]?.tokenHash;
  answers.push(await ask('often@nowhere.example'));
  assert.equal(new Set(answers.map((a) => JSON.stringify(a))).size, 1, 'the same answer each time');
  assert.equal(mails.filter((m) => m.to === 'often@nowhere.example').length, 3);
  assert.equal(invites[0]?.tokenHash, sent, 'the link of the last letter still opens the invitation');
});

test('the same link taken twice at once makes one account; reading links never uses up the tries of accepting', async () => {
  const { hashToken } = await import(src('lib/token-hash.ts'));
  const { inviteInfoAction } = await import(src('server/account-actions.ts'));
  const token = 'C'.repeat(43);
  const row = (): Invite => ({ id: 'i1', companyId: 'c1', email: 'twice@nowhere.example', name: 'X', role: 'TECHNICIAN', tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 864e5), locale: 'it', company: { active: true } });
  created = []; billing = false; userCreateError = null;
  invites = [row()]; vanish = true;
  assert.deepEqual(await accept(token), { error: 'invalidLink' }, 'the other request took it');
  assert.equal(created.length, 0);
  for (let i = 0; i < 25; i++) assert.equal(await inviteInfoAction('x'), null);
  invites = [row()];
  await assert.rejects(accept(token), /redirect \/it\/app/);
  assert.equal(created.length, 1);
});
