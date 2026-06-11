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
}

export interface Frame {
  balls: { id: number; x: number; y: number }[];
}

export interface ShotResult {
  /** Resting state after the shot (potted balls flagged). */
  finalBalls: Ball[];
  /** Object-ball ids potted, in the order they dropped. */
  potted: number[];
  /** True if the cue ball was potted (scratch). */
  cueScratch: boolean;
  /** First object ball the cue contacted, or null if it hit nothing. */
  firstContact: number | null;
  /** A cushion was struck (by any ball) after the first ball-ball contact. */
  cushionAfterContact: boolean;
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

const POCKETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [TABLE.w / 2, 0],
  [TABLE.w, 0],
  [0, TABLE.h],
  [TABLE.w / 2, TABLE.h],
  [TABLE.w, TABLE.h],
];

const clone = (b: Ball): Ball => ({ ...b });
const speed2 = (b: Ball): number => b.vx * b.vx + b.vy * b.vy;

function inPocket(x: number, y: number): boolean {
  for (const [px, py] of POCKETS) {
    const dx = x - px;
    const dy = y - py;
    if (dx * dx + dy * dy <= TABLE.pocketR * TABLE.pocketR) return true;
  }
  return false;
}

/**
 * Simulate a shot to rest. `balls` is the pre-shot layout (not mutated). The
 * cue ball (id 0) is launched along `shot`.
 */
export function runShot(balls: readonly Ball[], shot: Shot): ShotResult {
  const bs = balls.map(clone);
  const cue = bs.find((b) => b.id === 0);
  const power = Math.max(0, Math.min(1, shot.power));
  if (cue && !cue.potted) {
    cue.vx = Math.cos(shot.angle) * MAX_SPEED * power;
    cue.vy = Math.sin(shot.angle) * MAX_SPEED * power;
  }

  const potted: number[] = [];
  let cueScratch = false;
  let firstContact: number | null = null;
  let cushionAfterContact = false;
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

      if (inPocket(b.x, b.y)) {
        b.potted = true;
        b.vx = 0;
        b.vy = 0;
        if (b.id === 0) cueScratch = true;
        else potted.push(b.id);
        continue;
      }
      // Cushions (reflect; pockets already captured at the rails).
      if (b.x < r) {
        b.x = r;
        b.vx = -b.vx * CUSHION_REST;
        if (firstContact !== null) cushionAfterContact = true;
      } else if (b.x > TABLE.w - r) {
        b.x = TABLE.w - r;
        b.vx = -b.vx * CUSHION_REST;
        if (firstContact !== null) cushionAfterContact = true;
      }
      if (b.y < r) {
        b.y = r;
        b.vy = -b.vy * CUSHION_REST;
        if (firstContact !== null) cushionAfterContact = true;
      } else if (b.y > TABLE.h - r) {
        b.y = TABLE.h - r;
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
          const imp = -vn * BALL_REST;
          a.vx -= imp * nx;
          a.vy -= imp * ny;
          c.vx += imp * nx;
          c.vy += imp * ny;
          // Record first contact involving the cue ball.
          if (firstContact === null) {
            if (a.id === 0) firstContact = c.id;
            else if (c.id === 0) firstContact = a.id;
          }
        }
      }
    }

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
  return { finalBalls: bs, potted, cueScratch, firstContact, cushionAfterContact, frames };
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
  lastShot: { angle: number; power: number; before: Ball[] } | null;
}

export interface CueAction {
  type: "SHOOT";
  angle: number;
  power: number;
  cueX?: number;
  cueY?: number;
}

export type CueEvent =
  | { type: "SHOT"; seat: number; angle: number; power: number; before: Ball[]; potted: number[]; cueScratch: boolean }
  | { type: "FOUL"; seat: number; reason: string }
  | { type: "POINTS"; seat: number; points: number }
  | { type: "WIN"; seat: number };
