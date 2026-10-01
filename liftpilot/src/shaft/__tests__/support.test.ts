// The machine's support: the typical height of each kind, the sheave's axis it gives (pads on all but the shims), and
// the check of the beams against a calculation by hand (IPE 200, 3 m between the walls, machine 400 kg, static load
// 2000 kg × 1,5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, KV_VERT, PROFILES, defaultInputs, layout, padsOf, roomGeo, sheaveAxisOn, supportHeight, type MachineSpec, type MachineSupport } from '../index';
import { ownAxis } from '../support';
import { beamChecks, beamResult } from '../support-check';

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
