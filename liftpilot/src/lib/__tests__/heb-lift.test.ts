// The HEB beams on the shaft's walls in a design (registry locale.putrelle.vano): the derivation takes the shortest
// that pass, raises the machine by their height (the rope beyond the travel follows it), names them in the shaft it
// goes on with and marks them as the software's; a profile or a direction chosen stays; the beams on the drawings
// (their length chosen among the six, their height among the profiles), in the 3D's place, in the bill of materials
// and on sheet 1; a replacement's survey the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { edit as E, type Chain, type Edit, type Entity, type Pt } from '@/drawing';
import { KV_VERT } from '@/shaft/norme-vert';
import { HEB_PAD } from '@/shaft/support';
import { defaultLift, deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { bedplateMass, hebOf, supportLoad } from '@/lib/lift/support';
import { drawnShaft, enteredShaft } from '@/lib/lift/panel-form';
import { editShaft } from '@/lib/shaft-edit';
import { designBom } from '@/lib/prices/bom';
import { hebRows } from '@/lib/tavole/heb-rows';
import { deriveRoom } from '@/lib/room/derive';
import { applySurveyEdit } from '@/lib/room/edit';
import { startSurvey } from '@/lib/room/survey';
import { HEB_PROFILES, PROFILES, hebDrawn, roomGeo, roomPlanEntities, roomSectionEntities, type ShaftBeams } from '@/shaft';
import { outlineFromBeam, upstands } from '@/shaft/heb-clear';
import { layoutSite } from '@/shaft/room-site';
import { bedplateLegs, rinvioRun } from '@/shaft/rinvio';
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
  // (on their bearing plates and mortar beds, HEB_PAD more: round 36)
  assert.equal(d.machine.base, PROFILES[chosen.profile].h + HEB_PAD);
  assert.ok(Math.abs(d.machine.axis - plain.machine.axis - PROFILES[chosen.profile].h - HEB_PAD) < 1e-6);
  assert.ok(Number(d.values.L0) > Number(plain.values.L0), 'la fune oltre la corsa segue l’asse');
  // its checks with the others of the support, as the chosen one does
  assert.deepEqual(d.supportChecks.filter((c) => c.id.startsWith('m_heb')).map((c) => [c.id, c.status]),
    [['m_heb', 'ok'], ['m_hebf', 'ok'], ['m_hebfeet', 'ok'], ['m_hebrope', 'ok'], ['m_hebkerb', 'ok'], ['m_hebwall', 'ok']]);
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
    assert.equal(d.machine.base, PROFILES[profile].h + HEB_PAD);
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
  assert.equal(d.M.base, PROFILES[d.heb.chosen.profile].h + HEB_PAD);
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

test('progetto: il telaio con il rinvio scavalca le putrelle — le gambe dove i suoi lati le incrociano, il telaio oltre di esse', () => {
  // the example's bedplate runs 140 mm past the rear wall's outer face: on its corners its rear legs would stand on
  // nothing (until LIFT 1.27.0 no option passed); its legs go where its sides cross the beams, the beams inside the walls
  const d = deriveLift(withHeb(newLift(), {}));
  assert.ok(d.heb && d.machine.rinvio?.on === 'frame' && !d.machine.rinvio.maker);
  const c = d.heb.chosen;
  assert.ok(c.ok && c.bridge, `${c.dir} ${c.profile}`);
  assert.deepEqual([c.dir, c.profile], ['x', 'HEB 140'], 'le più corte, poi le più leggere');
  assert.ok(d.supportChecks.filter((x) => x.id.startsWith('m_heb')).every((x) => x.status === 'ok'));
  const G = roomGeo(d.layout, d.machine);
  assert.ok(G);
  const legs = bedplateLegs(G, d.machine, c), [u0, u1] = rinvioRun(d.machine, G);
  assert.equal(legs.length, 4);
  for (const [u, v] of legs) {
    // on a beam's axis (beams along x: constant y), on the bedplate
    const y = G.carDrop[1] + u * G.uy + v * G.ux;
    assert.ok(c.at.some((a) => Math.abs(a - y) < 1e-6), `gamba a y ${y}`);
    assert.ok(u > u0 && u < u1);
  }
  // the plan and section B-B draw them there, as the 3D sets them (until LIFT 1.27.0 the drawings kept them at the corners)
  const leg = KV_VERT.rinvioLeg, steel = (es: readonly Entity[]): Pt[][] => es.flatMap((e) => (e.e === 'path' && e.fill === 'steel' && e.pts.length === 4 ? [[...e.pts]] : []));
  const centres = steel(roomPlanEntities(d.layout, d.machine, G).entities).map((q): Pt => [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]);
  for (const [u, v] of legs) {
    const p: Pt = [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];
    assert.ok(centres.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6), `pianta: gamba a ${p.map(Math.round)}`);
  }
  const starts = steel(roomSectionEntities(d.layout, d.machine, G).entities).filter((q) => Math.abs(q[1][0] - q[0][0] - leg) < 1e-6).map((q) => q[0][0]);
  for (const [u] of legs) assert.ok(starts.some((x) => Math.abs(x - (u - leg / 2)) < 1e-6), `sezione B-B: gamba a u ${Math.round(u)}`);
  // turned round, the ropes in other places: the beams keep clear of them and pass
  const t = deriveLift(withHeb({ ...newLift(), shaft: { ...newLift().shaft, room: { ...(newLift().shaft.room ?? {}), motor: 'car' } } } as LiftInputs, {}));
  assert.ok(t.heb?.chosen.ok, 'girato');
});

test('progetto: le putrelle HEB fuori dai bordi dei fori in pianta, anche con le calate oblique o di lato (m_hebkerb)', () => {
  // round 36 review: the beams stand HEB_PAD over the slab, under the top of an upstand; drawn over one they would cut it
  const left = (inp: LiftInputs): LiftInputs => ({ ...inp, shaft: { ...inp.shaft, cw: 'left' } });
  const diag = (inp: LiftInputs): LiftInputs => ({ ...left(inp), shaft: { ...left(inp).shaft, plan: { ...(inp.shaft.plan ?? {}), cwPos: 300 } } });
  for (const [name, inp] of [['esempio', newLift()], ['contrappeso a sinistra', left(newLift())], ['calate oblique', diag(newLift())], ['telaio basso', onFrame()]] as const) {
    const d = deriveLift(withHeb(inp, {}));
    assert.ok(d.heb, name);
    const G = roomGeo(d.layout, d.machine);
    assert.ok(G, name);
    const S = layoutSite(d.layout), lay = hebDrawn(G, d.machine, S, S.govRopes), kerbs = upstands(G, d.machine, S);
    assert.ok(lay && kerbs.length > 0, name);
    const least = Math.min(...kerbs.flatMap((k) => lay.at.map((ax) => outlineFromBeam(k, lay, ax))));
    const check = d.supportChecks.find((c) => c.id === 'm_hebkerb');
    assert.ok(check, `${name}: verifica`);
    // the drawn beams are the derivation's: off every upstand when it passes, and the check tells otherwise
    assert.equal(check.status === 'ok', least >= -1e-6, `${name}: ${least}`);
    if (d.heb.chosen.ok) assert.ok(least >= -1e-6, `${name}: putrella sul bordo (${least})`);
  }
});
