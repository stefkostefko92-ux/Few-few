import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { TICKET_AUDIT_ACTION } from '../src/services/tickets/events.js';

/**
 * Всяко действие, което сървърът пише в одита, има етикет в конзолата (`admin.audit.action.*`,
 * паритетът на трите езика е в `i18n-parity.test.ts`) и група във филтъра (`GROUPS` в
 * `public/app/admin/audit.js`). Действията се четат от извикванията на `appendAudit` в `src/`;
 * изчислено име (шаблон, речник) трябва да е изброено тук — ново такова = червен тест.
 */

const ROOT = join(import.meta.dirname, '..');

/** Изчислените имена и какво дават (типовете `Action` в съответните модули). */
const LIFECYCLE = ['submit', 'reject', 'publish', 'deprecate', 'restore'];
const DYNAMIC: Record<string, string[]> = {
  'TICKET_AUDIT_ACTION[e.type]': Object.values(TICKET_AUDIT_ACTION),
  '`kb.document.${action}`': LIFECYCLE.map((a) => `kb.document.${a}`),
  '`kb.error.${action}`': LIFECYCLE.map((a) => `kb.error.${a}`),
  '`proposal.${t.action}`': ['review', 'accept', 'reject'].map((a) => `proposal.${a}`),
  '`user.bulk.${action}`': ['deactivate', 'activate', 'revoke_sessions', 'set_expiry'].map(
    (a) => `user.bulk.${a}`,
  ),
  // routes/quick-responses.ts: `audit(req, '<действие>', …)` → `action` от параметъра.
  action: [],
};

function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function auditActions(): { actions: Set<string>; unknown: string[] } {
  const actions = new Set<string>();
  const unknown: string[] = [];
  for (const file of sources(join(ROOT, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const call of src.matchAll(/appendAudit\(/g)) {
      const chunk = src.slice(call.index, call.index + 600);
      const m = /\baction(?::\s*([^,\n]+(?:\n\s*[?:][^,\n]+)*))?,/.exec(chunk);
      const expr = (m?.[1] ?? 'action').trim();
      const literals = [...expr.matchAll(/'([a-z_.]+)'/g)].map((l) => l[1] ?? '');
      if (literals.length > 0) for (const l of literals) actions.add(l);
      else if (expr in DYNAMIC) for (const a of DYNAMIC[expr] ?? []) actions.add(a);
      else unknown.push(`${file.slice(ROOT.length + 1)}: ${expr}`);
    }
    // Помощници, които подават името като литерал: `audit(req, 'quick_response.create', …)`.
    for (const m of src.matchAll(/\baudit\(req, '([a-z_]+\.[a-z_.]+)'/g)) actions.add(m[1] ?? '');
  }
  return { actions, unknown };
}

const it = JSON.parse(readFileSync(join(ROOT, 'public', 'i18n', 'it.json'), 'utf8')) as Record<
  string,
  string
>;
const groups = (() => {
  const js = readFileSync(join(ROOT, 'public', 'app', 'admin', 'audit.js'), 'utf8');
  const block = /const GROUPS = \[([\s\S]*?)\];/.exec(js)?.[1] ?? '';
  return [...block.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1] ?? '');
})();

describe('одитните действия в конзолата', () => {
  const { actions, unknown } = auditActions();

  test('всяко изчислено име е изброено (иначе не знаем какво пише сървърът)', () => {
    assert.deepEqual(unknown, []);
    assert.ok(actions.size > 60, `намерени ${actions.size}`);
  });

  test('всяко действие има етикет и група във филтъра', () => {
    const noLabel = [...actions].filter((a) => !(`admin.audit.action.${a}` in it)).sort();
    assert.deepEqual(noLabel, [], 'липсва admin.audit.action.<действие>');
    const noGroup = [...actions].filter((a) => !groups.some((g) => a.startsWith(g))).sort();
    assert.deepEqual(noGroup, [], 'липсва група в GROUPS');
    for (const g of groups) assert.ok(`admin.audit.group.${g}` in it, `admin.audit.group.${g}`);
  });
});
