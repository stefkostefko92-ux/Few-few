// «Segnala un problema» (round 48) over an in-memory database: only a signed-in user sends (an expired session keeps the
// text on screen), read-only companies too; the company and the user are the session's, never the form's; the kind, the
// message (≤ 4000), the page (a path of ours) and the code are checked; 10 an hour per person; the activity log and the
// administrators' e-mail carry the kind, never the text; only the platform's administrator marks a report handled.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

interface Row { id: string; companyId: string; userId: string | null; kind: string; page: string; digest: string | null; message: string; handledAt: Date | null }
let rows: Row[] = [];
const audits: { companyId: string | null; userId: string | null; action: string; entity: string; entityId?: string | null; meta?: unknown }[] = [];
const mails: { to: string; kind: string; type?: string }[] = [];
const waiting: Promise<unknown>[] = [];
let user: Record<string, unknown> | null = null;
const admins = [{ email: 'admin@carbonstealth.eu', role: 'SUPERADMIN', active: true }, { email: 'vecchio@carbonstealth.eu', role: 'SUPERADMIN', active: false },
  { email: 'titolare@ditta.example', role: 'OWNER', active: true }];

const db = {
  feedback: {
    create: async ({ data }: { data: Omit<Row, 'id' | 'handledAt'> }) => { const r = { ...data, id: `f${rows.length + 1}`, handledAt: null }; rows.push(r); return { id: r.id }; },
    updateMany: async ({ where, data }: { where: { id: string; handledAt: null | { not: null } }; data: { handledAt: Date | null } }) => {
      const r = rows.find((x) => x.id === where.id && (where.handledAt === null ? x.handledAt === null : x.handledAt !== null));
      if (r) r.handledAt = data.handledAt;
      return { count: r ? 1 : 0 };
    },
  },
  user: {
    findMany: async ({ where }: { where: { role: string; active: boolean } }) =>
      admins.filter((a) => a.role === where.role && a.active === where.active).map((a) => ({ email: a.email })),
  },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: db } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: (typeof audits)[number]) => { audits.push(a); } } });
mock.module(src('lib/mail.ts'), { namedExports: { mailConfigured: () => true } });
mock.module(src('lib/account-mail.ts'), { namedExports: { mailAccount: (to: string, _l: string, m: { kind: string; type?: string }) => { mails.push({ to, ...m }); } } });
mock.module(pkg('next/server'), { namedExports: { after: (fn: () => unknown) => { waiting.push(Promise.resolve().then(fn)); } } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });

const { sendFeedbackAction, setFeedbackHandledAction } = await import(src('server/feedback-actions.ts'));
const { capsOf } = await import(src('lib/rbac.ts'));

function as(id: string, role: string, companyId = 'c1', readOnly = false): void {
  user = { id, email: `${id}@ditta.example`, name: id, role, locale: 'it', companyId, companyName: 'Ditta', mustChangePassword: false, readOnly, caps: capsOf(role as 'OWNER') };
}
const form = (fields: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const REPORT = { kind: 'BUG', message: 'Il salvataggio della scheda non riesce\ndal vano scala.', page: '/it/app/rilievi/nuovo', digest: '2481632' };
async function send(fields: Record<string, string>) {
  const answer = await sendFeedbackAction({ status: 'idle' }, form(fields));
  await Promise.all(waiting.splice(0));
  return answer;
}
function reset(): void { rows = []; audits.length = 0; mails.length = 0; }

test('la sessione scaduta: niente salvato, il testo torna nel modulo', async () => {
  reset();
  user = null;
  assert.deepEqual(await send(REPORT), { status: 'error', error: 'sessionExpired', values: { kind: 'BUG', message: REPORT.message } });
  assert.equal(rows.length + audits.length + mails.length, 0);
});

test('una segnalazione: azienda e utente dalla sessione, mai dal modulo; pagina senza lingua; registro ed e-mail senza il testo', async () => {
  reset();
  as('u-tec', 'TECHNICIAN', 'c1', true); // a company in read-only mode reports too
  assert.deepEqual(await send({ ...REPORT, companyId: 'c2', userId: 'u-altro' }), { status: 'sent' });
  assert.deepEqual(rows, [{ id: 'f1', companyId: 'c1', userId: 'u-tec', kind: 'BUG', page: '/app/rilievi/nuovo', digest: '2481632', message: REPORT.message.trim(), handledAt: null }]);
  assert.deepEqual(audits, [{ companyId: 'c1', userId: 'u-tec', action: 'FEEDBACK_SENT', entity: 'Feedback', entityId: 'f1', meta: { kind: 'BUG' } }]);
  // every active platform administrator, and nobody else; the type, never the text
  assert.deepEqual(mails, [{ to: 'admin@carbonstealth.eu', kind: 'feedback', type: 'BUG' }]);
  // the e-mail's words (the type and the link, nothing typed): src/lib/__tests__/feedback.test.ts
  // the code of the error page is optional; a code that is no code is dropped
  assert.deepEqual(await send({ kind: 'QUESTION', message: 'Come si emette una revisione?', page: '/app', digest: '' }), { status: 'sent' });
  assert.deepEqual(await send({ kind: 'IDEA', message: 'Idea', page: '/app', digest: '<script>' }), { status: 'sent' });
  assert.deepEqual(rows.map((r) => [r.kind, r.page, r.digest]), [['BUG', '/app/rilievi/nuovo', '2481632'], ['QUESTION', '/app', null], ['IDEA', '/app', null]]);
});

test('la verifica: tipo, messaggio (≤ 4000), pagina nostra; il testo resta nel modulo', async () => {
  reset();
  as('u-check', 'SALES');
  const invalid = async (fields: Record<string, string>, field: string) => {
    const r = await send(fields);
    assert.equal(r.status, 'error');
    assert.ok(r.status === 'error' && r.error === 'invalid' && r.fields?.includes(field), `${field}: ${JSON.stringify(r)}`);
    assert.ok(r.status === 'error' && r.values?.message === (fields.message ?? ''), 'the text comes back');
  };
  await invalid({ ...REPORT, message: '   ' }, 'message');
  await invalid({ ...REPORT, message: 'x'.repeat(4001) }, 'message');
  await invalid({ ...REPORT, kind: 'SPAM' }, 'kind');
  for (const page of ['https://altro.example/x', '//altro.example', 'javascript:alert(1)', '/app/../../etc', '/app/%2e%2e']) await invalid({ ...REPORT, page }, 'page');
  assert.equal((await send({ ...REPORT, message: 'x'.repeat(4000), page: '/it/app/impianti?q=segreto#x' })).status, 'sent');
  assert.equal(rows[0]?.page, '/app/impianti', 'the path only: no query, no fragment, no locale');
  assert.equal(rows.length, 1, 'nothing stored for the refused ones');
});

test('al massimo 10 segnalazioni l’ora per persona', async () => {
  reset();
  as('u-rate', 'ENGINEER');
  for (let i = 0; i < 10; i++) assert.equal((await send(REPORT)).status, 'sent');
  assert.deepEqual(await send(REPORT), { status: 'error', error: 'rateLimited', values: { kind: 'BUG', message: REPORT.message } });
  as('u-rate-2', 'ENGINEER');
  assert.equal((await send(REPORT)).status, 'sent', 'another person has his own count');
  assert.equal(rows.length, 11);
});

test('«Segna come gestita» e «Riapri»: solo l’amministratore della piattaforma', async () => {
  reset();
  as('u-own', 'OWNER');
  await send(REPORT);
  await setFeedbackHandledAction(form({ id: 'f1', handled: '1', locale: 'it' }));
  assert.equal(rows[0]?.handledAt, null, 'the owner of a company cannot');
  assert.ok(!capsOf('OWNER').has('platform:admin') && capsOf('SUPERADMIN').has('platform:admin'), 'the admin page’s gate');
  as('u-admin', 'SUPERADMIN', 'c-platform');
  await setFeedbackHandledAction(form({ id: 'f1', handled: '1', locale: 'it' }));
  assert.ok((rows[0]?.handledAt as unknown) instanceof Date);
  await setFeedbackHandledAction(form({ id: 'f1', handled: '1', locale: 'it' }));
  await setFeedbackHandledAction(form({ id: 'f1', handled: '0', locale: 'it' }));
  assert.equal(rows[0]?.handledAt, null);
  assert.deepEqual(audits.slice(1).map((a) => [a.action, a.companyId, a.entityId, a.meta]), [
    ['FEEDBACK_HANDLED', 'c-platform', 'f1', undefined], ['FEEDBACK_REOPENED', 'c-platform', 'f1', undefined],
  ], 'one row per change, none for a repeated press, never the text');
  await setFeedbackHandledAction(form({ id: '../f1', handled: '1', locale: 'it' }));
  assert.equal(rows[0]?.handledAt, null, 'a forged id is nothing');
});
