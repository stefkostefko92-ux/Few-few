// The owner and four roles for the colleagues (Capotecnico, Progettista, Tecnico, Commerciale); rights by capability,
// from the default matrix approved on 2026-10-14 with the company's changes inside the hard rules (round 42); only the
// owner manages the colleagues and their rights; a company without a subscription after its trial reads but does not
// write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITIES, DEFAULT_GRANTS, MATRIX_CAPABILITIES, MEMBER_ROLES, REQUIRES, ROLES, assignableRoles, can, capsOf, editableRoles, formRightOf,
  grantable, holds, homeOf, isCapability, isRole, lockOf, matrixRightOf, outranks, remakes, type Capability, type MatrixCapability, type MemberRole,
  type Override,
} from '../rbac';

const T = 'OWNER' as const, C = 'CHIEF_TECHNICIAN' as const, P = 'ENGINEER' as const, TEC = 'TECHNICIAN' as const, S = 'SALES' as const;
/** The default matrix of the decision, row by row: who among the colleagues has the right (the owner always has it). */
const DECISION: Record<MatrixCapability, readonly MemberRole[]> = {
  'rilievi:view': [C, P, TEC, S], 'rilievi:edit': [C, P, TEC], 'rilievi:trash': [C, P], 'rilievi:trash-manage': [C],
  'projects:view': [C, P, TEC, S], 'impianti:create': [C, P, TEC], 'rilievi:link': [C, P, TEC], 'projects:edit': [C, P, TEC],
  'projects:archive': [C, P],
  'calc:create': [C, P, TEC], 'calc:review': [C, P],
  'progetto:edit': [C, P], 'drawings:issue': [C, P],
  'report:download': [C, P, TEC, S],
  'prices:view': [C, S], 'prices:edit': [],
  'audit:view': [C], 'users:manage': [], 'permissions:manage': [], 'billing:manage': [], 'company:edit': [], 'company:export': [],
};

test('i ruoli: titolare, quattro ruoli dei colleghi, piattaforma; Capotecnico tra i colleghi', () => {
  assert.deepEqual(ROLES, [T, C, P, TEC, S, 'SUPERADMIN']);
  assert.deepEqual(MEMBER_ROLES, [C, P, TEC, S]);
  assert.ok(isRole('CHIEF_TECHNICIAN') && isRole('OWNER') && isRole('SALES') && !isRole('VIEWER') && !isRole('ADMIN') && !isRole(7));
});

test('la matrice predefinita è esattamente quella della decisione, cella per cella', () => {
  assert.deepEqual(new Set(Object.keys(DECISION)), new Set(MATRIX_CAPABILITIES), 'every right of the matrix in the decision');
  for (const c of MATRIX_CAPABILITIES) {
    assert.deepEqual([...DEFAULT_GRANTS[c]].sort(), [...DECISION[c]].sort(), c);
    for (const r of MEMBER_ROLES) assert.equal(can(r, c), DECISION[c].includes(r as MemberRole), `${r} ${c}`);
    assert.ok(can(T, c), `the owner: ${c}`);
  }
  // the rights that follow another one: the calculations and designs with the installations, the update with the calculations
  for (const r of MEMBER_ROLES) {
    assert.equal(can(r, 'calc:view'), can(r, 'projects:view'), r);
    assert.equal(can(r, 'records:refresh'), can(r, 'calc:create'), r);
  }
  // the owner every right of the company; the platform above
  for (const c of CAPABILITIES) assert.equal(can(T, c), c !== 'platform:admin', c);
  for (const c of CAPABILITIES) assert.ok(can('SUPERADMIN', c), c);
});

test('regole fisse: il titolare ha sempre tutto; utenti, permessi, abbonamento e piattaforma mai ai colleghi; i dati dell’azienda solo al Capotecnico', () => {
  const everything: Override[] = MATRIX_CAPABILITIES.flatMap((c) => MEMBER_ROLES.map((r) => ({ role: r, capability: c, granted: true })));
  const nothing: Override[] = MATRIX_CAPABILITIES.flatMap((c) => [T, ...MEMBER_ROLES].map((r) => ({ role: r, capability: c, granted: false })));
  // the owner's column cannot be taken away
  assert.deepEqual(capsOf(T, nothing), capsOf(T));
  for (const r of MEMBER_ROLES) {
    const all = capsOf(r, everything);
    for (const c of ['users:manage', 'permissions:manage', 'billing:manage', 'platform:admin'] as const) {
      assert.ok(!all.has(c), `${r} never ${c}`);
      assert.equal(lockOf(r, c), 'never');
    }
    for (const c of ['company:edit', 'company:export'] as const) {
      assert.equal(all.has(c), r === C, `${r} ${c}`);
      assert.equal(grantable(r, c), r === C, `${r} ${c}`);
    }
    // everything else the company may give
    for (const c of MATRIX_CAPABILITIES) if (lockOf(r, c) === null) assert.ok(all.has(c), `${r} ${c}`);
  }
  assert.equal(lockOf(T, 'calc:create'), 'owner');
  assert.equal(lockOf('SUPERADMIN', 'calc:create'), 'platform');
  // a stored right the code does not know is ignored
  assert.deepEqual(capsOf(S, [{ role: S, capability: 'projects:delete', granted: true }]), capsOf(S));
});

test('le modifiche dell’azienda: concedere e togliere per ruolo, solo per quel ruolo', () => {
  const tec = capsOf(TEC, [{ role: TEC, capability: 'calc:create', granted: false }, { role: TEC, capability: 'progetto:edit', granted: true }]);
  assert.ok(!tec.has('calc:create') && !tec.has('records:refresh'), 'the Tecnico no longer calculates (nor updates records)');
  assert.ok(tec.has('progetto:edit') && tec.has('projects:view'), 'the Tecnico draws the project');
  assert.ok(capsOf(P, [{ role: TEC, capability: 'calc:create', granted: false }]).has('calc:create'), 'another role is untouched');
  const p = { role: TEC, caps: tec } as const;
  assert.ok(!can(p, 'calc:create') && can(p, 'progetto:edit') && can(TEC, 'calc:create'));
});

test('un diritto senza il suo presupposto non vale: senza vedere gli impianti niente lavoro sugli impianti', () => {
  for (const [c, req] of Object.entries(REQUIRES) as [MatrixCapability, MatrixCapability[]][]) {
    for (const r of req) assert.equal(REQUIRES[r], undefined, `${r}, prerequisite of ${c}, stands on nothing`);
  }
  const noView = capsOf(P, [{ role: P, capability: 'projects:view', granted: false }]);
  for (const c of ['projects:view', 'calc:view', 'impianti:create', 'projects:edit', 'calc:create', 'records:refresh', 'progetto:edit', 'drawings:issue',
    'report:download', 'rilievi:link'] as Capability[]) assert.ok(!noView.has(c), c);
  assert.ok(noView.has('rilievi:edit'), 'the survey sheets stay');
  assert.equal(homeOf({ role: P, caps: noView }), '/app/rilievi');
  const nothing = capsOf(S, [{ role: S, capability: 'projects:view', granted: false }, { role: S, capability: 'rilievi:view', granted: false }]);
  assert.equal(homeOf({ role: S, caps: nothing }), '/app/account');
  assert.equal(homeOf(S), '/app');
  // the price list stands on seeing the prices
  assert.ok(!capsOf(C, [{ role: C, capability: 'prices:edit', granted: true }, { role: C, capability: 'prices:view', granted: false }]).has('prices:edit'));
});

test('senza abbonamento dopo la prova: si legge, si scarica, si gestiscono colleghi e permessi e si paga, non si scrive', () => {
  const ro = (role: typeof T | typeof C | typeof TEC) => ({ role, readOnly: true });
  assert.ok(can(ro(T), 'projects:view') && can(ro(T), 'report:download') && can(ro(T), 'billing:manage'));
  assert.ok(can(ro(T), 'users:manage') && can(ro(T), 'permissions:manage') && can(ro(T), 'prices:view'));
  // the company's data leave it also read-only (terms of use, «exit»), the logo does not change
  assert.ok(can(ro(T), 'company:export') && !can(ro(T), 'company:edit'));
  for (const c of ['impianti:create', 'rilievi:link', 'projects:edit', 'projects:archive', 'calc:create', 'calc:review', 'progetto:edit', 'drawings:issue',
    'prices:edit', 'rilievi:edit', 'rilievi:trash', 'rilievi:trash-manage'] as const) {
    assert.ok(!can(ro(T), c) && !can(ro(C), c) && !can(ro(TEC), c), c);
  }
  assert.ok(can({ role: TEC, readOnly: false }, 'calc:create'));
  // a record the engines no longer reproduce is made again from what was entered, so its documents are downloaded also
  // read-only (terms art. 10); the Commerciale, who makes no records, does not
  assert.ok(can(ro(T), 'records:refresh') && can(ro(TEC), 'records:refresh') && !can(S, 'records:refresh'));
  // the overrides do not lift read-only: a right given by the company is still a write
  assert.ok(!can({ role: S, readOnly: true, caps: capsOf(S, [{ role: S, capability: 'calc:create', granted: true }]) }, 'calc:create'));
});

test('solo il titolare gestisce colleghi e permessi, dei quattro ruoli; mai un ruolo al suo livello o sopra', () => {
  assert.ok(outranks(T, TEC) && outranks(T, C) && !outranks(T, T) && outranks('SUPERADMIN', T));
  assert.ok(!outranks(C, TEC) && !outranks(P, TEC) && !outranks(TEC, S));
  assert.deepEqual(assignableRoles(T), [C, P, TEC, S]);
  assert.deepEqual(assignableRoles('SUPERADMIN'), [C, P, TEC, S]);
  for (const r of MEMBER_ROLES) assert.deepEqual(assignableRoles(r), [], r);
  assert.deepEqual(editableRoles(T), [C, P, TEC, S]);
  assert.deepEqual(editableRoles('SUPERADMIN'), [C, P, TEC, S]);
  for (const r of MEMBER_ROLES) assert.deepEqual(editableRoles(r), [], r);
  // whatever a company stores, a colleague never manages the rights
  const all = MATRIX_CAPABILITIES.map((c) => ({ role: C, capability: c, granted: true }));
  assert.deepEqual(editableRoles({ role: C, caps: capsOf(C, all) }), []);
});

test('Rilievi: tutti vedono; compilano tutti tranne il Commerciale; cestino a Progettista e sopra, gestione del cestino al Capotecnico e al titolare', () => {
  for (const r of [T, C, P, TEC, S, 'SUPERADMIN'] as const) assert.ok(can(r, 'rilievi:view'), r);
  for (const r of [T, C, P, TEC, 'SUPERADMIN'] as const) assert.ok(can(r, 'rilievi:edit'), r);
  assert.ok(!can(S, 'rilievi:edit'));
  assert.ok(can(P, 'rilievi:trash') && can(C, 'rilievi:trash') && can(T, 'rilievi:trash') && !can(S, 'rilievi:trash') && !can(TEC, 'rilievi:trash'));
  assert.ok(can(C, 'rilievi:trash-manage') && can(T, 'rilievi:trash-manage') && can('SUPERADMIN', 'rilievi:trash-manage'));
  for (const r of [P, TEC, S] as const) assert.ok(!can(r, 'rilievi:trash-manage'), r);
  // read-only: view only
  for (const r of [T, C, P, TEC] as const) {
    const ro = { role: r, readOnly: true };
    assert.ok(can(ro, 'rilievi:view'), r);
    assert.ok(!can(ro, 'rilievi:edit') && !can(ro, 'rilievi:trash') && !can(ro, 'rilievi:trash-manage'), r);
  }
});

test('rifare un record col software attuale: il calcolo chi fa i calcoli; il progetto dell’impianto e il locale macchina solo chi disegna il progetto, anche in sola lettura', () => {
  // the default matrix: the Tecnico makes the calculations, does not draw the project
  assert.ok(remakes(TEC, 'calc') && !remakes(TEC, 'lift') && !remakes(TEC, 'room'));
  for (const r of [T, C, P, 'SUPERADMIN'] as const) assert.ok(remakes(r, 'calc') && remakes(r, 'lift') && remakes(r, 'room'), r);
  assert.ok(!remakes(S, 'calc') && !remakes(S, 'lift'));
  // read-only: still made again (terms art. 10) by a role that holds the rights, though progetto:edit itself is a write
  const ro = { role: P, readOnly: true };
  assert.ok(!can(ro, 'progetto:edit') && holds(ro, 'progetto:edit') && remakes(ro, 'lift') && remakes(ro, 'room'));
  // the company keeps the calculations of a Progettista and takes the project away: the calculation only
  const noDraw = { role: P, caps: capsOf(P, [{ role: P, capability: 'progetto:edit', granted: false }]) };
  assert.ok(remakes(noDraw, 'calc') && !remakes(noDraw, 'lift') && !remakes(noDraw, 'room'));
  // and a Tecnico given the project draws it again too
  const draws = { role: TEC, caps: capsOf(TEC, [{ role: TEC, capability: 'progetto:edit', granted: true }]) };
  assert.ok(remakes(draws, 'lift') && remakes(draws, 'room'));
});

test('il modulo di ogni tipo d’impianto e la riga della matrice di ogni diritto', () => {
  assert.equal(formRightOf('REPLACEMENT'), 'calc:create');
  assert.equal(formRightOf('FULL'), 'progetto:edit');
  // a Tecnico creates both kinds, fills the replacement's calculator only
  assert.ok(can(TEC, 'impianti:create') && can(TEC, formRightOf('REPLACEMENT')) && !can(TEC, formRightOf('FULL')));
  // the derived rights come from their row; the platform's has none
  assert.equal(matrixRightOf('calc:view'), 'projects:view');
  assert.equal(matrixRightOf('records:refresh'), 'calc:create');
  assert.equal(matrixRightOf('progetto:edit'), 'progetto:edit');
  assert.equal(matrixRightOf('platform:admin'), null);
  assert.ok(isCapability('calc:create') && !isCapability('calc:delete') && !isCapability(undefined));
});
