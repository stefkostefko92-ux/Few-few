// The rights matrix as the company edits it (round 42, src/lib/permissions.ts): every right in one group, a box that
// brings its prerequisites and takes its dependents, the input the server takes (a locked right is forged), a save that
// keeps only what differs from the default and lists every change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GRANTS, MATRIX_CAPABILITIES, capsOf, type MatrixCapability } from '../rbac';
import {
  MATRIX_ROLES, PERMISSION_GROUPS, changedRoles, columnChanges, columnsOf, defaultColumn, matrixText, permissionsInputSchema, planSave, standing, toggle,
  type Grants,
} from '../permissions';

const defaults = (): Grants => columnsOf([]);
const STAMP = 'a'.repeat(64);

test('ogni diritto della matrice in un gruppo, una volta sola, nei sette gruppi della decisione', () => {
  const rows = PERMISSION_GROUPS.flatMap((g) => g.rows);
  assert.deepEqual([...rows].sort(), [...MATRIX_CAPABILITIES].sort());
  assert.equal(new Set(rows).size, rows.length);
  assert.deepEqual(PERMISSION_GROUPS.map((g) => g.key), ['rilievi', 'impianti', 'calcolo', 'progetto', 'documenti', 'prezzi', 'azienda']);
  assert.deepEqual(MATRIX_ROLES, ['CHIEF_TECHNICIAN', 'ENGINEER', 'TECHNICIAN', 'SALES']);
  for (const r of MATRIX_ROLES) assert.deepEqual(defaults()[r], defaultColumn(r), r);
});

test('una casella: concedere porta i presupposti, togliere porta via ciò che ne dipende; le regole fisse non si muovono', () => {
  const sales = defaultColumn('SALES');
  assert.ok(!sales.includes('calc:create'));
  const noView = toggle(sales, 'SALES', 'projects:view', false);
  for (const c of ['projects:view', 'report:download'] as const) assert.ok(!noView.includes(c), c);
  assert.ok(noView.includes('rilievi:view') && noView.includes('prices:view'));
  const back = toggle(noView, 'SALES', 'calc:create', true);
  assert.ok(back.includes('calc:create') && back.includes('projects:view'), 'the view comes with the calculations');
  assert.deepEqual(toggle(sales, 'SALES', 'users:manage', true), sales, 'never given');
  assert.deepEqual(toggle(sales, 'SALES', 'company:export', true), sales, 'only the Capotecnico');
  assert.ok(toggle(defaultColumn('CHIEF_TECHNICIAN'), 'CHIEF_TECHNICIAN', 'company:export', true).includes('company:export'));
  assert.deepEqual(standing(['calc:create', 'rilievi:view']), ['rilievi:view'], 'a column sent by hand: the right without its view goes');
});

test('l’input: la versione, le quattro colonne, nessun diritto bloccato', () => {
  const ok = { companyId: 'c1', stamp: STAMP, grants: defaults() };
  assert.ok(permissionsInputSchema.safeParse(ok).success);
  for (const bad of [
    { ...ok, stamp: 'x' },
    { ...ok, grants: { ...ok.grants, SALES: [...ok.grants.SALES, 'users:manage'] } },
    { ...ok, grants: { ...ok.grants, ENGINEER: [...ok.grants.ENGINEER, 'company:export'] } },
    { ...ok, grants: { ...ok.grants, OWNER: [] } },
    { ...ok, grants: { ...ok.grants, TECHNICIAN: ['projects:delete'] } },
    { ...ok, companyId: 'c-1;drop' },
  ]) assert.equal(permissionsInputSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 120));
});

test('il salvataggio: solo le righe diverse dal predefinito, ogni cambio con prima e dopo', () => {
  const wanted = defaults();
  wanted.TECHNICIAN = wanted.TECHNICIAN.filter((c) => c !== 'calc:create');
  wanted.SALES = [...wanted.SALES, 'rilievi:edit'];
  const first = planSave([], wanted);
  assert.deepEqual(first.rows, [
    { role: 'TECHNICIAN', capability: 'calc:create', granted: false },
    { role: 'SALES', capability: 'rilievi:edit', granted: true },
  ]);
  assert.deepEqual(first.changes, [
    { role: 'TECHNICIAN', capability: 'calc:create', from: true, to: false },
    { role: 'SALES', capability: 'rilievi:edit', from: false, to: true },
  ]);
  // back to the default: no row left, the change listed
  const back = planSave(first.rows, defaults());
  assert.deepEqual(back.rows, []);
  assert.equal(back.changes.length, 2);
  assert.deepEqual(columnChanges(defaults(), wanted), first.changes);
  // the same matrix again: nothing changes
  assert.deepEqual(planSave(first.rows, wanted).changes, []);
  // a locked or unknown stored row never comes back as a row
  const stray = planSave([{ role: 'SALES', capability: 'users:manage', granted: true }, { role: 'OWNER', capability: 'calc:create', granted: false }], defaults());
  assert.deepEqual(stray, { rows: [], changes: [] });
  for (const r of first.rows) assert.notEqual(r.granted, DEFAULT_GRANTS[r.capability as MatrixCapability].includes(r.role as never));
});

test('la versione della matrice non dipende dall’ordine delle righe', () => {
  const a = [{ role: 'SALES' as const, capability: 'rilievi:edit', granted: true }, { role: 'TECHNICIAN' as const, capability: 'calc:create', granted: false }];
  assert.equal(matrixText(a), matrixText([...a].reverse()));
  assert.notEqual(matrixText(a), matrixText([{ ...a[0], granted: false }, a[1]]));
});

test('lo schermo mostra i diritti che il ruolo ha davvero: senza il presupposto la casella è vuota, e il salvataggio lo dice', () => {
  // rows stored by hand: the Tecnico loses the view of the installations, keeps (on paper) the calculations
  const stored = [{ role: 'TECHNICIAN' as const, capability: 'projects:view', granted: false }];
  const cols = columnsOf(stored);
  assert.ok(!cols.TECHNICIAN.includes('calc:create') && !cols.TECHNICIAN.includes('projects:view'));
  // the screen's column is what rbac.ts grants
  assert.deepEqual(new Set(cols.TECHNICIAN), new Set([...capsOf('TECHNICIAN', stored)].filter((c) => (MATRIX_CAPABILITIES as readonly string[]).includes(c))));
  // giving the view back from that screen: the dialog and the server list the same changes
  const wanted = { ...cols, TECHNICIAN: toggle(cols.TECHNICIAN, 'TECHNICIAN', 'projects:view', true) };
  assert.deepEqual(planSave(stored, wanted).changes, columnChanges(cols, wanted));
});

test('i ruoli che l’azienda ha cambiato rispetto al predefinito', () => {
  assert.deepEqual(changedRoles([]), []);
  assert.deepEqual(changedRoles([{ role: 'TECHNICIAN', capability: 'calc:create', granted: false }]), ['TECHNICIAN']);
  // a row that changes nothing (the default already) or that the rules ignore: not a change
  assert.deepEqual(changedRoles([{ role: 'SALES', capability: 'prices:view', granted: true }, { role: 'SALES', capability: 'users:manage', granted: true }]), []);
});
