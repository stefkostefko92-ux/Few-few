// The machine room's sheets (plan, section B-B) with the machine turned by any angle and on every support: section B-B
// at its plan's scale, its heights in the room clear of the walls, the cut through the door's opening; the section
// line's marks along the cut askew; the door open outward in plan; the pulley's plates where the 3D has them; the load
// P1 clear of the governor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Entity, Shape } from '@/drawing';
import { STYLES } from '@/drawing';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { valueMarks } from '@/lib/lift/marks';
import { buildTavole, roomMarks } from '@/lib/tavole/build';
import { storedInput } from '@/lib/tavole/compose';
import { roomView } from '@/lib/tavole/views';
import { dropSpan, roomGeo, ropeWidths } from '@/shaft/machine-room';
import { editValue } from '@/shaft';
import { WALL } from '@/shaft/room-draw';
import { roomPlanEntities, roomSectionEntities } from '@/shaft/room-view';
import { rinvioPlan } from '@/shaft/rinvio-view';
import { layoutSite } from '@/shaft/room-site';

type Room = NonNullable<LiftInputs['shaft']['room']>;
const base = newLift(), room = base.shaft.room as Room;
const cw = (side: 'rear' | 'left' | 'right', cwPos?: number, r: Partial<Room> = {}, calc: Record<string, string> = {}): LiftInputs => ({
  ...base, calc: { ...base.calc, ...calc },
  shaft: { ...base.shaft, cw: side, ...(cwPos !== undefined ? { plan: { ...(base.shaft.plan ?? {}), cwPos } } : {}), room: { ...room, ...r } },
});
const frame: Partial<Room> = { support: { kind: 'frame' } };
// the drop line askew: the counterweight on a side off the car's axis, at the rear off it; and on a frame, on HEB beams
const ASKEW: [string, LiftInputs][] = [
  ['sinistra 300', cw('left', 300)], ['dietro 550', cw('rear', 550)], ['destra 700', cw('right', 700)],
  ['telaio, sinistra 300', cw('left', 300, frame, { layout: 'top' })], ['HEB, dietro 550', cw('rear', 550, { ...frame, heb: {} }, { layout: 'top' })],
];
const sheets = (inp: LiftInputs) => {
  const d = deriveLift(inp), marks = valueMarks(inp.auto, d, d.bottom, d.collaudo), project = { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: '', client: '' };
  const x = storedInput(d.values, d.layout, { number: '26-001', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S', projectData: project, plant: {}, revisions: [] }, null, marks);
  assert.ok(x);
  return buildTavole(x);
};
const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));

test('sezione B-B alla scala della sua pianta anche con la calata di sbieco o il locale più lungo; le due altezze in una fila restano da cambiare', () => {
  for (const [name, inp] of [...ASKEW, ['locale profondo 3060', { ...base, shaft: { ...base.shaft, room: { ...room, D: room.D + 60 } } }] as [string, LiftInputs]]) {
    const r = sheets(inp);
    assert.equal(r.sheets[8]?.scale, r.sheets[7]?.scale, name);
    assert.equal(r.sheets[8]?.scale, 25, name);
    // each read as it is and changed by what is typed on it (the higher one written whole)
    const R = deriveLift(inp).layout.inputs.room;
    assert.ok(R);
    for (const [key, h] of [['room.doorH', R.doorH], ['room.panelH', R.panelH]] as const) {
      const hit = r.hits[8]?.find((x) => x.edit.key === key);
      assert.ok(hit, `${name}: ${key}`);
      assert.equal(Math.round(hit.value), h, `${name}: ${key}`);
      assert.equal(editValue(hit.edit, hit.value + 10), h + 10, `${name}: ${key}`);
    }
  }
});

test('sezione B-B: le quote in altezza accanto alla macchina restano nella stanza, lontane dai muri; se non ci stanno, nelle file fuori', () => {
  const lifts: [string, LiftInputs][] = [...ASKEW, ['telaio', cw('rear', undefined, frame, { layout: 'top' })], ['telaio, rinvio a parte', cw('rear', undefined, frame)],
    ['2:1', cw('rear', undefined, {}, { r: '2' })], ['putrelle', cw('rear', undefined, { support: { kind: 'beams', profile: 'IPE 240' } }, { layout: 'top' })]];
  for (const [name, inp] of lifts) {
    const d = deriveLift(inp), L = d.layout, G = roomGeo(L, d.machine);
    assert.ok(G, name);
    const v = roomView(L, d.machine, 'section', { x0: 0, y0: 0, x1: 178, y1: 200 }), [r0, r1] = dropSpan(G, 0, 0, G.room.W, G.room.D), k = (v?.place.scale ?? 25) / 25;
    assert.ok(v, name);
    for (const c of chains(v.entities)) {
      if (c.dir !== 'y' || c.side || c.at === undefined) continue;
      assert.ok(c.at - 90 * k >= r0 + 40 * k - 1e-6 && c.at + 40 * k <= r1 + 1e-6, `${name}: «${c.text?.join()}» a ${Math.round(c.at)} fra ${Math.round(r0)} e ${Math.round(r1)}`);
    }
  }
});

test('sezione B-B per la porta: solo l’architrave sopra la sua altezza, gli stipiti visti oltre; altrimenti il muro pieno', () => {
  const concrete = (es: readonly Entity[]) => es.flatMap((e) => (e.e === 'path' && e.fill === 'concrete' ? [e.pts] : []));
  for (const [inp, through] of [[cw('rear', 550), true], [base, false]] as const) {
    const d = deriveLift(inp), L = d.layout, G = roomGeo(L, d.machine);
    assert.ok(G);
    const [r0] = dropSpan(G, 0, 0, G.room.W, G.room.D), es = roomSectionEntities(L, d.machine, G).entities;
    const wall = concrete(es).filter((p) => p.every(([u]) => u >= r0 - WALL - 1e-6 && u <= r0 + 1e-6) && Math.max(...p.map(([, z]) => z)) >= G.room.H - 1e-6);
    assert.equal(wall.length, 1);
    assert.equal(Math.min(...(wall[0] ?? []).map(([, z]) => z)), through ? G.room.doorH : 0, through ? 'architrave' : 'muro pieno');
  }
});

test('segni B-B di sbieco: il tratto lungo il taglio, la freccia perpendicolare; sugli assi come sempre', () => {
  for (const [inp, askew] of [[cw('left', 300), true], [cw('rear', 550), true], [base, false], [cw('left'), false]] as const) {
    const d = deriveLift(inp), L = d.layout, G = roomGeo(L, d.machine);
    assert.ok(G);
    const v = roomView(L, d.machine, 'plan', { x0: 0, y0: 0, x1: 178, y1: 230 });
    assert.ok(v);
    const marks = roomMarks(G, v.place, v.r.extent), heavy = marks.filter((s): s is Extract<Shape, { t: 'line' }> => s.t === 'line' && s.s === STYLES.heavy);
    assert.equal(heavy.length, 2);
    for (const l of heavy) {
      const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1];
      assert.ok(Math.abs(dx * G.uy - dy * G.ux) < 1e-9 * Math.hypot(dx, dy), `parallelo: ${dx} ${dy}`);
      if (!askew) assert.ok(Math.abs(dx) < 1e-12 || Math.abs(dy) < 1e-12, 'sugli assi');
    }
    // the machine's name and sheave along the drop line, read from the left or from below
    const label = v.entities.find((e): e is Extract<Entity, { e: 'text' }> => e.e === 'text' && e.text.includes('Ø'));
    const deg = (Math.atan2(G.uy, G.ux) * 180) / Math.PI, a = label?.angle ?? 0;
    assert.ok(Math.abs(Math.sin(((a - deg) * Math.PI) / 180)) < 1e-9 && a > -90 && a <= 90, `${a} ${deg}`);
    if (!askew) assert.ok(a === 0 || a === 90, `${a}`);
  }
});

test('pianta: la porta aperta verso fuori con il suo arco, oltre il muro (la quota della porta più in là); chiusa nel telaio se l’arco costa la scala', () => {
  const d = deriveLift(base), L = d.layout, G = roomGeo(L, d.machine);
  assert.ok(G);
  const { entities, bounds } = roomPlanEntities(L, d.machine, G), R = G.room;
  assert.equal(R.doorWall, 'front');
  const arc = entities.find((e) => e.e === 'path' && !e.closed && e.pts.length > 10);
  assert.ok(arc && arc.e === 'path' && Math.min(...arc.pts.map(([, y]) => y)) < -WALL - R.doorW / 2, 'arco fuori dal muro');
  assert.ok(bounds.y0 <= -WALL - (R.doorW - 100) + 1e-6, `${bounds.y0}`);
  const shut = roomPlanEntities(L, d.machine, G, { closedDoor: true });
  assert.equal(shut.bounds.y0, -WALL);
  // the door on a side wall of a 3 m room: its swing would take the plan to 1:50, the door is drawn shut and it stays at 1:25
  const side = deriveLift({ ...base, shaft: { ...base.shaft, room: { ...room, doorWall: 'left', doorAt: 400 } } }), Gs = roomGeo(side.layout, side.machine);
  assert.ok(Gs);
  assert.equal(roomView(side.layout, side.machine, 'plan', { x0: 0, y0: 0, x1: 178, y1: 230 })?.place.scale, 25);
});

test('rinvio nel telaio: le piastre dell’asse dentro la fascia della puleggia, |v| fra half − 10 e half, come il 3D', () => {
  const d = deriveLift(base), L = d.layout, G = roomGeo(L, d.machine), rf = d.machine.rinvio;
  assert.ok(G && rf);
  const half = ropeWidths(d.machine.n, d.machine.d).pulley, es = rinvioPlan(d.machine, G, rf, (u, v) => [u, v]);
  // the plates: the two steel paths 160 long at the pulley's axis
  const plates = es.filter((e) => e.e === 'path' && e.fill === 'steel' && Math.abs(Math.max(...e.pts.map(([u]) => u)) - Math.min(...e.pts.map(([u]) => u)) - 160) < 1e-6);
  assert.equal(plates.length, 2);
  for (const p of plates) {
    if (p.e !== 'path') continue;
    const a = p.pts.map(([, v]) => Math.abs(v));
    assert.ok(Math.abs(Math.min(...a) - (half - 10)) < 1e-6 && Math.abs(Math.max(...a) - half) < 1e-6, `${a}`);
  }
});

test('pianta: P1 lontano dal limitatore, dal suo nome e da P4, la sua guida non li attraversa (macchina girata)', () => {
  const inp: LiftInputs = { ...base, shaft: { ...base.shaft, room: { ...room, motor: 'car' } } }, d = deriveLift(inp), L = d.layout, G = roomGeo(L, d.machine);
  assert.ok(G);
  const marks = layoutSite(L).governor.marks ?? [], p1 = roomPlanEntities(L, d.machine, G).entities.find((e) => e.e === 'tag' && e.text === 'P1');
  assert.ok(marks.length === 3 && p1 && p1.e === 'tag' && p1.to);
  const [x, y] = p1.at, r = 1.9 * 25;
  for (const m of marks) assert.ok(Math.hypot(Math.max(m.x0 - x, 0, x - m.x1), Math.max(m.y0 - y, 0, y - m.y1)) >= r, `P1 ${p1.at} su ${JSON.stringify(m)}`);
});
