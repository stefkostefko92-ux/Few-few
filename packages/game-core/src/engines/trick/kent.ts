import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, hiddenLike, rankOf, suitOf, type Card, type Suit } from "./cards.js";

/**
 * Кент Купе — 4p (2v2) trick-taking, no trump (§4.6). 32-card deck, 8 tricks.
 * Follow the led suit if able; the highest card of the led suit wins the trick.
 * Card points (A=11, T=10, K=4, Q=3, J=2) accrue to the winning team; last
 * trick is +10. Higher team total wins the deal. Teams {0,2} vs {1,3}.
 */

const RANKS = ["7", "8", "9", "T", "J", "Q", "K", "A"] as const;
const VALUE: Record<string, number> = { A: 11, T: 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 };
const STRENGTH: Record<string, number> = { A: 8, K: 7, Q: 6, J: 5, T: 4, "9": 3, "8": 2, "7": 1 };

interface Play {
  seat: Seat;
  card: Card;
}

export interface KentState {
  hands: Card[][];
  dealer: Seat;
  turn: Seat;
  leader: Seat;
  trick: Play[];
  teamPoints: [number, number];
  winningTeam: number | null;
  done: boolean;
}

export type KentAction = { type: "PLAY"; card: Card };
export type KentEvent =
  | { type: "PLAY"; seat: Seat; card: Card }
  | { type: "TRICK"; seat: Seat; points: number }
  | { type: "RESULT"; team: number };

const next4 = (s: Seat): Seat => ((s + 1) % 4) as Seat;
const team = (s: Seat): number => s % 2;

function beats(a: Card, b: Card, leadSuit: Suit): boolean {
  if (suitOf(a) !== suitOf(b)) return suitOf(a) === leadSuit && suitOf(b) !== leadSuit;
  return (STRENGTH[rankOf(a)] ?? 0) > (STRENGTH[rankOf(b)] ?? 0);
}

export const kentEngine: GameEngine<KentState, KentAction, KentEvent> = {
  init(_opts: InitOpts, rng: SeededRng): KentState {
    const deck = rng.shuffle(buildDeck(RANKS));
    const hands = [deck.slice(0, 8), deck.slice(8, 16), deck.slice(16, 24), deck.slice(24, 32)];
    const dealer: Seat = 0;
    return {
      hands,
      dealer,
      turn: next4(dealer),
      leader: next4(dealer),
      trick: [],
      teamPoints: [0, 0],
      winningTeam: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    const hand = state.hands[seat]!;
    if (state.trick.length === 0) return hand.map((card) => ({ type: "PLAY", card }));
    const leadSuit = suitOf(state.trick[0]!.card);
    const sameSuit = hand.filter((c) => suitOf(c) === leadSuit);
    const pool = sameSuit.length > 0 ? sameSuit : hand;
    return pool.map((card) => ({ type: "PLAY", card }));
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    if (action.type !== "PLAY") throw new IllegalActionError("Only PLAY");
    const seat = state.turn;
    const legal = this.legalActions(state, seat) as Array<{ type: "PLAY"; card: Card }>;
    if (!legal.some((l) => l.card === action.card)) throw new IllegalActionError("Illegal card");

    const next: KentState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      trick: state.trick.slice(),
      teamPoints: [state.teamPoints[0], state.teamPoints[1]],
    };
    next.hands[seat] = next.hands[seat]!.filter((c) => c !== action.card);
    next.trick.push({ seat, card: action.card });
    const events: KentEvent[] = [{ type: "PLAY", seat, card: action.card }];

    if (next.trick.length < 4) {
      next.turn = next4(seat);
      return { state: next, events };
    }

    const leadSuit = suitOf(next.trick[0]!.card);
    let best = next.trick[0]!;
    for (const p of next.trick.slice(1)) if (beats(p.card, best.card, leadSuit)) best = p;
    const pts = next.trick.reduce((a, p) => a + (VALUE[rankOf(p.card)] ?? 0), 0);
    const winner = best.seat;
    const wTeam = team(winner);
    next.teamPoints[wTeam] = (next.teamPoints[wTeam] ?? 0) + pts;
    next.trick = [];
    next.leader = winner;
    next.turn = winner;
    events.push({ type: "TRICK", seat: winner, points: pts });

    if (next.hands.every((h) => h.length === 0)) {
      next.teamPoints[wTeam] = (next.teamPoints[wTeam] ?? 0) + 10; // last trick
      next.winningTeam = next.teamPoints[0]! >= next.teamPoints[1]! ? 0 : 1;
      next.done = true;
      events.push({ type: "RESULT", team: next.winningTeam });
    }
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winTeam = state.winningTeam ?? 0;
    return [0, 1, 2, 3].map((seat) => ({
      seat,
      result: team(seat as Seat) === winTeam ? "win" : "loss",
      points: team(seat as Seat) === winTeam ? 1 : 0,
    }));
  },

  redact(state, seat) {
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    return { ...state, hands };
  },
};
