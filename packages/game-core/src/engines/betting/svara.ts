import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, RANK_VALUE, rankOf, suitOf, hiddenLike, type Card } from "../cards.js";

/**
 * Свара — 2–6p bluff/betting with VIRTUAL chips only (§4.3, §11.4). Each player
 * antes, gets 3 cards; betting proceeds CALL/RAISE/FOLD around the table until
 * bets are matched, then a showdown ranks 3-card hands. Highest hand takes the
 * pot. STRICTLY social gaming with virtual chips — never real-money gambling,
 * never cashed out.
 *
 * 3-card hand ranking (descending): three-of-a-kind > straight-flush > flush >
 * straight > pair > high card, broken by the summed card "points" (A=11, T=10,
 * face=10) which is the traditional Свара count.
 */

const ANTE = 10;
const RAISE_STEP = 10;
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;

export interface SvaraState {
  hands: Card[][];
  chips: number[]; // virtual chips per seat
  bet: number[]; // current contribution to the pot this round
  folded: boolean[];
  /** Whether each seat has acted at least once this betting round. */
  acted: boolean[];
  pot: number;
  current: number; // highest bet to match
  turn: Seat;
  seats: number;
  /** Номер на ръката; мачът свършва при 1 платежоспособен или MAX_HANDS_SVARA. */
  handNo: number;
  winner: Seat | null;
  done: boolean;
}

export type SvaraAction =
  | { type: "CALL" }
  | { type: "RAISE" }
  | { type: "FOLD" };

export type SvaraEvent =
  | { type: "CALL"; seat: Seat; amount: number }
  | { type: "RAISE"; seat: Seat; to: number }
  | { type: "FOLD"; seat: Seat }
  | { type: "SHOWDOWN"; seat: Seat; pot: number }
  | { type: "WIN"; seat: Seat; pot: number }
  | { type: "HAND"; handNo: number }
  | { type: "MATCH"; seat: Seat };

export const SVARA_VIRTUAL_CHIPS_NOTICE =
  "Социална игра с виртуални чипове — не е хазарт за реални пари.";

const STARTING_CHIPS = 500;
/** Свара: ръце до 1 платежоспособен играч, но не повече от MAX_HANDS_SVARA. */
export const MAX_HANDS_SVARA = 20;

export const svaraEngine: GameEngine<SvaraState, SvaraAction, SvaraEvent> = {
  init(opts: InitOpts, rng: SeededRng): SvaraState {
    const seats = Math.min(Math.max(opts.seats, 2), 6);
    const deck = rng.shuffle(buildDeck(RANKS));
    const hands: Card[][] = [];
    const chips: number[] = [];
    const bet: number[] = [];
    for (let s = 0; s < seats; s++) {
      hands.push(deck.splice(0, 3));
      chips.push(STARTING_CHIPS - ANTE);
      bet.push(ANTE);
    }
    return {
      hands,
      chips,
      bet,
      folded: new Array<boolean>(seats).fill(false),
      acted: new Array<boolean>(seats).fill(false),
      pot: ANTE * seats,
      current: ANTE,
      turn: 0,
      seats,
      handNo: 1,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn || state.folded[seat]) return [];
    const actions: SvaraAction[] = [{ type: "FOLD" }];
    const toCall = state.current - (state.bet[seat] ?? 0);
    if ((state.chips[seat] ?? 0) >= toCall) actions.push({ type: "CALL" });
    if ((state.chips[seat] ?? 0) >= toCall + RAISE_STEP) actions.push({ type: "RAISE" });
    return actions;
  },

  reduce(state, action, rng) {
    const result = reduceHand(state, action);
    if (result.state.done) return nextHandOrEnd(result.state, result.events, rng);
    return result;
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winner = state.winner ?? 0;
    return state.hands.map((_, seat) => ({
      seat,
      result: seat === winner ? "win" : "loss",
      points: state.chips[seat] ?? 0,
    }));
  },

  redact(state, seat) {
    const hands = state.hands.map((h, i) => (i === seat || state.done ? h.slice() : hiddenLike(h)));
    return { ...state, hands };
  },
};

/** One betting action inside the current hand (original single-hand reducer). */
function reduceHand(
  state: SvaraState,
  action: SvaraAction,
): { state: SvaraState; events: SvaraEvent[] } {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    if (state.folded[seat]) throw new IllegalActionError("Folded player cannot act");
    const next: SvaraState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      chips: state.chips.slice(),
      bet: state.bet.slice(),
      folded: state.folded.slice(),
      acted: state.acted.slice(),
    };
    const events: SvaraEvent[] = [];
    const toCall = next.current - (next.bet[seat] ?? 0);
    next.acted[seat] = true; // this seat has now acted this round

    if (action.type === "FOLD") {
      next.folded[seat] = true;
      events.push({ type: "FOLD", seat });
    } else if (action.type === "CALL") {
      if ((next.chips[seat] ?? 0) < toCall) throw new IllegalActionError("Not enough chips");
      next.chips[seat]! -= toCall;
      next.bet[seat]! += toCall;
      next.pot += toCall;
      events.push({ type: "CALL", seat, amount: toCall });
    } else {
      const amount = toCall + RAISE_STEP;
      if ((next.chips[seat] ?? 0) < amount) throw new IllegalActionError("Not enough chips");
      next.chips[seat]! -= amount;
      next.bet[seat]! += amount;
      next.pot += amount;
      next.current = next.bet[seat]!;
      events.push({ type: "RAISE", seat, to: next.current });
    }

    // Last player standing wins immediately.
    const active = activeSeats(next);
    if (active.length === 1) {
      return award(next, active[0]!, events);
    }

    // Showdown only once bets are matched AND every active player has acted at
    // least once — otherwise the opening round (all seats start at the ANTE, so
    // bets are already "matched") would end after the very first CALL, before
    // anyone else gets to raise/fold.
    const advanced = nextActive(next, seat);
    next.turn = advanced;
    if (betsMatched(next) && activeSeats(next).every((s) => next.acted[s])) {
      return showdown(next, events);
    }
    return { state: next, events };
}

/** After a finished hand: end the match (1 платежоспособен / cap) or deal again. */
function nextHandOrEnd(
  state: SvaraState,
  events: SvaraEvent[],
  rng: SeededRng,
): { state: SvaraState; events: SvaraEvent[] } {
  const alive: Seat[] = [];
  for (let s = 0; s < state.seats; s++) if ((state.chips[s] ?? 0) >= ANTE) alive.push(s);

  if (alive.length <= 1 || state.handNo >= MAX_HANDS_SVARA) {
    let winner: Seat = alive[0] ?? 0;
    for (let s = 0; s < state.seats; s++) {
      if ((state.chips[s] ?? 0) > (state.chips[winner] ?? 0)) winner = s as Seat;
    }
    events.push({ type: "MATCH", seat: winner });
    return { state: { ...state, winner, done: true }, events };
  }

  // Нова ръка: анте от всички платежоспособни, новo раздаване.
  const next: SvaraState = {
    ...state,
    hands: state.hands.map(() => []),
    chips: state.chips.slice(),
    bet: new Array<number>(state.seats).fill(0),
    folded: state.folded.slice(),
    acted: new Array<boolean>(state.seats).fill(false),
    done: false,
    winner: null,
  };
  next.handNo += 1;
  const deck = rng.shuffle(buildDeck(RANKS));
  let pot = 0;
  for (let s = 0; s < next.seats; s++) {
    const playing = (next.chips[s] ?? 0) >= ANTE;
    next.folded[s] = !playing; // без чипове за анте → извън ръката
    if (playing) {
      next.hands[s] = deck.splice(0, 3);
      next.chips[s]! -= ANTE;
      next.bet[s] = ANTE;
      pot += ANTE;
    }
  }
  next.pot = pot;
  next.current = ANTE;
  next.turn = next.folded[0] ? nextActive(next, 0) : 0;
  events.push({ type: "HAND", handNo: next.handNo });
  return { state: next, events };
}

function activeSeats(state: SvaraState): Seat[] {
  const out: Seat[] = [];
  for (let s = 0; s < state.seats; s++) if (!state.folded[s]) out.push(s);
  return out;
}

function nextActive(state: SvaraState, from: Seat): Seat {
  for (let i = 1; i <= state.seats; i++) {
    const cand = (from + i) % state.seats;
    if (!state.folded[cand]) return cand;
  }
  return from;
}

/** All active players have matched the current bet. */
function betsMatched(state: SvaraState): boolean {
  return activeSeats(state).every((s) => state.bet[s] === state.current);
}

function handStrength(cards: Card[]): number {
  const ranks = cards.map(rankOf);
  const vals = ranks.map((r) => RANK_VALUE[r] ?? 0).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const points = cards.reduce((a, c) => a + Math.min(RANK_VALUE[rankOf(c)] ?? 0, 11) , 0);
  const isFlush = suits.every((s) => s === suits[0]);
  const sorted = [...vals].sort((a, b) => a - b);
  const isStraight = sorted.length === 3 && sorted[2]! - sorted[0]! === 2 && new Set(sorted).size === 3;
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());

  let category = 0; // high card
  if (maxCount === 3) category = 5;
  else if (isStraight && isFlush) category = 4;
  else if (isFlush) category = 3;
  else if (isStraight) category = 2;
  else if (maxCount === 2) category = 1;

  // Category dominates; ties broken by traditional points then high card.
  return category * 1000 + points * 10 + (vals[0] ?? 0);
}

function showdown(
  state: SvaraState,
  events: SvaraEvent[],
): { state: SvaraState; events: SvaraEvent[] } {
  let best: Seat = -1;
  let bestStrength = -1;
  for (const s of activeSeats(state)) {
    const strength = handStrength(state.hands[s]!);
    events.push({ type: "SHOWDOWN", seat: s, pot: state.pot });
    if (strength > bestStrength) {
      bestStrength = strength;
      best = s;
    }
  }
  return award(state, best, events);
}

function award(
  state: SvaraState,
  winner: Seat,
  events: SvaraEvent[],
): { state: SvaraState; events: SvaraEvent[] } {
  const next = { ...state, chips: state.chips.slice() };
  next.chips[winner] = (next.chips[winner] ?? 0) + next.pot;
  events.push({ type: "WIN", seat: winner, pot: next.pot });
  return { state: { ...next, winner, done: true }, events };
}
