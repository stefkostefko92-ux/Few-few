// The HEB beams on the shaft's walls (registry locale.putrelle.vano): their layout over the shaft (under the outermost
// feet, or as far apart as the walls let them under a frame crossing them), the check of a beam against a calculation
// by hand (HEB 140, 1600 mm between the walls, 40 kN between the two beams at mid-span), the margins of the feet, the
// ropes and the walls (a beam past the walls' outer faces rests on nothing), the six weighed in order and the one
// taken, the choice on a drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, KV_VERT, PROFILES, defaultInputs, hebChecks, hebDrawn, hebLayout, hebPick, hebResult, layout, roomGeo, type HebOption, type MachineSpec } from '../index';
import { HEB_KEYS, withHebChoice } from '../heb';
import { hebBase, onHeb } from '../support';

const M: MachineSpec = { D: 400, Dp: 0, n: 5, d: 8, mass: 400, label: '', axis: 600, h: 0, reverse: false, ropeIn: 0 };
const near = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('putrelle HEB: tra le facce interne del vano, 200 mm in ogni muro, sotto i piedi più esterni', () => {
  const R = { ...DEFAULT_ROOM, shaftX: 500, shaftY: 400 }, S = { W: 1600, D: 1750, wall: 250 };
  const feet = [[900, 1000], [1900, 1000], [900, 1500], [1900, 1500]] as const;
  const x = hebLayout(R, S, feet, 'x', 'HEB 140');
  assert.deepEqual(x.span, [500, 2100]);
  assert.deepEqual(x.ends, [500 - KV_VERT.hebBearing, 2100 + KV_VERT.hebBearing]);
  assert.equal(x.length, 1600 + 2 * KV_VERT.hebBearing);
  assert.deepEqual(x.at, [1000, 1500]);
  // across them the walls carrying them, outer face to outer face
  assert.deepEqual(x.walls, [400 - 250, 400 + 1750 + 250]);
  assert.equal(x.bridge, false);
  const y = hebLayout(R, S, feet, 'y', 'HEB 120');
  assert.deepEqual(y.span, [400, 2150]);
  assert.equal(y.length, 1750 + 400);
  assert.deepEqual(y.at, [900, 1900]);
  assert.deepEqual(y.walls, [500 - 250, 500 + 1600 + 250]);
});

test('putrelle HEB: sotto un telaio più lungo del vano, entro i muri; sotto i piedi, fuori dai muri non passano', () => {
  const R = { ...DEFAULT_ROOM, shaftX: 500, shaftY: 400 }, S = { W: 1600, D: 1750, wall: 250 }, half = PROFILES['HEB 160'].b / 2;
  // the frame's ends past the rear wall's outer face (2400): under the frame the second beam stays on that wall
  const feet = [[900, 1000], [1600, 1000], [900, 2600], [1600, 2600]] as const;
  const frame = hebLayout(R, S, feet, 'x', 'HEB 160', true);
  assert.equal(frame.bridge, true);
  assert.deepEqual(frame.at, [1000, 2400 - half]);
  const res = { at: [1250, 1700] as const, F: 30000 };
  const on = hebResult(frame, res, feet, [], 250);
  assert.ok(on.feet > 0 && on.wall >= 0, `piedi ${on.feet}, muri ${on.wall}`);
  // the same feet standing on the beams: the second beam past the wall rests on nothing
  const strict = hebLayout(R, S, feet, 'x', 'HEB 160');
  assert.deepEqual(strict.at, [1000, 2600]);
  const off = hebResult(strict, res, feet, [], 250);
  assert.equal(off.wall, 2400 - 2600 - half);
  assert.equal(hebChecks(off).find((c) => c.id === 'm_hebwall')?.status, 'fail');
  // no room for two beams under the frame between the walls: as under feet, failing
  const narrow = hebLayout(R, S, [[900, 2380], [1600, 2380], [900, 2700], [1600, 2700]], 'x', 'HEB 160', true);
  assert.equal(narrow.bridge, false);
});

test('putrelle HEB: tensione, freccia e reazione come a mano', () => {
  const lay = { dir: 'x' as const, profile: 'HEB 140' as const, at: [1000, 1600] as const, span: [500, 2100] as const, ends: [300, 2300] as const,
    walls: [250, 2400] as const, bridge: false, length: 2000 };
  const feet = [[800, 1000], [1800, 1000], [800, 1600], [1800, 1600]] as const;
  const r = hebResult(lay, { at: [1300, 1300], F: 40000 }, feet, [{ at: [1300, 1300], r: 10 }], 250);
  // each beam half the load at mid-span of L = 1600 + 200 between the bearings' centres, its own weight
  const P = PROFILES['HEB 140'], L = 1800, F = 20000, q = (P.mass * 9.81) / 1000, E = 210000, I = P.Iy * 1e4;
  const Mmax = (F * L) / 4 + (q * L * L) / 8;
  assert.ok(near(r.sigma, Mmax / (P.Wy * 1e3)), `σ ${r.sigma}`);
  assert.ok(near(r.f, (F * L ** 3) / (48 * E * I) + (5 * q * L ** 4) / (384 * E * I)), `f ${r.f}`);
  assert.ok(near(r.reaction, F / 2 + (q * L) / 2), `R ${r.reaction}`);
  assert.ok(near(r.sigmaMax, 275 / 1.05) && near(r.fMax, 1600 / 1500));
  // the feet on the flanges (70 mm either side of the axis), the ropes 300 mm from each axis less the flange and the rope
  assert.equal(r.feet, P.b / 2);
  assert.equal(r.rope, 300 - P.b / 2 - 10);
  assert.equal(r.wall, 250 - KV_VERT.hebBearing);
  assert.deepEqual(hebChecks(r).map((c) => [c.id, c.status]), [['m_heb', 'ok'], ['m_hebf', 'ok'], ['m_hebfeet', 'ok'], ['m_hebrope', 'ok'], ['m_hebwall', 'ok']]);
  // the load nearer one beam: that one takes more (lever rule); outside the beams the feet's check fails
  const off = hebResult(lay, { at: [1300, 1150], F: 40000 }, feet, [], 250);
  assert.ok(off.sigma > r.sigma && off.reaction > r.reaction);
  const out = hebResult(lay, { at: [1300, 900], F: 40000 }, feet, [], 250);
  assert.equal(hebChecks(out).find((c) => c.id === 'm_hebfeet')?.status, 'fail');
  // a rope under a beam, a wall thinner than the bearing
  const bad = hebResult(lay, { at: [1300, 1300], F: 40000 }, feet, [{ at: [1300, 1010], r: 10 }], 150);
  assert.deepEqual(hebChecks(bad).filter((c) => c.status === 'fail').map((c) => c.id), ['m_hebrope', 'm_hebwall']);
});

test('putrelle HEB: la scelta — le più corte che passano, poi le più leggere; a mano profilo e direzione', () => {
  const opt = (dir: 'x' | 'y', profile: HebOption['profile'], length: number, ok: boolean): HebOption => ({
    dir, profile, length, at: [0, 0], span: [0, 0], ends: [0, 0], walls: [0, 0], bridge: false, ok,
    result: { sigma: ok ? 50 : 300, sigmaMax: 262, f: 1, fMax: 2, feet: 10, rope: 100, wall: 0, reaction: 1 },
  });
  const opts = [opt('x', 'HEB 120', 2000, false), opt('x', 'HEB 140', 2000, true), opt('x', 'HEB 160', 2000, true), opt('y', 'HEB 120', 2150, true)];
  assert.equal(hebPick(opts, {}).profile, 'HEB 140');
  assert.deepEqual([hebPick(opts, { dir: 'y' }).dir, hebPick(opts, { dir: 'y' }).profile], ['y', 'HEB 120']);
  assert.equal(hebPick(opts, { profile: 'HEB 160' }).profile, 'HEB 160');
  // chosen by hand and failing: still the one taken
  assert.equal(hebPick(opts, { profile: 'HEB 120', dir: 'x' }).ok, false);
  // none passing: the closest
  const none = [opt('x', 'HEB 120', 2000, false), { ...opt('x', 'HEB 160', 2000, false), result: { ...opt('x', 'HEB 160', 2000, false).result, sigma: 270 } }];
  assert.equal(hebPick(none, {}).profile, 'HEB 160');
});

test('putrelle HEB: scelte sui disegni, altezza sotto il basamento, non sotto putrelle da muro a muro né sotto un plinto', () => {
  const R = { ...DEFAULT_ROOM, heb: {} };
  assert.deepEqual(HEB_KEYS, ['heb.option']);
  assert.deepEqual(withHebChoice(R, 'heb.option', 'y:HEB 140')?.heb, { profile: 'HEB 140', dir: 'y' });
  assert.equal(withHebChoice(R, 'heb.option', 'z:HEB 140'), null);
  assert.equal(withHebChoice(R, 'heb.option', 'x:HEB 200'), null);
  assert.equal(withHebChoice(R, 'sup.profile', 'x:HEB 140'), null);
  // the height: the profile chosen, else the tallest until the derivation puts its choice
  assert.equal(hebBase(R), PROFILES['HEB 160'].h);
  assert.equal(hebBase({ ...R, heb: { profile: 'HEB 120' } }), PROFILES['HEB 120'].h);
  assert.equal(hebBase(DEFAULT_ROOM), 0);
  for (const kind of ['beams', 'plinth'] as const) {
    const Rk = { ...R, support: { kind } };
    assert.equal(onHeb(Rk), false, kind);
    assert.equal(hebBase(Rk), 0, kind);
    const G = roomGeo(layout({ ...defaultInputs(1600, 1750), room: Rk }), M);
    assert.ok(G);
    assert.equal(hebDrawn(G, M, { W: 1600, D: 1750, wall: 200 }), null, kind);
  }
  const G = roomGeo(layout({ ...defaultInputs(1600, 1750), room: { ...R, heb: { profile: 'HEB 120', dir: 'y' } } }), M);
  assert.ok(G);
  const d = hebDrawn(G, M, { W: 1600, D: 1750, wall: 200 });
  assert.deepEqual([d?.profile, d?.dir, d?.length], ['HEB 120', 'y', 1750 + 2 * KV_VERT.hebBearing]);
});
