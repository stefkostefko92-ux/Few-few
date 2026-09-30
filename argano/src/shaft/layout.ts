// Layout of the shaft in plan: the largest car that fits between the doors, the guide rails and the counterweight,
// within the area its rated load admits; door frames, counterweight and rails placed; checks of the clearances.
// Pure: the same function draws the live preview in the browser and the saved design on the server.
import { DEFAULTS, KV } from './norme';
import { loadForArea, maxArea, passengers } from './area';
import type { Access, DoorLayout, Layout, Rail, Rect, ShaftCheck, ShaftCheckId, ShaftInputs } from './types';

const ACCESS: Readonly<Record<Exclude<Access, 'none'>, readonly [number, number, number]>> = {
  dm236_existing: KV.dm236Existing, dm236_residential: KV.dm236Residential, dm236_public: KV.dm236Public,
};

const floorTo = (x: number, step: number): number => Math.floor(x / step + 1e-9) * step;
const round1 = (x: number): number => Math.round(x);

/** A new design: the largest car, telescopic 800 mm doors, counterweight at the back, existing building. */
export function defaultInputs(W: number, D: number): ShaftInputs {
  return { W, D, Q: null, door: 'T2', doorWidth: 800, cw: 'rear', access: 'dm236_existing', ...DEFAULTS };
}

/** Checks whose limit is a maximum (value ≤ limit); for the others it is a minimum. */
export const isUpperLimit = (id: ShaftCheckId): boolean => id === 'v_area' || id === 'v_wall' || id === 'v_sill';

function check(id: ShaftCheckId, ok: boolean, value: number | null, limit: number | null, dec: number, unit: ShaftCheck['unit'], soft = false): ShaftCheck {
  return { id, status: ok ? 'ok' : soft ? 'warn' : 'fail', value, limit, dec, unit };
}

/** Car size: in the admissible range, the largest area the rated load admits; at equal area the deepest car. */
function carSize(I: ShaftInputs, maxA: number, maxB: number, minA: number, minB: number, shortSide: boolean): { A: number; B: number; Q: number } {
  const step = KV.sizeStep;
  if (I.Q === null) {
    const B = maxB, A = shortSide ? Math.min(maxA, floorTo(maxB, step)) : maxA;
    return { A, B, Q: loadForArea((A * B) / 1e6) };
  }
  const cap = maxArea(I.Q) * 1e6;
  let best: { A: number; B: number } | null = null;
  for (let a = maxA; a >= minA; a -= step) {
    const b = Math.min(maxB, floorTo(cap / a, step));
    if (b < minB || (shortSide && b < a)) continue;
    if (!best || a * b > best.A * best.B || (a * b === best.A * best.B && b > best.B)) best = { A: a, B: b };
  }
  return best ? { ...best, Q: I.Q } : { A: minA, B: minB, Q: I.Q };
}

function doorLayout(I: ShaftInputs, inner: Rect): DoorLayout {
  const L = I.doorWidth, half = KV.doorFrame / 2;
  if (I.door === 'C2') {
    const x0 = inner.x + (inner.w - L) / 2, overall = KV.doorStackC2 * L + KV.doorFrame, mid = x0 + L / 2;
    return { kind: 'C2', width: L, x0, x1: x0 + L, frame0: mid - overall / 2, frame1: mid + overall / 2, stack: 'both' };
  }
  // telescopic: the opening flush with one side of the car, the panels stacking toward the other side
  const overall = KV.doorStackT2 * L + KV.doorFrame;
  const right: DoorLayout = { kind: 'T2', width: L, x0: inner.x, x1: inner.x + L, frame0: inner.x - half, frame1: inner.x - half + overall, stack: 'right' };
  const left: DoorLayout = { kind: 'T2', width: L, x0: inner.x + inner.w - L, x1: inner.x + inner.w, frame0: inner.x + inner.w + half - overall, frame1: inner.x + inner.w + half, stack: 'left' };
  const margin = (d: DoorLayout): number => Math.min(d.frame0, I.W - d.frame1);
  return margin(left) > margin(right) ? left : right;
}

export function layout(I: ShaftInputs): Layout {
  const { W, D, cw, carWall, railZone } = I;
  const step = KV.sizeStep;
  const front = I.landingDepth + I.sillGap + I.carDoorDepth; // outside of the car front wall
  const cwZone = I.cwWallGap + I.cwDepth + I.cwCarGap; // wall to car across the counterweight
  const xL = cw === 'left' ? Math.max(railZone, cwZone) : railZone;
  const xR = W - (cw === 'right' ? Math.max(railZone, cwZone) : railZone);
  const yB = D - (cw === 'rear' ? cwZone : I.rearGap);
  const maxA = Math.max(0, floorTo(xR - xL - 2 * carWall, step)), maxB = Math.max(0, floorTo(yB - front - 2 * carWall, step));
  const acc = I.access === 'none' ? null : ACCESS[I.access];
  const minA = Math.max(I.doorWidth + KV.carDoorMargin, acc ? acc[0] : 0), minB = Math.max(KV.carMinDepth, acc ? acc[1] : 0);
  const shortSide = acc !== null;
  const fits = maxA >= minA && maxB >= minB && (!shortSide || maxB >= minA);
  const size = fits ? carSize(I, maxA, maxB, minA, minB, shortSide) : { A: minA, B: minB, Q: I.Q ?? loadForArea((minA * minB) / 1e6) };
  const { A, B, Q } = size;
  const area = (A * B) / 1e6, areaMax = maxArea(Q);

  // car centred between its guide rails, against the landing side
  const outerW = A + 2 * carWall, outerD = B + 2 * carWall;
  const car: Rect = { x: round1(xL + (xR - xL - outerW) / 2), y: front, w: outerW, h: outerD };
  const carInner: Rect = { x: car.x + carWall, y: car.y + carWall, w: A, h: B };
  const door = doorLayout(I, carInner);

  // guide rails of the car at mid-depth of the car, blades toward it; counterweight with its own pair
  const yMid = round1(car.y + car.h / 2), shoe = 20;
  const rails: Rail[] = [
    { x: car.x - shoe, y: yMid, dir: 'right', size: 'car', bracketAxis: 'x', bracketTo: 0 },
    { x: car.x + car.w + shoe, y: yMid, dir: 'left', size: 'car', bracketAxis: 'x', bracketTo: W },
  ];
  let cwRect: Rect;
  if (cw === 'rear') {
    const len = Math.min(KV.cwMaxLength, W - 2 * railZone), x = round1(car.x + car.w / 2 - len / 2), y = D - I.cwWallGap - I.cwDepth;
    cwRect = { x, y, w: len, h: I.cwDepth };
    rails.push({ x: x - 8, y: y + I.cwDepth / 2, dir: 'right', size: 'cw', bracketAxis: 'y', bracketTo: D },
      { x: x + len + 8, y: y + I.cwDepth / 2, dir: 'left', size: 'cw', bracketAxis: 'y', bracketTo: D });
  } else {
    const y1 = D - KV.cwEndGap, y0 = Math.max(yMid + KV.cwRailClear, y1 - KV.cwMaxLength), len = Math.max(0, y1 - y0);
    const x = cw === 'left' ? I.cwWallGap : W - I.cwWallGap - I.cwDepth;
    cwRect = { x, y: y0, w: I.cwDepth, h: len };
    const wall = cw === 'left' ? 0 : W;
    rails.push({ x: x + I.cwDepth / 2, y: y0 - 8, dir: 'back', size: 'cw', bracketAxis: 'x', bracketTo: wall },
      { x: x + I.cwDepth / 2, y: y1 + 8, dir: 'front', size: 'cw', bracketAxis: 'x', bracketTo: wall });
  }
  const cwLength = cw === 'rear' ? cwRect.w : cwRect.h;

  const checks: ShaftCheck[] = [
    check('v_fit', fits, Math.min(maxA - minA, maxB - minB), 0, 0, 'mm'),
    check('v_area', area <= areaMax + 1e-9, area, areaMax, 2, 'm²'),
    ...(acc ? [
      check('v_acc_car', A >= acc[0] && B >= acc[1], Math.min(A - acc[0], B - acc[1]), 0, 0, 'mm'),
      check('v_acc_door', I.doorWidth >= acc[2], I.doorWidth, acc[2], 0, 'mm'),
      check('v_acc_side', A <= B, B - A, 0, 0, 'mm'),
    ] : []),
    check('v_door', Math.min(door.frame0, W - door.frame1) >= 0, Math.min(door.frame0, W - door.frame1), 0, 0, 'mm'),
    check('v_wall', I.landingDepth + I.sillGap <= KV.wallFacingEntranceMax, I.landingDepth + I.sillGap, KV.wallFacingEntranceMax, 0, 'mm'),
    check('v_sill', I.sillGap <= KV.sillGapMax, I.sillGap, KV.sillGapMax, 0, 'mm'),
    check('v_cw', I.cwCarGap >= KV.carCwMin, I.cwCarGap, KV.carCwMin, 0, 'mm'),
    check('v_cwlen', cwLength >= KV.cwMinLength, cwLength, KV.cwMinLength, 0, 'mm', true),
  ];

  return {
    inputs: I, fits, A, B, area, Q, Qgiven: I.Q !== null, areaMax, persons: passengers(Q, area), maxA, maxB, minA, minB,
    car, carInner, door, cw: cwRect, rails, checks,
  };
}

/** Worst status of the checks: the verdict of the design. */
export function verdictOf(L: Layout): 'ok' | 'warn' | 'fail' {
  return L.checks.some((c) => c.status === 'fail') ? 'fail' : L.checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
}
