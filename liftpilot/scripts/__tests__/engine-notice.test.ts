// Round 48 (scripts/engine-notice.ts): the pure part of the engine correction notice — what counts as a changed
// result (the verdict, the counts, the checks that are or were a finding; not a new version, not a new «info» line),
// the grouping by company with its saved works and installations, the arguments (no --send without --motivo, no
// unknown argument) and the key a company is told once for — and the recomputation of a record that does not read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byCompany, changeOf, checkMap, describe, noticeKey, parseArgs, storedChecks, type Changed, type Outcome } from '../engine-diff';
import { calcNow, liftNow, roomNow, shaftNow } from '../engine-records';

const out = (verdict: Outcome['verdict'], fails: number, warns: number, checks: Record<string, string> | null): Outcome => ({ verdict, fails, warns, checks });

test('checkMap: id → stato; un id ripetuto si distingue per ordine', () => {
  assert.deepEqual(checkMap([{ id: 'a', status: 'ok' }, { id: 'b', status: 'warn' }, { id: 'a', status: 'fail' }]), { a: 'ok', b: 'warn', 'a#2': 'fail' });
});

test('storedChecks: calcolo da results.res.checks, vano e locale da results.checks, progetto nessuno, illeggibile null', () => {
  assert.deepEqual(storedChecks('calc', { res: { checks: [{ id: 'fr_brake', status: 'ok', value: 1 }] }, sens: [] }), { fr_brake: 'ok' });
  assert.deepEqual(storedChecks('shaft', { checks: [{ id: 'p_toe', status: 'warn', limit: 2 }] }), { p_toe: 'warn' });
  assert.deepEqual(storedChecks('room', { checks: [{ id: 'm_route', status: 'fail' }] }), { m_route: 'fail' });
  assert.equal(storedChecks('lift', { checks: [{ id: 'x', status: 'ok' }] }), null);
  assert.equal(storedChecks('calc', { checks: [] }), null);
  assert.equal(storedChecks('shaft', null), null);
});

test('changeOf: stesso esito → nessun cambio, anche con una versione nuova', () => {
  assert.equal(changeOf(out('WARN', 0, 1, { a: 'ok', b: 'warn' }), out('WARN', 0, 1, { a: 'ok', b: 'warn' })), null);
});

test('changeOf: una verifica nuova «info»/«ok», o ok ↔ info, non è un cambio del risultato', () => {
  assert.equal(changeOf(out('OK', 0, 0, { a: 'ok' }), out('OK', 0, 0, { a: 'info', g_press: 'info', s_fa: 'ok' })), null);
  assert.equal(changeOf(out('OK', 0, 0, { a: 'ok', old: 'info' }), out('OK', 0, 0, { a: 'ok' })), null);
});

test('changeOf: una verifica che è o era un rilievo (fail/warn) cambia, con l’esito e i conteggi', () => {
  const c = changeOf(out('OK', 0, 0, { a: 'ok' }), out('WARN', 0, 2, { a: 'warn', p_toe: 'warn' }));
  assert.ok(c);
  assert.deepEqual(c.verdict, { from: 'OK', to: 'WARN' });
  assert.deepEqual(c.counts, { fails: [0, 0], warns: [0, 2] });
  assert.deepEqual(c.checks, [{ id: 'a', from: 'ok', to: 'warn' }, { id: 'p_toe', from: null, to: 'warn' }]);
  assert.equal(describe(c), 'OK→WARN; warns 0→2; a ok→warn, p_toe —→warn');
  const gone = changeOf(out('FAIL', 1, 0, { d_mp: 'fail' }), out('OK', 0, 0, {}));
  assert.deepEqual(gone?.checks, [{ id: 'd_mp', from: 'fail', to: null }]);
});

test('changeOf: senza le verifiche salvate (progetto dell’impianto) contano esito e conteggi', () => {
  assert.equal(changeOf(out('WARN', 0, 2, null), out('WARN', 0, 2, null)), null);
  const c = changeOf(out('WARN', 0, 2, null), out('WARN', 0, 4, { x: 'warn' }));
  assert.equal(c?.verdict, null);
  assert.deepEqual(c?.checks, []);
  assert.equal(describe(c ?? assert.fail()), 'warns 2→4');
});

test('changeOf: un ingresso rifiutato dai motori attuali è un cambio', () => {
  const c = changeOf(out('OK', 0, 0, {}), { refused: 'inputs refused: L0, rinvio' });
  assert.equal(c?.refused, 'inputs refused: L0, rinvio');
  assert.equal(describe(c ?? assert.fail()), 'refused: inputs refused: L0, rinvio');
});

test('byCompany: un elaborato per proprietario (calcolo e vano di un progetto = il progetto), impianti distinti', () => {
  const ch = changeOf(out('OK', 0, 0, null), { refused: 'x' }) ?? assert.fail();
  const row = (id: string, owner: string, companyId: string, projectId: string): Changed => ({ kind: 'calc', id, owner, companyId, projectId, project: projectId, change: ch });
  const g = byCompany([row('c1', 'lift:L1', 'A', 'p1'), row('s1', 'lift:L1', 'A', 'p1'), row('c2', 'calc:c2', 'A', 'p2'), row('r1', 'room:r1', 'B', 'p3')]);
  assert.deepEqual(g.map((x) => [x.companyId, x.records.length, x.elaborati, x.impianti]), [['A', 3, 2, 2], ['B', 1, 1, 1]]);
});

test('noticeKey: le quattro versioni, una per riga del registro', () => {
  assert.equal(noticeKey({ calc: '1.8.0', lift: '1.33.0', room: '1.17.0', shaft: '2.27.0' }), 'calc 1.8.0 · lift 1.33.0 · room 1.17.0 · shaft 2.27.0');
  assert.notEqual(noticeKey({ calc: '1.8.0', lift: '1.33.0', room: '1.17.0', shaft: '2.27.0' }), noticeKey({ calc: '1.8.0', lift: '1.34.0', room: '1.17.0', shaft: '2.27.0' }));
});

test('parseArgs: elenco senza argomenti; --send solo con --motivo; il motivo su una riga, 10–600 caratteri', () => {
  assert.deepEqual(parseArgs([]), { ok: true, send: false, motivo: null });
  assert.equal(parseArgs(['--send']).ok, false);
  assert.deepEqual(parseArgs(['--send', '--motivo', '  Corretta la verifica\n del freno  ']), { ok: true, send: true, motivo: 'Corretta la verifica del freno' });
  assert.deepEqual(parseArgs(['--motivo=Corretta la verifica del freno']), { ok: true, send: false, motivo: 'Corretta la verifica del freno' });
  assert.equal(parseArgs(['--send', '--motivo', 'corto']).ok, false);
  assert.equal(parseArgs(['--send', '--motivo', 'x'.repeat(601)]).ok, false);
  assert.equal(parseArgs(['--motivo']).ok, false);
  assert.deepEqual(parseArgs(['--sned', '--motivo', 'Corretta la verifica del freno']), { ok: false, error: 'unknown argument: --sned' });
});

test('ricalcolo: un record che non si legge più è rifiutato, non un errore', () => {
  assert.ok('refused' in calcNow({ inputs: { nonUnCampo: 1 }, collaudo: null, intervento: null }));
  assert.ok('refused' in liftNow({ inputs: {}, base: null }));
  assert.ok('refused' in roomNow({ inputs: {}, calc: { inputs: {}, collaudo: null, intervento: null } }));
  assert.ok('refused' in shaftNow({ W: 'largo' }));
});
