import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hasKey, LOCALES, translatorFor } from '../src/i18n.js';
import { viewHelpers } from '../src/http/view.js';
import { ROOT } from '../src/paths.js';
import { auditLine, type AuditPeople, type AuditRow } from '../src/services/admin-audit-view.js';
import { auditActionId, auditDetail } from '../src/services/audit-detail.js';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const t = translatorFor('bg');
const fmt = viewHelpers('bg');
const format = { t, date: (d: Date) => fmt.date(d), projectName: () => null };

test('every audit action the server writes has words in the panel, in every language', () => {
  const codes = new Set<string>();
  for (const file of files(join(ROOT, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\baction:\s*'([a-zA-Z]+\.[\w.]+)'/g))
      codes.add(match[1]!);
  }
  assert.ok(codes.size > 30, `only ${codes.size} actions found — the scan no longer sees the code`);
  const missing = [...codes].flatMap((code) =>
    LOCALES.filter((locale) => !hasKey(locale, `admin.audit.act.${auditActionId(code)}`)).map(
      (locale) => `${locale}: ${code}`,
    ),
  );
  assert.deepEqual(missing, []);
});

test('the details read as text, not as JSON', () => {
  const plan = auditDetail(
    'admin.plan.changed',
    {
      from: 'TRIAL',
      to: 'PREMIUM',
      until: '2027-11-08T07:03:16.114Z',
      months: 12,
      request: 'cmv0x',
    },
    format,
  );
  assert.deepEqual(plan, [
    'Тестов период → Premium',
    '12 месеца',
    'до 8 ноември 2027 г.',
    'по поръчка',
  ]);
  const order = auditDetail(
    'plan.request.created',
    { option: 'm12', buyer: 'CONSUMER', earlyStart: true, terms: '2026-10-09', replaced: ['a'] },
    format,
  );
  assert.deepEqual(order, [
    '12 месеца',
    'потребител',
    'ранно начало',
    'заменя 1 поръчка',
    'условия от 9 октомври 2026 г.',
  ]);
  assert.deepEqual(auditDetail('admin.sessions.revoked', { count: 3 }, format), ['3 сесии']);
  for (const parts of [plan, order]) for (const part of parts) assert.doesNotMatch(part, /[{}"]/);
});

test('a field no reader knows stays visible, and nothing is shown for an empty detail', () => {
  assert.deepEqual(auditDetail('admin.account.banned', { reason: 'спам', extra: 7 }, format), [
    'причина: „спам“',
    'extra: 7',
  ]);
  assert.deepEqual(auditDetail('some.new.action', { a: 'b' }, format), ['a: b']);
  assert.deepEqual(auditDetail('auth.login', null, format), []);
  assert.deepEqual(auditDetail('auth.login', ['x'], format), []);
});

const row = (over: Partial<AuditRow>): AuditRow => ({
  id: 1,
  at: new Date('2026-10-09T10:00:00Z'),
  actorType: 'HUMAN',
  actorId: 'staff1',
  actorLabel: 'Мария',
  action: 'admin.account.banned',
  targetType: 'user',
  targetId: 'cust1',
  detail: null,
  ip: '127.0.0.1',
  ...over,
});

const people: AuditPeople = {
  emails: new Map([
    ['staff1', 'maria@example.test'],
    ['cust1', 'ivan@example.test'],
  ]),
  requests: new Map([['req1', 'cust1']]),
  projects: new Map([['prj1', { name: 'Кухня', userId: 'cust1' }]]),
};

test('the panel shows e-mails instead of ids, and a deleted account as such', () => {
  const line = auditLine(row({}), people, t, fmt);
  assert.equal(line.label, 'Блокиран акаунт');
  assert.equal(line.code, 'admin.account.banned');
  assert.deepEqual(line.actor, { text: 'Мария', href: '/admin/accounts/staff1' });
  assert.deepEqual(line.target, { text: 'ivan@example.test', href: '/admin/accounts/cust1' });

  const customer = auditLine(
    row({ actorId: 'cust1', actorLabel: '@customer:cust1', action: 'auth.login' }),
    people,
    t,
    fmt,
  );
  assert.deepEqual(customer.actor, { text: 'ivan@example.test', href: '/admin/accounts/cust1' });
  assert.deepEqual(customer.target, { text: 'собственият акаунт' });

  const gone = auditLine(
    row({ actorId: 'cmvgone0001', actorLabel: '@customer:cmvgone0001', targetId: 'cmvgone0001' }),
    people,
    t,
    fmt,
  );
  assert.equal(gone.actor.kind, 'изтрит акаунт');
  assert.equal(gone.actor.text, 'cmvgone0…');
  assert.equal(gone.actor.title, 'cmvgone0001');

  const order = auditLine(row({ targetType: 'request', targetId: 'req1' }), people, t, fmt);
  assert.deepEqual(order.target, {
    kind: 'поръчка',
    text: 'ivan@example.test',
    href: '/admin/accounts/cust1',
  });
  const project = auditLine(row({ targetType: 'project', targetId: 'prj1' }), people, t, fmt);
  assert.equal(project.target?.kind, 'проект „Кухня“');

  const unknown = auditLine(row({ action: 'brand.new.thing' }), people, t, fmt);
  assert.equal(unknown.label, 'brand.new.thing', 'an action without words is shown as written');
});
