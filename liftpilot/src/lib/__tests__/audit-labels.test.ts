// The activity log (/app/audit) shows each row by its words in messages/it.json (audit.actions, audit.entities); a
// missing one shows the bare code. Every action the type allows (src/lib/audit.ts) and every action or entity written
// anywhere — the server's audit() calls, and the scripts that write the log directly (npm run engine:notice,
// npm run legal:notice) — has its Italian label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import it from '../../../messages/it.json';

const root = new URL('../../../', import.meta.url).pathname;
const actions: Record<string, string> = it.audit.actions, entities: Record<string, string> = it.audit.entities;

/** The source files under `dir` (the tests aside: their rows are made up). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(p);
    return /\.(ts|tsx|mjs)$/.test(name) ? [p] : [];
  });
}
const code = [...sources(join(root, 'src')), ...sources(join(root, 'scripts'))].map((p) => readFileSync(p, 'utf8')).join('\n');
const found = (re: RegExp): string[] => [...new Set([...code.matchAll(re)].map((m) => m[1] ?? ''))];

test('registro attività: ogni azione del tipo AuditAction ha la sua etichetta', () => {
  const type = /export type AuditAction =([^;]+);/.exec(readFileSync(join(root, 'src/lib/audit.ts'), 'utf8'))?.[1] ?? '';
  const all = [...type.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1] ?? '');
  assert.ok(all.length > 50, 'the union read');
  for (const a of all) assert.ok(actions[a], `audit.actions.${a}`);
});

test('registro attività: ogni azione e oggetto scritti nel codice e negli script hanno la loro etichetta', () => {
  const written = found(/\baction: (?:[a-z]+ \? )?'([A-Z_]+)'/g);
  const alternatives = found(/\baction: [a-z]+ \? '[A-Z_]+' : '([A-Z_]+)'/g);
  // round 48: the beta invitations, the reports, the engine's notice
  for (const a of ['BETA_INVITE_SENT', 'BETA_INVITE_RESENT', 'BETA_INVITE_REVOKED', 'FEEDBACK_SENT', 'FEEDBACK_HANDLED', 'FEEDBACK_REOPENED', 'ENGINE_NOTICE_SENT']) {
    assert.ok([...written, ...alternatives].includes(a), `${a} written somewhere`);
  }
  for (const a of [...written, ...alternatives]) assert.ok(actions[a], `audit.actions.${a}`);
  const objects = found(/\bentity: '([A-Za-z]+)'/g);
  assert.ok(objects.includes('BetaInvite') && objects.includes('Feedback'), 'the entities read');
  for (const e of objects) assert.ok(entities[e], `audit.entities.${e}`);
});
