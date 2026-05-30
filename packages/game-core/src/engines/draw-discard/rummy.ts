import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, hiddenLike, RANK_VALUE, RANKS_52, rankOf, suitOf, type Card } from "../cards.js";

/**
 * Реми (Gin Rummy) — 2p melding (§4.11). Each player holds 10 cards. A turn is
 * DRAW (from stock or the discard top) then DISCARD one card. You may KNOCK
 * when your deadwood (unmelded card points) is ≤ 10, or GIN at 0. Melds are
 * runs (3+ same-suit sequence) and sets (3+ same rank). On knock the lower
 * deadwood wins the difference; ties/illegal-knocks resolve to the knocker
 * losing. Opponent hand + stock are redacted.
 *
 * Simplification (harden in S9): no lay-off onto opponent melds; scoring is
 * win/loss by deadwood comparison, not running 100-point match.
 */

export interface RummyState {
  hands: Card[][];
  stock: Card[];
  discard: Card[]; // top = last element
  turn: Seat;
  phase: "DRAW" | "DISCARD";
  winner: Seat | null;
  done: boolean;
  deadwood: [number, number] | null; // filled at finish
}

export type RummyAction =
  | { type: "DRAW"; from: "stock" | "discard" }
  | { type: "DISCARD"; card: Card }
  | { type: "KNOCK"; card: Card };

export type RummyEvent =
  | { type: "DRAW"; seat: Seat; from: "stock" | "discard" }
  | { type: "DISCARD"; seat: Seat; card: Card }
  | { type: "KNOCK"; seat: Seat; deadwood: number }
  | { type: "WIN"; seat: Seat };

const HAND = 10;
const deadwoodValue = (r: string): number => Math.min(RANK_VALUE[r] ?? 0, 10);

export const rummyEngine: GameEngine<RummyState, RummyAction, RummyEvent> = {
  init(_opts: InitOpts, rng: SeededRng): RummyState {
    const deck = rng.shuffle(buildDeck(RANKS_52));
    const hands = [deck.splice(0, HAND), deck.splice(0, HAND)];
    const discard = [deck.shift()!];
    return {
      hands,
      stock: deck,
      discard,
      turn: 0,
      phase: "DRAW",
      winner: null,
      done: false,
      deadwood: null,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    if (state.phase === "DRAW") {
      const actions: RummyAction[] = [];
      if (state.stock.length > 0) actions.push({ type: "DRAW", from: "stock" });
      if (state.discard.length > 0) actions.push({ type: "DRAW", from: "discard" });
      return actions;
    }
    // DISCARD phase: discard any card; knock with any card if resulting deadwood ≤10.
    const hand = state.hands[seat]!;
    const actions: RummyAction[] = [];
    for (const card of hand) {
      actions.push({ type: "DISCARD", card });
      const remaining = hand.filter((c) => c !== card);
      if (bestDeadwood(remaining) <= 10) actions.push({ type: "KNOCK", card });
    }
    return actions;
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: RummyState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      stock: state.stock.slice(),
      discard: state.discard.slice(),
    };
    const events: RummyEvent[] = [];

    if (action.type === "DRAW") {
      if (next.phase !== "DRAW") throw new IllegalActionError("Not draw phase");
      let card: Card | undefined;
      if (action.from === "stock") card = next.stock.shift();
      else card = next.discard.pop();
      if (!card) throw new IllegalActionError("Empty pile");
      next.hands[seat]!.push(card);
      next.phase = "DISCARD";
      events.push({ type: "DRAW", seat, from: action.from });
      // Stock exhausted with no knock -> lowest deadwood wins.
      if (next.stock.length === 0 && action.from === "stock") {
        /* allow the discard to proceed */
      }
      return { state: next, events };
    }

    const isKnock = action.type === "KNOCK";
    const card = action.card;
    if (next.phase !== "DISCARD") throw new IllegalActionError("Not discard phase");
    if (!next.hands[seat]!.includes(card)) throw new IllegalActionError("Card not in hand");

    next.hands[seat] = next.hands[seat]!.filter((c) => c !== card);
    next.discard.push(card);
    events.push({ type: "DISCARD", seat, card });

    if (isKnock) {
      const myDead = bestDeadwood(next.hands[seat]!);
      if (myDead > 10) throw new IllegalActionError("Deadwood too high to knock");
      const opp: Seat = seat === 0 ? 1 : 0;
      const oppDead = bestDeadwood(next.hands[opp]!);
      events.push({ type: "KNOCK", seat, deadwood: myDead });
      const winner: Seat = myDead <= oppDead ? seat : opp;
      next.deadwood = seat === 0 ? [myDead, oppDead] : [oppDead, myDead];
      events.push({ type: "WIN", seat: winner });
      return { state: { ...next, winner, done: true }, events };
    }

    // No knock; if stock is empty, end by deadwood comparison.
    if (next.stock.length === 0) {
      const d0 = bestDeadwood(next.hands[0]!);
      const d1 = bestDeadwood(next.hands[1]!);
      const winner: Seat = d0 <= d1 ? 0 : 1;
      next.deadwood = [d0, d1];
      events.push({ type: "WIN", seat: winner });
      return { state: { ...next, winner, done: true }, events };
    }

    next.turn = seat === 0 ? 1 : 0;
    next.phase = "DRAW";
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winner = state.winner ?? 0;
    const loser: Seat = winner === 0 ? 1 : 0;
    const margin = state.deadwood ? Math.abs(state.deadwood[0] - state.deadwood[1]) : 0;
    return [
      { seat: winner, result: "win", points: Math.max(1, margin) },
      { seat: loser, result: "loss", points: 0 },
    ];
  },

  redact(state, seat) {
    const opp: Seat = seat === 0 ? 1 : 0;
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    void opp;
    return { ...state, hands, stock: hiddenLike(state.stock) };
  },
};

/**
 * Minimum deadwood for a hand: greedily extract the best non-overlapping melds
 * (sets and runs of length ≥3), summing the points of leftover cards. This is a
 * heuristic (not guaranteed optimal) but sufficient and deterministic for play.
 */
export function bestDeadwood(hand: Card[]): number {
  const used = new Set<Card>();

  // Sets: 3+ of a rank.
  const byRank = new Map<string, Card[]>();
  for (const c of hand) {
    const arr = byRank.get(rankOf(c)) ?? [];
    arr.push(c);
    byRank.set(rankOf(c), arr);
  }
  for (const cards of byRank.values()) {
    if (cards.length >= 3) for (const c of cards) used.add(c);
  }

  // Runs: same suit, consecutive ranks, length ≥3.
  const bySuit = new Map<string, Card[]>();
  for (const c of hand) {
    if (used.has(c)) continue;
    const arr = bySuit.get(suitOf(c)) ?? [];
    arr.push(c);
    bySuit.set(suitOf(c), arr);
  }
  for (const cards of bySuit.values()) {
    const sorted = cards
      .slice()
      .sort((a, b) => (RANK_VALUE[rankOf(a)] ?? 0) - (RANK_VALUE[rankOf(b)] ?? 0));
    let run: Card[] = [];
    let prev = -99;
    for (const c of sorted) {
      const v = RANK_VALUE[rankOf(c)] ?? 0;
      if (v === prev + 1) {
        run.push(c);
      } else {
        if (run.length >= 3) for (const x of run) used.add(x);
        run = [c];
      }
      prev = v;
    }
    if (run.length >= 3) for (const x of run) used.add(x);
  }

  let dead = 0;
  for (const c of hand) if (!used.has(c)) dead += deadwoodValue(rankOf(c));
  return dead;
}
