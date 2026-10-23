// The lists behind a record's result pill read from what a record stores (src/lib/verdict-checks.ts): the canonical
// JSON's quirks (a limit that is not finite is stored as its text), the checks that are not counted, an id the running
// software no longer knows, the acceptance test's choice of checks, and the lift design's merge with the beams under
// the machine. The save path itself is tested in src/server/__tests__/verdict-checks.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agrees, calcList, isCalcCheckId, isShaftCheckId, isVerdictKind, liftListDerived, liftListStored, roomList, shaftList } from '../verdict-checks';
import type { Check } from '@/calc/types';
import type { ShaftCheck } from '@/shaft/types';

const calcRow = (id: string, status: string, limit: number | string | null = 1) => ({ id, status, value: 2, limit, util: null, dec: 2 });
const shaftRow = (id: string, status: string) => ({ id, status, value: -40, limit: 0 });

test('calcolo: le non superate e le attenzioni del suo snapshot, nient’altro', () => {
  const l = calcList({ res: { checks: [calcRow('tr_up', 'fail', 'Infinity'), calcRow('tr_real', 'warn'), calcRow('r_dd', 'ok'), calcRow('s_fa', 'info'), calcRow('x_gone', 'fail')] } });
  assert.equal(l.basis, 'stored');
  assert.deepEqual(l.fails.map((c) => c.id), ['tr_up', 'x_gone'], 'an id no longer known keeps its place: the count tells');
  assert.equal(l.fails[0]?.limit, Infinity, 'a limit stored as text');
  assert.deepEqual(l.warns.map((c) => c.id), ['tr_real']);
  assert.ok(agrees(l, { failCount: 2, warnCount: 1 }));
  assert.ok(!agrees(l, { failCount: 3, warnCount: 1 }));
  assert.equal(calcList({ nonsense: true }).basis, 'unreadable');
});

test('vano: decimali e unità dalla definizione della verifica, se c’è', () => {
  const def: ShaftCheck = { id: 'v_fit', status: 'ok', value: 10, limit: 0, dec: 0, unit: 'mm' };
  const l = shaftList({ checks: [shaftRow('v_fit', 'fail'), shaftRow('v_door', 'warn')] }, [def]);
  assert.deepEqual(l.fails[0], { src: 'shaft', id: 'v_fit', status: 'fail', value: -40, limit: 0, dec: 0, unit: 'mm' });
  assert.deepEqual(l.warns[0], { src: 'shaft', id: 'v_door', status: 'warn', value: -40, limit: 0, dec: null, unit: null });
});

test('locale macchina: solo le verifiche che il collaudo prende', () => {
  const results = { checks: [shaftRow('m_calata', 'fail'), shaftRow('m_height', 'fail'), shaftRow('m_door', 'warn')] };
  // under UNI 10411-1 with the machine replaced the room's height and door stay as they are (not counted)
  const l = roomList(results, { norma: '10411-1', parti: ['machine'] });
  assert.deepEqual([l.fails.map((c) => c.id), l.warns.length], [['m_calata'], 0]);
  // a new lift: every check
  const all = roomList(results, { norma: 'en81', parti: [] });
  assert.deepEqual([all.fails.length, all.warns.length], [2, 1]);
  assert.equal(roomList(results, null).basis, 'unreadable', 'the calculation’s values do not read');
});

test('progetto dell’impianto: le verifiche del collaudo, quelle delle travi al posto di quelle del vano', () => {
  const calc = [{ id: 'tr_up', status: 'fail', value: 1.2, limit: 1, util: 1.2, dec: 3, cs: null }, { id: 'tr_real', status: 'warn', value: 1, limit: 1, util: 1, dec: 3, cs: null }] as Check[];
  const shaft: ShaftCheck[] = [{ id: 'm_panel', status: 'fail', value: 400, limit: 500, dec: 0, unit: 'mm' }, { id: 'v_fit', status: 'ok', value: 1, limit: 0, dec: 0, unit: 'mm' }];
  // the free area in front of the panel measured up to the machine replaces the shaft's own, and passes
  const support: ShaftCheck[] = [{ id: 'm_panel', status: 'ok', value: 600, limit: 500, dec: 0, unit: 'mm' }, { id: 'm_beam', status: 'warn', value: 1, limit: 1, dec: 2, unit: 'MPa' }];
  const l = liftListDerived({ norma: 'en81', parti: [] }, calc, shaft, support);
  assert.equal(l.basis, 'derived');
  assert.deepEqual(l.fails.map((c) => c.id), ['tr_up']);
  assert.deepEqual(l.warns.map((c) => c.id), ['tr_real', 'm_beam']);
  // the same design no longer reproduced: what its calculation and its shaft design keep, marked partial
  const stored = liftListStored({ res: { checks: [calcRow('tr_up', 'fail')] } }, { checks: [shaftRow('m_panel', 'fail')] }, { norma: 'en81', parti: [] });
  assert.equal(stored.basis, 'partial');
  assert.deepEqual(stored.fails.map((c) => c.id), ['tr_up', 'm_panel']);
});

test('i nomi delle verifiche e dei record', () => {
  assert.ok(isCalcCheckId('tr_up') && !isCalcCheckId('v_fit'));
  assert.ok(isShaftCheckId('v_fit') && !isShaftCheckId('tr_up') && !isShaftCheckId('x_gone'));
  assert.ok(['calc', 'shaft', 'room', 'lift'].every(isVerdictKind) && !isVerdictKind('drawing'));
});
