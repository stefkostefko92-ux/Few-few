// The control panel on the machine room's floor (registry locale.quadro, locale.quadro.posto, locale.macchina): clear of
// what stands on the floor, the free area in front of it, the ways from the door (UNI EN 81-20:2020, 5.2.6.3.2.2) and
// where the software puts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, KV_VERT, type RoomInputs } from '../index';
import { WALLS, boxGap, doorZone, meets, panelArea, panelBox, panelFree, switchBox, switchSpan, type Box, type Wall } from '../room-floor';
import { panelChecks, placePanel } from '../room-panel';
import { routeWidths } from '../room-route';

// the sample design's room: 3 × 3 m, the door on the front wall from 300 mm; the machine on the diverting pulley's
// bedplate along y up to 170 mm from the rear wall, the governor beside it, the main switch past the door
const R: RoomInputs = { ...DEFAULT_ROOM, doorWall: 'front', doorAt: 300, doorW: 800, panelWall: 'rear', panelAt: 300, panelW: 800, panelD: 300 };
const MACHINE: readonly Box[] = [[760, 1090, 1350, 2730], [700, 990, 1427, 2830]];
const GEAR: readonly Box[] = [...MACHINE, [1945, 1450, 2110, 1700], switchBox(R)];
const placed = (wall: Wall, at: number): RoomInputs => ({ ...R, panelWall: wall, panelAt: at });
const outcome = (S: RoomInputs, id: 'm_quadro' | 'm_route') => panelChecks(S, GEAR, null).find((c) => c.id === id);

test('rettangoli in pianta: distanza, contatto, sovrapposizione', () => {
  assert.equal(boxGap([0, 0, 100, 100], [150, 0, 250, 100]), 50);
  assert.equal(boxGap([0, 0, 100, 100], [130, 140, 200, 200]), 50, 'diagonal: 30 and 40 apart');
  assert.equal(boxGap([0, 0, 100, 100], [100, 0, 200, 100]), 0, 'touching');
  assert.equal(boxGap([0, 0, 100, 100], [80, 90, 200, 200]), -10, 'the least shift that parts them');
  assert.equal(meets([0, 0, 100, 100], [100, 0, 200, 100]), false);
  assert.equal(meets([0, 0, 100, 100], [99, 0, 200, 100]), true);
});

test('interruttore generale: 150 mm oltre la porta, prima della porta se la parete finisce', () => {
  assert.deepEqual(switchSpan(R), [1250, 1450]);
  assert.deepEqual(switchBox(R), [1250, 0, 1450, 130]);
  assert.deepEqual(switchSpan({ ...R, doorAt: 2000 }), [1650, 1850]);
  assert.deepEqual(switchBox({ ...R, doorWall: 'right', doorAt: 400 }), [3000 - 130, 1350, 3000, 1550]);
  // the way through the door: its opening 700 mm into the room
  assert.deepEqual(doorZone(R), [300, 0, 1100, KV_VERT.panelFreeDepth]);
});

test('davanti al quadro: conta ciò che arriva oltre il suo fronte, non ciò che gli sta accanto contro il muro', () => {
  // a 400 mm panel next to the switch: its free area, 500 mm wide, reaches over the switch, which stays behind its front
  const S: RoomInputs = { ...R, panelWall: 'front', panelAt: 1480, panelW: 400 };
  assert.ok(panelArea(S)[0] < switchBox(S)[2], 'the area reaches over the switch');
  assert.equal(panelFree(S, [switchBox(S)]), S.D - S.panelD);
  // the machine in front of a panel on the rear wall: up to its near side; reaching into the panel: negative
  assert.equal(panelFree(placed('rear', 1500), [[1400, 500, 2000, 1500]]), 3000 - 1500 - 300);
  assert.equal(panelFree(R, MACHINE), 3000 - 2830 - 300);
});

test('percorsi dalla porta: larghi quanto il passaggio più stretto, misurati per difetto', () => {
  const far: Box = [0, 2200, 3000, 3000];
  // an empty room: the door's 800 mm
  const [open] = routeWidths(R, [], [far]);
  assert.ok(open <= 800 && open >= 760, `porta: ${open}`);
  // a block across the room leaving 600 mm by the right wall
  const [side] = routeWidths(R, [[0, 1000, 2400, 2000]], [far]);
  assert.ok(side <= 600 && side >= 560, `passaggio: ${side}`);
  // closed off
  assert.deepEqual(routeWidths(R, [[0, 1000, 3000, 2000]], [far]), [0]);
});

test('quadro inserito nel telaio dell’argano: m_quadro non passa; spostato, passa', () => {
  const inside = outcome(R, 'm_quadro');
  assert.equal(inside?.status, 'fail');
  assert.equal(inside?.value, -130, 'into the bedplate of the diverting pulley by 130 mm');
  const moved = outcome(placed('front', 1550), 'm_quadro');
  assert.deepEqual([moved?.status, moved?.value], ['ok', 100], '100 mm from the main switch');
  // out of the room
  assert.equal(outcome(placed('front', 2500), 'm_quadro')?.status, 'fail');
});

test('quadro davanti alla porta: il percorso dalla porta non c’è', () => {
  const door = panelChecks(placed('front', 300), GEAR, null).find((c) => c.id === 'm_route');
  assert.deepEqual([door?.status, door?.value], ['fail', 0]);
  // over the door's left jamb by 500 mm: 300 mm left of the opening
  const half = panelChecks(placed('front', 0), GEAR, null).find((c) => c.id === 'm_route');
  assert.ok(half?.status === 'fail' && (half.value ?? 0) <= 300, `half the door: ${half?.value}`);
  // up to the jamb, the opening stays whole
  assert.equal(panelChecks({ ...placed('front', 0), panelW: 300 }, GEAR, null).find((c) => c.id === 'm_route')?.status, 'ok');
  const ok = outcome(placed('front', 1550), 'm_route');
  assert.equal(ok?.status, 'ok');
  assert.ok((ok?.value ?? 0) >= KV_VERT.routeW && (ok?.value ?? 0) % 10 === 0, 'by defect to 10 mm');
});

test('posto del quadro: contro una parete vicino alla porta, fuori da argano, limitatore, interruttore e passaggio della porta', () => {
  assert.deepEqual(placePanel(R, GEAR), { wall: 'front', at: 1550 });
  // whatever the door's wall (its opening clear of the machine), the place keeps every rule the software places it by
  for (const doorWall of WALLS) {
    const S0: RoomInputs = { ...R, doorWall, doorAt: 1500 }, gear = [...MACHINE, switchBox(S0)], spot = placePanel(S0, gear), S = { ...S0, panelWall: spot.wall, panelAt: spot.at };
    const P = panelBox(S), A = panelArea(S);
    assert.ok(gear.every((b) => boxGap(P, b) >= 0), `${doorWall}: clear of the gear`);
    assert.ok(!meets(P, doorZone(S)) && !meets(A, doorZone(S)), `${doorWall}: off the way through the door`);
    assert.ok(panelFree(S, gear) >= KV_VERT.panelFreeDepth, `${doorWall}: its free area`);
    assert.ok(panelChecks(S, gear, null).every((c) => c.status === 'ok'), `${doorWall}: its checks`);
    assert.equal(spot.at % KV_VERT.panelStep === 0 || spot.at + S.panelW === (spot.wall === 'front' || spot.wall === 'rear' ? S.W : S.D), true, `${doorWall}: on the step`);
  }
  // no place at all (a room filled by the machine): the one with the fewest shortcomings, still on a wall
  const full = placePanel({ ...R, W: 1500, D: 1500 }, [[0, 400, 1500, 1500]]);
  assert.ok(WALLS.includes(full.wall));
});
