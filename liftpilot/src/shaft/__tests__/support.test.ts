// The machine's support: the typical height of each kind, the sheave's axis it gives (pads on all but the shims), the
// check of the beams against a calculation by hand (IPE 200, 3 m between the walls, machine 400 kg, static load
// 2000 kg × 1,5, shared linearly between the beams under the frame's three irons, the sheave between them), and the
// machine inside the room (walls and ceiling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, KV_VERT, PROFILES, defaultInputs, layout, roomGeo, sheaveAxisOn, supportHeight, type MachineSpec, type MachineSupport } from '../index';
import { ownAxis, supportSpan } from '../support';
import { beamChecks, beamDoorGap, beamResult, fitChecks, freeBeside, machineTop, rowShares } from '../support-check';

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
  // on shims the axis stays where the software puts it
  assert.ok(Math.abs(sheaveAxisOn({ kind: 'shims' }, D, SHIMS_AXIS) - SHIMS_AXIS) < 1e-9);
  // beams raised clear of the floor carry the machine higher: the axis follows the entered height, the machine's own
  // anti-vibration mounts straight on them (until SHAFT 2.21.0 30 mm of pads more under them)
  const raised: MachineSupport = { kind: 'beams', height: 900 };
  assert.ok(Math.abs(sheaveAxisOn(raised, D, SHIMS_AXIS) - (900 + ownAxis(D))) < 1e-9);
  for (const kind of ['frame', 'beams', 'plates', 'plinth'] as const) assert.ok(Math.abs(sheaveAxisOn({ kind }, D, SHIMS_AXIS) - (supportHeight({ kind }, D, SHIMS_AXIS) + ownAxis(D))) < 1e-9, kind);
});

test('putrelle: una sotto ogni ferro del telaio, la puleggia fra i ferri, tensione e freccia come il calcolo a mano', () => {
  const load = { machine: 400, static: 2000, dyn: 1.5 };
  const G = geo({ kind: 'beams' }), b = beamResult(G, M, load);
  assert.ok(b);
  assert.equal(b.clear, 3000);
  assert.equal(b.L, 3000 + KV_VERT.supportBearing);
  // by hand: the generic machine at Ø 400 (scale 400/560) on its frame of three irons, 500 and 180 mm before the
  // sheave's plane and 180 mm past it (at Ø 560), its weight at the middle of its outline 160 mm before the plane, the
  // ropes in it; the load 400 + 2000 × 1,5 kg acts 13,4 mm before the plane, between the irons: linear shares 0,12,
  // 0,32 and 0,55, the iron past the sheave the most loaded, none pulled up
  const sc = D / 560, rows = [500 * sc, 180 * sc, -180 * sc], F = 400 + 2000 * 1.5, v = (400 * 160 * sc) / F;
  const irons = G.frame.beams.map((z) => G.frame.zSheave - z);
  assert.ok(irons.length === 3 && irons.every((r, i) => Math.abs(r - rows[i]) < 1e-9), `i tre ferri ${irons}`);
  const m = rows.reduce((t, r) => t + r, 0) / 3, S = rows.reduce((t, r) => t + (r - m) ** 2, 0), k = rows.map((r) => 1 / 3 + ((v - m) * (r - m)) / S);
  assert.ok(k.every((x) => x > 0.12), `quote ${k}`);
  const most = Math.max(...k) * F * 9.81;
  assert.ok(Math.abs(b.F - most) < 1e-6 && Math.abs(most - 18503.38) < 0.01, `F ${b.F}`);
  const L = 3150, q = (22.4 * 9.81) / 1000, W = 194.3e3, I = 1943e4, E = 210000;
  assert.ok(Math.abs(b.sigma - ((most * L) / 4 + (q * L * L) / 8) / W) < 1e-9, `σ ${b.sigma}`);
  assert.ok(Math.abs(b.f - ((most * L ** 3) / (48 * E * I) + (5 * q * L ** 4) / (384 * E * I))) < 1e-9, `f ${b.f}`);
  assert.ok(Math.abs(b.sigma - 76.40) < 0.01 && Math.abs(b.f - 3.022) < 1e-3, `σ ${b.sigma}, f ${b.f}`);
  assert.ok(Math.abs(b.sigmaMax - 275 / 1.05) < 1e-9);
  assert.equal(b.fMax, 2);
  // the stress passes, the deflection over L/1500 does not; IPE 240 passes both
  const loadChecks = (g: typeof G) => beamChecks(g, M, load).filter((c) => c.id !== 'm_beamwall');
  assert.deepEqual(loadChecks(G).map((c) => [c.id, c.status]), [['m_beam', 'ok'], ['m_beamf', 'fail']]);
  assert.deepEqual(loadChecks(geo({ kind: 'beams', profile: 'IPE 220' })).map((c) => c.status), ['ok', 'fail']);
  assert.deepEqual(loadChecks(geo({ kind: 'beams', profile: 'IPE 240' })).map((c) => c.status), ['ok', 'ok']);
});

test('putrelle: ognuna appoggiata nei muri, mai nel vano della porta del locale', () => {
  const load = { machine: 400, static: 2000, dyn: 1.5 }, wall = (s: MachineSupport, door: Partial<typeof DEFAULT_ROOM>) => {
    const G = roomGeo(layout({ ...defaultInputs(1600, 1750), room: { ...DEFAULT_ROOM, support: s, ...door } }), M);
    assert.ok(G);
    return { gap: beamDoorGap(G), check: beamChecks(G, M, load).find((c) => c.id === 'm_beamwall') };
  };
  // the beams run from the front wall to the rear one, the first of them (its flange at x 943 ± 50) in the door 300…1100
  const inDoor = wall({ kind: 'beams' }, {});
  assert.ok(inDoor.gap !== null && inDoor.gap < 0 && inDoor.check?.status === 'fail', `porta ${inDoor.gap}`);
  // the door further along the wall: every beam bears on masonry
  const clear = wall({ kind: 'beams' }, { doorAt: 1900 });
  assert.ok(clear.gap !== null && clear.gap > 0 && clear.check?.status === 'ok', `porta ${clear.gap}`);
  // the door on a side wall no beam bears in: no check
  assert.equal(wall({ kind: 'beams' }, { doorWall: 'left' }).check, undefined);
});

test('putrelle: le quote di ogni fila sommano il carico e il suo momento', () => {
  // two rows: the lever rule; three (the frame's irons): linear, the same total and the same moment
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
  const G = geo({ kind: 'frame' }), R = G.room, fit = (g: typeof G) => fitChecks(g, M).find((x) => x.id === 'm_fit'), c = fit(G);
  assert.ok(c && c.id === 'm_fit' && c.status === 'ok' && c.unit === 'mm');
  // the least distance: the ceiling over the machine's top, or a corner of its frame — with the frame it stands on, its
  // sections under the irons and running KV_VERT.supportOverhang past the bedplate at each end — to a wall
  const [a, b] = supportSpan({ kind: 'frame' }, D) ?? [0, 0], half = PROFILES[KV_VERT.supportFrame].b / 2;
  const vs = G.frame.beams.flatMap((z) => [z - half, z + half]).map((z) => G.dir * (G.frame.zSheave - z));
  const u0 = Math.min(G.frame0, G.sheaveAt + G.dir * a, G.sheaveAt + G.dir * b), u1 = Math.max(G.frame1, G.sheaveAt + G.dir * a, G.sheaveAt + G.dir * b);
  const v0 = Math.min(G.across[0], ...vs), v1 = Math.max(G.across[1], ...vs);
  assert.ok(u1 - u0 > G.frame1 - G.frame0, 'il telaio sporge oltre il telaio dell’argano');
  const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux]);
  const expected = Math.min(R.H - machineTop(M, G), ...corners.flatMap(([x, y]) => [x, R.W - x, y, R.D - y]));
  assert.equal(c.value, Math.round(expected));
  // a room lower than the machine, a room whose wall cuts the frame: the check fails by as much
  const low = roomGeo(layout({ ...defaultInputs(1600, 1750), room: { ...DEFAULT_ROOM, support: { kind: 'frame' }, H: Math.floor(machineTop(M, G)) - 40 } }), M);
  assert.ok(low);
  const l = fit(low);
  assert.ok(l && l.status === 'fail' && l.value !== null && l.value <= -40);
  const narrow = roomGeo(layout({ ...defaultInputs(1600, 1750), room: { ...DEFAULT_ROOM, support: { kind: 'frame' }, W: 2000, D: 2300 } }), M);
  assert.ok(narrow);
  const n = fit(narrow);
  assert.ok(n && n.value !== null && n.value < (c.value ?? 0));
  assert.deepEqual(fitChecks(null, M), [], 'senza locale nessuna verifica');
});

test('rinvio sul suo supporto sotto l’argano: lo scavalcano solo le putrelle sollevate', async () => {
  const { defaultLift, deriveLift } = await import('../../lib/lift');
  // the wrap angle entered: on a frame the SH140's sheave stands so high that the plan places no diverting pulley for it
  // and the proposal would not take it (shapes.test.ts)
  const L0 = defaultLift(), L = { ...L0, calc: { ...L0.calc, alphaMode: 'manual' }, catalog: { brand: 'SICOR' as const, model: 'SH140' } };
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
