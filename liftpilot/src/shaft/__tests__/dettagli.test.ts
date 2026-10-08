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
import { pitKit, pitKitSection } from '../pit-kit';
import { bufferPlan } from '../pit';
import { bufferTagAt } from '../plan-pit';
import { quad } from '../plan-walls';
import { FISHPLATES, RAILS } from '../rails';
import { railsDev } from '../rails-dev';
import { cwScreen, screenChecks } from '../screen';
import { mapZ, sectionEntities, type ZMap } from '../section-view';
import { toeOf, toeSection, toeWidth } from '../toe';
import type { ShaftCheck } from '../types';
import type { VerticalInputs } from '../vertical';

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
    // what the drawing gives beside the standard's figures: informations, nothing of the design's to check
    assert.equal(lo?.status, 'info', name);
    assert.equal(lo?.value, KV_VERT.cwScreenLow, name);
    assert.equal(lo?.limit, KV_VERT.cwScreenLow, name);
    assert.equal(w?.status, 'info', name);
    assert.ok((w?.value ?? 0) >= (w?.limit ?? Infinity), name);
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

test('cartello del contrappeso: gioco massimo = extracorsa + il margine minore delle verifiche che il gioco riduce, a 5 mm', () => {
  const L = layout(defaultInputs(1600, 1750));
  // the ones that must pass, and the warnings of the crosshead and of the car's guided travel while they pass
  const head = L.checks.filter((c) => ['h_refuge', 'h_clear', 'h_cw'].includes(c.id) || (['h_cross', 'h_guide'].includes(c.id) && c.status === 'ok'));
  assert.deepEqual(head.map((c) => c.id).sort(), ['h_clear', 'h_cross', 'h_cw', 'h_guide', 'h_refuge']);
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
  // under hung pulleys (h_hung) and with the refuge measured to the rope rig (h_refuge_rig, in place of h_refuge) too
  assert.equal(cwGapOver(L, [{ ...top, id: 'h_hung' }])[0]?.value, over[0]?.value);
  const rig = cwGapOver(L, [{ id: 'h_refuge_rig', status: 'ok', value: 2010, limit: 2000, dec: 0, unit: 'mm' }]);
  assert.equal(rig[0]?.value, Math.floor((L.inputs.vertical.cwRunby + Math.min(m, 10)) / 5) * 5);
  // a headroom's check failing by more than the run-by: no clearance would do, the sign waits
  assert.equal(cwGapMax(L, [{ ...top, status: 'fail', value: 0, limit: 10000 }]), null);
  assert.equal(cwGapMax(L, [{ ...top, status: 'fail', value: 100, limit: 100 + L.inputs.vertical.cwRunby }]), 0);
  // a warning already given does not count (it stays a warning), one that passes does
  const cross: ShaftCheck = { id: 'h_cross', status: 'warn', value: 300, limit: 500, dec: 0, unit: 'mm' };
  assert.equal(cwGapMax(L, [cross]), L.inputs.vertical.cwRunby);
  assert.equal(cwGapMax(L, [{ ...cross, status: 'ok', value: 520 }]), Math.floor((L.inputs.vertical.cwRunby + 20) / 5) * 5);
});

test('cartello del contrappeso: con il gioco scritto nessuna verifica del progetto peggiora', () => {
  const RANK = { ok: 0, info: 0, warn: 1, fail: 2 } as const;
  const tweaks: readonly ((V: VerticalInputs) => VerticalInputs)[] = [
    (V) => V,
    // the crosshead within 500 mm of the ceiling at its highest: the warning h_cross passes by little (review, round 36)
    (V) => ({ ...V, frameTop: V.frameTop + 100 }),
    // no balustrade, the crosshead high: the car's guided travel passes by little
    (V) => ({ ...V, frameTop: V.frameTop + 450, parapet: 0 }),
    // a taller counterweight: its guided travel passes by little
    (V) => ({ ...V, cwH: V.cwH + 400 }),
  ];
  let seen = 0;
  for (const [name, I0] of CASES) for (const [k, tw] of tweaks.entries()) {
    const I: ShaftInputs = { ...I0, vertical: tw(I0.vertical) }, L = layout(I), gap = cwGapMax(L, L.checks);
    if (gap === null) continue;
    seen++;
    const at = layout({ ...I, vertical: { ...I.vertical, cwRunby: gap } }).checks;
    for (const c of L.checks) {
      const d = at.find((x) => x.id === c.id);
      assert.ok(d && RANK[d.status] <= RANK[c.status], `${name} #${k}: ${c.id} ${c.status} → ${d?.status} (${d?.value}/${d?.limit}) col gioco ${gap}`);
    }
  }
  assert.ok(seen >= CASES.length * 3, `${seen}`);
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
    // nothing behind the counterweight's screen: all it closes off to the wall is out of reach from the door and the pit
    const s = cwScreen(L), pts = quad(L, s.wall, s.u0, 0, s.u1, s.v1);
    const shut = { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
    for (const it of [k.ladder, k.box]) assert.ok(apart(it.box, shut), `${name}: dietro la protezione del contrappeso`);
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
  // the lower stop under the box, its top at most 1200 mm over the pit floor: the section draws both
  assert.equal(deep.lowStop, KV_VERT.stopLower - KV_VERT.pitBoxH / 2 - 2600);
  assert.equal(pitKit(layout(I)).lowStop, null);
  const stops = (J: ShaftInputs): number => pitKitSection(layout(J), (x, z) => [x, z], -J.vertical.pit)
    .filter((e) => e.e === 'text' && e.text.startsWith('STOP ')).length;
  assert.equal(stops({ ...I, vertical: { ...I.vertical, pit: 2600 } }), 2);
  assert.equal(stops(I), 1);
});

test('lamiera sottosoglia: sotto ogni soglia di piano anche dove la corsa è disegnata più corta', () => {
  const I0 = defaultInputs(1600, 1750), floors = ['0', '1', '2', '3', '4', '5', '6'].map((label, i, a) => ({ label, rise: i < a.length - 1 ? 3000 : 0, door: 'A' as const }));
  const I: ShaftInputs = { ...I0, vertical: { ...I0.vertical, floors } }, L = layout(I), S = section(L);
  const zmap: ZMap = { z0: I.doorHeight + 250, z1: S.top - I.vertical.frameBelow - 600, f: 0.2 };
  const drawn = new Set(sectionEntities(L, { carFloor: floors.length - 1, lo: -Infinity, hi: Infinity, zmap }).entities.map((e) => JSON.stringify(e)));
  let short = 0;
  for (const zf of S.levels) {
    for (const e of toeSection(I, zf, (q, z) => [q, mapZ(zmap, z)])) assert.ok(drawn.has(JSON.stringify(e)), `piano a ${zf}`);
    if (zf > zmap.z0 + 1 && zf < zmap.z1 - 1) short++;
  }
  assert.ok(short >= 3, `${short}`);
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
