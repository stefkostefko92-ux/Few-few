// One form → shaft, calculation, simulation: the automatic values by hand, the entered ones kept, the records valid
// for the server's schemas, the same derivation twice; the registries of the automatic values and of the simulation
// cover their constants and say their numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInputs, sizeMachine } from '@/calc/index';
import { roomGeo, travel } from '@/shaft';
import { ownAxis } from '@/shaft/support';
import { KV_VERT } from '@/shaft/norme-vert';
import { rinvioAxisOf, rinvioTopOf } from '@/shaft/rinvio';
import { formValuesSchema, visibleBad } from '@/lib/calc-input';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { liftInputsSchema } from '@/lib/lift-input';
import { AUTO_ALL, KL, VOCI_IMPIANTO, carMassEstimate, defaultLift, deriveLift, ropeRig, valueMarks, type LiftInputs } from '@/lib/lift';
import { KS, VOCI_SIM, duration, frameAt, runScenario } from '@/sim';

const it = (x: number): string => String(x).replace('.', ',');

test('dal modulo unico: corsa, portata, velocità, massa stimata, macchina proposta', () => {
  const inp = defaultLift(), d = deriveLift(inp);
  assert.equal(d.values.H, travel(inp.shaft.vertical.floors) / 1000);
  assert.equal(d.values.Q, d.layout.Q);
  assert.equal(d.values.v, inp.shaft.vertical.v);
  assert.equal(d.values.P, carMassEstimate(d.layout.Q));
  assert.equal(carMassEstimate(630), 700);
  assert.equal(d.origin.P, 'estimate');
  assert.equal(d.noProposal, false);
  assert.equal(d.origin.machine, 'auto');
  // the machine proposed passes every check of the verification
  assert.deepEqual(d.analysis.res.fails.map((c) => c.id), []);
  assert.deepEqual(visibleBad(d.analysis.ctx.bad, d.values), []);
});

test('i valori inseriti restano: massa della cabina, macchina, geometria', () => {
  const base = defaultLift();
  const inp: LiftInputs = { ...base, calc: { ...base.calc, P: 812, n_D: 480, dx: 0.42, L0: 2.5 }, auto: { ...AUTO_ALL, P: false, machine: false, dx: false, L0: false } };
  const d = deriveLift(inp);
  assert.equal(d.values.P, 812);
  assert.equal(d.values.n_D, 480);
  assert.equal(d.values.dx, 0.42);
  assert.equal(d.values.L0, 2.5);
  assert.deepEqual([d.origin.P, d.origin.machine, d.origin.dx], ['entered', 'entered', 'entered']);
});

test('segni per i documenti: dagli interruttori salvati; l\'argano proposto solo se la derivazione è nota', () => {
  const inp = defaultLift(), d = deriveLift(inp);
  assert.deepEqual(valueMarks(inp.auto, d), { pEstimate: true, geometry: ['L0', 'dx', 'Hv'], machineProposed: true, bottom: null, catalog: null, collaudo: null });
  assert.equal(valueMarks(inp.auto, null).machineProposed, false);
  const hand: LiftInputs = { ...inp, calc: { ...inp.calc, P: 812, n_D: 480 }, auto: { ...AUTO_ALL, P: false, machine: false, Hv: false } };
  assert.deepEqual(valueMarks(hand.auto, deriveLift(hand)), { pEstimate: false, geometry: ['L0', 'dx'], machineProposed: false, bottom: null, catalog: null, collaudo: null });
});

test('distanza del rinvio e fune oltre la corsa, a mano', () => {
  const d = deriveLift(defaultLift()), L = d.layout, V = d.values;
  const calata = Math.hypot(L.cw.x + L.cw.w / 2 - (L.car.x + L.car.w / 2), L.cw.y + L.cw.h / 2 - (L.car.y + L.car.h / 2));
  const D = Number(V.n_D), Dp = Number(V.Dp);
  assert.equal(V.dx, Math.round(calata - D / 2 - Dp / 2) / 1000);
  const vt = d.shaft.vertical, room = d.shaft.room;
  assert.ok(room);
  // the machine on the bedplate with the diverting pulley (registry locale.rinvio): its top, then the machine
  const axis = rinvioTopOf(Dp) + ownAxis(D);
  assert.equal(d.machine.axis, axis);
  assert.equal(V.L0, Math.round(vt.headroom - vt.frameTop + room.slab + axis) / 1000);
});

test('il rinvio sta nel locale, nel telaio dell\'argano: mai nel vano', () => {
  const base = defaultLift();
  for (const calc of [base.calc, { ...base.calc, r: '2' }, { ...base.calc, Dp: 600 }]) {
    const d = deriveLift({ ...base, calc }), M = d.machine, rf = M.rinvio, Dp = Number(d.values.Dp);
    assert.ok(rf && rf.on === 'frame', 'telaio con rinvio quando nessun basamento è scelto');
    assert.equal(rf.pulleyAxis, rinvioAxisOf(Dp));
    assert.ok(rf.pulleyAxis - Dp / 2 >= KV_VERT.rinvioRim, 'il bordo del rinvio sopra il pavimento');
    assert.ok(rf.top >= rf.pulleyAxis + Dp / 2 + KV_VERT.rinvioOver - 1e-9, 'il rinvio sotto le travi');
    // h is the sheave's axis over the pulley's
    assert.ok(Math.abs(Number(d.values.h) - Math.round(M.axis - rf.pulleyAxis) / 1000) < 1e-9, `h ${d.values.h}`);
    const G = roomGeo(d.layout, M);
    assert.ok(G && G.pulleyZ - Dp / 2 >= 0);
  }
  // another support chosen: the pulley on its own stand, at the same height; an h by hand under the floor is an issue
  const room = base.shaft.room;
  assert.ok(room);
  const stand = deriveLift({ ...base, shaft: { ...base.shaft, room: { ...room, support: { kind: 'plinth' } } } });
  assert.equal(stand.machine.rinvio?.on, 'stand');
  const low = deriveLift({ ...base, auto: { ...base.auto, dx: false }, calc: { ...base.calc, h: 2.5 } });
  assert.ok(low.issues.includes('rinvio'));
});

test('rinvio dalla pianta: semplice o inverso come lo legge l\'angolo di avvolgimento; 2:1 dal lato interno delle pulegge', () => {
  const base = defaultLift();
  const spacing = (d: ReturnType<typeof deriveLift>): number => {
    const L = d.layout;
    return Math.hypot(L.cw.x + L.cw.w / 2 - (L.car.x + L.car.w / 2), L.cw.y + L.cw.h / 2 - (L.car.y + L.car.h / 2));
  };
  const same3d = (d: ReturnType<typeof deriveLift>): void => {
    const rig = ropeRig(d), defl = rig.wheels.find((w) => w.role === 'deflector');
    assert.ok(defl && Math.abs(defl.u - rig.sheave.u - Number(d.values.dx)) < 1e-9, 'stessa geometria nel 3D');
  };
  // 2:1 in a deep shaft: a simple bend, the ropes Dp closer together
  const deep = deriveLift({ ...base, shaft: { ...base.shaft, D: 2200 }, calc: { ...base.calc, r: '2' } });
  const D1 = Number(deep.values.n_D), Dp = Number(deep.values.Dp);
  assert.ok(Math.abs(Number(deep.values.dx) - Math.round(spacing(deep) - Dp - D1 / 2 - Dp / 2) / 1000) < 1e-12, `dx ${deep.values.dx}`);
  assert.deepEqual(deep.issues, []);
  same3d(deep);
  // 2:1 in the example shaft: only a reverse bend places the rope drop where the plan has it (Dp/2 past the pulley)
  const tight = deriveLift({ ...base, calc: { ...base.calc, r: '2' } }), D2 = Number(tight.values.n_D);
  assert.deepEqual(tight.issues, []);
  assert.ok(Math.abs(Number(tight.values.dx) - Math.round(spacing(tight) - Dp - D2 / 2 + Dp / 2) / 1000) < 1e-12, `dx ${tight.values.dx}`);
  same3d(tight);
  // a sheave entered by hand that leaves neither bend: the distance is reported, the form cannot be saved as is
  const hand = deriveLift({ ...base, calc: { ...base.calc, r: '2', n_D: 560 }, auto: { ...AUTO_ALL, machine: false } });
  assert.deepEqual(hand.issues, ['dx']);
  assert.deepEqual(deriveLift({ ...base, calc: { ...base.calc, r: '2', n_D: 560 }, auto: { ...AUTO_ALL, machine: false, dx: false } }).issues, []);
});

test('tiro diretto: la puleggia è la calata della pianta; un diametro diverso o fuori gamma è segnalato', () => {
  const base = defaultLift(), top = { ...base.calc, layout: 'top' };
  for (const shaft of [base.shaft, { ...base.shaft, cw: 'left' as const }]) {
    const d = deriveLift({ ...base, shaft, calc: top }), c = d.calata ?? 0, rig = ropeRig(d);
    assert.equal(d.analysis.ctx.N.D, Math.round(c));
    assert.deepEqual(d.issues, []);
    // the falls hang plumb: the sheave's counterweight side over the counterweight's drop
    assert.ok(Math.abs((rig.sheave.u + rig.sheave.r) * 1000 - rig.calata * 1000) <= KL.calataTol, `calata ${c}`);
  }
  // another sheave by hand, or the existing one compared: the plan contradicts it
  assert.deepEqual(deriveLift({ ...base, calc: { ...top, n_D: 560 }, auto: { ...AUTO_ALL, machine: false } }).issues, ['calata']);
  assert.deepEqual(deriveLift({ ...base, calc: { ...top, compare: true, o_D: 560 } }).issues, ['calata']);
  // a car so deep that the falls are beyond the calculation's sheaves: no machine, the plan must change
  const deep = deriveLift({ ...base, shaft: { ...base.shaft, W: 2000, D: 2300 }, calc: top });
  assert.ok((deep.calata ?? 0) > 800 && deep.noProposal && deep.issues.includes('calata'));
  // with a diverting pulley the falls are free
  assert.equal(deriveLift(base).calata, null);
});

test('macchina proposta: la stessa qualunque puleggia fosse inserita prima; con la geometria a mano, quella del dimensionamento', () => {
  const base = defaultLift();
  for (const shaft of [base.shaft, { ...base.shaft, W: 1100, D: 1300, cw: 'left' as const }]) {
    const D = [440, 560, 640].map((n_D) => deriveLift({ ...base, shaft, calc: { ...base.calc, n_D } }).analysis.ctx.N.D);
    assert.deepEqual(new Set(D).size, 1, `pulegge ${D.join('/')}`);
  }
  const hand = deriveLift({ ...base, calc: { ...base.calc, context: 'new' }, auto: { ...AUTO_ALL, L0: false, dx: false } }), c = readInputs(hand.values);
  const sz = sizeMachine(c.I, c.N, c.fixedD, c.rope);
  assert.deepEqual([hand.analysis.ctx.N.D, hand.analysis.ctx.N.n, hand.analysis.ctx.N.d], [sz.pick?.D, sz.pick?.n, sz.pick?.d]);
});

test('i record che il server salva passano gli schemi e si rifanno uguali', () => {
  const inp = defaultLift();
  assert.ok(liftInputsSchema.safeParse(inp).success);
  const d = deriveLift(inp);
  assert.ok(formValuesSchema.safeParse(d.values).success);
  assert.ok(shaftInputsSchema.safeParse(d.shaft).success);
  assert.deepEqual(readInputs(d.values).bad, []);
  assert.deepEqual(deriveLift(inp).values, d.values);
});

test('la simulazione dell\'impianto derivato: la cabina arriva all\'ultimo piano', () => {
  const d = deriveLift(defaultLift()), top = d.sim.levels.length - 1;
  const run = runScenario(d.sim, { id: 'ride', p: { from: 0, to: top, load: 0 } });
  assert.ok(Math.abs(frameAt(run.series, duration(run.series)).s - d.sim.levels[top]) < 1e-9);
});

test('registri dei valori automatici e della simulazione', () => {
  for (const voci of [VOCI_IMPIANTO, VOCI_SIM]) {
    const ids = voci.map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const v of voci) for (const f of ['titolo', 'valore', 'riferimento', 'fonte'] as const) assert.ok(v[f].trim(), `${v.id}: ${f}`);
  }
  const usedL = new Set(VOCI_IMPIANTO.flatMap((v) => v.costanti ?? [])), usedS = new Set(VOCI_SIM.flatMap((v) => v.costanti ?? []));
  assert.deepEqual(Object.keys(KL).filter((k) => !usedL.has(k as keyof typeof KL)), []);
  assert.deepEqual(Object.keys(KS).filter((k) => !usedS.has(k as keyof typeof KS)), []);
  const text = (voci: readonly { id: string; valore: string }[], id: string): string => voci.find((v) => v.id === id)?.valore ?? '';
  assert.ok(text(VOCI_IMPIANTO, 'impianto.massa.cabina').includes(`P = ${it(KL.carMassRatio)}·Q`));
  assert.ok(text(VOCI_IMPIANTO, 'impianto.massa.cabina').includes(`${KL.carMassStep} kg`));
  assert.ok(text(VOCI_IMPIANTO, 'impianto.L0').includes(`${it(KL.sheaveAxisPerD)}·D`));
  assert.ok(text(VOCI_IMPIANTO, 'impianto.calata').includes(`più di ${KL.calataTol} mm`));
  const pct = (x: number): string => `${it(Math.round(x * 1000) / 10)} %`, carico = text(VOCI_IMPIANTO, 'impianto.variazione.carico');
  for (const x of [...KL.loadIncQ, ...KL.loadIncT, ...KL.loadIncTcp, KL.loadStruct11]) assert.ok(carico.includes(pct(x)), pct(x));
  assert.ok(carico.includes(`${KL.loadSplitQ} kg`));
  assert.ok(text(VOCI_IMPIANTO, 'impianto.marcatura').includes(KL.ceFrom.split('-').reverse().join('/')));
  assert.ok(text(VOCI_SIM, 'sim.profilo').includes(`${it(KS.jerk)} m/s³`));
  for (const k of ['doorOpen', 'doorClose', 'dwell', 'startDelay'] as const) assert.ok(text(VOCI_SIM, 'sim.porte').includes(`${it(KS[k])} s`), k);
  assert.ok(text(VOCI_SIM, 'sim.ammortizzatori').includes(`${it(KS.bufferSpeed)} volte`));
  assert.ok(text(VOCI_SIM, 'sim.bloccata').includes(`${it(KS.stallSpeed)} m/s`));
  assert.ok(text(VOCI_SIM, 'sim.passo').includes(`${it(KS.step)} s`));
});
