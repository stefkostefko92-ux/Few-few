// The machine room measured on a DXF plan in the browser (round 50, src/lib/cad/locale.ts): a click in the room (the
// shaft's outline below left out of the measure by its layer) and one in the shaft give the room's clear size, the
// shaft's and where the shaft lies from the room's left and front inner walls — the drawing's bottom as the front wall,
// or the side chosen —, also on a plan turned by 30°; a shaft not parallel to the room is said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as acad from '@node-projects/acad-ts';
import { readCad } from '../cad/read';
import { castRays, dominantAngle, type Survey } from '../cad/measure';
import { misuraLocale } from '../cad/locale';

const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** A machine room 3000 × 2800 (inner faces from 0,0, walls 300 mm) over a shaft 1600 × 1750 whose inner corner is at
 *  500, 600 — the shaft's outline on its own layer —, turned by `angle` (the shaft by `angle + skew`). */
function plan(angle: number, skew = 0): Uint8Array {
  const doc = new acad.CadDocument();
  const { header, layers, modelSpace } = doc;
  if (!header || !layers || !modelSpace) throw new Error('document');
  header.version = acad.ACadVersion.AC1027;
  header.insUnits = acad.UnitsType.Millimeters;
  const walls = new acad.Layer('MURI'), shaft = new acad.Layer('VANO_SOTTO');
  layers.add(walls);
  layers.add(shaft);
  const poly = (pts: [number, number][], layer: acad.Layer, a: number, about: [number, number] = [0, 0]): void => {
    const p = new acad.LwPolyline(pts.map(([x, y]) => {
      const [rx, ry] = rot(x - about[0], y - about[1], a - angle);
      return new acad.XY(...rot(rx + about[0], ry + about[1], angle));
    }));
    p.isClosed = true;
    p.layer = layer;
    modelSpace.entities.add(p);
  };
  poly([[0, 0], [3000, 0], [3000, 2800], [0, 2800]], walls, angle);
  poly([[-300, -300], [3300, -300], [3300, 3100], [-300, 3100]], walls, angle);
  poly([[500, 600], [2100, 600], [2100, 2350], [500, 2350]], shaft, angle + skew, [1300, 1475]);
  const out: string[] = [];
  new acad.DxfWriter({ write: (v: string) => { out.push(v); } }, doc).write();
  return new TextEncoder().encode(out.join(''));
}

function surveys(angle: number, skew = 0, shaftOnly = false): { room: Survey; shaft: Survey } {
  const m = readCad(plan(angle, skew), 'locale.dxf'), under = m.layers.findIndex((l) => l.name === 'VANO_SOTTO');
  const at = (x: number, y: number, visible: (i: number) => boolean): Survey => {
    const [px, py] = rot(x, y, angle), s = castRays(m, visible, px, py, dominantAngle(m, visible, px, py, 3000), 30000);
    assert.ok(s, `closed at ${x}, ${y}`);
    return s;
  };
  // the room with the shaft's layer left out; the shaft with every layer (or with its own only: its walls then give the
  // direction of the rays, not the room's longer ones)
  return { room: at(2700, 2600, (i) => i !== under && !m.layers[i]?.hidden), shaft: at(1300, 1500, (i) => (shaftOnly ? i === under : !m.layers[i]?.hidden)) };
}
const byId = (r: ReturnType<typeof misuraLocale>): Record<string, number> => Object.fromEntries(r.values.map((v) => [v.id, v.value]));

test('locale dal DXF: il locale, il vano e dove sta il vano, col lato in basso come parete anteriore — anche ruotato di 30°', () => {
  for (const deg of [0, 30]) {
    const { room, shaft } = surveys((deg * Math.PI) / 180);
    const r = misuraLocale(room, shaft, 1, 'down');
    assert.deepEqual(byId(r), { 'room.W': 3000, 'room.D': 2800, 'shaft.W': 1600, 'shaft.D': 1750, 'room.shaftX': 500, 'room.shaftY': 600 }, `${deg}°`);
    assert.equal(r.skew, false);
  }
});

test('locale dal DXF: la parete anteriore scelta su un altro lato del disegno', () => {
  const { room, shaft } = surveys(0);
  // the drawing's left side is the front wall: seen from it, the room's left is the drawing's top
  assert.deepEqual(byId(misuraLocale(room, shaft, 1, 'left')), { 'room.W': 2800, 'room.D': 3000, 'shaft.W': 1750, 'shaft.D': 1600, 'room.shaftX': 450, 'room.shaftY': 500 });
  // the top is the front wall: the room's left is the drawing's right
  assert.deepEqual(byId(misuraLocale(room, shaft, 1, 'up')), { 'room.W': 3000, 'room.D': 2800, 'shaft.W': 1600, 'shaft.D': 1750, 'room.shaftX': 900, 'room.shaftY': 450 });
  // centimetres
  assert.equal(byId(misuraLocale(room, null, 10, 'down'))['room.W'], 30000);
});

test('locale dal DXF: solo il vano, e un vano non parallelo al locale', () => {
  const { room, shaft } = surveys(0);
  assert.deepEqual(misuraLocale(null, shaft, 1, 'down'), { values: [{ id: 'shaft.W', value: 1600 }, { id: 'shaft.D', value: 1750 }], skew: false });
  assert.deepEqual(misuraLocale(null, null, 1, 'down'), { values: [], skew: false });
  void room;
  const turned = surveys(0, (2 * Math.PI) / 180, true), t = misuraLocale(turned.room, turned.shaft, 1, 'down');
  assert.equal(t.skew, true);
  assert.deepEqual([byId(t)['shaft.W'], byId(t)['shaft.D']], [1600, 1750], 'its own size, whatever its turn');
});
