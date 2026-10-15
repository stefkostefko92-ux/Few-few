// «Aggiorna con il software attuale» (src/server/refresh-actions.ts): a record the engines no longer reproduce is made
// again once — never a duplicate of a legal document: not a record still reproduced, not one already made again (the
// audit keeps `updates`), not two at the same moment. What no longer passes opens the form. Always the user's company.
// A replacement's machine room: refresh-room.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capsOf } from '@/lib/rbac';
import { APP, actions, calcRow, calls, db, go, liftRow, project, signIn, src, stale, state } from './refresh-fixture';

// ---- who may ask
test('senza sessione: all’accesso', async () => {
  const { refreshCalculationAction } = await actions();
  state.session = null;
  assert.equal(await go(refreshCalculationAction, 'c1'), '/it/login');
});

test('password da cambiare, senza il diritto di salvare, id non valido: al tabellone, nulla rifatto', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  signIn({ mustChangePassword: true });
  assert.equal(await go(refreshCalculationAction, 'old1'), APP);
  signIn({ role: 'SALES' });
  assert.equal(await go(refreshCalculationAction, 'old1'), APP);
  signIn();
  assert.equal(await go(refreshCalculationAction, '../x'), APP);
  assert.equal(calls.calc.length, 0);
});

test('la 31ª richiesta in 10 minuti: al tabellone', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1')];
  for (let i = 0; i < 30; i++) assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/old1`, `richiesta ${i + 1}`);
  assert.equal(await go(refreshCalculationAction, 'old1'), APP);
});

test('il calcolo di un’altra ditta o archiviato: al tabellone, nulla rifatto', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('theirs', { ...stale, companyId: 'c2' }), calcRow('arch', { ...stale, project: project({ archivedAt: new Date(0) }) })];
  assert.equal(await go(refreshCalculationAction, 'theirs'), APP);
  assert.equal(await go(refreshCalculationAction, 'arch'), APP);
  assert.equal(calls.calc.length, 0);
});

// ---- a replacement's calculation
test('calcolo ancora riprodotto: alla sua pagina, nessuna copia', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('ok1')];
  assert.equal(await go(refreshCalculationAction, 'ok1'), `${APP}/calculations/ok1`);
  assert.equal(calls.calc.length, 0);
});

test('calcolo vecchio: rifatto una volta, con la stessa etichetta, e la pagina del nuovo dice da quale', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`);
  assert.equal(calls.calc.length, 1);
  // the type as stored: none before round 45
  const [, projectId, , label, , tipo, from] = calls.calc[0];
  assert.deepEqual([projectId, label, tipo, from], ['p1', 'prima', null, 'old1']);
});

test('calcolo già rifatto (il registro ha `updates`): al nuovo con ?da=, nessun secondo record', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  db.audit = [{ companyId: 'c1', action: 'CALCULATION_SAVED', updates: 'old1', entityId: 'made1' }];
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/made1?da=old1`);
  assert.equal(calls.calc.length, 0);
});

test('il registro di un’altra ditta non conta come «già rifatto»', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  db.audit = [{ companyId: 'c2', action: 'CALCULATION_SAVED', updates: 'old1', entityId: 'theirs1' }];
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`);
  assert.equal(calls.calc.length, 1);
});

test('due richieste nello stesso momento: la seconda trova «occupato», un solo record; poi si può ancora', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  let open!: () => void;
  state.gate = new Promise<void>((r) => { open = r; });
  const first = go(refreshCalculationAction, 'old1');
  await new Promise((r) => setImmediate(r)); // the first is inside the save
  assert.equal(calls.calc.length, 1);
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/old1`, 'la seconda torna al vecchio');
  assert.equal(calls.calc.length, 1, 'nessun secondo record');
  open();
  assert.equal(await first, `${APP}/calculations/new1?da=old1`);
  state.gate = null;
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`, 'il blocco è tolto dopo');
});

test('il blocco è tolto anche se il salvataggio fallisce', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  state.created = { ok: false, error: 'invalidFields' };
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/projects/p1/calc?from=old1&aggiorna=1`);
  state.created = { ok: true, id: 'new1' };
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`);
});

test('dati che il software non accetta più: si apre il modulo su di essi, nessun record', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  state.created = { ok: false, error: 'invalidFields' };
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/projects/p1/calc?from=old1&aggiorna=1`);
  db.calc = [calcRow('bad1', { inputs: { nonsense: true }, sha256: '0'.repeat(64) })];
  calls.calc = [];
  assert.equal(await go(refreshCalculationAction, 'bad1'), `${APP}/projects/p1/calc?from=bad1&aggiorna=1`);
  assert.equal(calls.calc.length, 0, 'valori illeggibili: non si salva');
});

test('calcolo argano di un impianto qualsiasi (round 45): si rifà al suo posto col suo tipo; l’archivio del vano dal Progetto', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [
    calcRow('full1', { ...stale, intervento: 'TRASFORMAZIONE_COMPLETA', project: project() }),
    calcRow('shaft1', { ...stale, shaftDesign: { id: 'd1' } }),
  ];
  // a step-2 calculation of a former whole project: made again in place, its type carried
  assert.equal(await go(refreshCalculationAction, 'full1'), `${APP}/calculations/new1?da=full1`);
  assert.equal(calls.calc.length, 1);
  assert.equal(calls.calc[0]?.[5], 'TRASFORMAZIONE_COMPLETA', 'il tipo passa al nuovo');
  assert.equal(calls.calc[0]?.[6], 'full1');
  // a calculation of the archive (made from a shaft design before the one form): from the Progetto, no copy
  assert.equal(await go(refreshCalculationAction, 'shaft1'), `${APP}/projects/p1/progetto`);
  assert.equal(calls.calc.length + calls.lift.length, 1);
});

test('«Solo argano» salvato prima del giro 46, senza la regolazione del quadro: si rifà (nessun rifiuto «inverter»; il ⚠ nei documenti)', async () => {
  // «Aggiorna» makes the record again from what it stored (createCalculation, no interventoValido): the question the form
  // asks since round 46 is not a refusal here
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('solo46', { ...stale, intervento: 'SOLO_ARGANO', collaudo: { norma: '10411-1', parti: ['machine'] } })];
  assert.equal(await go(refreshCalculationAction, 'solo46'), `${APP}/calculations/new1?da=solo46`);
  assert.equal(calls.calc.length, 1);
  const [, , , , chosen, tipo, from] = calls.calc[0] ?? [];
  assert.deepEqual([chosen, tipo, from], [{ norma: '10411-1', parti: ['machine'] }, 'SOLO_ARGANO', 'solo46']);
});

test('calcolo di un progetto dell’impianto: tocca al progetto rifarlo', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('clift1', { ...stale, liftDesign: { id: 'lift1' } })];
  db.lift = [liftRow('lift1')];
  assert.equal(await go(refreshCalculationAction, 'clift1'), `${APP}/lift-designs/lift1`, 'riprodotto: alla sua pagina');
  assert.equal(calls.lift.length + calls.calc.length, 0);
});

// ---- a lift design
test('progetto dell’impianto riprodotto: alla sua pagina, nessuna copia', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('lift1')];
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/lift1`);
  assert.equal(calls.lift.length, 0);
});

test('progetto dell’impianto vecchio: rifatto una volta; già rifatto: al nuovo senza secondo record', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('lift1', { engineVersion: '0.0.0' })];
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/new1?da=lift1`);
  assert.equal(calls.lift.length, 1);
  assert.equal(calls.lift[0][5], 'lift1', 'il record dice quale rifà');
  assert.equal(calls.lift[0][6], null, 'un progetto del modulo unico non ha base');
  db.audit = [{ companyId: 'c1', action: 'LIFT_DESIGN_SAVED', updates: 'lift1', entityId: 'made1' }];
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/made1?da=lift1`);
  assert.equal(calls.lift.length, 1);
});

test('progetto dell’impianto: due richieste insieme, un solo record', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('lift1', { engineVersion: '0.0.0' })];
  let open!: () => void;
  state.gate = new Promise<void>((r) => { open = r; });
  const first = go(refreshLiftDesignAction, 'lift1');
  await new Promise((r) => setImmediate(r));
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/lift1`);
  open();
  assert.equal(await first, `${APP}/lift-designs/new1?da=lift1`);
  assert.equal(calls.lift.length, 1);
});

test('progetto dell’impianto che non passa più: al modulo con ?from= e il segno che lo dice in cima (aggiorna=1)', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('lift1', { engineVersion: '0.0.0' })];
  state.created = { ok: false, error: 'invalidFields' };
  const to = await go(refreshLiftDesignAction, 'lift1');
  assert.equal(to, `${APP}/projects/p1/progetto?from=lift1&aggiorna=1`);
  // the form reads the mark and says at its top why it opened (refresh-form.ts); opened from the record's page, it does not
  const { openedByRefresh } = await import(src('lib/refresh-form.ts'));
  assert.equal(openedByRefresh(Object.fromEntries(new URL(to, 'http://x').searchParams)), true);
  assert.equal(openedByRefresh({ from: 'lift1' }), false);
});

test('chi fa i calcoli ma non disegna il progetto (il Tecnico): il progetto dell’impianto non si rifà, si resta sul record', async () => {
  const { refreshLiftDesignAction, refreshCalculationAction } = await actions();
  db.lift = [liftRow('lift1', { engineVersion: '0.0.0' })];
  signIn({ role: 'TECHNICIAN' });
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/lift1`);
  // nor through the design's calculation
  db.calc = [calcRow('c1', { liftDesign: { id: 'lift1' }, project: project() })];
  assert.equal(await go(refreshCalculationAction, 'c1'), `${APP}/lift-designs/lift1`);
  assert.equal(calls.lift.length, 0, 'nessun nuovo progetto dell’impianto');
  // one the company took the project away from, the calculations kept: the same
  signIn({ role: 'ENGINEER', caps: capsOf('ENGINEER', [{ role: 'ENGINEER', capability: 'progetto:edit', granted: false }]) });
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/lift1`);
  assert.equal(calls.lift.length, 0);
  // already made again by a colleague: to the new one, as for anyone
  db.audit = [{ companyId: 'c1', action: 'LIFT_DESIGN_SAVED', updates: 'lift1', entityId: 'lift2' }];
  signIn({ role: 'TECHNICIAN' });
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/lift2?da=lift1`);
});

test('progetto dell’impianto di un’altra ditta o archiviato: al tabellone', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('theirs', { engineVersion: '0.0.0', companyId: 'c2' }), liftRow('arch', { engineVersion: '0.0.0', project: project({ archivedAt: new Date(0) }) })];
  assert.equal(await go(refreshLiftDesignAction, 'theirs'), APP);
  assert.equal(await go(refreshLiftDesignAction, 'arch'), APP);
  assert.equal(calls.lift.length, 0);
});

// ---- a lift design drawn on a «Calcolo argano» (round 45)
test('progetto disegnato su un calcolo argano: base riprodotta — la stessa; base vecchia — prima il calcolo, poi il disegno su quello nuovo', async () => {
  const { refreshLiftDesignAction } = await actions();
  const { liftInputsOf, progettoOf } = await import(src('lib/lift/progetto.ts'));
  const base = calcRow('b1', { intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-1', parti: ['machine', 'controller'] } });
  db.lift = [liftRow('lift1', { engineVersion: '0.0.0', baseCalculation: base })];
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/new1?da=lift1`);
  assert.deepEqual(calls.lift[0]?.[6], { id: 'b1', intervento: 'AMMODERNAMENTO' }, 'la stessa base');
  assert.equal(calls.calc.length, 0);
  // the base no longer reproduced: made again first (its type carried, no machine room), the drawing composed on it
  calls.lift = [];
  db.lift = [liftRow('lift2', { engineVersion: '0.0.0', baseCalculation: { ...base, ...stale } })];
  db.calc = [calcRow('new1', { intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-1', parti: ['machine', 'controller'] } })];
  assert.equal(await go(refreshLiftDesignAction, 'lift2'), `${APP}/lift-designs/new1?da=lift2`);
  assert.equal(calls.calc.length, 1);
  assert.equal(calls.calc[0]?.[5], 'AMMODERNAMENTO');
  assert.equal(calls.calc[0]?.[6], 'b1');
  assert.deepEqual(calls.lift[0]?.[6], { id: 'new1', intervento: 'AMMODERNAMENTO' }, 'la nuova base');
  const sent = calls.lift[0]?.[2] as { calc: Record<string, unknown>; auto: { P: boolean; machine: boolean }; collaudo?: unknown };
  const fresh = db.calc[0] as { inputs: Record<string, unknown> };
  assert.deepEqual(sent, liftInputsOf(progettoOf((db.lift[0] as { inputs: never }).inputs), { values: fresh.inputs, collaudo: { norma: '10411-1', parti: ['machine', 'controller'] } }));
  assert.equal(sent.auto.P || sent.auto.machine, false, 'argano e massa della cabina dal calcolo');
  // already made again by a colleague: the drawing goes on that calculation, which is not made a second time
  calls.calc = []; calls.lift = [];
  db.audit = [{ companyId: 'c1', action: 'CALCULATION_SAVED', updates: 'b1', entityId: 'new1' }];
  db.lift = [liftRow('lift3', { engineVersion: '0.0.0', baseCalculation: { ...base, ...stale } })];
  assert.equal(await go(refreshLiftDesignAction, 'lift3'), `${APP}/lift-designs/new1?da=lift3`);
  assert.equal(calls.calc.length, 0);
  assert.deepEqual(calls.lift[0]?.[6], { id: 'new1', intervento: 'AMMODERNAMENTO' });
});
