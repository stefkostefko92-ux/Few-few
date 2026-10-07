// The HEB beams on the shaft's walls in a design (registry locale.putrelle.vano): the derivation takes the shortest
// that pass, raises the machine by their height (the rope beyond the travel follows it), names them in the shaft it
// goes on with and marks them as the software's; a profile or a direction chosen stays; the beams on the drawings
// (their length chosen among the six, their height among the profiles), in the 3D's place, in the bill of materials
// and on sheet 1; a replacement's survey the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { edit as E, type Chain, type Edit, type Entity } from '@/drawing';
import { defaultLift, deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { bedplateMass, hebOf, supportLoad } from '@/lib/lift/support';
import { drawnShaft, enteredShaft } from '@/lib/lift/panel-form';
import { editShaft } from '@/lib/shaft-edit';
import { designBom } from '@/lib/prices/bom';
import { hebRows } from '@/lib/tavole/heb-rows';
import { deriveRoom } from '@/lib/room/derive';
import { applySurveyEdit } from '@/lib/room/edit';
import { startSurvey } from '@/lib/room/survey';
import { HEB_PROFILES, PROFILES, roomGeo, roomPlanEntities, roomSectionEntities, type ShaftBeams } from '@/shaft';
import { roomPlanOn, roomSectionOn } from '@/shaft/room-view';

const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
const picks = (es: readonly Entity[]): Edit[] => chains(es).flatMap((c) => (c.edit ?? []).filter((e): e is Edit => !!e && e.key === 'heb.option'));
const withHeb = (inp: LiftInputs, heb: ShaftBeams): LiftInputs => {
  const R = inp.shaft.room;
  assert.ok(R, 'locale macchina');
  return { ...inp, shaft: { ...inp.shaft, room: { ...R, heb } } };
};
// a machine pulling straight down on our low frame: the frame lies across the beams, which stay between the walls
const onFrame = (): LiftInputs => {
  const b = newLift(), R = b.shaft.room;
  assert.ok(R, 'locale macchina');
  return { ...b, calc: { ...b.calc, layout: 'top' }, shaft: { ...b.shaft, room: { ...R, support: { kind: 'frame' } } } };
};

test('progetto: le putrelle più corte che passano, l’argano alzato della loro altezza, scelte del software', () => {
  const base = onFrame(), plain = deriveLift(base), d = deriveLift(withHeb(base, {}));
  assert.equal(plain.heb, null);
  assert.ok(d.heb, 'putrelle pesate');
  const { options, chosen, auto } = d.heb;
  assert.deepEqual(auto, { profile: true, dir: true });
  assert.equal(options.length, 6);
  // the shortest first, then the lightest; the one taken is the first that passes
  for (let i = 1; i < options.length; i++) {
    const p = options[i - 1], q = options[i];
    assert.ok(p.length < q.length || (p.length === q.length && PROFILES[p.profile].mass <= PROFILES[q.profile].mass), `ordine ${i}`);
  }
  assert.equal(chosen, options.find((o) => o.ok));
  assert.ok(chosen.ok && chosen.bridge, 'sotto il telaio, entro i muri');
  // named in the shaft the design goes on with; the machine stands their height higher
  assert.deepEqual(d.shaft.room?.heb, { profile: chosen.profile, dir: chosen.dir });
  assert.equal(d.machine.base, PROFILES[chosen.profile].h);
  assert.ok(Math.abs(d.machine.axis - plain.machine.axis - PROFILES[chosen.profile].h) < 1e-6);
  assert.ok(Number(d.values.L0) > Number(plain.values.L0), 'la fune oltre la corsa segue l’asse');
  // its checks with the others of the support, as the chosen one does
  assert.deepEqual(d.supportChecks.filter((c) => c.id.startsWith('m_heb')).map((c) => c.status), ['ok', 'ok', 'ok', 'ok', 'ok']);
  // derived again from what it goes on with: the same
  const again = deriveLift({ ...base, shaft: d.shaft });
  assert.deepEqual(again.shaft.room?.heb, d.shaft.room?.heb);
  assert.equal(again.machine.axis, d.machine.axis);
  assert.deepEqual(again.heb?.auto, { profile: false, dir: false });
});

test('progetto: profilo o direzione scelti restano, anche se non passano', () => {
  const base = newLift();
  for (const profile of HEB_PROFILES) {
    const d = deriveLift(withHeb(base, { profile }));
    assert.equal(d.heb?.chosen.profile, profile);
    assert.deepEqual(d.heb?.auto, { profile: false, dir: true });
    assert.equal(d.machine.base, PROFILES[profile].h);
  }
  const y = deriveLift(withHeb(base, { dir: 'y', profile: 'HEB 120' }));
  assert.deepEqual([y.heb?.chosen.dir, y.heb?.chosen.profile], ['y', 'HEB 120']);
  assert.ok(y.supportChecks.some((c) => c.id.startsWith('m_heb') && c.status === 'fail'), 'la scelta a mano che non passa si vede');
});

test('progetto: le putrelle sui disegni, scelte sulla quota; nella distinta e nel foglio 1', () => {
  const inp = withHeb(newLift(), {}), d = deriveLift(inp), G = roomGeo(d.layout, d.machine);
  assert.ok(G && d.heb);
  const plan = picks(roomPlanEntities(d.layout, d.machine, G).entities), sec = picks(roomSectionEntities(d.layout, d.machine, G).entities);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].pick?.options.length, 6);
  assert.equal(plan[0].pick?.options[plan[0].pick.current]?.set, `${d.heb.chosen.dir}:${d.heb.chosen.profile}`);
  assert.equal(sec.length, 1);
  assert.deepEqual(sec[0].pick?.options.map((o) => o.set), HEB_PROFILES.map((p) => `${d.heb?.chosen.dir}:${p}`));
  // choosing another on the plan's length: both named
  const other = plan[0].pick?.options.findIndex((o) => o.set !== plan[0].pick?.options[plan[0].pick.current]?.set) ?? -1;
  const r = editShaft(d.shaft, plan[0], other);
  assert.ok(r.ok);
  const set = String(plan[0].pick?.options[other]?.set).split(':');
  assert.deepEqual(r.inputs.room?.heb, { dir: set[0], profile: set[1] });
  // the bill of materials: two beams of their length; sheet 1: weight and the force on a bearing
  const line = designBom(d).find((l) => l.key === `heb:${d.heb?.chosen.profile}`);
  assert.ok(line && Math.abs(line.qty - (2 * d.heb.chosen.length) / 1000) < 1e-9 && line.unit === 'm');
  const rows = hebRows(d.heb.chosen, (x) => String(Math.round(x)));
  assert.equal(rows.length, 2);
  assert.ok(rows[0][0].includes(d.heb.chosen.profile) && rows[1][2] === 'daN');
});

test('rilievo: le putrelle sotto il nuovo argano, scelte sulla quota del disegno', () => {
  const V = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 }, s0 = startSurvey(780), s = { ...s0, room: { ...s0.room, heb: {} } };
  const plain = deriveRoom(V, s0), d = deriveRoom(V, s);
  assert.equal(plain.heb, null);
  assert.ok(d.heb && d.G, 'putrelle pesate');
  assert.deepEqual(d.G.room.heb, { profile: d.heb.chosen.profile, dir: d.heb.chosen.dir });
  assert.equal(d.M.base, PROFILES[d.heb.chosen.profile].h);
  assert.ok(d.checks.some((c) => c.id === 'm_heb'));
  const plan = picks(roomPlanOn(d.site, d.M, d.G).entities);
  assert.equal(plan.length, 1);
  assert.equal(picks(roomSectionOn(d.site, d.M, d.G).entities).length, 1);
  const last = (plan[0].pick?.options.length ?? 1) - 1, next = applySurveyEdit(s, plan[0], last);
  const set = String(plan[0].pick?.options[last]?.set).split(':');
  assert.deepEqual(next?.room.heb, { dir: set[0], profile: set[1] });
});

test('progetto: i disegni mostrano le putrelle prese; un’altra quota le lascia al software, la scelta sulla quota le inserisce', () => {
  const inp = withHeb(newLift(), {}), d = deriveLift(inp), drawn = drawnShaft(inp.shaft, d);
  assert.deepEqual(drawn.room?.heb, d.shaft.room?.heb);
  const H = drawn.room?.H ?? 0, r = editShaft(drawn, E('room.H'), H + 100);
  assert.ok(r.ok);
  const entered = enteredShaft(r.inputs, inp.shaft, d);
  assert.equal(entered.room?.H, H + 100);
  assert.deepEqual(entered.room?.heb, {}, 'ancora del software');
  const G = roomGeo(d.layout, d.machine);
  assert.ok(G);
  const pick = picks(roomPlanEntities(d.layout, d.machine, G).entities)[0], i = (pick.pick?.current ?? 0) === 0 ? 1 : 0, set = String(pick.pick?.options[i]?.set).split(':');
  const chosen = editShaft(drawn, pick, i);
  assert.ok(chosen.ok);
  assert.deepEqual(enteredShaft(chosen.inputs, inp.shaft, d).room?.heb, { dir: set[0], profile: set[1] });
});

test('progetto: il basamento del costruttore con il rinvio pesa sulle putrelle con l’argano', () => {
  const L = defaultLift(), R = L.shaft.room;
  assert.ok(R);
  const d = deriveLift({ ...L, catalog: { brand: 'SICOR', model: 'SH140' }, shaft: { ...L.shaft, room: { ...R, heb: {} } } }), bed = bedplateMass(d.machine);
  assert.ok(d.machine.rinvio?.maker && bed > 0, 'il basamento SICOR con rinvio');
  const { ctx, res } = d.analysis, reaction = (machine: number) => hebOf(d.layout, d.machine, supportLoad(ctx, res.Mcw, { machine }))?.chosen.result.reaction ?? 0;
  assert.equal(d.heb?.chosen.result.reaction, reaction(ctx.N.mass + bed));
  assert.ok(reaction(ctx.N.mass) < reaction(ctx.N.mass + bed));
});

test('progetto: il telaio con il rinvio sulle sue gambe oltre il muro di fondo — nessuna putrella lo porta, e lo dice', () => {
  // the example's bedplate runs 140 mm past the rear wall's outer face: its rear legs would stand on nothing
  const d = deriveLift(withHeb(newLift(), {}));
  assert.ok(d.heb);
  assert.equal(d.heb.options.some((o) => o.ok), false);
  assert.equal(d.heb.chosen.bridge, false);
  assert.equal(d.supportChecks.find((c) => c.id === 'm_hebwall')?.status, 'fail');
});
