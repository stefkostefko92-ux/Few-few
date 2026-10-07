// The machine's support: the typical height of each kind, the sheave's axis it gives (pads on all but the shims), the
// check of the beams against a calculation by hand (IPE 200, 3 m between the walls, machine 400 kg, static load
// 2000 kg × 1,5, shared by the lever rule between the beams under the bedplate's rows), and the machine inside the room
// (walls and ceiling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, KV_VERT, PROFILES, defaultInputs, layout, padsOf, roomGeo, sheaveAxisOn, supportHeight, type MachineSpec, type MachineSupport } from '../index';
import { ownAxis } from '../support';
import { beamChecks, beamResult, fitChecks, freeBeside, machineTop, rowShares } from '../support-check';

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

test('putrelle: la regola della leva, tensione e freccia come il calcolo a mano', () => {
  const load = { machine: 400, static: 2000, dyn: 1.5 };
  const b = beamResult(geo({ kind: 'beams' }), M, load);
  assert.ok(b);
  assert.equal(b.clear, 3000);
  assert.equal(b.L, 3000 + KV_VERT.supportBearing);
  // by hand: the generic machine at Ø 400 (scale 400/560), the beams under its bedplate's rows 180 and 500 mm from the
  // sheave's plane, its weight 245 mm from it, the ropes in it; the load 400 + 2000 × 1,5 kg acts 20,6 mm from the
  // sheave's plane, outside the beams: the near one takes 1,47 of it, the far one is pulled up by 0,47
  const sc = D / 560, a = 180 * sc, z = 500 * sc, F = 400 + 2000 * 1.5, v = (400 * 245 * sc) / F;
  const near = ((z - v) / (z - a)) * F * 9.81, far = ((v - a) / (z - a)) * F * 9.81;
  assert.ok(Math.abs(b.F - near) < 1e-6 && Math.abs(near - 49111.31) < 0.01, `F ${b.F}`);
  assert.ok(Math.abs(b.up + far) < 1e-6 && Math.abs(b.up - 15757.31) < 0.01, `up ${b.up}`);
  const L = 3150, q = (22.4 * 9.81) / 1000, W = 194.3e3, I = 1943e4, E = 210000;
  assert.ok(Math.abs(b.sigma - ((near * L) / 4 + (q * L * L) / 8) / W) < 1e-9, `σ ${b.sigma}`);
  assert.ok(Math.abs(b.f - ((near * L ** 3) / (48 * E * I) + (5 * q * L ** 4) / (384 * E * I))) < 1e-9, `f ${b.f}`);
  assert.ok(Math.abs(b.sigma - 200.45) < 0.01 && Math.abs(b.f - 7.907) < 1e-3, `σ ${b.sigma}, f ${b.f}`);
  assert.ok(Math.abs(b.sigmaMax - 275 / 1.05) < 1e-9);
  assert.equal(b.fMax, 2);
  // the stress passes, the deflection over L/1500 does not, the far beam is pulled up (a warning: anchor it); a stiffer
  // profile passes both, the pull stays (where the load acts, not the profile)
  assert.deepEqual(beamChecks(geo({ kind: 'beams' }), M, load).map((c) => [c.id, c.status]), [['m_beam', 'ok'], ['m_beamf', 'fail'], ['m_beamup', 'warn']]);
  assert.deepEqual(beamChecks(geo({ kind: 'beams', profile: 'IPE 300' }), M, load).map((c) => c.status), ['ok', 'ok', 'warn']);
  const up = beamChecks(geo({ kind: 'beams' }), M, load).find((c) => c.id === 'm_beamup');
  assert.ok(up && up.unit === 'kN' && up.value !== null && Math.abs(up.value - 15.7573) < 1e-4 && up.limit === 0);
  // a heavy machine with a light load on its ropes: the resultant between the beams, no pull
  const heavy = beamChecks(geo({ kind: 'beams', profile: 'IPE 300' }), M, { machine: 4000, static: 200, dyn: 1.5 }).find((c) => c.id === 'm_beamup');
  assert.ok(heavy && heavy.status === 'ok' && heavy.value === 0);
});

test('putrelle: le quote di ogni fila sommano il carico e il suo momento', () => {
  // two rows: the lever rule; three (an outboard support's row): linear, the same total and the same moment
  assert.deepEqual(rowShares([100, 300], 150), [0.75, 0.25]);
  assert.deepEqual(rowShares([100, 300], 0), [1.5, -0.5]);
  for (const v of [-80, 0, 150, 260, 420]) {
    const rows = [100, 220, 400], k = rowShares(rows, v);
    assert.ok(Math.abs(k.reduce((t, x) => t + x, 0) - 1) < 1e-12, `somma a ${v}`);
    assert.ok(Math.abs(k.reduce((t, x, i) => t + x * rows[i], 0) - v) < 1e-9, `momento a ${v}`);
  }
  assert.deepEqual(rowShares([200], 0), [1], 'una sola fila: tutto su di essa');
});

test('putrelle: nessuna verifica sugli altri basamenti', () => {
  for (const kind of ['shims', 'frame', 'plates', 'plinth'] as const) assert.deepEqual(beamChecks(geo({ kind }), M, { machine: 400, static: 2000, dyn: 1.5 }), []);
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
