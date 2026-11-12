/**
 * Deterministic 2D billiard physics. Pure float math (no RNG, no time source),
 * so the realtime server and the browser run the IDENTICAL simulation: the
 * server computes the authoritative resting state from a shot, and each client
 * re-runs `runShot` on the same pre-shot balls + shot to animate — landing on
 * exactly the same positions. Only the shot params travel over the wire.
 *
 * Units: a 2×1 table (cushion-to-cushion). Six pockets (4 corners + 2 mid-rail).
 */

export interface Ball {
  id: number; // 0 = cue
  x: number;
  y: number;
  vx: number;
  vy: number;
  potted: boolean;
}

export interface Shot {
  /** Aim direction in radians. */
  angle: number;
  /** 0..1 — fraction of max break speed. */
  power: number;
  /** Ефект — точка на удара върху бялата, нормирана към диска на позволения
   *  радиус (|(spinX, spinY)| ≤ 1). spinX > 0 = вдясно от центъра спрямо
   *  посоката на удара (английски ефект при борд); spinY > 0 = горе (follow —
   *  бялата продължава след сблъсъка), spinY < 0 = долу (draw — връща се).
   *  Липсва = 0 (удар в центъра, „stun“) — старото поведение е непроменено. */
  spinX?: number;
  spinY?: number;
}

/** Максимално отместване на върха на щеката от центъра (в радиуси на топката),
 *  на което съответства |spin| = 1. По-навън е „miscue“ — не се допуска. */
export const SPIN_MAX_TIP = 0.5;

/** Нормализира ефекта: нечислово → 0, извън единичния диск → върху ръба. */
export function clampSpin(x: unknown, y: unknown): { spinX: number; spinY: number } {
  let sx = typeof x === "number" && Number.isFinite(x) ? x : 0;
  let sy = typeof y === "number" && Number.isFinite(y) ? y : 0;
  const m2 = sx * sx + sy * sy;
  if (m2 > 1) {
    const m = Math.sqrt(m2);
    sx /= m;
    sy /= m;
  }
  return { spinX: sx, spinY: sy };
}

/** Валиден ли е ефектът, подаден от клиента (сървърна граница, без нормализиране). */
export function spinOk(x: unknown, y: unknown): boolean {
  for (const v of [x, y]) {
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < -1 || v > 1) return false;
  }
  const sx = (x as number | undefined) ?? 0;
  const sy = (y as number | undefined) ?? 0;
  return sx * sx + sy * sy <= 1 + 1e-9;
}

export interface Frame {
  balls: { id: number; x: number; y: number }[];
}

export interface ShotResult {
  /** Resting state after the shot (potted balls flagged). */
  finalBalls: Ball[];
  /** Object-ball ids potted, in the order they dropped. */
  potted: number[];
  /** Индекс на джоба (0..5, виж `POCKETS`) за всяка топка от `potted` — същия ред. */
  pottedPockets: number[];
  /** True if the cue ball was potted (scratch). */
  cueScratch: boolean;
  /** First object ball the cue contacted, or null if it hit nothing. */
  firstContact: number | null;
  /** A cushion was struck (by any ball) after the first ball-ball contact. */
  cushionAfterContact: boolean;
  /** Брой РАЗЛИЧНИ обектни топки (не бялата), ударили борд по време на удара —
   *  нужен за законното разбиване в пула (WPA: ≥4 топки до борд или вкарана топка). */
  cushionBalls: number;
  /** Sampled positions over time for client-side animation (60 fps). */
  frames: Frame[];
}

export const TABLE = {
  w: 2,
  h: 1,
  ballR: 0.0285,
  pocketR: 0.052,
} as const;

const MAX_SPEED = 4.2; // units/sec at power 1
const FRICTION = 0.95; // units/sec^2 linear deceleration
const CUSHION_REST = 0.9;
const BALL_REST = 0.97;
const DT = 1 / 300;
const SAMPLE = 5; // → 60 fps frames
const MAX_STEPS = 9000;
const REST_EPS = 0.012; // speed below which a ball is considered stopped

// Ефект: колко от скоростта на удара става въртене (горе/долу и странично),
// как се губи по сукното и колко се предава при сблъсък/борд.
const FOLLOW_GAIN = 0.85; // spinY=±1 → ±0.85·v0 „запас“ follow/draw
const SIDE_GAIN = 0.6; // spinX=±1 → 0.6·v0 периферна скорост
const SPIN_DECAY = 1.1; // units/sec^2 — draw/follow се изтрива с търкалянето
const FOLLOW_XFER = 0.7; // каква част от запаса се превръща в скорост след сблъсъка
const SIDE_XFER = 0.35; // триене борд↔топка при английски ефект
const SIDE_KEEP = 0.5; // остатък от страничното въртене след борд

/** Джобовете: 0 горе-ляво, 1 горе-среда, 2 горе-дясно, 3 долу-ляво, 4 долу-среда, 5 долу-дясно. */
export const POCKETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [TABLE.w / 2, 0],
  [TABLE.w, 0],
  [0, TABLE.h],
  [TABLE.w / 2, TABLE.h],
  [TABLE.w, TABLE.h],
];

const clone = (b: Ball): Ball => ({ ...b });
const speed2 = (b: Ball): number => b.vx * b.vx + b.vy * b.vy;

/** Индекс на джоба, в който е (x, y), или -1. */
function pocketAt(x: number, y: number): number {
  for (let i = 0; i < POCKETS.length; i++) {
    const [px, py] = POCKETS[i]!;
    const dx = x - px;
    const dy = y - py;
    if (dx * dx + dy * dy <= TABLE.pocketR * TABLE.pocketR) return i;
  }
  return -1;
}

/**
 * Английски ефект при борд: в точката на допир (R·n, n — нормалата към борда)
 * повърхността на бялата се движи с side·(−n_y, n_x); триенето в борда дава
 * тангенциален тласък в обратна посока, ограничен от силата на удара в борда.
 * Мутира скоростта на `b`, връща остатъчното странично въртене.
 */
function english(b: Ball, side: number, nx: number, ny: number, vn: number): number {
  const k = Math.min(1, Math.abs(vn) / Math.abs(side)) * SIDE_XFER;
  b.vx -= side * -ny * k;
  b.vy -= side * nx * k;
  return side * SIDE_KEEP;
}

/** Линейно затихване към 0 (детерминистично, само аритметика). */
const decay = (v: number, d: number): number => (v > d ? v - d : v < -d ? v + d : 0);

/**
 * Simulate a shot to rest. `balls` is the pre-shot layout (not mutated). The
 * cue ball (id 0) is launched along `shot`.
 */
export function runShot(balls: readonly Ball[], shot: Shot): ShotResult {
  const bs = balls.map(clone);
  const cue = bs.find((b) => b.id === 0);
  const power = Math.max(0, Math.min(1, shot.power));
  const { spinX, spinY } = clampSpin(shot.spinX, shot.spinY);
  // Въртенето на бялата се пази отделно (не е част от сериализирания Ball):
  //  roll — запас follow(+)/draw(−) по посоката на движение (единици скорост);
  //  side — периферна скорост ωz·R (z по конвенцията на масата: x→y).
  let roll = 0;
  let side = 0;
  if (cue && !cue.potted) {
    const v0 = MAX_SPEED * power;
    cue.vx = Math.cos(shot.angle) * v0;
    cue.vy = Math.sin(shot.angle) * v0;
    roll = spinY * FOLLOW_GAIN * v0;
    // Удар вдясно от центъра (spinX > 0) завърта топката с ωz < 0 (x→y е по
    // часовника на екрана, y надолу): cross(отместване, посока) = −spinX.
    side = -spinX * SIDE_GAIN * v0;
  }

  const potted: number[] = [];
  const pottedPockets: number[] = [];
  let cueScratch = false;
  let firstContact: number | null = null;
  let cushionAfterContact = false;
  const railed = new Set<number>(); // обектни топки, докоснали борд
  const frames: Frame[] = [];
  const r = TABLE.ballR;

  const snapshot = () => {
    frames.push({
      balls: bs.filter((b) => !b.potted).map((b) => ({ id: b.id, x: b.x, y: b.y })),
    });
  };
  snapshot();

  for (let step = 0; step < MAX_STEPS; step++) {
    let moving = false;

    // Integrate + cushions + pockets.
    for (const b of bs) {
      if (b.potted) continue;
      if (speed2(b) > REST_EPS * REST_EPS) moving = true; else continue;
      b.x += b.vx * DT;
      b.y += b.vy * DT;

      const pk = pocketAt(b.x, b.y);
      if (pk >= 0) {
        b.potted = true;
        b.vx = 0;
        b.vy = 0;
        if (b.id === 0) cueScratch = true;
        else {
          potted.push(b.id);
          pottedPockets.push(pk);
        }
        continue;
      }
      // Cushions (reflect; pockets already captured at the rails).
      if (b.id !== 0 && (b.x < r || b.x > TABLE.w - r || b.y < r || b.y > TABLE.h - r)) railed.add(b.id);
      const eng = b.id === 0 && side !== 0;
      if (b.x < r) {
        b.x = r;
        if (eng) side = english(b, side, -1, 0, b.vx);
        b.vx = -b.vx * CUSHION_REST;
        if (firstContact !== null) cushionAfterContact = true;
      } else if (b.x > TABLE.w - r) {
        b.x = TABLE.w - r;
        if (eng) side = english(b, side, 1, 0, b.vx);
        b.vx = -b.vx * CUSHION_REST;
        if (firstContact !== null) cushionAfterContact = true;
      }
      if (b.y < r) {
        b.y = r;
        if (eng) side = english(b, side, 0, -1, b.vy);
        b.vy = -b.vy * CUSHION_REST;
        if (firstContact !== null) cushionAfterContact = true;
      } else if (b.y > TABLE.h - r) {
        b.y = TABLE.h - r;
        if (eng) side = english(b, side, 0, 1, b.vy);
        b.vy = -b.vy * CUSHION_REST;
        if (firstContact !== null) cushionAfterContact = true;
      }
    }

    // Ball-ball collisions (equal mass elastic along the normal).
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]!;
      if (a.potted) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const c = bs[j]!;
        if (c.potted) continue;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > (2 * r) * (2 * r) || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        // Separate overlap.
        const overlap = 2 * r - d;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        c.x += nx * overlap * 0.5;
        c.y += ny * overlap * 0.5;
        // Relative velocity along normal.
        const rvx = c.vx - a.vx;
        const rvy = c.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          // Follow/draw: посоката на бялата ПРЕДИ сблъсъка (въртенето е по нея).
          const cueBall = a.id === 0 ? a : c.id === 0 ? c : null;
          let dux = 0;
          let duy = 0;
          if (cueBall && roll !== 0) {
            const sp = Math.sqrt(cueBall.vx * cueBall.vx + cueBall.vy * cueBall.vy);
            if (sp > 0) {
              dux = cueBall.vx / sp;
              duy = cueBall.vy / sp;
            }
          }
          const imp = -vn * BALL_REST;
          a.vx -= imp * nx;
          a.vy -= imp * ny;
          c.vx += imp * nx;
          c.vy += imp * ny;
          if (cueBall && roll !== 0) {
            // Горен ефект бута бялата напред по линията на удара, долен — назад.
            cueBall.vx += dux * roll * FOLLOW_XFER;
            cueBall.vy += duy * roll * FOLLOW_XFER;
            roll = 0;
          }
          // Record first contact involving the cue ball.
          if (firstContact === null) {
            if (a.id === 0) firstContact = c.id;
            else if (c.id === 0) firstContact = a.id;
          }
        }
      }
    }

    // Въртенето се изтрива по сукното (draw „умира“ при дълъг път).
    roll = decay(roll, SPIN_DECAY * DT);
    side = decay(side, SPIN_DECAY * DT);

    // Friction (linear deceleration toward rest).
    for (const b of bs) {
      if (b.potted) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp <= REST_EPS) {
        b.vx = 0;
        b.vy = 0;
        continue;
      }
      const ns = sp - FRICTION * DT;
      if (ns <= REST_EPS) {
        b.vx = 0;
        b.vy = 0;
      } else {
        const k = ns / sp;
        b.vx *= k;
        b.vy *= k;
      }
    }

    if (step % SAMPLE === 0) snapshot();
    if (!moving) break;
  }

  snapshot(); // final resting frame
  // Zero residual velocity in the returned resting state.
  for (const b of bs) {
    b.vx = 0;
    b.vy = 0;
  }
  return { finalBalls: bs, potted, pottedPockets, cueScratch, firstContact, cushionAfterContact, cushionBalls: railed.size, frames };
}

/** Place a ball at rest. */
export const ball = (id: number, x: number, y: number): Ball => ({ id, x, y, vx: 0, vy: 0, potted: false });

/** Is every ball at rest / potted? (sanity helper) */
export const allAtRest = (balls: readonly Ball[]): boolean =>
  balls.every((b) => b.potted || speed2(b) <= REST_EPS * REST_EPS);

// ── Cue-sport data types (shared so the web can render/animate without the
// server engine bundle) ─────────────────────────────────────────────────────

export type CueVariant = "EIGHTBALL" | "NINEBALL" | "SNOOKER";
export type Group = "solids" | "stripes" | null;

export interface CueState {
  variant: CueVariant;
  balls: Ball[];
  turn: number;
  phase: "PLAY" | "DONE";
  ballInHand: boolean;
  groups: [Group, Group];
  open: boolean;
  scores: [number, number];
  expect: "red" | "colour" | null;
  winner: number | null;
  message: string;
  shotNo: number;
  lastShot: { angle: number; power: number; spinX?: number; spinY?: number; before: Ball[] } | null;
}

export interface CueAction {
  type: "SHOOT";
  angle: number;
  power: number;
  cueX?: number;
  cueY?: number;
  /** Ефект (виж `Shot.spinX/spinY`). */
  spinX?: number;
  spinY?: number;
  /** 8-ball: обявен джоб за осмицата (0..5, виж `POCKETS`) — задължителен,
   *  когато играчът е на осмицата. */
  pocket?: number;
}

export type CueEvent =
  | {
      type: "SHOT";
      seat: number;
      angle: number;
      power: number;
      spinX?: number;
      spinY?: number;
      before: Ball[];
      potted: number[];
      cueScratch: boolean;
    }
  | { type: "FOUL"; seat: number; reason: string }
  | { type: "POINTS"; seat: number; points: number }
  /** Предупреждение към играча (напр. 9-ball „twoFouls“ — трети пореден фал губи рака). */
  | { type: "WARNING"; seat: number; reason: string }
  | { type: "WIN"; seat: number };
