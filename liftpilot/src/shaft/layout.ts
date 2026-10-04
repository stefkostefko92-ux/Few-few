// Layout of the shaft in plan: the largest car that fits between the doors, the guide rails and the counterweight,
// within the area its rated load admits; doors on one or two entrances, car frame, counterweight with its rails,
// checks of the clearances. Pure: the same function draws the live preview in the browser and the saved design.
import { DEFAULTS, KV } from './norme';
import { loadForArea, maxArea, passengers } from './area';
import { RAILS, railClip } from './rails';
import { DEFAULT_ROOM } from './room';
import { DEFAULT_VERTICAL } from './vertical';
import { sectionChecks } from './section';
import { roomChecks } from './machine-room';
import { check } from './checks';
import { bufferChecks } from './pit';
import { cwNiche, nicheMargin } from './niche';
import { hasHead, headCheck, headFacingExtra, headOf } from './head';
import { PANEV_BACK, cwBracketsOf } from './staffe';
import { cwBracketMargin, cwSpecialOf } from './staffe-scelta';
import { doorOpDepthOf, doorOpOf } from './operator';
import { frameRoom } from './frame';
import type { Access, CwSide, DoorLayout, Layout, Rail, Rect, ShaftCheck, ShaftInputs, Wall } from './types';

const ACCESS: Readonly<Record<Exclude<Access, 'none'>, readonly [number, number, number]>> = {
  dm236_existing: KV.dm236Existing, dm236_residential: KV.dm236Residential, dm236_public: KV.dm236Public,
};

const floorTo = (x: number, step: number): number => Math.floor(x / step + 1e-9) * step;
const BUFFER_KEYS: ReadonlySet<string> = new Set(['bufX', 'bufY', 'bufSpan', 'cwBufPos']);
const round1 = (x: number): number => Math.round(x);

/** A new design: the largest car, telescopic 800 × 2000 mm doors, one entrance, counterweight at the back. */
export function defaultInputs(W: number, D: number): ShaftInputs {
  return {
    W, D, Q: null, door: 'T2', doorWidth: 800, doorHeight: 2000, cw: 'rear', access: 'dm236_existing', entrances: 'one', side2: 'right',
    carRail: 'T70-1/A', cwRail: 'T45/A', wall: 200, vertical: DEFAULT_VERTICAL, room: DEFAULT_ROOM, ...DEFAULTS,
  };
}

/** The counterweight where the entrances leave room for it: never on a wall with a door. */
export function counterweightSide(I: ShaftInputs): CwSide {
  if (I.entrances === 'opposite' && I.cw === 'rear') return 'left';
  if (I.entrances === 'adjacent') return I.side2 === 'right' ? 'left' : 'right';
  return I.cw;
}

/** Car size: in the admissible range, the largest area the rated load admits; at equal area the deepest car. A car
 *  between two entrances spans the shaft across them: its depth (opposite) or its width (adjacent) is the largest. */
function carSize(I: ShaftInputs, maxA: number, maxB: number, minA: number, minB: number, shortSide: boolean, fixedB: boolean, fixedA: boolean): { A: number; B: number; Q: number } {
  const step = KV.sizeStep;
  if (I.Q === null) {
    const B = maxB, A = shortSide && !fixedA ? Math.min(maxA, floorTo(maxB, step)) : maxA;
    return { A, B, Q: loadForArea((A * B) / 1e6) };
  }
  const cap = maxArea(I.Q) * 1e6;
  let best: { A: number; B: number } | null = null;
  for (let a = maxA; a >= (fixedA ? maxA : minA); a -= step) {
    const b = fixedB ? maxB : Math.min(maxB, floorTo(cap / a, step));
    if (b < minB || (shortSide && b < a) || a * b > cap + 1e-6) continue;
    if (!best || a * b > best.A * best.B || (a * b === best.A * best.B && b > best.B)) best = { A: a, B: b };
  }
  return best ? { ...best, Q: I.Q } : { A: fixedA ? maxA : minA, B: fixedB ? maxB : minB, Q: I.Q };
}

/** A door on a wall, along that wall's axis between `lo` and `hi` (the car inside). A telescopic door goes flush with
 *  the side of the car that leaves the walls more room, or with the side `flush` asks for. */
function doorOn(I: ShaftInputs, side: 'A' | 'B', wall: Wall, lo: number, hi: number, wallLen: number, flush?: 'lo' | 'hi'): DoorLayout {
  const L = I.doorWidth, half = KV.doorFrame / 2, [f, e] = doorOpOf(I), opLen = f * L + e;
  const base = { side, wall, kind: I.door, width: L, height: I.doorHeight };
  if (I.door === 'C2') {
    const mid = (lo + hi) / 2, overall = KV.doorStackC2 * L + KV.doorFrame;
    return { ...base, u0: mid - L / 2, u1: mid + L / 2, l0: mid - L / 2, l1: mid + L / 2, frame0: mid - overall / 2, frame1: mid + overall / 2, stack: 'both',
      op0: mid - opLen / 2, op1: mid + opLen / 2 };
  }
  // telescopic: the opening flush with one side of the car, the panels stacking toward the other side; the operator's
  // closing side just past the opening, the rest over the stack
  const overall = KV.doorStackT2 * L + KV.doorFrame, ext = KV.doorOpClose;
  const high: DoorLayout = { ...base, u0: lo, u1: lo + L, l0: lo, l1: lo + L, frame0: lo - half, frame1: lo - half + overall, stack: 'high', op0: lo - ext, op1: lo - ext + opLen };
  const low: DoorLayout = { ...base, u0: hi - L, u1: hi, l0: hi - L, l1: hi, frame0: hi + half - overall, frame1: hi + half, stack: 'low', op0: hi + ext - opLen, op1: hi + ext };
  if (flush) return flush === 'lo' ? high : low;
  const margin = (d: DoorLayout): number => Math.min(d.frame0, wallLen - d.frame1);
  return margin(low) > margin(high) ? low : high;
}

/** Plan box of a car door operator: on the car roof, over the car sill, along the door's wall. */
function operatorBox(I: ShaftInputs, d: DoorLayout): readonly [number, number, number, number] {
  const v0 = I.landingDepth + I.sillGap, v1 = v0 + doorOpDepthOf(I);
  if (d.wall === 'front') return [d.op0, v0, d.op1, v1];
  if (d.wall === 'rear') return [d.op0, I.D - v1, d.op1, I.D - v0];
  return d.wall === 'left' ? [v0, d.op0, v1, d.op1] : [I.W - v1, d.op0, I.W - v0, d.op1];
}

/** How far two boxes run into each other (the longer side of their intersection), 0 when apart. */
function clash(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): number {
  const ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return ix > 0 && iy > 0 ? Math.round(Math.max(ix, iy)) : 0;
}

/** A door moved along its wall to `at` (its clear opening's start), with an operator `opLen` long and its landing door
 *  at `land` (where that one's clear opening starts; absent: in line with the car door). */
function placed(d: DoorLayout, at: number | undefined, opLen: number | undefined, land: number | undefined): DoorLayout {
  const dd = at === undefined ? 0 : at - d.u0;
  let r: DoorLayout = { ...d, u0: d.u0 + dd, u1: d.u1 + dd, l0: d.l0 + dd, l1: d.l1 + dd, frame0: d.frame0 + dd, frame1: d.frame1 + dd, op0: d.op0 + dd, op1: d.op1 + dd };
  if (opLen !== undefined) {
    const ext = KV.doorOpClose, mid = (r.u0 + r.u1) / 2;
    if (r.stack === 'both') r = { ...r, op0: mid - opLen / 2, op1: mid + opLen / 2 };
    else if (r.stack === 'high') r = { ...r, op0: r.u0 - ext, op1: r.u0 - ext + opLen };
    else r = { ...r, op0: r.u1 + ext - opLen, op1: r.u1 + ext };
  }
  // the landing door apart from the car door, with its frame
  const s = land === undefined ? 0 : land - r.l0;
  return s === 0 ? r : { ...r, l0: r.l0 + s, l1: r.l1 + s, frame0: r.frame0 + s, frame1: r.frame1 + s };
}

export function layout(I: ShaftInputs): Layout {
  const { W, D, carWall } = I, step = KV.sizeStep, cwSide = counterweightSide(I), fix = I.plan ?? {};
  const cr = RAILS[I.carRail], wr = RAILS[I.cwRail];
  const doorZone = I.landingDepth + I.sillGap + I.carDoorDepth; // wall of an entrance to the outside of the car
  const lateralZone = I.cwWallGap + I.cwDepth + I.cwRailGap + cr.h + I.shoeGap; // wall to the car across a side counterweight
  // cantilever sling: the car rails stand across the wall there (blades along it), so their foot width counts, and the
  // car passes the clips on their feet' edges
  const cantGap = Math.max(I.shoeGap, Math.ceil(railClip(I.carRail).reach) + KV.cantClipGap);
  const cantileverZone = I.cwWallGap + I.cwDepth + I.cwRailGap + cr.b + cantGap;
  // a niche the counterweight runs in: its wall is that much further back there, and the car gains it down to the room
  // the rails need anyway
  const niche = cwNiche(I, cwSide), nd = niche?.depth ?? 0;
  const zone = (w: Wall): number => {
    if (w === 'front') return doorZone;
    if (w === 'rear') return I.entrances === 'opposite' ? doorZone : cwSide === 'rear' ? Math.max(I.rearGap, I.cwWallGap + I.cwDepth + I.cwCarGap - nd) : I.rearGap;
    if (I.entrances === 'adjacent') return I.side2 === w ? doorZone : cwSide === w ? Math.max(I.railZone, cantileverZone - nd) : I.railZone;
    return cwSide === w ? Math.max(I.railZone, lateralZone - nd) : I.railZone;
  };
  // the counterweight along its wall: the length its room gives and its start, centred at `mid`, inside its niche with
  // its rails and the room their brackets' plates need on the niche's back (Panev's supports) or the niche's gap
  const cwAlong = (room: number, mid: number): readonly [number, number] => {
    const keep = KV.cwShoe + wr.h + (cwBracketsOf(I) === 'panev' ? PANEV_BACK : KV.nicheGap);
    const len = fix.cwLen ?? Math.max(0, Math.min(KV.cwMaxLength, floorTo(niche ? Math.min(room, niche.width - 2 * keep) : room, step)));
    const start = round1(mid - len / 2);
    return [len, fix.cwPos ?? (niche ? Math.min(Math.max(start, niche.at + keep), niche.at + niche.width - keep - len) : start)];
  };
  const xL = zone('left'), xR = W - zone('right'), yF = zone('front'), yB = D - zone('rear');
  const maxA = Math.max(0, floorTo(xR - xL - 2 * carWall, step)), maxB = Math.max(0, floorTo(yB - yF - 2 * carWall, step));
  const acc = I.access === 'none' ? null : ACCESS[I.access];
  const minA = Math.max(I.doorWidth + KV.carDoorMargin, acc ? acc[0] : 0);
  const minB = Math.max(KV.carMinDepth, acc ? acc[1] : 0, I.entrances === 'adjacent' ? I.doorWidth + KV.carDoorMargin : 0);
  const shortSide = acc !== null && I.entrances !== 'adjacent';
  const fixedB = I.entrances === 'opposite', fixedA = I.entrances === 'adjacent';
  const fits = maxA >= minA && maxB >= minB && (!shortSide || maxB >= minA);
  const proposed = fits ? carSize(I, maxA, maxB, minA, minB, shortSide, fixedB, fixedA) : { A: minA, B: minB };
  // the car inside as set by hand, else as proposed; the load is the given one or the one its area needs
  const A = fix.A ?? proposed.A, B = fix.B ?? proposed.B, Q = I.Q ?? loadForArea((A * B) / 1e6);
  const area = (A * B) / 1e6, areaMax = maxArea(Q);

  // car: against the entrance(s); across the rails, centred between them (adjacent: against the side entrance)
  const outerW = A + 2 * carWall, outerD = B + 2 * carWall;
  const x = fix.carX ?? (I.entrances === 'adjacent' ? (I.side2 === 'right' ? xR - outerW : xL) : round1(xL + (xR - xL - outerW) / 2));
  const car: Rect = { x, y: yF, w: outerW, h: outerD };
  const carInner: Rect = { x: car.x + carWall, y: car.y + carWall, w: A, h: B };
  // two adjacent entrances keep a corner post of the car between them: each opening away from the shared corner
  const adj = I.entrances === 'adjacent';
  const doors: DoorLayout[] = [placed(doorOn(I, 'A', 'front', carInner.x, carInner.x + A, W, adj ? (I.side2 === 'right' ? 'lo' : 'hi') : undefined), fix.doorA, fix.opLen, fix.landA)];
  if (I.entrances === 'opposite') doors.push(placed(doorOn(I, 'B', 'rear', carInner.x, carInner.x + A, W), fix.doorB, fix.opLen, fix.landB));
  if (adj) doors.push(placed(doorOn(I, 'B', I.side2, carInner.y, carInner.y + B, D, 'hi'), fix.doorB, fix.opLen, fix.landB));

  // car rails: central sling on the two side walls, facing each other at the middle of the car; for two adjacent
  // entrances a cantilever sling with both rails on the wall opposite the side entrance and the counterweight between
  const rails: Rail[] = [];
  let frame: Layout['frame'], bridge: Layout['bridge'] = null, cwRect: Rect, cwDbg: number;
  // where the counterweight's rails may reach along its wall: [lo, hi]
  let cwRoom: readonly [number, number];
  const frames = doors;
  if (I.entrances === 'adjacent') {
    // the blades face each other along the wall: the car hangs off them and its overturning moment goes into the
    // faces of the blades, which take it both ways (on the tips it could only push the car away from the wall)
    const left = cwSide === 'left', wallX = left ? 0 : W;
    const ax = round1(left ? car.x - cantGap - cr.b / 2 : car.x + car.w + cantGap + cr.b / 2);
    const y0 = fix.railY ?? car.y + KV.cantRailEnd + cr.h, y1 = y0 + (fix.dbg ?? car.h - 2 * (KV.cantRailEnd + cr.h)), f0 = y0 - cr.h, f1 = y1 + cr.h;
    frame = { kind: 'cantilever', axis: ax, dbg: y1 - y0 };
    rails.push({ x: ax, y: y0, dir: 'back', kind: 'car', bracketAxis: 'x', bracketTo: wallX },
      { x: ax, y: y1, dir: 'front', kind: 'car', bracketAxis: 'x', bracketTo: wallX });
    // counterweight between the feet of the car rails, against the wall, clear of their brackets; its rails at its ends
    const [len, cy] = cwAlong(f1 - f0 - 2 * (KV.cantCwGap + KV.cwShoe + wr.h), round1((f0 + f1) / 2));
    const cx0 = left ? I.cwWallGap - nd : W - I.cwWallGap - I.cwDepth + nd, cwWall = left ? -nd : W + nd;
    cwRect = { x: cx0, y: cy, w: I.cwDepth, h: len };
    cwDbg = len + 2 * KV.cwShoe;
    cwRoom = [f0 + KV.cantCwGap, f1 - KV.cantCwGap];
    rails.push({ x: cx0 + I.cwDepth / 2, y: cwRect.y - KV.cwShoe, dir: 'back', kind: 'cw', bracketAxis: 'x', bracketTo: cwWall },
      { x: cx0 + I.cwDepth / 2, y: cwRect.y + len + KV.cwShoe, dir: 'front', kind: 'cw', bracketAxis: 'x', bracketTo: cwWall });
  } else {
    const yMid = fix.railY ?? round1(car.y + car.h / 2), l = car.x - I.shoeGap, r = car.x + car.w + I.shoeGap;
    frame = { kind: 'central', axis: yMid, dbg: r - l };
    rails.push({ x: l, y: yMid, dir: 'right', kind: 'car', bracketAxis: 'x', bracketTo: cwSide === 'left' ? l - cr.h : 0 });
    rails.push({ x: r, y: yMid, dir: 'left', kind: 'car', bracketAxis: 'x', bracketTo: cwSide === 'right' ? r + cr.h : W });
    if (cwSide === 'rear') {
      const [len, cx] = cwAlong(W - 2 * I.railZone, car.x + car.w / 2), y = D + nd - I.cwWallGap - I.cwDepth;
      cwRect = { x: cx, y, w: len, h: I.cwDepth };
      cwDbg = len + 2 * KV.cwShoe;
      cwRoom = [0, W];
      rails.push({ x: cx - KV.cwShoe, y: y + I.cwDepth / 2, dir: 'right', kind: 'cw', bracketAxis: 'y', bracketTo: D + nd },
        { x: cx + len + KV.cwShoe, y: y + I.cwDepth / 2, dir: 'left', kind: 'cw', bracketAxis: 'y', bracketTo: D + nd });
    } else {
      // beside the car, between the wall and the car rail, centred on the rails' axis; clear of the door zones it faces
      const left = cwSide === 'left', x0 = left ? I.cwWallGap - nd : W + nd - I.cwWallGap - I.cwDepth, xOut = left ? x0 + I.cwDepth + I.cwRailGap : x0 - I.cwRailGap;
      const blocks = (w: Wall): boolean => frames.some((d) => d.wall === w && (left ? d.frame0 - 40 < xOut : d.frame1 + 40 > xOut));
      const yLo = (blocks('front') ? doorZone : 0) + KV.cwEndGap, yHi = D - (blocks('rear') ? doorZone : 0) - KV.cwEndGap;
      const [len, cy] = cwAlong(2 * (Math.min(yMid - yLo, yHi - yMid) - KV.cwShoe - wr.h), yMid);
      cwRect = { x: x0, y: cy, w: I.cwDepth, h: len };
      cwDbg = len + 2 * KV.cwShoe;
      cwRoom = [yLo, yHi];
      const ax = x0 + I.cwDepth / 2, cwWall = left ? -nd : W + nd;
      rails.push({ x: ax, y: cwRect.y - KV.cwShoe, dir: 'back', kind: 'cw', bracketAxis: 'x', bracketTo: cwWall },
        { x: ax, y: cwRect.y + len + KV.cwShoe, dir: 'front', kind: 'cw', bracketAxis: 'x', bracketTo: cwWall });
      bridge = { x: xOut, y0: cwRect.y - KV.cwShoe - wr.h, y1: cwRect.y + len + KV.cwShoe + wr.h };
    }
  }
  const cwLength = cwSide === 'rear' ? cwRect.w : cwRect.h;
  const carCw = cwSide === 'rear' ? cwRect.y - (car.y + car.h) : cwSide === 'left' ? car.x - (cwRect.x + cwRect.w) : cwRect.x - (car.x + car.w);
  // a plan set by hand still has to fit: the car keeps the room of the rails, doors and counterweight from the
  // walls, the counterweight's rails stay inside their room, every door opens on the car
  const cwLo = (cwSide === 'rear' ? cwRect.x : cwRect.y) - KV.cwShoe - wr.h, cwHi = (cwSide === 'rear' ? cwRect.x + cwRect.w : cwRect.y + cwRect.h) + KV.cwShoe + wr.h;
  const place = Math.min(car.x - zone('left'), W - zone('right') - (car.x + car.w), car.y - zone('front'), D - zone('rear') - (car.y + car.h), cwLo - cwRoom[0], cwRoom[1] - cwHi);
  const onCar = Math.min(...doors.map((d) => (d.wall === 'front' || d.wall === 'rear' ? Math.min(d.u0 - carInner.x, carInner.x + A - d.u1) : Math.min(d.u0 - carInner.y, carInner.y + B - d.u1))));
  const niches = nicheMargin(I, doors, cwSide, { lo: cwLo, hi: cwHi });
  // Panev's supports for the counterweight rails: one of the catalogue's must take each rail (on its wall, or in its niche)
  const span = niche ? [niche.at, niche.at + niche.width] as const : undefined, heads = hasHead(I) ? [undefined, headOf(I)] : [undefined];
  // (a solution to the site's drawing chosen by hand: to be verified on it)
  const special = cwBracketsOf(I) === 'panev' && cwSpecialOf(I) !== null, staffe = cwBracketsOf(I) === 'panev' && !special
    ? Math.min(...rails.filter((r) => r.kind === 'cw').flatMap((r) => heads.map((h) => cwBracketMargin(I, doors, r, span, h) ?? Infinity))) : null;
  // the walls of the top floor's entrances further out in the headroom: the car stands that much further from them
  const facing = I.landingDepth + I.sillGap + headFacingExtra(I, doors);

  // the landing door's frame and the car door's operator inside the shaft
  const doorMargin = (d: DoorLayout): number => {
    const len = d.wall === 'front' || d.wall === 'rear' ? W : D;
    return Math.min(d.frame0, len - d.frame1, d.op0, len - d.op1);
  };
  // a landing door set apart from its car door: its clear opening past the car door's on one side by as much, and the
  // passage through both what their openings share
  const shifted = doors.filter((d) => (d.side === 'A' ? fix.landA : fix.landB) !== undefined), passage = Math.min(...doors.map((d) => d.width - Math.abs(d.l0 - d.u0)));
  // the landing doors' own frame in the shaft: their panels behind it (frame.ts)
  const behind = frameRoom(I, doors);
  const checks: ShaftCheck[] = [
    check('v_fit', fits, Math.min(maxA - minA, maxB - minB), 0, 0, 'mm'),
    check('v_area', area <= areaMax + 1e-9, area, areaMax, 2, 'm²'),
    ...(acc ? [
      check('v_acc_car', A >= acc[0] && B >= acc[1], Math.min(A - acc[0], B - acc[1]), 0, 0, 'mm'),
      check('v_acc_door', passage >= acc[2], passage, acc[2], 0, 'mm'),
      ...(shortSide ? [check('v_acc_side', A <= B, B - A, 0, 0, 'mm')] : []),
    ] : []),
    check('v_door', doorMargin(doors[0]) >= 0, doorMargin(doors[0]), 0, 0, 'mm'),
    ...(doors[1] ? [check('v_door2', doorMargin(doors[1]) >= 0, doorMargin(doors[1]), 0, 0, 'mm')] : []),
    ...shifted.map((d) => ((x: number) => check(d.side === 'A' ? 'v_land' : 'v_land2', x <= KV.landingShiftMax, x, KV.landingShiftMax, 0, 'mm'))(Math.abs(d.l0 - d.u0))),
    // two adjacent entrances: the operators on the car roof must not run into each other at the shared corner
    ...(adj && doors[1] ? [((x: number) => check('v_op', x <= 0, x, 0, 0, 'mm', true))(clash(operatorBox(I, doors[0]), operatorBox(I, doors[1])))] : []),
    check('v_wall', facing <= KV.wallFacingEntranceMax, facing, KV.wallFacingEntranceMax, 0, 'mm'),
    check('v_sill', I.sillGap <= KV.sillGapMax, I.sillGap, KV.sillGapMax, 0, 'mm'),
    check('v_cw', carCw >= KV.carCwMin, carCw, KV.carCwMin, 0, 'mm'),
    check('v_cwlen', cwLength >= KV.cwMinLength, cwLength, KV.cwMinLength, 0, 'mm', true),
    // only a plan with distances set by hand can put them out of place: the worked-out one keeps them in by construction
    // (the buffers' places have a check of their own, pit.ts)
    ...(Object.entries(fix).some(([k, v]) => v !== undefined && !BUFFER_KEYS.has(k)) ? [
      check('v_place', place >= 0, Math.round(place), 0, 0, 'mm'),
      check('v_doorcar', onCar >= 0, Math.round(onCar), 0, 0, 'mm'),
    ] : []),
    ...(niches !== null ? [check('v_niche', niches >= 0, Math.round(niches), 0, 0, 'mm')] : []),
    ...(staffe !== null && Number.isFinite(staffe) ? [check('v_staffa', staffe >= 0, Math.round(staffe), 0, 0, 'mm')] : []),
    ...(special ? [check('v_staffa', false, null, null, 0, 'mm', true)] : []),
    ...(behind !== null ? [check('v_telaio', behind >= 0, behind, 0, 0, 'mm', true)] : []),
  ];

  const L: Layout = {
    inputs: I, fits, A, B, area, Q, Qgiven: I.Q !== null, areaMax, persons: passengers(Q, area), maxA, maxB, minA, minB,
    car, carInner, doors, frame, cw: cwRect, cwSide, cwDbg, bridge, rails, checks,
  };
  const head = headCheck(L);
  L.checks.push(...(head ? [head] : []), ...bufferChecks(L), ...sectionChecks(L), ...roomChecks(L));
  return L;
}

/** Worst status of the checks: the verdict of the design. */
export function verdictOf(L: Layout): 'ok' | 'warn' | 'fail' {
  return L.checks.some((c) => c.status === 'fail') ? 'fail' : L.checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
}
