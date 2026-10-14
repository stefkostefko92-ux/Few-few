// «Aggiorna con il software attuale» on a replacement's machine room (src/server/refresh-actions.ts): a whole project's
// is made again from its form; one already made again opens the new one; the calculation is made again with it, by
// whoever draws the project — the Tecnico makes the calculation again and the room stays on the previous one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP, actions, calcRow, calls, db, go, project, signIn, stale, type Row } from './refresh-fixture';

const roomRow = (id: string, over: Row = {}): Row => ({
  id, companyId: 'c1', label: 'locale', inputs: { nonsense: true }, sha256: '0'.repeat(64), project: project(), calculation: calcRow('old1', stale), ...over,
});

test('machinale di un progetto intero: si rifà dal modulo, niente copia', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('room1', { project: project({ kind: 'FULL' }) })];
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/projects/p1/progetto`);
  assert.equal(calls.calc.length + calls.room.length, 0);
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
