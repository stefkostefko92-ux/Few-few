/**
 * Frame-time governor, ported from boy/src/quality.js: holds the page at 60 fps
 * by moving the INTERNAL resolution of the hall backdrop instead of switching
 * effects off. Too many missed refreshes in the window lower the scale by 15%;
 * a clean window raises it by 8%, but never straight back above a scale that
 * just failed until `holdMs` has passed. Pure logic — unit-tested.
 */
export interface GovernorOpts {
  budgetMs?: number;
  windowSize?: number;
  minScale?: number;
  warmupMs?: number;
  holdMs?: number;
}

export interface Governor {
  readonly scale: number;
  reset(nowMs: number): void;
  /** Feed one frame interval. Returns true when the scale changed. */
  sample(dtMs: number, nowMs: number): boolean;
}

export function createGovernor({
  budgetMs = 19.5,
  windowSize = 40,
  minScale = 0.5,
  warmupMs = 3000,
  holdMs = 20000,
}: GovernorOpts = {}): Governor {
  let scale = 1;
  let samples: number[] = [];
  let lastChange = 0;
  let ceiling = 1;
  let ceilingUntil = 0;
  let since = 0;
  return {
    get scale() {
      return scale;
    },
    reset(nowMs) {
      scale = 1;
      samples = [];
      since = nowMs;
      ceiling = 1;
      ceilingUntil = 0;
    },
    sample(dtMs, nowMs) {
      if (dtMs > 250 || nowMs - since < warmupMs) return false;
      samples.push(dtMs);
      if (samples.length > windowSize) samples.shift();
      if (samples.length < windowSize * 0.75 || nowMs - lastChange < 1200) return false;
      const slow = samples.filter((d) => d > budgetMs).length / samples.length;
      if (slow > 0.12 && scale > minScale) {
        ceiling = scale;
        ceilingUntil = nowMs + holdMs;
        scale = Math.max(minScale, scale * 0.85);
      } else if (slow === 0 && scale < 1 && (nowMs > ceilingUntil || scale * 1.08 < ceiling)) {
        scale = Math.min(1, scale * 1.08);
      } else return false;
      lastChange = nowMs;
      samples = [];
      return true;
    },
  };
}

/**
 * Безнадеждно бавно рисуване (софтуерен WebGL, претоварен GPU): `frames`
 * поредни кадъра, всеки по-бавен от `slowMs`, след загряване `warmupMs` — или
 * два поредни кадъра над `hopelessMs` още в загряването (смяната на раздела е
 * един дълъг кадър, не два).
 * Управителят по-горе нарочно пропуска кадри над 250 ms (смяна на раздела),
 * затова при постоянно бавен рендер не реагираше никога — а анимираната зала и
 * празното прерисуване на 3D дъските замразяваха цялата страница (всеки клик
 * чакаше секунди и часовникът на хода изтичаше). Решението е лепкаво.
 */
export interface StallDetector {
  readonly stalled: boolean;
  reset(nowMs: number): void;
  /** Подай момента на кадъра; връща true, щом рисуването е обявено за безнадеждно. */
  tick(nowMs: number): boolean;
}

export function createStallDetector({
  slowMs = 250,
  frames = 6,
  warmupMs = 3000,
  hopelessMs = 1000,
}: { slowMs?: number; frames?: number; warmupMs?: number; hopelessMs?: number } = {}): StallDetector {
  let since = 0;
  let last = 0;
  let run = 0;
  let hopeless = 0;
  let stalled = false;
  return {
    get stalled() {
      return stalled;
    },
    reset(nowMs) {
      since = nowMs;
      last = 0;
      run = 0;
      hopeless = 0;
      stalled = false;
    },
    tick(nowMs) {
      if (stalled) return true;
      const dt = last ? nowMs - last : 0;
      last = nowMs;
      hopeless = dt > hopelessMs ? hopeless + 1 : 0;
      if (hopeless >= 2) stalled = true;
      if (stalled || nowMs - since < warmupMs) return stalled;
      run = dt > slowMs ? run + 1 : 0;
      if (run >= frames) stalled = true;
      return stalled;
    },
  };
}

/**
 * Да рисува ли 3D ядрото този кадър. Нормално: при движение или промяна веднага,
 * иначе на празен ход през `idleMs`. При безнадеждно бавен рендер — само при
 * промяна и не по-често от max(1 s, 2× цената на последния кадър): иначе ходовете
 * на ботовете (по-чести от един кадър) държаха главната нишка заета без край.
 */
export function shouldRender(o: {
  now: number;
  lastAt: number;
  lastCost: number;
  force: boolean;
  stalled: boolean;
  idleMs: number;
}): boolean {
  if (!o.stalled) return o.force || o.now - o.lastAt >= o.idleMs;
  return o.force && o.now - o.lastAt >= Math.max(1000, 2 * o.lastCost);
}

/** Phones and small screens start light; the governor refines from there. */
export function initialPixelCap(coarsePointer: boolean, shortestSide: number): number {
  return coarsePointer || shortestSide < 700 ? 0.5 : 0.75;
}
