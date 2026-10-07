// The machine room's drawings change the design where they are: the shaft's place and size under the room, the
// control panel, the slab, the door's and the panel's height, the rope drop and the diverting pulley's distance (which
// move the counterweight or the car), the shaft along the drop line. Each editable dimension, given its length ± 10 mm,
// reads that length once the installation is derived again (the machine with it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Entity } from '../../drawing';
import { defaultLift, deriveLift } from '../../lib/lift';
import { DEFAULT_ROOM, applyEdit, editValue, roomGeo, roomPlanEntities, roomSectionEntities, type MachineSupport, type ShaftInputs } from '../index';

const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
type Shaft = ReturnType<typeof defaultLift>['shaft'];

// the panel where it is entered: a dimension of it moved on the drawing enters its place (the form switches the
// software's place off: LiftWorkspace)
function draw(shaft: ShaftInputs, kind: 'plan' | 'section'): Chain[] {
  const base = defaultLift(), dv = deriveLift({ ...base, shaft, auto: { ...base.auto, panel: false } }), G = roomGeo(dv.layout, dv.machine);
  assert.ok(G, 'locale macchina');
  return chains(kind === 'plan' ? roomPlanEntities(dv.layout, dv.machine, G).entities : roomSectionEntities(dv.layout, dv.machine, G).entities);
}

const ROOM = defaultLift().shaft.room ?? DEFAULT_ROOM;
const on = (support: MachineSupport): Partial<Shaft> => ({ room: { ...ROOM, support } });
const VARIANTS: readonly (readonly [string, Partial<Shaft>])[] = [
  ['contrappeso sul fondo', {}], ['contrappeso a sinistra', { cw: 'left' }], ['contrappeso a destra', { cw: 'right' }],
  ['argano su telaio', on({ kind: 'frame' })], ['argano su putrelle sollevate', on({ kind: 'beams', height: 700 })],
  ['argano su piastre', on({ kind: 'plates' })], ['argano su plinto', on({ kind: 'plinth', length: 1600 })],
];

for (const [name, patch] of VARIANTS) {
  test(`locale macchina, ${name}: ogni quota modificabile legge il valore scritto`, () => {
    const I: ShaftInputs = { ...defaultLift().shaft, ...patch };
    const keys = new Set<string>();
    for (const kind of ['plan', 'section'] as const) {
      const before = draw(I, kind);
      before.forEach((c, j) => c.edit?.forEach((e, i) => {
        if (!e || e.key.startsWith('calc.')) return;
        keys.add(e.key);
        if (e.pick) {
          // a choice from the catalogue: the next entry is the one the drawing then shows
          const k = (e.pick.current + 1) % e.pick.options.length, next = applyEdit(I, e, k);
          assert.ok(next, `${kind}: ${e.key}`);
          assert.equal(draw(next, kind)[j].edit?.[i]?.pick?.current, k, `${kind}: ${e.key} → ${e.pick.options[k]?.label ?? ''}`);
          return;
        }
        const now = Math.round(e.value ?? Math.abs(c.pts[i + 1] - c.pts[i]));
        for (const d of [10, -10]) {
          const next = applyEdit(I, e, now + d);
          // refused only when the input would go below nothing (shims a few mm thick under the machine)
          if (!next && editValue(e, now + d) < 0) continue;
          assert.ok(next, `${kind}: ${e.key}`);
          const after = draw(next, kind)[j];
          assert.equal(Math.round(Math.abs(after.pts[i + 1] - after.pts[i])), now + d, `${kind}: ${e.key} (${c.text?.[i] ?? ''}) ${now} → ${now + d}`);
        }
      }));
    }
    for (const k of ['room.W', 'room.D', 'room.shaftX', 'room.shaftY', 'room.panelAt', 'room.panelW', 'room.panelD', 'room.slab', 'room.H', 'room.doorH', 'room.panelH']) assert.ok(keys.has(k), k);
    assert.ok(keys.has('cwWallGap') || keys.has('plan.carX'), 'la calata');
  });
}
