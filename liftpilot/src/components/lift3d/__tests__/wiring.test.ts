// The machine room's trunking: square to the walls, clear of what stands on the floor, round the machine's bedframe
// when it is in the way, and none at all when nothing is clear.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rectOf, trunkingRoute, type Rect } from '../wiring';

const ROOM: Rect = { x0: -500, y0: -500, x1: 2500, y1: 2500 };
const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Every leg square to the walls and, 50 mm either side of its axis, clear of the blocks and inside the room. */
function check(way: readonly (readonly [number, number])[], blocked: readonly Rect[]): void {
  for (let i = 1; i < way.length; i++) {
    const [a, b] = [way[i - 1], way[i]];
    assert.ok(Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6, `tratto ${i} non in squadra`);
    const r = rectOf([a, b], 50);
    assert.ok(r.x0 >= ROOM.x0 && r.x1 <= ROOM.x1 && r.y0 >= ROOM.y0 && r.y1 <= ROOM.y1, `tratto ${i} fuori dal locale`);
    for (const k of blocked) assert.ok(!overlaps(r, k), `tratto ${i} sopra un ingombro`);
  }
}

test('canalina: dritta dal quadro al tubo del motore', () => {
  const way = trunkingRoute([60, 2260], [0, -1], [60, 2010], [], ROOM);
  assert.ok(way);
  check(way, []);
  assert.equal(way.length, 2);
  assert.ok(Math.abs(way[1][1] - 1950) < 1e-6, 'oltre il tubo di 60 mm');
});

test('canalina: gira attorno al telaio della macchina che sta in mezzo', () => {
  const frame: Rect = { x0: -282, y0: 477, x1: 1124, y1: 820 }, blocked = [frame, { x0: 120, y0: 843, x1: 580, y1: 1037 }];
  const way = trunkingRoute([-80, 2260], [0, -1], [-93, 306], blocked, ROOM);
  assert.ok(way, 'un percorso c’è');
  check(way, blocked);
  const end = way[way.length - 1];
  assert.ok(Math.hypot(end[0] + 93, end[1] - 306) <= 60 + 1e-6, 'arriva al tubo del motore');
});

test('canalina: nessuna se il tubo del motore è chiuso da ogni lato', () => {
  const blocked = [{ x0: -500, y0: 0, x1: 2500, y1: 200 }];
  assert.equal(trunkingRoute([60, 2260], [0, -1], [60, -300], blocked, ROOM), null);
});
