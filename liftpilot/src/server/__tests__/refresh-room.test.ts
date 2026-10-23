// «Aggiorna con il software attuale» on a machine room (src/server/refresh-actions.ts): of any installation (round 45: a
// former whole project's too, re-placed in place); one already made again opens the new one; the calculation is made
// again with it, by whoever draws the project — the Tecnico makes the calculation again and the room stays on the
// previous one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSurvey } from '@/lib/room/survey';
import { APP, actions, calcRow, calls, db, go, project, signIn, stale, type Row } from './refresh-fixture';

const roomRow = (id: string, over: Row = {}): Row => ({
  id, companyId: 'c1', label: 'locale', inputs: { nonsense: true }, sha256: '0'.repeat(64), project: project(), calculation: calcRow('old1', stale), ...over,
});

test('machinale di un impianto qualsiasi (round 45): si rifà al suo posto, non dal Progetto', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('room1', { project: project() })];
  db.calc = [calcRow('new1')];
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/calculations/new1/locale?from=room1&aggiorna=1`);
  assert.equal(calls.calc.length, 1, 'il calcolo rifatto');
});

test('machinale già rifatto: al nuovo con ?da=, nessun record', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('room1')];
  db.audit = [{ companyId: 'c1', action: 'ROOM_DESIGN_SAVED', updates: 'room1', entityId: 'made1' }];
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/room-designs/made1?da=room1`);
  assert.equal(calls.calc.length + calls.room.length, 0);
});

test('machinale con rilievo che il nuovo calcolo non prende più: si rifà il calcolo, il rilievo va al suo modulo', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('room1')];
  db.calc = [calcRow('new1')]; // the calculation made again, as the database then has it
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/calculations/new1/locale?from=room1&aggiorna=1`);
  assert.equal(calls.calc.length, 1);
  assert.equal(calls.room.length, 0, 'il rilievo illeggibile non è salvato');
});

test('il Tecnico: il locale macchina non si rifà; il calcolo sì, e il rilievo resta sul precedente', async () => {
  const { refreshRoomDesignAction, refreshCalculationAction } = await actions();
  db.room = [roomRow('room1')];
  signIn({ role: 'TECHNICIAN' });
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/room-designs/room1`);
  assert.equal(calls.calc.length + calls.room.length, 0, 'né calcolo né locale');
  // the replacement's calculation with its machine room: the calculation is made again, the room is not carried over
  db.calc = [calcRow('old1', { ...stale, roomDesigns: [{ id: 'room1', label: 'locale', inputs: { nonsense: true } }] })];
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`);
  assert.equal(calls.calc.length, 1);
  assert.equal(calls.room.length, 0, 'il locale resta sul calcolo precedente');
});

test('machinale di un’altra ditta o archiviato: al tabellone', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('theirs', { companyId: 'c2' }), roomRow('arch', { project: project({ archivedAt: new Date(0) }) })];
  assert.equal(await go(refreshRoomDesignAction, 'theirs'), APP);
  assert.equal(await go(refreshRoomDesignAction, 'arch'), APP);
  assert.equal(calls.calc.length + calls.room.length, 0);
});

// a modernisation keeping the machine (round 45): no machine room is surveyed on its calculation, nor carried onto it
const KEPT = { intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-1', parti: ['controller'] } };
const survey = startSurvey(600);

test('calcolo con l’argano che resta: il locale salvato prima non si rifà sul calcolo rifatto, resta com’è', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', { ...stale, ...KEPT, roomDesigns: [{ id: 'room1', label: 'locale', inputs: survey }] }), calcRow('new1', KEPT)];
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`);
  assert.equal(calls.calc.length, 1, 'il calcolo rifatto');
  assert.equal(calls.room.length, 0, 'il locale non è portato sul calcolo che tiene l’argano');
  // the same survey on a calculation replacing the machine is carried over (the rule above is the kept machine's only)
  db.calc = [calcRow('old2', { ...stale, roomDesigns: [{ id: 'room2', label: 'locale', inputs: survey }] }), calcRow('new1')];
  calls.calc = [];
  assert.equal(await go(refreshCalculationAction, 'old2'), `${APP}/calculations/new1?da=old2`);
  assert.equal(calls.room.length, 1);
});

test('locale macchina su un calcolo con l’argano che resta: non si rifà, si torna al calcolo', async () => {
  const { refreshRoomDesignAction } = await actions();
  // its calculation still reproduced: the room is not placed again on it
  db.room = [roomRow('room1', { inputs: survey, calculation: calcRow('calc1', KEPT) })];
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/calculations/calc1`);
  // its calculation made again: the new one, without the room
  db.room = [roomRow('room2', { inputs: survey, calculation: calcRow('old1', { ...stale, ...KEPT }) })];
  db.calc = [calcRow('new1', KEPT)];
  assert.equal(await go(refreshRoomDesignAction, 'room2'), `${APP}/calculations/new1`);
  assert.equal(calls.calc.length, 1);
  assert.equal(calls.room.length, 0, 'nessun locale sul calcolo che tiene l’argano');
});
