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

/**
 * Engine-level extras carried on top of the shared CueState. They serialize
 * with the rest of the state (cue sports are open information, `redact` is a
 * pass-through), so clients and the realtime host can read them without
 * widening the shared wire type.
 */
export interface CueStateExtras {
  /** Real-time length of the last shot's animation in ms (frames are 60 fps).
   *  The realtime host uses it to pace bots / the turn clock. */
  lastShotMs?: number;
  /** 9-ball: the shot about to be played may be declared a push-out. */
  pushAvail?: boolean;
  /** 9-ball: a push-out was just played — the player to move may PASS back. */
  pushDecision?: boolean;
  /** Snooker: the striker potted the last red — next is a colour of choice
   *  (it re-spots), before the ordered end-game begins. */
  freeColour?: boolean;
  /** Snooker: a foul left the incoming striker snookered — free ball (any
   *  first contact counts as the ball "on"). */
  freeBall?: boolean;
  /** 9-ball: consecutive fouls per seat. Three in a row by the same player
   *  (with no legal shot in between) loses the rack (WPA three-foul rule).
   *  A legal shot resets that seat's counter; a value of 2 is the warning. */
  fouls?: [number, number];
  /** Snooker: the last stroke was a "foul and a miss" — the striker fouled
   *  without first contacting a ball "on". Surfaced so the referee/host can
   *  offer the standard replay option (see note in rulesSnooker). */
  miss?: boolean;
}
export type CueStateX = CueState & CueStateExtras;

/** SHOOT may carry a 9-ball push-out declaration; PASS declines a push-out. */
export type CueActionX = (CueAction & { pushOut?: boolean }) | { type: "PASS" };

type ShotRes = ReturnType<typeof runShot>;

const R = TABLE.ballR;
/** Pool: the break must be played from behind the head string. */
const HEAD_STRING_X = 0.5;
/** Snooker: ball-in-hand is restricted to the "D" (matches the drawn arc). */
const BAULK_X = 0.42;
const D_RADIUS = 0.18;
const D_SPOT: [number, number] = [BAULK_X, TABLE.h / 2];
/** Pool foot spot (the rack apex) — where the 8 re-spots after a break pot. */
const FOOT_SPOT: [number, number] = [1.35, TABLE.h / 2];

const inBaulkD = (x: number, y: number): boolean =>
  x <= BAULK_X + 1e-9 && (x - BAULK_X) ** 2 + (y - TABLE.h / 2) ** 2 <= D_RADIUS * D_RADIUS + 1e-9;

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);
const isRed = (id: number): boolean => id >= 11 && id <= 25;
const isColour = (id: number): boolean => id >= 2 && id <= 7;
const value = (id: number): number => (isRed(id) ? 1 : id);
const clone = (b: Ball): Ball => ({ ...b });
const cloneAll = (bs: Ball[]): Ball[] => bs.map(clone);
const live = (bs: Ball[]): Ball[] => bs.filter((b) => !b.potted);

function initial(variant: CueVariant): CueStateX {
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
    fouls: [0, 0],
    miss: false,
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
  /** Machine code translated by the client (i18n key `cue.foul.<code>`), or a
   *  literal `+N` points string for snooker breaks, or "". Never prose. */
  reason: string;
  continueTurn: boolean;
  winner: Seat | null;
  points: number; // awarded this shot (snooker: to shooter, or to opponent if foul)
  pointsToOpponent: boolean;
}

// ── Per-variant rules ────────────────────────────────────────────────────────

function rulesEightBall(state: CueStateX, balls: Ball[], r: ShotRes): Outcome {
  const shooter = state.turn;
  const breakShot = state.shotNo === 0;
  const pottedObj = r.potted;
  const eightPotted = pottedObj.includes(8);
  const myGroupBalls = (g: Group) =>
    g === "solids" ? [1, 2, 3, 4, 5, 6, 7] : g === "stripes" ? [9, 10, 11, 12, 13, 14, 15] : [];
  const group: Group = state.groups[shooter] ?? null;
  const open = state.open;

  const onEight = !open && group !== null && myGroupBalls(group).every((id) => !live(balls).some((b) => b.id === id));
  const firstHitEight = r.firstContact === 8;
  const noRail = pottedObj.length === 0 && !r.cushionAfterContact && r.firstContact !== null;

  if (eightPotted && breakShot) {
    // The 8 on the break is NOT a loss: re-spot it on the foot spot and judge
    // the rest of the shot by the normal rules (a scratch stays a plain foul).
    respot(balls, 8, FOOT_SPOT);
  } else if (eightPotted) {
    const legalEight = onEight && firstHitEight && !r.cueScratch;
    return {
      foul: false,
      reason: legalEight ? "eightWin" : "eightLoss",
      continueTurn: false,
      winner: legalEight ? shooter : other(shooter),
      points: 0,
      pointsToOpponent: false,
    };
  }

  // Foul checks — judged against the PRE-shot groups: a foul never assigns
  // groups, and on an open table only the 8 is an illegal first contact.
  let foul = false;
  let reason = "";
  if (r.cueScratch) {
    foul = true;
    reason = "scratch";
  } else if (r.firstContact === null) {
    foul = true;
    reason = "noContact";
  } else if (!open && group && !myGroupBalls(group).includes(r.firstContact) && !(onEight && firstHitEight)) {
    foul = true;
    reason = "wrongBall";
  } else if (open && firstHitEight && !breakShot) {
    foul = true;
    reason = "eightFirstOpen";
  } else if (noRail) {
    foul = true;
    reason = "noRail";
  }

  // Groups lock on the first LEGAL pot while the table is open — a foul keeps
  // the table open (reduce mirrors this decision onto `state.groups`).
  let effGroup = group;
  let effOpen = open;
  if (open && !foul && pottedObj.some((p) => p !== 8)) {
    const first = pottedObj.find((p) => p !== 8)!;
    effGroup = first <= 7 ? "solids" : "stripes";
    effOpen = false;
  }

  const pottedMine =
    !foul && pottedObj.some((p) => (effOpen ? p !== 8 : myGroupBalls(effGroup).includes(p)));
  return {
    foul,
    reason: foul ? reason : eightPotted && breakShot ? "eightBreakRespot" : pottedMine ? "continues" : "",
    continueTurn: pottedMine,
    winner: null,
    points: 0,
    pointsToOpponent: false,
  };
}

function rulesNineBall(
  state: CueStateX,
  balls: Ball[],
  r: ShotRes,
  pushOut: boolean,
): Outcome & { pushed?: boolean } {
  const shooter = state.turn;
  const lowestBefore = Math.min(...[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((id) =>
    state.balls.some((b) => b.id === id && !b.potted),
  ));
  const ninePotted = r.potted.includes(9);
  const noRail = r.potted.length === 0 && !r.cushionAfterContact && r.firstContact !== null;

  if (pushOut) {
    // Push-out (the shot right after the break, declared by the shooter): no
    // lowest-ball or rail requirement — only a scratch fouls. The 9 comes back
    // if potted; other balls stay down. The opponent then plays or passes back.
    if (ninePotted) respot(balls, 9, SNOOKER_SPOTS[6]!);
    if (r.cueScratch) {
      return { foul: true, reason: "scratch", continueTurn: false, winner: null, points: 0, pointsToOpponent: false };
    }
    return {
      foul: false,
      reason: "pushOut",
      continueTurn: false,
      winner: null,
      points: 0,
      pointsToOpponent: false,
      pushed: true,
    };
  }

  let foul = false;
  let reason = "";
  if (r.cueScratch) {
    foul = true;
    reason = "scratch";
  } else if (r.firstContact === null) {
    foul = true;
    reason = "noContact";
  } else if (r.firstContact !== lowestBefore) {
    foul = true;
    reason = "lowestFirst";
  } else if (noRail) {
    foul = true;
    reason = "noRail";
  }

  if (ninePotted && !foul) {
    return { foul: false, reason: "nineWin", continueTurn: false, winner: shooter, points: 0, pointsToOpponent: false };
  }
  if (ninePotted && foul) respot(balls, 9, SNOOKER_SPOTS[6]!); // re-spot the 9 at the foot

  const pottedAny = !foul && r.potted.length > 0;
  return {
    foul,
    reason: foul ? reason : pottedAny ? "continues" : "",
    continueTurn: pottedAny,
    winner: null,
    points: 0,
    pointsToOpponent: false,
  };
}

type SnookerOutcome = Outcome & {
  nextExpect?: "red" | "colour";
  /** The striker just potted the last red legally → colour of choice next. */
  freeColourNext?: boolean;
  /** The foul left the incoming striker snookered → free ball next. */
  freeBallNext?: boolean;
  /** Force ball-in-hand for the incoming striker (re-spotted black). */
  cueInHand?: boolean;
  /** "Foul and a miss": the striker fouled without first hitting a ball "on". */
  miss?: boolean;
};

/** Balls "on" for the incoming striker after a foul: reds while any remain,
 *  else the lowest colour. */
function ballsOn(balls: Ball[]): Ball[] {
  const reds = live(balls).filter((b) => isRed(b.id));
  if (reds.length) return reds;
  const colours = live(balls).filter((b) => isColour(b.id));
  if (!colours.length) return [];
  const lo = Math.min(...colours.map((b) => b.id));
  return colours.filter((b) => b.id === lo);
}

/** Straight-line visibility: can the cue reach the centre or either edge of
 *  `t` without another ball blocking the corridor? (coarse, cushions ignored) */
function canSee(balls: Ball[], cue: Ball, t: Ball): boolean {
  const dx = t.x - cue.x;
  const dy = t.y - cue.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  const px = -dy / d;
  const py = dx / d;
  for (const off of [0, 1.8 * R, -1.8 * R]) {
    if (pathClear(balls, cue.x, cue.y, t.x + px * off, t.y + py * off, [t.id])) return true;
  }
  return false;
}

/** After a foul: is the incoming striker snookered on every ball "on"? */
function snookeredAfterFoul(balls: Ball[]): boolean {
  const cue = balls.find((b) => b.id === 0 && !b.potted);
  if (!cue) return false;
  const on = ballsOn(balls);
  if (!on.length) return false;
  return !on.some((t) => canSee(balls, cue, t));
}

function rulesSnooker(state: CueStateX, balls: Ball[], r: ShotRes): SnookerOutcome {
  const shooter = state.turn;
  const redsLeft = state.balls.some((b) => isRed(b.id) && !b.potted);
  const expect = state.expect ?? "red";
  // "Colour of choice" right after the striker potted the last red.
  const freeColour = state.freeColour === true && !redsLeft && expect === "colour";
  // Free ball: a foul left this striker snookered — any first contact is "on".
  const freeBall = state.freeBall === true;
  const pottedReds = r.potted.filter(isRed);
  const pottedColours = r.potted.filter(isColour);
  const fc = r.firstContact;

  const coloursLeft = [2, 3, 4, 5, 6, 7].filter((id) => state.balls.some((b) => b.id === id && !b.potted));
  const lowestColour = coloursLeft.length ? Math.min(...coloursLeft) : 7;
  // Value of the ball "on" — every foul costs at least max(4, ballOn).
  const ballOn = expect === "red" ? 1 : !redsLeft && !freeColour ? lowestColour : 4;

  let foul = false;
  let reason = "";
  let foulValue = 4;
  const setFoul = (why: string, v: number) => {
    if (!foul) reason = why;
    foul = true;
    foulValue = Math.max(foulValue, v, ballOn);
  };

  if (r.cueScratch) setFoul("scratch", 4);
  if (fc === null) setFoul("noContact", 4);

  if (freeBall) {
    // Any first contact counts as the ball "on"; only scratch/no-contact foul.
  } else if (freeColour || (redsLeft && expect === "colour")) {
    // A colour of choice: any colour may be struck / potted (one at a time).
    if (fc !== null && !isColour(fc)) setFoul("needColour", 4);
    if (pottedReds.length) setFoul("redPotted", 4);
    if (pottedColours.length > 1) setFoul("multiColour", Math.max(...pottedColours.map(value)));
  } else if (!redsLeft && expect === "colour") {
    // End-game: no reds — colours in ascending order.
    if (fc !== null && fc !== lowestColour) setFoul("wrongBall", Math.max(4, value(fc)));
    if (pottedReds.length) setFoul("wrongPot", 4);
    if (pottedColours.some((c) => c !== lowestColour)) setFoul("wrongPot", Math.max(...pottedColours.map(value), 4));
  } else {
    // On a red.
    if (fc !== null && !isRed(fc)) setFoul("needRed", Math.max(4, value(fc)));
    if (pottedColours.length) setFoul("colourPotted", Math.max(...pottedColours.map(value), 4));
  }

  if (foul) {
    // "Foul and a miss": did the striker first contact a ball that was "on"?
    // (Mirrors the ball-on branches above.) If not, a referee calls a miss and
    // the opponent may ask for a replay. NOTE: a *full* replay-from-position is
    // out of scope here — it needs a new incoming-player choice action plus a
    // stored pre-shot layout, which reaches into the shared action/wire type,
    // the realtime host and the view (all outside this engine's ownership). We
    // therefore only DETECT the miss and surface it via `state.miss` (+ the
    // FOUL event); the standard "play again from the same position" option is
    // left for the host/UI to offer on top of this flag.
    let hitBallOn: boolean;
    if (freeBall) hitBallOn = fc !== null;
    else if (freeColour || (redsLeft && expect === "colour")) hitBallOn = fc !== null && isColour(fc);
    else if (!redsLeft && expect === "colour") hitBallOn = fc === lowestColour;
    else hitBallOn = fc !== null && isRed(fc);
    const miss = !hitBallOn;

    // Every colour potted on a foul stroke returns to its spot (reds stay
    // down, unscored) — the frame must keep its full ball set.
    for (const c of pottedColours) respot(balls, c, SNOOKER_SPOTS[c]!);
    let freeBallNext = false;
    if (r.cueScratch) {
      // Ball-in-hand: default D spot; the striker may re-place within the D.
      placeCue(balls, D_SPOT);
    } else {
      // Snookered on all balls "on" after the foul → the incoming striker
      // gets a free ball.
      freeBallNext = snookeredAfterFoul(balls);
    }
    return {
      foul: true,
      reason,
      continueTurn: false,
      winner: null,
      points: foulValue,
      pointsToOpponent: true,
      freeBallNext,
      miss,
    };
  }

  // Legal shot — score pots + advance the expectation, re-spotting colours
  // while reds remain.
  let pts = 0;
  let nextExpect: "red" | "colour" = expect;
  let pottedSomething = false;

  if (freeBall && expect === "red") {
    // Free ball while on reds: every pot counts as a red; colours come back up.
    pts += pottedReds.length + pottedColours.length;
    for (const c of pottedColours) respot(balls, c, SNOOKER_SPOTS[c]!);
    if (r.potted.length > 0) {
      pottedSomething = true;
      nextExpect = "colour";
    }
  } else if (freeBall && !redsLeft && !freeColour && expect === "colour") {
    // Free ball in the end-game: any colour pots for the ball-on's value; the
    // ball on itself stays down, other colours are re-spotted.
    for (const c of pottedColours) {
      pts += value(lowestColour);
      if (c !== lowestColour) respot(balls, c, SNOOKER_SPOTS[c]!);
    }
    if (pottedColours.length) pottedSomething = true;
  } else if (freeColour) {
    // Colour of choice after the last red: scores its own value and returns.
    if (pottedColours.length === 1) {
      const c = pottedColours[0]!;
      pts += value(c);
      pottedSomething = true;
      respot(balls, c, SNOOKER_SPOTS[c]!);
    }
    nextExpect = "colour";
  } else if (redsLeft && expect === "red") {
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

  // The striker who legally pots the LAST red is on a colour of choice next.
  const redsNow = balls.some((b) => isRed(b.id) && !b.potted);
  const freeColourNext = pottedSomething && redsLeft && !redsNow && expect === "red";

  // Win when the table is cleared.
  const cleared = !balls.some((b) => b.id !== 0 && !b.potted);
  if (cleared) {
    const s0 = state.scores[0] + (shooter === 0 ? pts : 0);
    const s1 = state.scores[1] + (shooter === 1 ? pts : 0);
    if (s0 === s1) {
      // A frame can't end level: re-spot the black, ball-in-hand from the D,
      // and play on until someone pots it (or fouls).
      respot(balls, 7, SNOOKER_SPOTS[7]!);
      placeCue(balls, D_SPOT);
      return {
        foul: false,
        reason: "respotBlack",
        continueTurn: false,
        winner: null,
        points: pts,
        pointsToOpponent: false,
        nextExpect: "colour",
        cueInHand: true,
      };
    }
    const winner: Seat = s0 > s1 ? 0 : 1;
    return { foul: false, reason: "cleared", continueTurn: false, winner, points: pts, pointsToOpponent: false, nextExpect };
  }

  return {
    foul: false,
    reason: pottedSomething ? `+${pts}` : "",
    continueTurn: pottedSomething,
    winner: null,
    points: pts,
    pointsToOpponent: false,
    nextExpect,
    freeColourNext,
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
function legalTargets(state: CueStateX): Ball[] {
  const objs = live(state.balls).filter((b) => b.id !== 0);
  if (objs.length === 0) return [];
  if (state.variant === "NINEBALL") {
    const lo = Math.min(...objs.map((b) => b.id));
    return objs.filter((b) => b.id === lo);
  }
  if (state.variant === "SNOOKER") {
    if (state.freeBall) return objs; // free ball: everything is "on"
    const reds = objs.filter((b) => isRed(b.id));
    if (state.expect === "red") return reds.length ? reds : objs;
    const colours = objs.filter((b) => isColour(b.id));
    if (reds.length || state.freeColour) return colours; // any colour
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
function candidateShots(state: CueStateX): CueAction[] {
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

export function makeCueEngine(variant: CueVariant): GameEngine<CueStateX, CueActionX, CueEvent> {
  return {
    init: () => initial(variant),

    legalActions(state, seat) {
      if (state.phase === "DONE" || seat !== state.turn) return [];
      return candidateShots(state);
    },

    validate(state, seat, action) {
      if (state.phase === "DONE" || seat !== state.turn) return false;
      if (!action) return false;
      // 9-ball: PASS hands a push-out back to the player who pushed.
      if (action.type === "PASS") return variant === "NINEBALL" && state.pushDecision === true;
      if (action.type !== "SHOOT") return false;
      if (!Number.isFinite(action.angle)) return false;
      if (!(action.power > 0) || action.power > 1) return false;
      // A push-out may only be declared on the shot right after the break.
      if (action.pushOut === true && !(variant === "NINEBALL" && state.pushAvail === true)) return false;
      if (action.cueX !== undefined || action.cueY !== undefined) {
        if (!state.ballInHand) return false;
        if (!Number.isFinite(action.cueX) || !Number.isFinite(action.cueY)) return false;
        const x = action.cueX!;
        const y = action.cueY!;
        if (!placementOk(state.balls, x, y, 0)) return false;
        // Snooker: in-hand only from the "D"; pool: break from behind the line.
        if (variant === "SNOOKER" && !inBaulkD(x, y)) return false;
        if (variant !== "SNOOKER" && state.shotNo === 0 && x > HEAD_STRING_X) return false;
      }
      return true;
    },

    reduce(state, action) {
      // 9-ball PASS: the opponent declines to play after a push-out — the shot
      // goes back to the pusher. No physics, no new shot to animate.
      if (action.type === "PASS") {
        const next: CueStateX = { ...state, turn: other(state.turn), pushDecision: false, message: "", lastShotMs: 0 };
        return { state: next, events: [] };
      }

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
      const pushOut = variant === "NINEBALL" && state.pushAvail === true && action.pushOut === true;
      const out =
        variant === "EIGHTBALL" ? rulesEightBall(state, balls, r)
        : variant === "NINEBALL" ? rulesNineBall(state, balls, r, pushOut)
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

      const next: CueStateX = {
        ...state,
        balls,
        shotNo: state.shotNo + 1,
        lastShot: { angle: action.angle, power: action.power, before },
        // Real-time animation length (frames play back at 60 fps) — the
        // realtime host paces bots / the turn clock with it.
        lastShotMs: Math.round((r.frames.length * 1000) / 60),
        message: out.reason,
      };

      // 8-ball group assignment side-effect (legal shots only — a foul keeps
      // the table open).
      if (variant === "EIGHTBALL" && state.open && !r.cueScratch && !out.foul) {
        const firstObj = r.potted.find((p) => p !== 8);
        if (firstObj !== undefined) {
          const g: Group = firstObj <= 7 ? "solids" : "stripes";
          next.groups = shooter === 0 ? [g, g === "solids" ? "stripes" : "solids"] : [g === "solids" ? "stripes" : "solids", g];
          next.open = false;
        }
      }

      // 9-ball push-out bookkeeping.
      if (variant === "NINEBALL") {
        next.pushAvail = state.shotNo === 0 && out.winner === null;
        next.pushDecision = (out as { pushed?: boolean }).pushed === true && out.winner === null;
      }

      // 9-ball three-consecutive-foul rule (WPA 5.2): a player who fouls on
      // three successive strokes — with no legal shot in between — loses the
      // rack. Any legal (non-foul) stroke resets that seat's counter; a count
      // of 2 is the warning the opponent is owed before the deciding foul.
      let threeFoulWin: Seat | null = null;
      if (variant === "NINEBALL") {
        const fouls: [number, number] = [state.fouls?.[0] ?? 0, state.fouls?.[1] ?? 0];
        const s = shooter as 0 | 1;
        if (out.foul) {
          fouls[s] += 1;
          if (fouls[s] >= 3) threeFoulWin = other(shooter);
        } else {
          fouls[s] = 0;
        }
        next.fouls = fouls;
      }

      // Snooker scoring + expectation.
      if (variant === "SNOOKER") {
        const so = out as SnookerOutcome;
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
        next.freeColour = so.freeColourNext === true;
        next.freeBall = so.freeBallNext === true;
        next.miss = so.miss === true; // "foul and a miss" flag for the referee/host
      } else if (out.foul) {
        events.push({ type: "FOUL", seat: shooter, reason: out.reason });
      }

      // Turn / ball-in-hand / winner. A 9-ball three-foul loss overrides the
      // normal turn handoff (the opponent wins the rack outright).
      const winner = out.winner ?? threeFoulWin;
      if (winner !== null) {
        next.winner = winner;
        next.phase = "DONE";
        if (out.winner === null && threeFoulWin !== null) next.message = "threeFoul";
        events.push({ type: "WIN", seat: winner });
      } else if (out.continueTurn) {
        next.turn = shooter;
        next.ballInHand = false;
      } else {
        next.turn = other(shooter);
        next.ballInHand =
          variant !== "SNOOKER" ? out.foul : r.cueScratch || (out as SnookerOutcome).cueInHand === true;
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
