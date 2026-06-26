import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, HIDDEN, hiddenLike, rankOf, type Card } from "./cards.js";

/**
 * Кент / Купе — 4 играчи в два отбора {0,2} срещу {1,3} (§4.6). Това НЕ е игра
 * с взятки, а игра на събиране и таен сигнал:
 *
 *  - Тесте от 4 ранга × 4 бои = 16 карти; всеки получава по 4.
 *  - На всеки кръг ВСИЧКИ играчи едновременно подават по една карта наляво
 *    (към seat+1). В turn-based модела ходът обикаля 0→1→2→3 и всеки избира
 *    тайно картата си (`PASS`); щом четиримата изберат, размяната се случва
 *    наведнъж и всеки получава картата от десния си съсед.
 *  - Цел: да събереш 4 еднакви карти („Кент").
 *  - Който събере Кент, тайно дава знак на партньора си (`SIGNAL` — вижда се
 *    само от партньора). Партньорът (или самият притежател) вика „Купе!"
 *    (`CALL_KUPE`). Ако отборът на викащия наистина има Кент → печели кръга;
 *    ако викне напразно → точката отива при противниците.
 *
 * Мач: всеки спечелен кръг е +1; играе се до KENT_TARGET точки. Между кръговете
 * се раздава наново. За да приключва винаги (вкл. при случайна игра) има таван
 * на размените на кръг и на общия брой кръгове.
 */

const RANKS = ["A", "K", "Q", "J"] as const; // 4 ранга → 16 карти
export const KENT_TARGET = 3;
const MAX_PASSES = 60;
const MAX_ROUNDS = 40;

export interface KentState {
  hands: Card[][];
  /** Card each seat has chosen to pass this round (null = not chosen yet). */
  pending: (Card | null)[];
  /** Whether a seat has flashed the secret signal this round. */
  signaled: boolean[];
  turn: Seat;
  leader: Seat;
  passes: number; // completed simultaneous passes this round
  round: number;
  matchScore: [number, number];
  /** Result of the last finished round (for the UI between rounds). */
  lastRound: { caller: Seat; correct: boolean; winningTeam: number } | null;
  winningTeam: number | null;
  done: boolean;
}

export type KentAction =
  | { type: "PASS"; card: Card }
  | { type: "SIGNAL"; seat: Seat }
  | { type: "CALL_KUPE"; seat: Seat };

export type KentEvent =
  | { type: "PASS"; seat: Seat }
  | { type: "SWAP"; round: number }
  | { type: "SIGNAL"; seat: Seat }
  | { type: "KUPE"; caller: Seat; correct: boolean; winningTeam: number }
  | { type: "ROUND"; winningTeam: number; matchScore: [number, number] }
  | { type: "REDEAL"; round: number }
  | { type: "RESULT"; team: number };

const next4 = (s: Seat): Seat => ((s + 1) % 4) as Seat;
const prev4 = (s: Seat): Seat => ((s + 3) % 4) as Seat;
const team = (s: Seat): number => s % 2;
const partner = (s: Seat): Seat => ((s + 2) % 4) as Seat;

/** A hand is a "Кент" when all four cards share one rank. */
function isKent(hand: Card[]): boolean {
  return hand.length === 4 && hand.every((c) => rankOf(c) === rankOf(hand[0]!));
}

function teamHasKent(state: KentState, t: number): boolean {
  return [0, 1, 2, 3].some((s) => team(s as Seat) === t && isKent(state.hands[s]!));
}

function deal(rng: SeededRng): Card[][] {
  const deck = rng.shuffle(buildDeck(RANKS));
  return [deck.slice(0, 4), deck.slice(4, 8), deck.slice(8, 12), deck.slice(12, 16)];
}

/** Reset per-round fields and deal a new hand (does not change match score). */
function freshRound(state: KentState, rng: SeededRng, round: number): void {
  state.hands = deal(rng);
  state.pending = [null, null, null, null];
  state.signaled = [false, false, false, false];
  state.turn = 0;
  state.leader = 0;
  state.passes = 0;
  state.round = round;
}

function settleRound(state: KentState, winningTeam: number, events: KentEvent[], rng: SeededRng): void {
  state.matchScore = [
    state.matchScore[0] + (winningTeam === 0 ? 1 : 0),
    state.matchScore[1] + (winningTeam === 1 ? 1 : 0),
  ];
  events.push({ type: "ROUND", winningTeam, matchScore: [...state.matchScore] });
  const [a, b] = state.matchScore;
  if (a >= KENT_TARGET || b >= KENT_TARGET || state.round >= MAX_ROUNDS) {
    state.winningTeam = a >= b ? 0 : 1;
    state.done = true;
    events.push({ type: "RESULT", team: state.winningTeam });
  } else {
    freshRound(state, rng, state.round + 1);
  }
}

export const kentEngine: GameEngine<KentState, KentAction, KentEvent> = {
  init(_opts: InitOpts, rng: SeededRng): KentState {
    const state: KentState = {
      hands: deal(rng),
      pending: [null, null, null, null],
      signaled: [false, false, false, false],
      turn: 0,
      leader: 0,
      passes: 0,
      round: 1,
      matchScore: [0, 0],
      lastRound: null,
      winningTeam: null,
      done: false,
    };
    return state;
  },

  legalActions(state, seat) {
    if (state.done) return [];
    const actions: KentAction[] = [];
    // Anyone may shout „Купе!" at any time.
    actions.push({ type: "CALL_KUPE", seat });
    // The holder of a Kent may flash the secret signal (once per round).
    if (isKent(state.hands[seat]!) && !state.signaled[seat]) actions.push({ type: "SIGNAL", seat });
    // The seat on turn passes one card (if they haven't chosen yet this round).
    if (seat === state.turn && state.pending[seat] === null) {
      for (const card of state.hands[seat]!) actions.push({ type: "PASS", card });
    }
    return actions;
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");

    const next: KentState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      pending: state.pending.slice(),
      signaled: state.signaled.slice(),
      matchScore: [state.matchScore[0], state.matchScore[1]],
    };
    const events: KentEvent[] = [];

    if (action.type === "CALL_KUPE") {
      const caller = action.seat;
      const correct = teamHasKent(next, team(caller));
      const winningTeam = correct ? team(caller) : 1 - team(caller);
      next.lastRound = { caller, correct, winningTeam };
      events.push({ type: "KUPE", caller, correct, winningTeam });
      settleRound(next, winningTeam, events, rng);
      return { state: next, events };
    }

    if (action.type === "SIGNAL") {
      const s = action.seat;
      if (!isKent(next.hands[s]!)) throw new IllegalActionError("No Kent to signal");
      next.signaled[s] = true;
      events.push({ type: "SIGNAL", seat: s });
      return { state: next, events };
    }

    // PASS
    if (action.type !== "PASS") throw new IllegalActionError("Unknown action");
    const seat = state.turn;
    if (next.pending[seat] !== null) throw new IllegalActionError("Already passed");
    if (!next.hands[seat]!.includes(action.card)) throw new IllegalActionError("Card not in hand");
    next.pending[seat] = action.card;
    events.push({ type: "PASS", seat });

    // Advance the turn to the next seat that still needs to choose.
    let t = next4(seat);
    while (next.pending[t] !== null && t !== seat) t = next4(t);
    next.turn = t;

    // All four chosen → simultaneous pass to the left.
    if (next.pending.every((c) => c !== null)) {
      const incoming = next.pending.slice();
      for (let s = 0; s < 4; s++) {
        const give = incoming[s]!;
        next.hands[s] = next.hands[s]!.filter((c) => c !== give);
      }
      for (let s = 0; s < 4; s++) {
        // seat s receives the card the RIGHT neighbour (s-1) passed left.
        next.hands[s]!.push(incoming[prev4(s as Seat)]!);
      }
      next.pending = [null, null, null, null];
      next.passes += 1;
      next.turn = next.leader;
      events.push({ type: "SWAP", round: next.round });

      if (next.passes >= MAX_PASSES) {
        // Deadlocked round — re-deal without awarding points (bounded play).
        events.push({ type: "REDEAL", round: next.round });
        if (next.round >= MAX_ROUNDS) {
          next.winningTeam = next.matchScore[0] >= next.matchScore[1] ? 0 : 1;
          next.done = true;
          events.push({ type: "RESULT", team: next.winningTeam });
        } else {
          freshRound(next, rng, next.round + 1);
        }
      }
    }

    return { state: next, events };
  },

  /** Bot: collect toward the most-held rank; signal/call when its team has Kent. */
  bot(state, seat, _rng) {
    if (state.done) return null;
    const myTeam = team(seat);
    // If my team already completed a Kent, call it (the partner usually calls).
    if (teamHasKent(state, myTeam)) return { type: "CALL_KUPE", seat };
    // If a Kent is in hand, signal once (faithful flavour; harmless if called next).
    if (isKent(state.hands[seat]!) && !state.signaled[seat]) return { type: "SIGNAL", seat };
    if (seat === state.turn && state.pending[seat] === null) {
      // Keep the rank we hold most of; pass away a singleton.
      const counts = new Map<string, number>();
      for (const c of state.hands[seat]!) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
      const worst = state.hands[seat]!.reduce((m, c) =>
        (counts.get(rankOf(c)) ?? 0) < (counts.get(rankOf(m)) ?? 0) ? c : m,
      );
      return { type: "PASS", card: worst };
    }
    return null; // not our turn and nothing to do
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winTeam = state.winningTeam ?? 0;
    return [0, 1, 2, 3].map((seat) => ({
      seat: seat as Seat,
      result: team(seat as Seat) === winTeam ? "win" : "loss",
      points: team(seat as Seat) === winTeam ? state.matchScore[winTeam] ?? 0 : 0,
    }));
  },

  redact(state, seat) {
    // Own hand visible; others hidden. Signals are secret EXCEPT the partner's.
    const p = partner(seat as Seat);
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    const signaled = state.signaled.map((v, i) => (i === seat || i === p ? v : false));
    const pending = state.pending.map((c, i) => (i === seat ? c : c === null ? null : HIDDEN));
    return { ...state, hands, signaled, pending };
  },
};
