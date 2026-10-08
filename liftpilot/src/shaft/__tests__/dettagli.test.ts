// The shaft's details of round 36: the brackets' intervals and the rails' lengths, the emergency doors over 11 m, the
// plate under the landing sills with its dimension, the counterweight's screen and the clearance on its sign, the pit's
// ladder and control box, the tag of the car buffers off the rails, the car at its extreme positions in section A-A.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Entity, Pt } from '../../drawing';
import { applyEdit, defaultInputs, KV_VERT, layout, section, sectionDims, type ShaftInputs } from '../index';
import { bracketHeights, bracketSpans, maxBracketSpan, railPieces, railSpan } from '../brackets';
import { cwGapMax, cwGapOver } from '../cw-gap';
import { maxDoorRise } from '../detail-checks';
import { pitKit } from '../pit-kit';
import { bufferPlan } from '../pit';
import { bufferTagAt } from '../plan-pit';
import { FISHPLATES, RAILS } from '../rails';
import { railsDev } from '../rails-dev';
import { cwScreen, screenChecks } from '../screen';
import { toeOf, toeWidth } from '../toe';
import type { ShaftCheck } from '../types';

const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
/** A chain's whole length, first point to last [mm]. */
const span = (c: Chain): number => Math.abs((c.pts.at(-1) ?? 0) - (c.pts[0] ?? 0));
const checkOf = (I: ShaftInputs, id: string): ShaftCheck | undefined => layout(I).checks.find((c) => c.id === id);
const withZone = (I: ShaftInputs, unlockZone: number): ShaftInputs => ({ ...I, vertical: { ...I.vertical, unlockZone } });

const CASES: readonly (readonly [string, ShaftInputs])[] = [
  ['contrappeso sul fondo', defaultInputs(1600, 1750)],
  ['contrappeso a sinistra', { ...defaultInputs(1600, 1750), cw: 'left' }],
  ['contrappeso a destra, porte centrali', { ...defaultInputs(1600, 1750), cw: 'right', door: 'C2' }],
  ['accessi opposti', { ...defaultInputs(1600, 1750), entrances: 'opposite', D: 2000 }],
  ['accessi adiacenti', { ...defaultInputs(1900, 1900), entrances: 'adjacent', side2: 'right' }],
];

test('staffe: l’interasse massimo è quello tra le staffe montate, le guide in spezzoni da 5 m dal fondo', () => {
  assert.deepEqual(railPieces(0, 12000), { pieces: [5000, 5000, 2000], joints: [5000, 10000] });
  assert.deepEqual(railPieces(-1500, 8500), { pieces: [5000, 5000], joints: [3500] });
  assert.deepEqual(railPieces(0, 3000), { pieces: [3000], joints: [] });
  for (const [name, I] of CASES) {
    const L = layout(I), [z0, z1] = railSpan(section(L)), hs = bracketHeights(z0, z1, I.carRail, L.carBracketPitch), spans = bracketSpans(hs);
    assert.equal(spans.length, hs.length - 1, name);
    assert.ok(Math.abs(spans.reduce((a, b) => a + b, 0) - ((hs.at(-1) ?? 0) - (hs[0] ?? 0))) < 1e-6, name);
    assert.equal(maxBracketSpan(z0, z1, I.carRail, L.carBracketPitch), Math.max(...spans), name);
    // the brackets keep off the fishplates: so an interval may be longer than the pitch, never by more than a plate
    assert.ok(Math.max(...spans) <= (L.carBracketPitch ?? KV_VERT.bracketPitch) + FISHPLATES[I.carRail].l + 180, `${name}: ${Math.max(...spans)}`);
    // the elevation of the rails: a bracket dimension each, the rails' lengths summing to the rail
    const dev = railsDev(L), cs = chains(dev.entities);
    const guide = cs.filter((c) => c.text?.every((t) => t === 'Guida {v}'));
    assert.equal(guide.length, 2, name);
    for (const c of guide) assert.equal(span(c), z1 - z0, name);
    assert.ok(cs.some((c) => c.pts.length === hs.length + 2), `${name}: catena delle staffe`);
  }
});

test('porte di soccorso: oltre 11 m tra due porte di piano consecutive la verifica non passa', () => {
  const I = defaultInputs(1600, 1750), two = (rise: number): ShaftInputs => ({ ...I, vertical: { ...I.vertical, main: 0,
    floors: [{ label: '0', rise, door: 'A' }, { label: '1', rise: 0, door: 'A' }] } });
  assert.equal(checkOf(two(KV_VERT.emergencyRise), 'v_emerg')?.status, 'ok');
  const far = checkOf(two(KV_VERT.emergencyRise + 10), 'v_emerg');
  assert.equal(far?.status, 'fail');
  assert.equal(far?.value, KV_VERT.emergencyRise + 10);
  assert.equal(far?.limit, KV_VERT.emergencyRise);
  assert.equal(maxDoorRise(layout(I)), 3000);
  // a floor served only by the second entrance of a single-entrance design has no door here: the rise runs on
  const skip: ShaftInputs = { ...I, vertical: { ...I.vertical, main: 0, floors: [{ label: '0', rise: 6000, door: 'A' }, { label: '1', rise: 6000, door: 'B' },
    { label: '2', rise: 0, door: 'A' }] } };
  assert.equal(maxDoorRise(layout(skip)), 12000);
  assert.equal(checkOf(skip, 'v_emerg')?.status, 'fail');
});

test('lamiera sottosoglia: metà zona di sbloccaggio + 50, avviso finché la zona non è data, quota modificabile', () => {
  const I = defaultInputs(1600, 1750), t = toeOf(I);
  assert.deepEqual([t.h, t.zone, t.entered], [KV_VERT.unlockMax + KV_VERT.toeOver, KV_VERT.unlockMax, false]);
  assert.ok(t.bevel >= KV_VERT.toeBevel, 'proiezione dello smusso ≥ 20 mm');
  assert.equal(toeWidth(800), 850);
  const warn = checkOf(I, 'p_toe');
  assert.equal(warn?.status, 'warn');
  assert.equal(warn?.value, 250);
  const ok = checkOf(withZone(I, 300), 'p_toe');
  assert.equal(ok?.status, 'ok');
  assert.equal(ok?.value, 350);
  // the detail at a floor dimensions it; changing it sets the zone
  const L = layout(I), c = chains(sectionDims(L, section(L), 'floor', 0, null)).find((x) => x.text?.[0] === 'Sottosoglia {v}');
  assert.ok(c?.edit?.[0], 'quota della lamiera');
  assert.equal(c.edit[0].value, 250);
  const J = applyEdit(I, c.edit[0], 300);
  assert.equal(J?.vertical.unlockZone, 250);
  // opposite entrances: the floor's B door dimensioned on the right
  const O: ShaftInputs = { ...I, entrances: 'opposite', D: 2000, vertical: { ...I.vertical, floors: I.vertical.floors.map((f) => ({ ...f, door: 'B' as const })) } };
  const LO = layout(O), co = chains(sectionDims(LO, section(LO), 'floor', 0, null)).filter((x) => x.text?.[0] === 'Sottosoglia {v}');
  assert.equal(co.length, 1);
  assert.equal(co[0]?.side, 'right');
});

test('protezione del contrappeso: bordo inferiore ≤ 300, larga quanto contrappeso e guide + 40, fino al muro se resta più di 300', () => {
  for (const [name, I] of CASES) {
    const L = layout(I), s = cwScreen(L), [lo, w] = screenChecks(L);
    assert.equal(lo?.status, 'ok', name);
    assert.equal(lo?.value, KV_VERT.cwScreenLow, name);
    assert.equal(w?.status, 'ok', name);
    assert.ok(s.u0 <= s.bare[0] && s.u1 >= s.bare[1], name);
    assert.ok(s.bare[1] - s.bare[0] >= s.cwLen + 2 * KV_VERT.cwScreenPast - 1e-9, name);
    const len = s.wall === 'front' || s.wall === 'rear' ? I.W : I.D;
    // an end left short of the wall leaves at most 300 mm open, or stops at a car rail in the line of the sheet
    for (const [end, wall] of [[s.u0, 0], [s.u1, len]] as const) {
      const open = Math.abs(end - wall);
      if (open > KV_VERT.cwScreenWall) {
        assert.ok(L.rails.some((r) => r.kind === 'car' && Math.abs((s.wall === 'rear' ? r.x : r.y) - end) < RAILS[I.carRail].b), `${name}: ${open} mm aperti`);
      }
    }
  }
});

test('cartello del contrappeso: gioco massimo = extracorsa + il margine minore della testata, a 5 mm', () => {
  const L = layout(defaultInputs(1600, 1750)), head = L.checks.filter((c) => c.id === 'h_refuge' || c.id === 'h_clear');
  const m = Math.min(...head.map((c) => (c.value ?? 0) - (c.limit ?? 0))), want = Math.floor((L.inputs.vertical.cwRunby + m) / 5) * 5;
  const info = L.checks.find((c) => c.id === 'h_cwgap');
  assert.equal(info?.status, 'info');
  assert.equal(info?.limit, null);
  assert.equal(info?.value, want);
  assert.equal(cwGapMax(L, L.checks), want);
  // the car's top under what hangs over it (2:1, known with the calculation) with less margin: the sign says less
  const top: ShaftCheck = { id: 'h_top', status: 'ok', value: 120, limit: 100, dec: 0, unit: 'mm' };
  assert.deepEqual(cwGapOver(L, []), []);
  const over = cwGapOver(L, [top]);
  assert.equal(over[0]?.value, Math.floor((L.inputs.vertical.cwRunby + Math.min(m, 20)) / 5) * 5);
  // a headroom's check failing by more than the run-by: no clearance would do, the sign waits
  assert.equal(cwGapMax(L, [{ ...top, status: 'fail', value: 0, limit: 10000 }]), null);
  assert.equal(cwGapMax(L, [{ ...top, status: 'fail', value: 100, limit: 100 + L.inputs.vertical.cwRunby }]), 0);
});

test('fossa: scala entro 600 mm e pulsantiera entro 750 mm dal vano porta, libere da cabina, contrappeso e ammortizzatori', () => {
  for (const [name, I] of CASES) {
    const L = layout(I), k = pitKit(L);
    assert.ok(k.ladderAllowed, name);
    assert.ok(k.ladder && k.ladder.reach <= KV_VERT.ladderUse, `${name}: scala`);
    assert.ok(k.box && k.box.reach <= KV_VERT.pitReach, `${name}: pulsantiera`);
    const apart = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a): boolean => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
    const car = { x0: L.car.x, y0: L.car.y, x1: L.car.x + L.car.w, y1: L.car.y + L.car.h }, cw = { x0: L.cw.x, y0: L.cw.y, x1: L.cw.x + L.cw.w, y1: L.cw.y + L.cw.h };
    for (const it of [k.ladder, k.box]) for (const b of [car, cw]) assert.ok(apart(it.box, b), name);
    assert.ok(apart(k.ladder.box, k.box.box), `${name}: scala e pulsantiera`);
    for (const s of bufferPlan(L).spots) {
      const f = s.r;
      assert.ok(apart(k.ladder.box, { x0: s.c[0] - f, y0: s.c[1] - f, x1: s.c[0] + f, y1: s.c[1] + f }), `${name}: ammortizzatore`);
    }
    // one stop between 400 mm over the landing and 2000 mm over the pit floor
    assert.ok(k.stop >= KV_VERT.stopOverLanding && k.stop <= KV_VERT.stopOverPit - I.vertical.pit, name);
  }
  const I = defaultInputs(1600, 1750), deep = pitKit(layout({ ...I, vertical: { ...I.vertical, pit: 2600 } }));
  assert.equal(deep.ladderAllowed, false);
  assert.equal(deep.ladder, null);
  assert.equal(deep.twoStops, true);
  assert.equal(deep.stop, KV_VERT.stopUpper);
});

test('P6 in pianta della fossa: lontano dalle guide, dalle staffe e dall’asse della cabina', () => {
  for (const [name, I] of [...CASES, ['quattro ammortizzatori', { ...defaultInputs(1600, 1750), vertical: { ...defaultInputs(1600, 1750).vertical, carBuffers: 4 } }] as const]) {
    const L = layout(I), taken: Pt[] = [], cx = L.car.x + L.car.w / 2;
    for (const s of bufferPlan(L).spots.filter((x) => x.kind === 'car')) {
      const p = bufferTagAt(L, s.c, taken);
      for (const r of L.rails) assert.ok(Math.hypot(p[0] - r.x, p[1] - r.y) > 95, `${name}: P6 sulla guida`);
      assert.ok(Math.abs(p[0] - cx) > 95, `${name}: P6 sull’asse`);
      for (const t of taken) assert.ok(Math.hypot(p[0] - t[0], p[1] - t[1]) > 190, `${name}: P6 sovrapposti`);
      taken.push(p);
    }
  }
});

test('sezione A-A: la cabina nelle posizioni estreme con le distanze verificate, quotate e modificabili', () => {
  const I = defaultInputs(1600, 1750), L = layout(I), S = section(L), top = I.vertical.floors.length - 1;
  const head = chains(sectionDims(L, S, 'top', top, null)), pit = chains(sectionDims(L, S, 'pit', 0, null));
  const ref = head.find((c) => c.text?.[0] === 'H. Rifugio {v}');
  assert.ok(ref?.edit?.[0], 'rifugio sul tetto alla posizione più alta');
  for (const want of [`{v} ≥ ${KV_VERT.headShoe}`]) assert.ok(head.some((c) => c.text?.[0] === want && c.edit?.[0]?.key === 'v.headroom'), want);
  const low = pit.find((c) => c.text?.[0]?.includes('Parti basse'));
  assert.ok(low?.edit?.[0], 'parti basse sugli ammortizzatori compressi');
  assert.ok(span(low) >= Math.max(KV_VERT.pitClear, KV_VERT.refugeH[I.vertical.pitRefuge]) - 1, 'conforme');
  assert.ok(pit.some((c) => c.text?.[0]?.includes('Grembiule') && c.edit?.[0]), 'grembiule');
  // changing the headroom where the clearance is dimensioned: it reads the new value
  const clr = head.find((c) => c.text?.[0] === `{v} ≥ ${KV_VERT.headShoe}`), e = clr?.edit?.[0];
  assert.ok(clr && e);
  const now = Math.round(span(clr)), J = applyEdit(I, e, now + 50);
  assert.ok(J);
  const LJ = layout(J), after = chains(sectionDims(LJ, section(LJ), 'top', top, null)).find((c) => c.text?.[0] === `{v} ≥ ${KV_VERT.headShoe}`);
  assert.ok(after);
  assert.equal(Math.round(span(after)), now + 50);
});
