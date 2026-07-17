import type { GameEngine, GameEvent, Seat } from "../kernel/contract.js";
import { SeededRng } from "../kernel/rng.js";

/**
 * Difficulty-aware bot action selection, generic over any engine (§9.3).
 *
 *   EASY   → uniform-random legal action.
 *   NORMAL → the engine's own heuristic `bot()` if present, else random (this
 *            is exactly the historical bot behaviour).
 *   HARD   → flat Monte-Carlo: score each candidate by random playouts to a
 *            terminal state and pick the best expected result, with an instant
 *            take-the-win / avoid random when a move wins outright. Bounded by a
 *            simulation budget so a bot move stays fast, and skipped for engines
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
  rng: SeededRng,
  budget: { left: number },
): number {
  let cur = state;
  for (let step = 0; step < PLAYOUT_STEPS && budget.left > 0; step++) {
    if (engine.isTerminal(cur)) break;
    // Find a seat that can move (turn order is engine-internal; scan seats).
    let moved = false;
    const seatCount = engine.score(cur).length || seat + 1;
    for (let s = 0; s <= seatCount; s++) {
      const acts = engine.legalActions(cur, s);
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

  const budget = { left: SIM_BUDGET };
  let best: A | null = null;
  let bestScore = -1;
  for (const a of candidates) {
    let total = 0;
    let n = 0;
    for (let p = 0; p < PLAYOUTS && budget.left > 0; p++) {
      let next: S;
      try {
        next = engine.reduce(state, a, rng).state;
      } catch {
        break;
      }
      budget.left--;
      total += rollout(engine, next, seat, rng, budget);
      n++;
    }
    const avg = n > 0 ? total / n : 0;
    if (avg > bestScore) {
      bestScore = avg;
      best = a;
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
      return randomAction(engine, state, seat, rng);
    case "HARD":
      return chooseHard(engine, state, seat, rng);
    case "NORMAL":
    default:
      return engine.bot?.(state, seat, rng) ?? randomAction(engine, state, seat, rng);
  }
}
