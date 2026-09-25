import type { GameEngine, GameEvent, Seat } from "../kernel/contract.js";
import { SeededRng } from "../kernel/rng.js";

/**
 * Difficulty-aware bot action selection, generic over any engine (§9.3).
 *
 *   EASY   → the engine's heuristic with deliberate blunders: 35 % of moves are
 *            a random legal action. (Pure random was degenerate: in Думи the
 *            only enumerable move is PASS, so the bot lost every life; in Реми
 *            it almost never knocked, so matches ran ~14 600 moves.)
 *   NORMAL → the engine's own heuristic `bot()` if present, else random (this
 *            is exactly the historical bot behaviour).
 *   HARD   → flat Monte-Carlo: score each candidate by random playouts to a
 *            terminal state and pick the best expected result, with an instant
 *            take-the-win / avoid random when a move wins outright. Bounded by a
 *            simulation budget AND a wall-clock budget (the transition count
 *            alone let a chess decision block the event loop ~17 s), and skipped for engines
 *            with a continuous action space (`validate` present, e.g. cue
 *            sports) where playouts are too costly — those fall back to NORMAL.
 */
export type BotDifficulty = "EASY" | "NORMAL" | "HARD";

// Cost guards — worst case ≈ MAX_BRANCH × PLAYOUTS × PLAYOUT_STEPS reduces, but
// the shared SIM_BUDGET hard-caps total simulated transitions per decision.
const MAX_BRANCH = 10;
const PLAYOUTS = 24;
const PLAYOUT_STEPS = 400;
const SIM_BUDGET = 24_000;
/** Wall-clock cap per HARD decision (ms) — the realtime host is single-threaded. */
const HARD_MS = 120;
/** Share of EASY moves that are a random legal action instead of the heuristic. */
const EASY_BLUNDER = 0.35;

const now = (): number => globalThis.performance?.now() ?? Date.now();
interface Budget {
  left: number;
  until: number;
}
const spent = (b: Budget): boolean => b.left <= 0 || now() >= b.until;

function randomAction<S, A, E extends GameEvent>(
  engine: GameEngine<S, A, E>,
  state: S,
  seat: Seat,
  rng: SeededRng,
): A | null {
  const actions = engine.legalActions(state, seat);
  if (actions.length === 0) return null;
  return actions[rng.int(actions.length)] ?? null;
}

/** Utility of a terminal (or step-capped) state for `seat`: win 1, draw 0.5, loss 0. */
function terminalUtility<S, A, E extends GameEvent>(
  engine: GameEngine<S, A, E>,
  state: S,
  seat: Seat,
): number {
  if (!engine.isTerminal(state)) return 0.5; // undecided cutoff → neutral
  const mine = engine.score(state).find((s) => s.seat === seat);
  if (!mine) return 0.5;
  return mine.result === "win" ? 1 : mine.result === "loss" ? 0 : 0.5;
}

/** One random playout from `state` to terminal (or a step cap), returning utility for `seat`. */
function rollout<S, A, E extends GameEvent>(
  engine: GameEngine<S, A, E>,
  state: S,
  seat: Seat,
  seats: number,
  rng: SeededRng,
  budget: Budget,
): number {
  let cur = state;
  for (let step = 0; step < PLAYOUT_STEPS && budget.left > 0; step++) {
    if ((step & 31) === 0 && now() >= budget.until) break;
    if (engine.isTerminal(cur)) break;
    // Find a seat that can move (turn order is engine-internal; scan seats 0..seats-1).
    let moved = false;
    for (let s = 0; s < seats; s++) {
      let acts: A[];
      try {
        acts = engine.legalActions(cur, s);
      } catch {
        return 0.5; // an engine that cannot answer for this seat — bail neutral
      }
      if (acts.length === 0) continue;
      const a = acts[rng.int(acts.length)]!;
      try {
        cur = engine.reduce(cur, a, rng).state;
      } catch {
        return 0.5; // malformed transition — bail neutral
      }
      budget.left--;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return terminalUtility(engine, cur, seat);
}

function chooseHard<S, A, E extends GameEvent>(
  engine: GameEngine<S, A, E>,
  state: S,
  seat: Seat,
  rng: SeededRng,
): A | null {
  // Continuous action spaces (cue physics) → playouts too costly; defer.
  if (engine.validate) return engine.bot?.(state, seat, rng) ?? randomAction(engine, state, seat, rng);

  let candidates = engine.legalActions(state, seat);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  // Take an immediate winning move if one exists (cheap 1-ply check).
  for (const a of candidates) {
    try {
      const next = engine.reduce(state, a, rng).state;
      if (engine.isTerminal(next) && terminalUtility(engine, next, seat) === 1) return a;
    } catch {
      /* skip illegal-in-simulation */
    }
  }

  // Cap the branch factor by sampling to keep the search bounded.
  if (candidates.length > MAX_BRANCH) candidates = rng.shuffle(candidates).slice(0, MAX_BRANCH);

  // Round-robin: every candidate gets one playout per round, so a budget that
  // runs out mid-search leaves all candidates equally sampled (no bias toward
  // the ones evaluated first).
  const budget: Budget = { left: SIM_BUDGET, until: now() + HARD_MS };
  const seats = Math.max(engine.score(state).length, seat + 1);
  const total = new Array<number>(candidates.length).fill(0);
  const count = new Array<number>(candidates.length).fill(0);
  for (let p = 0; p < PLAYOUTS && !spent(budget); p++) {
    for (let i = 0; i < candidates.length && !spent(budget); i++) {
      let next: S;
      try {
        next = engine.reduce(state, candidates[i]!, rng).state;
      } catch {
        continue;
      }
      budget.left--;
      total[i] = (total[i] ?? 0) + rollout(engine, next, seat, seats, rng, budget);
      count[i] = (count[i] ?? 0) + 1;
    }
  }
  let best: A | null = null;
  let bestScore = -1;
  for (let i = 0; i < candidates.length; i++) {
    const n = count[i] ?? 0;
    if (n === 0) continue;
    const avg = (total[i] ?? 0) / n;
    if (avg > bestScore) {
      bestScore = avg;
      best = candidates[i]!;
    }
  }
  return best ?? engine.bot?.(state, seat, rng) ?? randomAction(engine, state, seat, rng);
}

/** Pick an action for `seat` at the given difficulty. Returns null if no move. */
export function chooseBotAction<S, A, E extends GameEvent>(
  engine: GameEngine<S, A, E>,
  state: S,
  seat: Seat,
  difficulty: BotDifficulty,
  rng: SeededRng,
): A | null {
  switch (difficulty) {
    case "EASY":
      return rng.next() < EASY_BLUNDER
        ? randomAction(engine, state, seat, rng)
        : (engine.bot?.(state, seat, rng) ?? randomAction(engine, state, seat, rng));
    case "HARD":
      return chooseHard(engine, state, seat, rng);
    case "NORMAL":
    default:
      return engine.bot?.(state, seat, rng) ?? randomAction(engine, state, seat, rng);
  }
}
