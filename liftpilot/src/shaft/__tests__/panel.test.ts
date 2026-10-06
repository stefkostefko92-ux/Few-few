// The free area in front of the control panel in the machine room (UNI EN 81-20:2020, 5.2.6.3.2.1 a)): to the opposite
// wall, or to the machine where it stands in front of the panel; and the checks of the machine that take the place of
// the shaft's (mergeChecks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, KV_VERT, mergeChecks, type ShaftCheck } from '../index';
import { roomChecksOf } from '../machine-room';
import { panelFree } from '../panel';

// panel on the rear wall (y = D), 800 mm wide from x = 1900, 300 mm deep: the area in front of it spans x 1900…2700
const R = DEFAULT_ROOM;

test('davanti al quadro: fino al muro di fronte, o fino alla macchina che ci sta davanti', () => {
  assert.equal(panelFree(R), R.D - R.panelD);
  // the machine in front of the panel: from the panel's wall to the machine's near side (D − y1), less the panel
  assert.equal(panelFree(R, [1500, 600, 2200, 1700]), R.D - 1700 - R.panelD);
  // beside the area, it does not count
  assert.equal(panelFree(R, [200, 600, 1800, 2600]), R.D - R.panelD);
  // a panel on the left wall: the area runs along y, the machine's near side is its x0
  const L = { ...R, panelWall: 'left' as const, panelAt: 1000 };
  assert.equal(panelFree(L, [1200, 900, 2000, 1600]), 1200 - R.panelD);
  // the check follows: 700 mm needed (the panel on the rear wall: the machine's near side is its y1)
  const m = (box?: readonly [number, number, number, number]) => roomChecksOf(R, box).find((c) => c.id === 'm_panel');
  assert.equal(m()?.status, 'ok');
  assert.equal(m([1500, 600, 2200, R.D - R.panelD - KV_VERT.panelFreeDepth])?.status, 'ok', 'esattamente 700 mm');
  assert.equal(m([1500, 600, 2200, R.D - R.panelD - KV_VERT.panelFreeDepth + 1])?.status, 'fail', '699 mm');
});

test('verifiche della macchina al posto di quelle del vano con lo stesso nome', () => {
  const c = (id: ShaftCheck['id'], status: ShaftCheck['status']): ShaftCheck => ({ id, status, value: 0, limit: 0, dec: 0, unit: 'mm' });
  const merged = mergeChecks([c('m_height', 'ok'), c('m_panel', 'ok'), c('m_door', 'ok')], [c('m_beam', 'ok'), c('m_panel', 'fail')]);
  assert.deepEqual(merged.map((x) => `${x.id}:${x.status}`), ['m_height:ok', 'm_panel:fail', 'm_door:ok', 'm_beam:ok']);
});
