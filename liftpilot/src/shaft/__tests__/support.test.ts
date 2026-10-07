// The machine's support: the typical height of each kind, the sheave's axis it gives (pads on all but the shims), the
// check of the beams against a calculation by hand (IPE 200, 3 m between the walls, machine 400 kg, static load
// 2000 kg × 1,5), and the machine inside the room (walls and ceiling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, KV_VERT, PROFILES, defaultInputs, layout, padsOf, roomGeo, sheaveAxisOn, supportHeight, type MachineSpec, type MachineSupport } from '../index';
import { ownAxis } from '../support';
import { beamChecks, beamResult, fitChecks, freeBeside, machineTop } from '../support-check';

const D = 400, SHIMS_AXIS = 0.55 * D;
const M: MachineSpec = { D, Dp: 0, n: 5, d: 8, mass: 400, label: '', axis: 600, h: 0, reverse: false, ropeIn: 0 };
const geo = (s: MachineSupport) => {
  const G = roomGeo(layout({ ...defaultInputs(1600, 1750), room: { ...DEFAULT_ROOM, support: s } }), M);
  assert.ok(G, 'locale macchina');
  return G;
};

test('basamento: altezza tipica di ogni tipo e asse della puleggia', () => {
  assert.equal(supportHeight({ kind: 'frame' }, D, SHIMS_AXIS), PROFILES[KV_VERT.supportFrame].h);
  assert.equal(supportHeight({ kind: 'beams' }, D, SHIMS_AXIS), PROFILES[KV_VERT.supportBeam].h);
  assert.equal(supportHeight({ kind: 'plates' }, D, SHIMS_AXIS), KV_VERT.supportPlate);
  assert.equal(supportHeight({ kind: 'plinth' }, D, SHIMS_AXIS), KV_VERT.supportPlinth);
  // on shims the axis stays where the software puts it, without pads
  assert.equal(padsOf({ kind: 'shims' }), 0);
  assert.ok(Math.abs(sheaveAxisOn({ kind: 'shims' }, D, SHIMS_AXIS) - SHIMS_AXIS) < 1e-9);
  // beams raised clear of the floor carry the machine higher: the axis follows the entered height
  const raised: MachineSupport = { kind: 'beams', height: 900 };
  assert.ok(Math.abs(sheaveAxisOn(raised, D, SHIMS_AXIS) - (900 + KV_VERT.supportPads + ownAxis(D))) < 1e-9);
});

test('putrelle: tensione e freccia come il calcolo a mano', () => {
  const b = beamResult(geo({ kind: 'beams' }), { machine: 400, static: 2000, dyn: 1.5 });
  assert.ok(b);
  assert.equal(b.clear, 3000);
  assert.equal(b.L, 3000 + KV_VERT.supportBearing);
  assert.ok(Math.abs(b.F - 16677) < 1e-6, `F ${b.F}`);
  assert.ok(Math.abs(b.sigma - 68.9948) < 1e-3, `σ ${b.sigma}`);
  assert.ok(Math.abs(b.f - 2.73048) < 1e-4, `f ${b.f}`);
  assert.ok(Math.abs(b.sigmaMax - 275 / 1.05) < 1e-9);
  assert.equal(b.fMax, 2);
  // the stress passes, the deflection over L/1500 does not: a stiffer profile passes both
  assert.deepEqual(beamChecks(geo({ kind: 'beams' }), { machine: 400, static: 2000, dyn: 1.5 }).map((c) => [c.id, c.status]), [['m_beam', 'ok'], ['m_beamf', 'fail']]);
  assert.deepEqual(beamChecks(geo({ kind: 'beams', profile: 'IPE 240' }), { machine: 400, static: 2000, dyn: 1.5 }).map((c) => c.status), ['ok', 'ok']);
});

test('putrelle: nessuna verifica sugli altri basamenti', () => {
  for (const kind of ['shims', 'frame', 'plates', 'plinth'] as const) assert.deepEqual(beamChecks(geo({ kind }), { machine: 400, static: 2000, dyn: 1.5 }), []);
});

test('ingombro: l’argano dentro il locale, il margine minimo da muri e soffitto', () => {
  const G = geo({ kind: 'frame' }), R = G.room, [c] = fitChecks(G, M);
  assert.ok(c && c.id === 'm_fit' && c.status === 'ok' && c.unit === 'mm');
  // the least distance: the ceiling over the machine's top, or a corner of its frame to a wall
  const corners = [[G.frame0, G.across[0]], [G.frame1, G.across[0]], [G.frame1, G.across[1]], [G.frame0, G.across[1]]].map(([u, v]) => [
    G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux]);
  const expected = Math.min(R.H - machineTop(M, G), ...corners.flatMap(([x, y]) => [x, R.W - x, y, R.D - y]));
  assert.equal(c.value, Math.round(expected));
  // a room lower than the machine, a room whose wall cuts the frame: the check fails by as much
  const low = roomGeo(layout({ ...defaultInputs(1600, 1750), room: { ...DEFAULT_ROOM, support: { kind: 'frame' }, H: Math.floor(machineTop(M, G)) - 40 } }), M);
  assert.ok(low);
  const [l] = fitChecks(low, M);
  assert.ok(l && l.status === 'fail' && l.value !== null && l.value <= -40);
  const narrow = roomGeo(layout({ ...defaultInputs(1600, 1750), room: { ...DEFAULT_ROOM, support: { kind: 'frame' }, W: 2000, D: 2300 } }), M);
  assert.ok(narrow);
  const [n] = fitChecks(narrow, M);
  assert.ok(n && n.value !== null && n.value < (c.value ?? 0));
  assert.deepEqual(fitChecks(null, M), [], 'senza locale nessuna verifica');
});

test('rinvio sul suo supporto sotto l’argano: lo scavalcano solo le putrelle sollevate', async () => {
  const { defaultLift, deriveLift } = await import('../../lib/lift');
  const L = { ...defaultLift(), catalog: { brand: 'SICOR' as const, model: 'SH140' } };
  const withSupport = (support: MachineSupport) => deriveLift({ ...L, shaft: { ...L.shaft, room: { ...(L.shaft.room ?? DEFAULT_ROOM), support } } });
  const stand = (s: MachineSupport) => withSupport(s).supportChecks.find((c) => c.id === 'm_stand');
  // a frame on the floor over the pulley's stand: they clash by the pulley's top
  const onFrame = stand({ kind: 'frame' });
  assert.ok(onFrame && onFrame.status === 'fail' && onFrame.value !== null && onFrame.value < 0);
  // beams raised over it: clear
  const raised = stand({ kind: 'beams', height: 1400 });
  assert.ok(raised && raised.status === 'ok' && raised.value !== null && raised.value > 0);
  // on the bedplate with the pulley (the default) there is no stand
  assert.equal(deriveLift(L).supportChecks.find((c) => c.id === 'm_stand'), undefined);
});

test('superficie libera accanto all’argano: 500 × 600 mm sul lato più libero, fino a muri e quadro', () => {
  const R = DEFAULT_ROOM, K = KV_VERT, dn = (f: ReturnType<typeof freeBeside>) => ({ depth: f.depth, need: f.need });
  // a machine 1000 × 600 mm near the left wall: the most room is behind its 1000 mm side, which takes 500 deep (the
  // strip 500 deep along that side)
  assert.deepEqual(freeBeside(R, [500, 500, 1500, 1100]), { depth: R.D - 1100, need: K.maintW, area: [500, 1100, 1500, 1100 + K.maintW] });
  // a machine 550 × 500 mm: in front of a side shorter than 600 mm the area needs 600 deep
  assert.deepEqual(dn(freeBeside(R, [500, 500, 1050, 1000])), { depth: R.D - 1000, need: K.maintD });
  // pushed into a corner, only 500 left in front of its 1000 mm side: enough the other way round (500 deep, ≥ 600 long)
  assert.deepEqual(dn(freeBeside({ ...R, W: 1500, D: 1600 }, [0, 0, 1500, 1100])), { depth: 500, need: K.maintW });
  // the control panel in front of that side takes its depth
  const panel = { ...R, W: 1500, D: 1700, panelWall: 'rear' as const, panelAt: 0, panelW: 1500, panelD: 300 };
  assert.ok(freeBeside(panel, [0, 0, 1500, 1100]).depth < K.maintW);
  // so does what else stands beside it: a governor 200 mm behind the machine leaves the right side the most room
  const gov = freeBeside(R, [500, 500, 1500, 1100], [[900, 1300, 1100, 1500]]);
  assert.deepEqual(gov, { depth: R.W - 1500, need: K.maintW, area: [1500, 500, 1500 + K.maintW, 1100] });
  // on the design: the default machine room leaves the area free
  const L = layout(defaultInputs(1600, 1750)), G = roomGeo(L, M);
  assert.equal(fitChecks(G, M).find((c) => c.id === 'm_free')?.status, 'ok');
});
