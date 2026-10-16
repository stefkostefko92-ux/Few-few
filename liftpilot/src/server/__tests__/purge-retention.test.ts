// What src/lib/purge.ts keeps only for a while (round 48, after the review): the beta invitations never used go
// BETA_INVITE_KEEP_DAYS after their link ended, the used ones once their company is gone; a company deleted for having
// no users takes its invitations in the same transaction; the reports of «Segnala un problema» go FEEDBACK_KEEP_MONTHS
// after they were handled. A small evaluator runs the where clauses purge.ts writes on rows in memory.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

interface Beta { id: string; usedAt: Date | null; expiresAt: Date; companyId: string | null }
interface Report { id: string; handledAt: Date | null }
let betas: Beta[] = [], reports: Report[] = [], companies: { id: string; users: number }[] = [];
let stale: { id: string; companyId: string }[] = [];

type W = Record<string, unknown>;
const cmp = (v: unknown, c: unknown): boolean => {
  if (c === null) return v === null;
  if (typeof c !== 'object' || c instanceof Date) return v === c;
  const o = c as W;
  if ('not' in o) return o.not === null ? v !== null : v !== o.not;
  if ('lt' in o) return v instanceof Date && v < (o.lt as Date);
  if ('lte' in o) return v instanceof Date && v <= (o.lte as Date);
  throw new Error(`unsupported ${JSON.stringify(o)}`);
};
const matchBeta = (b: Beta, w: W): boolean => Object.entries(w).every(([k, c]) => {
  if (k === 'OR') return (c as W[]).some((x) => matchBeta(b, x));
  if (k === 'company') return companies.some((co) => co.id === b.companyId && co.users === 0);
  return cmp((b as unknown as W)[k], c);
});
const remove = <T>(rows: T[], hit: (r: T) => boolean): [T[], number] => { const kept = rows.filter((r) => !hit(r)); return [kept, rows.length - kept.length]; };
const db = {
  user: {
    findMany: async () => stale,
    deleteMany: async ({ where }: { where: { id: string } }) => {
      const u = stale.find((x) => x.id === where.id);
      const co = companies.find((c) => c.id === u?.companyId);
      if (co) co.users -= 1;
      return { count: u ? 1 : 0 };
    },
  },
  company: { deleteMany: async ({ where }: { where: { id: string } }) => { let n; [companies, n] = remove(companies, (c) => c.id === where.id && c.users === 0); return { count: n }; } },
  betaInvite: { deleteMany: async ({ where }: { where: W }) => { let n; [betas, n] = remove(betas, (b) => matchBeta(b, where)); return { count: n }; } },
  feedback: { deleteMany: async ({ where }: { where: { handledAt: W } }) => { let n; [reports, n] = remove(reports, (r) => cmp(r.handledAt, where.handledAt)); return { count: n }; } },
  pendingRegistration: { deleteMany: async () => ({ count: 0 }) },
  invite: { deleteMany: async () => ({ count: 0 }) },
  session: { deleteMany: async () => ({ count: 0 }) },
};
// the array form of $transaction: the calls run in their order (the mocks run when made)
mock.module(src('lib/db.ts'), { namedExports: { prisma: { ...db, $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops) } } });
mock.module(src('lib/inactive.ts'), { namedExports: { purgeInactive: async () => ({ told: 0, deleted: 0 }) } });

const { purgeStale, feedbackCutoff, FEEDBACK_KEEP_MONTHS } = await import(src('lib/purge.ts'));
const { BETA_INVITE_KEEP_DAYS } = await import(src('lib/token-shape.ts'));
const DAY = 864e5;

test('beta invitations: unused ones go BETA_INVITE_KEEP_DAYS after their end, used ones once their company is gone; reports 24 months after handled', async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now });
  const ago = (days: number) => new Date(now - days * DAY);
  companies = [{ id: 'c-live', users: 1 }, { id: 'c-empty', users: 1 }];
  stale = [{ id: 'u-stale', companyId: 'c-empty' }];
  betas = [
    { id: 'waiting', usedAt: null, expiresAt: new Date(now + 5 * DAY), companyId: null },
    { id: 'expired-recently', usedAt: null, expiresAt: ago(BETA_INVITE_KEEP_DAYS - 1), companyId: null },
    { id: 'expired-long-ago', usedAt: null, expiresAt: ago(BETA_INVITE_KEEP_DAYS + 1), companyId: null },
    { id: 'used-live', usedAt: ago(100), expiresAt: ago(90), companyId: 'c-live' },
    { id: 'used-orphan', usedAt: ago(100), expiresAt: ago(90), companyId: null },
    { id: 'used-empty', usedAt: ago(100), expiresAt: ago(90), companyId: 'c-empty' },
  ];
  reports = [{ id: 'open', handledAt: null }, { id: 'handled-recently', handledAt: ago(30) }, { id: 'handled-long-ago', handledAt: ago(800) }];
  await purgeStale();
  assert.deepEqual(betas.map((b) => b.id), ['waiting', 'expired-recently', 'used-live']);
  assert.deepEqual(companies.map((c) => c.id), ['c-live'], 'the company left without users went, its invitation with it');
  assert.deepEqual(reports.map((r) => r.id), ['open', 'handled-recently']);
});

test('the reports’ cutoff is FEEDBACK_KEEP_MONTHS calendar months back', () => {
  assert.equal(FEEDBACK_KEEP_MONTHS, 24);
  assert.equal(feedbackCutoff(new Date('2029-03-15T10:00:00Z')).toISOString(), '2027-03-15T10:00:00.000Z');
});
