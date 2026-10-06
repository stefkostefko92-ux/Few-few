// The companies inactive without a subscription (src/lib/inactive.ts): the owner is told by e-mail first and the
// company goes only from the day the e-mail names, if still nobody signed in; a sign-in or a subscription in between
// keeps it; never the platform's company, one never billed, or one whose owner could not be told.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

interface U { role: string; lastLoginAt: Date | null; active: boolean; emailVerifiedAt: Date | null; email: string; locale: string }
interface C { id: string; billingExempt: boolean; createdAt: Date; subscriptionStatus: string | null; inactiveNoticeAt: Date | null; users: U[] }
let companies: C[] = [];
let mailOk = true, mailOn = true;
const sent: string[] = [], audits: string[] = [];

// a small evaluator of the where clauses src/lib/inactive.ts writes
type W = Record<string, unknown>;
const cmp = (v: unknown, c: unknown): boolean => {
  if (c === null) return v === null;
  if (typeof c !== 'object' || c instanceof Date) return v === c || (v instanceof Date && c instanceof Date && v.getTime() === c.getTime());
  const o = c as W;
  if ('not' in o) return o.not === null ? v !== null : v !== o.not;
  if ('lt' in o) return v instanceof Date && v < (o.lt as Date);
  if ('gte' in o) return v instanceof Date && v >= (o.gte as Date);
  if ('notIn' in o) return v !== null && !(o.notIn as unknown[]).includes(v);
  throw new Error(`unsupported ${JSON.stringify(o)}`);
};
const matchUser = (u: U, w: W): boolean => Object.entries(w).every(([k, c]) =>
  k === 'OR' ? (c as W[]).some((x) => matchUser(u, x)) : cmp((u as unknown as W)[k], c));
const match = (co: C, w: W): boolean => Object.entries(w).every(([k, c]) => {
  if (k === 'OR') return (c as W[]).some((x) => match(co, x));
  if (k === 'NOT') return !match(co, c as W);
  if (k === 'users') return !co.users.some((u) => matchUser(u, (c as { none: W }).none));
  return cmp((co as unknown as W)[k], c);
});
const db = {
  company: {
    updateMany: async ({ where, data }: { where: W; data: Partial<C> }) => { const hit = companies.filter((c) => match(c, where)); hit.forEach((c) => Object.assign(c, data)); return { count: hit.length }; },
    findMany: async ({ where }: { where: W }) => companies.filter((c) => match(c, where)).map((c) => ({ id: c.id, users: c.users.filter((u) => u.role === 'OWNER' && u.active && u.emailVerifiedAt) })),
    findFirst: async ({ where }: { where: W }) => companies.find((c) => match(c, where)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<C> }) => Object.assign(companies.find((c) => c.id === where.id) ?? {}, data),
    delete: async ({ where }: { where: { id: string } }) => { companies = companies.filter((c) => c.id !== where.id); },
  },
  auditLog: { deleteMany: async () => ({ count: 0 }) },
  user: { deleteMany: async ({ where }: { where: { companyId: string } }) => { const c = companies.find((x) => x.id === where.companyId); if (c) c.users = []; return { count: 0 }; } },
  $queryRaw: async () => [],
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: { ...db, $transaction: async (fn: (t: typeof db) => unknown) => fn(db) } } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: { action: string; entityId: string }) => { audits.push(`${a.action}:${a.entityId}`); } } });
mock.module(src('lib/env.ts'), { namedExports: { publicBaseUrl: () => 'https://liftpilot.test' } });
mock.module(src('lib/mail.ts'), { namedExports: { mailConfigured: () => mailOn, sendMail: async (m: { to: string }) => { if (mailOk) sent.push(m.to); return mailOk; } } });
mock.module(src('lib/mail-templates.ts'), { namedExports: { accountMail: () => ({ subject: 's', text: 't', html: 'h' }) } });

const now = new Date('2029-03-15T10:00:00Z');
const old = new Date('2026-01-10T00:00:00Z'), recent = new Date('2029-01-05T00:00:00Z');
const owner = (lastLoginAt: Date | null, email: string): U => ({ role: 'OWNER', lastLoginAt, active: true, emailVerifiedAt: old, email, locale: 'it' });
const company = (id: string, o: Partial<C> = {}): C => ({ id, billingExempt: false, createdAt: old, subscriptionStatus: null, inactiveNoticeAt: null, users: [owner(old, `${id}@x.test`)], ...o });

test('the owner of an inactive company is told; nobody else, and nothing is deleted before the day', async () => {
  const { purgeInactive } = await import(src('lib/inactive.ts'));
  companies = [
    company('idle'),
    company('paying', { subscriptionStatus: 'active' }),
    company('late', { subscriptionStatus: 'past_due' }),
    company('ended', { subscriptionStatus: 'canceled' }),
    company('exempt', { billingExempt: true }),
    company('young', { createdAt: recent }),
    company('working', { users: [owner(old, 'w@x.test'), { ...owner(recent, 'c@x.test'), role: 'TECHNICIAN' }] }),
    company('platform', { users: [owner(old, 'p@x.test'), { ...owner(null, 'a@x.test'), role: 'SUPERADMIN' }] }),
    company('nobody', { users: [{ ...owner(old, 'n@x.test'), emailVerifiedAt: null }] }),
  ];
  sent.length = 0; audits.length = 0; mailOk = true; mailOn = true;
  assert.deepEqual(await purgeInactive(now), { told: 2, deleted: 0 });
  assert.deepEqual(sent.sort(), ['ended@x.test', 'idle@x.test']);
  assert.equal(companies.find((c) => c.id === 'idle')?.inactiveNoticeAt?.getTime(), now.getTime());
  assert.equal(companies.find((c) => c.id === 'nobody')?.inactiveNoticeAt, null, 'no verified owner: never told, never deleted');
  // the next run, the day before the one named: nothing
  assert.deepEqual(await purgeInactive(new Date('2029-04-14T23:00:00Z')), { told: 0, deleted: 0 });
});

test('from the day named the company goes; a sign-in in between keeps it and ends the notice', async () => {
  const { purgeInactive, deletionDay } = await import(src('lib/inactive.ts'));
  const told = new Date('2029-03-15T10:00:00Z');
  companies = [company('gone', { inactiveNoticeAt: told }), company('back', { inactiveNoticeAt: told, users: [owner(new Date('2029-03-20T08:00:00Z'), 'b@x.test')] })];
  sent.length = 0; audits.length = 0;
  const day = deletionDay(told);
  assert.equal(day.toISOString(), '2029-04-15T00:00:00.000Z');
  assert.deepEqual(await purgeInactive(day), { told: 0, deleted: 1 });
  assert.deepEqual(companies.map((c) => c.id), ['back']);
  assert.equal(companies[0]?.inactiveNoticeAt, null, 'the sign-in ended the notice');
  assert.ok(audits.includes('COMPANY_DELETED:gone'));
});

test('an e-mail that did not go out counts as no notice, and without mail nothing is told or deleted', async () => {
  const { purgeInactive } = await import(src('lib/inactive.ts'));
  companies = [company('idle')];
  sent.length = 0; mailOk = false; mailOn = true;
  assert.deepEqual(await purgeInactive(now), { told: 0, deleted: 0 });
  assert.equal(companies[0]?.inactiveNoticeAt, null);
  mailOk = true; mailOn = false;
  assert.deepEqual(await purgeInactive(now), { told: 0, deleted: 0 });
  assert.equal(companies[0]?.inactiveNoticeAt, null);
});
