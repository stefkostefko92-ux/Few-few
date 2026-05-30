import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, RANK_VALUE, RANKS_52, rankOf, type Card } from "../cards.js";

/**
 * Война (War) — 2p luck game (§4.4). Each FLIP both players reveal their top
 * card; higher rank takes both. On a tie ("war") each buries 1 card face-down
 * and flips again; the winner takes the whole pile. Fully determined by the
 * shuffle — the only action is FLIP, so it is bot/auto friendly.
 *
 * To guarantee termination we cap total flips; if reached, the player holding
 * more cards wins (standard practical rule for engine play).
 */

export interface WarState {
  hands: Card[][]; // remaining deck per seat (index 0 = top)
  pile: Card[]; // cards in contention this round
  table: [Card | null, Card | null]; // currently revealed card per seat
  turn: Seat; // always 0 — FLIP is symmetric, kept for contract shape
  flips: number;
  winner: Seat | null;
  done: boolean;
}

export type WarAction = { type: "FLIP" };
export type WarEvent =
  | { type: "FLIP"; cards: [Card, Card] }
  | { type: "TAKE"; seat: Seat; count: number }
  | { type: "WAR"; buried: number }
  | { type: "WIN"; seat: Seat };

const MAX_FLIPS = 5000;
const val = (c: Card): number => RANK_VALUE[rankOf(c)] ?? 0;

export const warEngine: GameEngine<WarState, WarAction, WarEvent> = {
  init(_opts: InitOpts, rng: SeededRng): WarState {
    const deck = rng.shuffle(buildDeck(RANKS_52));
    return {
      hands: [deck.slice(0, 26), deck.slice(26)],
      pile: [],
      table: [null, null],
      turn: 0,
      flips: 0,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== 0) return [];
    return [{ type: "FLIP" }];
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    if (action.type !== "FLIP") throw new IllegalActionError("Only FLIP");

    const hands: Card[][] = [state.hands[0]!.slice(), state.hands[1]!.slice()];
    const pile = state.pile.slice();
    const events: WarEvent[] = [];

    const a = hands[0]!.shift();
    const b = hands[1]!.shift();
    // If a player can't reveal, the other wins.
    if (!a || !b) {
      const winner: Seat = !a ? 1 : 0;
      return finish({ ...state, hands, pile, table: [null, null] }, winner, events);
    }
    pile.push(a, b);
    events.push({ type: "FLIP", cards: [a, b] });

    if (val(a) > val(b)) {
      hands[0]!.push(...pile);
      events.push({ type: "TAKE", seat: 0, count: pile.length });
      return settle(state, hands, [], events);
    }
    if (val(b) > val(a)) {
      hands[1]!.push(...pile);
      events.push({ type: "TAKE", seat: 1, count: pile.length });
      return settle(state, hands, [], events);
    }

    // War: each buries up to 1 card face-down (if available).
    const buryA = hands[0]!.shift();
    const buryB = hands[1]!.shift();
    if (buryA) pile.push(buryA);
    if (buryB) pile.push(buryB);
    events.push({ type: "WAR", buried: (buryA ? 1 : 0) + (buryB ? 1 : 0) });
    return settle(state, hands, pile, events);
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winner = state.winner ?? (state.hands[0]!.length >= state.hands[1]!.length ? 0 : 1);
    const loser: Seat = winner === 0 ? 1 : 0;
    return [
      { seat: winner, result: "win", points: 1 },
      { seat: loser, result: "loss", points: 0 },
    ];
  },

  // No hidden info beyond face-down piles, which are not revealed to anyone.
  redact: (s) => s,
};

function settle(
  prev: WarState,
  hands: Card[][],
  pile: Card[],
  events: WarEvent[],
): { state: WarState; events: WarEvent[] } {
  const flips = prev.flips + 1;
  const next: WarState = { ...prev, hands, pile, table: [null, null], flips };

  if (hands[0]!.length === 0 || hands[1]!.length === 0) {
    const winner: Seat = hands[0]!.length === 0 ? 1 : 0;
    return finish(next, winner, events);
  }
  if (flips >= MAX_FLIPS) {
    const winner: Seat = hands[0]!.length >= hands[1]!.length ? 0 : 1;
    return finish(next, winner, events);
  }
  return { state: next, events };
}

function finish(
  state: WarState,
  winner: Seat,
  events: WarEvent[],
): { state: WarState; events: WarEvent[] } {
  events.push({ type: "WIN", seat: winner });
  return { state: { ...state, winner, done: true }, events };
}
