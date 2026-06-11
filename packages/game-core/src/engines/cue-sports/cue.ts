import type { GameEngine, Seat } from "../../kernel/contract.js";
import {
  runShot,
  TABLE,
  type Ball,
  type CueAction,
  type CueEvent,
  type CueState,
  type CueVariant,
  type Group,
} from "@aso/shared";
import {
  rackEightBall,
  rackNineBall,
  rackSnooker,
  SNOOKER_SPOTS,
} from "./racks.js";

export type { CueState, CueAction, CueEvent, CueVariant, Group };

const R = TABLE.ballR;
const other = (s: Seat): Seat => (s === 0 ? 1 : 0);
const isRed = (id: number): boolean => id >= 11 && id <= 25;
const isColour = (id: number): boolean => id >= 2 && id <= 7;
const value = (id: number): number => (isRed(id) ? 1 : id);
const clone = (b: Ball): Ball => ({ ...b });
const cloneAll = (bs: Ball[]): Ball[] => bs.map(clone);
const live = (bs: Ball[]): Ball[] => bs.filter((b) => !b.potted);

function initial(variant: CueVariant): CueState {
  const balls = variant === "EIGHTBALL" ? rackEightBall() : variant === "NINEBALL" ? rackNineBall() : rackSnooker();
  return {
    variant,
    balls,
    turn: 0,
    phase: "PLAY",
    ballInHand: variant !== "SNOOKER", // pool breaks with cue-in-hand behind the line
    groups: [null, null],
    open: true,
    scores: [0, 0],
    expect: variant === "SNOOKER" ? "red" : null,
    winner: null,
    message: "",
    shotNo: 0,
    lastShot: null,
  };
}

/** A valid resting place for a ball (in bounds, not overlapping another). */
function placementOk(balls: Ball[], x: number, y: number, ignoreId: number): boolean {
  if (x < R || x > TABLE.w - R || y < R || y > TABLE.h - R) return false;
  for (const b of balls) {
    if (b.potted || b.id === ignoreId) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    if (dx * dx + dy * dy < (2 * R) * (2 * R)) return false;
  }
  return true;
}

/** Bring `id` back onto its spot (or the nearest free point along +x). */
function respot(balls: Ball[], id: number, spot: [number, number]): void {
  const b = balls.find((x) => x.id === id);
  if (!b) return;
  b.potted = false;
  b.vx = 0;
  b.vy = 0;
  let x = spot[0];
  const y = spot[1];
  for (let i = 0; i < 200 && !placementOk(balls, x, y, id); i++) x += R;
  if (x > TABLE.w - R) {
    x = spot[0];
    for (let i = 0; i < 200 && !placementOk(balls, x, y, id); i++) x -= R;
  }
  b.x = x;
  b.y = y;
}

/** Place the cue ball at a default spot (used after a scratch). */
function placeCue(balls: Ball[], spot: [number, number]): void {
  const cue = balls.find((b) => b.id === 0);
  if (!cue) return;
  cue.potted = false;
  cue.vx = 0;
  cue.vy = 0;
  let x = spot[0];
  const y = spot[1];
  for (let i = 0; i < 200 && !placementOk(balls, x, y, 0); i++) x += R * 0.5;
  cue.x = x;
  cue.y = y;
}

interface Outcome {
  foul: boolean;
  reason: string;
  continueTurn: boolean;
  winner: Seat | null;
  points: number; // awarded this shot (snooker: to shooter, or to opponent if foul)
  pointsToOpponent: boolean;
}

// ── Per-variant rules ────────────────────────────────────────────────────────

function rulesEightBall(state: CueState, balls: Ball[], r: ReturnType<typeof runShot>): Outcome {
  const shooter = state.turn;
  const pottedObj = r.potted;
  const eightPotted = pottedObj.includes(8);
  const myGroupBalls = (g: Group) =>
    g === "solids" ? [1, 2, 3, 4, 5, 6, 7] : g === "stripes" ? [9, 10, 11, 12, 13, 14, 15] : [];
  let group: Group = state.groups[shooter] ?? null;
  let open = state.open;

  // Assign groups on the first legal pot while the table is open.
  if (open && !r.cueScratch && pottedObj.some((p) => p !== 8)) {
    const first = pottedObj.find((p) => p !== 8)!;
    group = first <= 7 ? "solids" : "stripes";
    open = false;
  }

  const onEight = !open && group !== null && myGroupBalls(group).every((id) => !live(balls).some((b) => b.id === id));
  const firstHitEight = r.firstContact === 8;
  const noRail = pottedObj.length === 0 && !r.cushionAfterContact && r.firstContact !== null;

  if (eightPotted) {
    const legalEight = onEight && firstHitEight && !r.cueScratch;
    return {
      foul: false,
      reason: legalEight ? "Осмицата е вкарана!" : "Осмицата е вкарана нередовно — загуба.",
      continueTurn: false,
      winner: legalEight ? shooter : other(shooter),
      points: 0,
      pointsToOpponent: false,
    };
  }

  // Foul checks.
  let foul = false;
  let reason = "";
  if (r.cueScratch) {
    foul = true;
    reason = "Фал: бялата падна.";
  } else if (r.firstContact === null) {
    foul = true;
    reason = "Фал: не уцели топка.";
  } else if (!open && group && !myGroupBalls(group).includes(r.firstContact) && !(onEight && firstHitEight)) {
    foul = true;
    reason = "Фал: уцели чужда топка.";
  } else if (open && firstHitEight) {
    foul = true;
    reason = "Фал: уцели осмицата при отворена маса.";
  } else if (noRail) {
    foul = true;
    reason = "Фал: нито топка в джоб, нито борд.";
  }

  const pottedMine =
    !foul && pottedObj.some((p) => (open ? p !== 8 : myGroupBalls(group).includes(p)));
  return {
    foul,
    reason: foul ? reason : pottedMine ? "Продължава." : "",
    continueTurn: pottedMine,
    winner: null,
    points: 0,
    pointsToOpponent: false,
  };
}

function rulesNineBall(state: CueState, balls: Ball[], r: ReturnType<typeof runShot>): Outcome {
  const shooter = state.turn;
  const onTable = live(balls).filter((b) => b.id >= 1 && b.id <= 9).map((b) => b.id);
  const lowestBefore = Math.min(...[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((id) =>
    state.balls.some((b) => b.id === id && !b.potted),
  ));
  const ninePotted = r.potted.includes(9);
  const noRail = r.potted.length === 0 && !r.cushionAfterContact && r.firstContact !== null;

  let foul = false;
  let reason = "";
  if (r.cueScratch) {
    foul = true;
    reason = "Фал: бялата падна.";
  } else if (r.firstContact === null) {
    foul = true;
    reason = "Фал: не уцели топка.";
  } else if (r.firstContact !== lowestBefore) {
    foul = true;
    reason = "Фал: трябва първо най-малката.";
  } else if (noRail) {
    foul = true;
    reason = "Фал: нито топка в джоб, нито борд.";
  }

  if (ninePotted && !foul) {
    return { foul: false, reason: "Деветката е вкарана — победа!", continueTurn: false, winner: shooter, points: 0, pointsToOpponent: false };
  }
  if (ninePotted && foul) respot(balls, 9, SNOOKER_SPOTS[6]!); // re-spot the 9 at the foot

  const pottedAny = !foul && r.potted.length > 0;
  void onTable;
  return {
    foul,
    reason: foul ? reason : pottedAny ? "Продължава." : "",
    continueTurn: pottedAny,
    winner: null,
    points: 0,
    pointsToOpponent: false,
  };
}

type SnookerOutcome = Outcome & { nextExpect?: "red" | "colour" };

function rulesSnooker(state: CueState, balls: Ball[], r: ReturnType<typeof runShot>): SnookerOutcome {
  const shooter = state.turn;
  const redsLeft = state.balls.some((b) => isRed(b.id) && !b.potted);
  const expect = state.expect ?? "red";
  const pottedReds = r.potted.filter(isRed);
  const pottedColours = r.potted.filter(isColour);
  const fc = r.firstContact;

  let foul = false;
  let reason = "";
  let foulValue = 4;

  const setFoul = (why: string, v: number) => {
    if (foul) return;
    foul = true;
    reason = why;
    foulValue = Math.max(foulValue, v);
  };

  if (r.cueScratch) setFoul("Фал: бялата падна.", 4);
  if (fc === null) setFoul("Фал: не уцели топка.", 4);

  // End-game: no reds — colours in ascending order.
  if (!redsLeft && expect === "colour") {
    const lowestColour = Math.min(...[2, 3, 4, 5, 6, 7].filter((id) => state.balls.some((b) => b.id === id && !b.potted)));
    if (fc !== null && fc !== lowestColour) setFoul("Фал: грешна топка.", Math.max(4, value(fc)));
    if (pottedReds.length) setFoul("Фал: няма червени.", 4);
    if (pottedColours.some((c) => c !== lowestColour)) setFoul("Фал: грешна топка в джоба.", Math.max(...pottedColours.map(value), 4));
  } else if (expect === "red") {
    if (fc !== null && !isRed(fc)) setFoul("Фал: трябваше червена.", Math.max(4, value(fc)));
    if (pottedColours.length) setFoul("Фал: вкара цветна вместо червена.", Math.max(...pottedColours.map(value), 4));
  } else {
    // expect colour (reds remain): may hit any colour.
    if (fc !== null && !isColour(fc)) setFoul("Фал: трябваше цветна.", 4);
    if (pottedReds.length) setFoul("Фал: вкара червена.", 4);
    if (pottedColours.length > 1) setFoul("Фал: повече от една цветна.", Math.max(...pottedColours.map(value), 4));
  }

  if (foul) {
    if (r.cueScratch) {
      // Ball-in-hand in the baulk D (approx).
      placeCue(balls, [0.42, TABLE.h / 2]);
    }
    return { foul: true, reason, continueTurn: false, winner: null, points: foulValue, pointsToOpponent: true };
  }

  // Legal shot — score pots + advance the expectation, re-spotting colours
  // while reds remain.
  let pts = 0;
  let nextExpect: "red" | "colour" = expect;
  let pottedSomething = false;

  if (redsLeft && expect === "red") {
    pts += pottedReds.length;
    if (pottedReds.length > 0) {
      pottedSomething = true;
      nextExpect = "colour";
    }
  } else if (redsLeft && expect === "colour") {
    if (pottedColours.length === 1) {
      const c = pottedColours[0]!;
      pts += value(c);
      pottedSomething = true;
      respot(balls, c, SNOOKER_SPOTS[c]!); // colours come back up while reds remain
    }
    nextExpect = "red";
  } else if (pottedColours.length === 1) {
    // end-game colours (no reds) — they stay down.
    pts += value(pottedColours[0]!);
    pottedSomething = true;
  }

  // Win when the table is cleared.
  const cleared = !balls.some((b) => b.id !== 0 && !b.potted);
  if (cleared) {
    const s0 = state.scores[0] + (shooter === 0 ? pts : 0);
    const s1 = state.scores[1] + (shooter === 1 ? pts : 0);
    const winner = s0 === s1 ? null : s0 > s1 ? 0 : 1;
    return { foul: false, reason: "Масата е изчистена!", continueTurn: false, winner, points: pts, pointsToOpponent: false, nextExpect };
  }

  return {
    foul: false,
    reason: pottedSomething ? `+${pts}` : "",
    continueTurn: pottedSomething,
    winner: null,
    points: pts,
    pointsToOpponent: false,
    nextExpect,
  };
}

// ── Bot shots: ghost-ball potting attempts (so bots actually aim) ────────────

const POOL_POCKETS: [number, number][] = [
  [0, 0],
  [TABLE.w / 2, 0],
  [TABLE.w, 0],
  [0, TABLE.h],
  [TABLE.w / 2, TABLE.h],
  [TABLE.w, TABLE.h],
];

/** Object balls this seat is allowed to pot right now. */
function legalTargets(state: CueState): Ball[] {
  const objs = live(state.balls).filter((b) => b.id !== 0);
  if (objs.length === 0) return [];
  if (state.variant === "NINEBALL") {
    const lo = Math.min(...objs.map((b) => b.id));
    return objs.filter((b) => b.id === lo);
  }
  if (state.variant === "SNOOKER") {
    const reds = objs.filter((b) => isRed(b.id));
    if (state.expect === "red") return reds.length ? reds : objs;
    if (reds.length) return objs.filter((b) => isColour(b.id)); // any colour
    const colours = objs.filter((b) => isColour(b.id));
    const lo = Math.min(...colours.map((b) => b.id));
    return colours.filter((b) => b.id === lo);
  }
  const g = state.groups[state.turn] ?? null;
  if (state.open || g === null) return objs.filter((b) => b.id !== 8);
  const mine = g === "solids" ? objs.filter((b) => b.id >= 1 && b.id <= 7) : objs.filter((b) => b.id >= 9 && b.id <= 15);
  return mine.length ? mine : objs.filter((b) => b.id === 8);
}

/** Is the straight line cue→ghost clear of other balls (coarse check)? */
function pathClear(balls: Ball[], cx: number, cy: number, gx: number, gy: number, ignore: number[]): boolean {
  const dx = gx - cx;
  const dy = gy - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  const ux = dx / len;
  const uy = dy / len;
  for (const b of balls) {
    if (b.potted || b.id === 0 || ignore.includes(b.id)) continue;
    const t = (b.x - cx) * ux + (b.y - cy) * uy;
    if (t <= 0 || t >= len) continue;
    const perp = Math.abs((b.x - cx) * -uy + (b.y - cy) * ux);
    if (perp < 2 * R * 0.92) return false;
  }
  return true;
}

/**
 * Candidate shots for bots / auto-play: for each legal target ball and each
 * pocket, aim the cue at the "ghost ball" (one diameter behind the object ball
 * along the target→pocket line). Ranked by cut angle + clear path; the best few
 * are returned so RandomBot picks a sensible (if imperfect) pot.
 */
function candidateShots(state: CueState): CueAction[] {
  const cue = live(state.balls).find((b) => b.id === 0);
  const targets = legalTargets(state);
  if (!cue || targets.length === 0) return [{ type: "SHOOT", angle: 0, power: 0.6 }];

  const shots: { angle: number; power: number; score: number }[] = [];
  for (const tb of targets) {
    for (const [px, py] of POOL_POCKETS) {
      const tpx = px - tb.x;
      const tpy = py - tb.y;
      const tpDist = Math.hypot(tpx, tpy);
      if (tpDist < 1e-6) continue;
      const ux = tpx / tpDist;
      const uy = tpy / tpDist;
      const gx = tb.x - ux * 2 * R;
      const gy = tb.y - uy * 2 * R;
      const cgx = gx - cue.x;
      const cgy = gy - cue.y;
      const cgDist = Math.hypot(cgx, cgy);
      if (cgDist < 1e-6) continue;
      const cutCos = (cgx / cgDist) * ux + (cgy / cgDist) * uy; // 1 = dead straight
      if (cutCos <= 0.2) continue; // cut too thin to make
      if (!pathClear(state.balls, cue.x, cue.y, gx, gy, [tb.id])) continue;
      const power = Math.min(1, 0.42 + (cgDist + tpDist) * 0.17 + (1 - cutCos) * 0.22);
      const score = cutCos * 2 - tpDist * 0.12 - cgDist * 0.06;
      shots.push({ angle: Math.atan2(cgy, cgx), power, score });
    }
  }
  shots.sort((a, b) => b.score - a.score);
  if (shots.length === 0) {
    // No clean pot — roll toward the nearest legal target (a safety/contact).
    const t = targets.reduce((n, b) =>
      Math.hypot(b.x - cue.x, b.y - cue.y) < Math.hypot(n.x - cue.x, n.y - cue.y) ? b : n,
    );
    return [{ type: "SHOOT", angle: Math.atan2(t.y - cue.y, t.x - cue.x), power: 0.5 }];
  }
  return shots.slice(0, 3).map((s) => ({ type: "SHOOT", angle: s.angle, power: Math.max(0.22, s.power) }));
}

// ── Engine factory ───────────────────────────────────────────────────────────

export function makeCueEngine(variant: CueVariant): GameEngine<CueState, CueAction, CueEvent> {
  return {
    init: () => initial(variant),

    legalActions(state, seat) {
      if (state.phase === "DONE" || seat !== state.turn) return [];
      return candidateShots(state);
    },

    validate(state, seat, action) {
      if (state.phase === "DONE" || seat !== state.turn) return false;
      if (!action || action.type !== "SHOOT") return false;
      if (!Number.isFinite(action.angle)) return false;
      if (!(action.power > 0) || action.power > 1) return false;
      if (action.cueX !== undefined || action.cueY !== undefined) {
        if (!state.ballInHand) return false;
        if (!Number.isFinite(action.cueX) || !Number.isFinite(action.cueY)) return false;
        if (!placementOk(state.balls, action.cueX!, action.cueY!, 0)) return false;
      }
      return true;
    },

    reduce(state, action) {
      const events: CueEvent[] = [];
      const balls = cloneAll(state.balls);

      // Ball-in-hand placement (validated above).
      if (state.ballInHand && action.cueX !== undefined && action.cueY !== undefined) {
        const cue = balls.find((b) => b.id === 0);
        if (cue) {
          cue.potted = false;
          cue.x = action.cueX;
          cue.y = action.cueY;
          cue.vx = 0;
          cue.vy = 0;
        }
      }

      const before = cloneAll(balls);
      const r = runShot(balls, { angle: action.angle, power: action.power });
      // Adopt the resting layout from the simulation.
      const rested = r.finalBalls;
      // Replace positions/potted in `balls` from `rested` (same ids/order).
      for (let i = 0; i < balls.length; i++) {
        const f = rested.find((b) => b.id === balls[i]!.id)!;
        balls[i] = { ...f };
      }

      const shooter = state.turn;
      const out =
        variant === "EIGHTBALL" ? rulesEightBall(state, balls, r)
        : variant === "NINEBALL" ? rulesNineBall(state, balls, r)
        : rulesSnooker(state, balls, r);

      events.push({
        type: "SHOT",
        seat: shooter,
        angle: action.angle,
        power: action.power,
        before,
        potted: r.potted,
        cueScratch: r.cueScratch,
      });

      // Cue scratch in pool → opponent gets ball-in-hand; bring the cue back.
      if (r.cueScratch && variant !== "SNOOKER") {
        placeCue(balls, [0.5, TABLE.h / 2]);
      }

      const next: CueState = {
        ...state,
        balls,
        shotNo: state.shotNo + 1,
        lastShot: { angle: action.angle, power: action.power, before },
        message: out.reason,
      };

      // 8-ball group assignment side-effect.
      if (variant === "EIGHTBALL" && state.open && !r.cueScratch) {
        const firstObj = r.potted.find((p) => p !== 8);
        if (firstObj !== undefined) {
          const g: Group = firstObj <= 7 ? "solids" : "stripes";
          next.groups = shooter === 0 ? [g, g === "solids" ? "stripes" : "solids"] : [g === "solids" ? "stripes" : "solids", g];
          next.open = false;
        }
      }

      // Snooker scoring + expectation.
      if (variant === "SNOOKER") {
        const so = out as Outcome & { nextExpect?: "red" | "colour" };
        const credit = (seat: Seat, pts: number): [number, number] =>
          seat === 0 ? [state.scores[0] + pts, state.scores[1]] : [state.scores[0], state.scores[1] + pts];
        if (out.pointsToOpponent) {
          next.scores = credit(other(shooter), out.points);
          events.push({ type: "FOUL", seat: shooter, reason: out.reason });
          events.push({ type: "POINTS", seat: other(shooter), points: out.points });
        } else if (out.points > 0) {
          next.scores = credit(shooter, out.points);
          events.push({ type: "POINTS", seat: shooter, points: out.points });
        }
        const redsLeftNow = next.balls.some((b) => isRed(b.id) && !b.potted);
        next.expect = redsLeftNow ? (so.nextExpect ?? "red") : "colour";
      } else if (out.foul) {
        events.push({ type: "FOUL", seat: shooter, reason: out.reason });
      }

      // Turn / ball-in-hand / winner.
      if (out.winner !== null) {
        next.winner = out.winner;
        next.phase = "DONE";
        events.push({ type: "WIN", seat: out.winner });
      } else if (out.continueTurn) {
        next.turn = shooter;
        next.ballInHand = false;
      } else {
        next.turn = other(shooter);
        next.ballInHand = variant !== "SNOOKER" ? out.foul : r.cueScratch;
      }

      return { state: next, events };
    },

    isTerminal: (state) => state.phase === "DONE",

    score(state) {
      const w = state.winner;
      if (w === null) {
        return [
          { seat: 0, result: "draw" as const },
          { seat: 1, result: "draw" as const },
        ];
      }
      return [0, 1].map((seat) => ({
        seat,
        result: (seat === w ? "win" : "loss") as "win" | "loss",
        points: state.variant === "SNOOKER" ? state.scores[seat as 0 | 1] : undefined,
      }));
    },

    // Cue sports are fully open-information: nothing to hide.
    redact: (state) => state,
  };
}

export const eightBallEngine = makeCueEngine("EIGHTBALL");
export const nineBallEngine = makeCueEngine("NINEBALL");
export const snookerEngine = makeCueEngine("SNOOKER");
