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
 * Белот — 4-player (2v2) trick-taking, suit contract (§4.1). 32-card deck
 * (7,8,9,T,J,Q,K,A x 4). Teams: seats {0,2} vs {1,3}. Server-authoritative;
 * other players' hands are redacted.
 *
 * BID phase: starting left of the dealer each player passes or names a trump
 * suit; the first call sets the contract and ends bidding. If all four pass,
 * the engine forces a default trump so the deal always proceeds.
 * PLAY phase: 8 tricks. Follow the led suit; if void, play a trump if you hold
 * one; otherwise anything. The trick goes to the highest trump, else the
 * highest card of the led suit. Last trick is worth +10 ("10 de der").
 *
 * Simplifications (to harden later): single deal (no running 151 target), no
 * declarations (terца/петдесет/belote), and the strict over-trump / must-head
 * obligations are relaxed to "must trump when void".
 */

const RANKS = ["7", "8", "9", "T", "J", "Q", "K", "A"] as const;
const TRUMP_VALUE: Record<string, number> = { J: 20, "9": 14, A: 11, T: 10, K: 4, Q: 3, "8": 0, "7": 0 };
const PLAIN_VALUE: Record<string, number> = { A: 11, T: 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 };
const TRUMP_STRENGTH: Record<string, number> = { J: 8, "9": 7, A: 6, T: 5, K: 4, Q: 3, "8": 2, "7": 1 };
const PLAIN_STRENGTH: Record<string, number> = { A: 8, T: 7, K: 6, Q: 5, J: 4, "9": 3, "8": 2, "7": 1 };

const DEFAULT_TRUMP: Suit = "S";

interface Play {
  seat: Seat;
  card: Card;
}

export interface BeloteState {
  phase: "BID" | "PLAY";
  hands: Card[][];
  trump: Suit | null;
  declarer: Seat | null;
  dealer: Seat;
  turn: Seat;
  leader: Seat;
  trick: Play[];
  passes: number;
  teamPoints: [number, number]; // [team A {0,2}, team B {1,3}]
  tricksTaken: [number, number];
  lastTrickWinner: Seat | null;
  winningTeam: number | null;
  done: boolean;
}

export type BeloteAction =
  | { type: "PASS" }
  | { type: "CALL"; suit: Suit }
  | { type: "PLAY"; card: Card };

export type BeloteEvent =
  | { type: "CALL"; seat: Seat; suit: Suit }
  | { type: "PASS"; seat: Seat }
  | { type: "CONTRACT"; trump: Suit; declarer: Seat }
  | { type: "PLAY"; seat: Seat; card: Card }
  | { type: "TRICK"; seat: Seat; points: number }
  | { type: "RESULT"; team: number; made: boolean };

const next4 = (s: Seat): Seat => ((s + 1) % 4) as Seat;
const team = (s: Seat): number => s % 2;
const cardValue = (c: Card, trump: Suit): number =>
  suitOf(c) === trump ? (TRUMP_VALUE[rankOf(c)] ?? 0) : (PLAIN_VALUE[rankOf(c)] ?? 0);
const at2 = (t: [number, number], i: number): number => (i === 0 ? t[0] : t[1]);

/** Does card `a` beat the current winning card `b`, given the trump suit? */
function beats(a: Card, b: Card, trump: Suit): boolean {
  const aT = suitOf(a) === trump;
  const bT = suitOf(b) === trump;
  if (aT && !bT) return true;
  if (!aT && bT) return false;
  if (aT && bT) return (TRUMP_STRENGTH[rankOf(a)] ?? 0) > (TRUMP_STRENGTH[rankOf(b)] ?? 0);
  if (suitOf(a) !== suitOf(b)) return false; // off-suit, no trump -> cannot beat
  return (PLAIN_STRENGTH[rankOf(a)] ?? 0) > (PLAIN_STRENGTH[rankOf(b)] ?? 0);
}

function startPlay(state: BeloteState, trump: Suit, declarer: Seat, events: BeloteEvent[]): void {
  state.phase = "PLAY";
  state.trump = trump;
  state.declarer = declarer;
  const first = next4(state.dealer);
  state.leader = first;
  state.turn = first;
  events.push({ type: "CONTRACT", trump, declarer });
}

export const beloteEngine: GameEngine<BeloteState, BeloteAction, BeloteEvent> = {
  init(_opts: InitOpts, rng: SeededRng): BeloteState {
    const deck = rng.shuffle(buildDeck(RANKS));
    const hands = [deck.slice(0, 8), deck.slice(8, 16), deck.slice(16, 24), deck.slice(24, 32)];
    const dealer: Seat = 0;
    const first = next4(dealer);
    return {
      phase: "BID",
      hands,
      trump: null,
      declarer: null,
      dealer,
      turn: first,
      leader: first,
      trick: [],
      passes: 0,
      teamPoints: [0, 0],
      tricksTaken: [0, 0],
      lastTrickWinner: null,
      winningTeam: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    if (state.phase === "BID") {
      const actions: BeloteAction[] = [{ type: "PASS" }];
      for (const suit of ["S", "H", "D", "C"] as Suit[]) actions.push({ type: "CALL", suit });
      return actions;
    }
    const hand = state.hands[seat]!;
    const trump = state.trump!;
    if (state.trick.length === 0) return hand.map((card) => ({ type: "PLAY", card }));

    const leadSuit = suitOf(state.trick[0]!.card);
    const sameSuit = hand.filter((c) => suitOf(c) === leadSuit);
    if (sameSuit.length > 0) return sameSuit.map((card) => ({ type: "PLAY", card }));
    const trumps = hand.filter((c) => suitOf(c) === trump);
    const pool = trumps.length > 0 ? trumps : hand;
    return pool.map((card) => ({ type: "PLAY", card }));
  },

  reduce(state, action, _rng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const legal = this.legalActions(state, seat);
    const matches = (a: BeloteAction, b: BeloteAction): boolean => {
      if (a.type !== b.type) return false;
      if (a.type === "CALL" && b.type === "CALL") return a.suit === b.suit;
      if (a.type === "PLAY" && b.type === "PLAY") return a.card === b.card;
      return true;
    };
    if (!legal.some((l) => matches(l, action))) {
      throw new IllegalActionError(`Illegal belote action ${JSON.stringify(action)}`);
    }

    const next: BeloteState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      trick: state.trick.slice(),
      teamPoints: [state.teamPoints[0], state.teamPoints[1]],
      tricksTaken: [state.tricksTaken[0], state.tricksTaken[1]],
    };
    const events: BeloteEvent[] = [];

    if (next.phase === "BID") {
      if (action.type === "PASS") {
        next.passes += 1;
        events.push({ type: "PASS", seat });
        if (next.passes >= 4) startPlay(next, DEFAULT_TRUMP, next4(next.dealer), events);
        else next.turn = next4(seat);
        return { state: next, events };
      }
      if (action.type === "CALL") {
        events.push({ type: "CALL", seat, suit: action.suit });
        startPlay(next, action.suit, seat, events);
        return { state: next, events };
      }
      throw new IllegalActionError("Expected bid action");
    }

    // PLAY
    if (action.type !== "PLAY") throw new IllegalActionError("Expected play action");
    next.hands[seat] = next.hands[seat]!.filter((c) => c !== action.card);
    next.trick.push({ seat, card: action.card });
    events.push({ type: "PLAY", seat, card: action.card });

    if (next.trick.length < 4) {
      next.turn = next4(seat);
      return { state: next, events };
    }

    // Resolve the trick.
    const trump = next.trump!;
    let best = next.trick[0]!;
    for (const play of next.trick.slice(1)) {
      if (beats(play.card, best.card, trump)) best = play;
    }
    const pts = next.trick.reduce((acc, p) => acc + cardValue(p.card, trump), 0);
    const winner = best.seat;
    const wTeam = team(winner);
    next.teamPoints[wTeam] = at2(next.teamPoints, wTeam) + pts;
    next.tricksTaken[wTeam] = at2(next.tricksTaken, wTeam) + 1;
    next.lastTrickWinner = winner;
    next.trick = [];
    next.leader = winner;
    next.turn = winner;
    events.push({ type: "TRICK", seat: winner, points: pts });

    if (next.hands.every((h) => h.length === 0)) {
      next.teamPoints[wTeam] = at2(next.teamPoints, wTeam) + 10; // last-trick bonus
      const declTeam = team(next.declarer!);
      const made = at2(next.teamPoints, declTeam) >= 82;
      next.winningTeam = made ? declTeam : 1 - declTeam;
      next.done = true;
      events.push({ type: "RESULT", team: next.winningTeam, made });
    }

    return { state: next, events };
  },

  isTerminal: (state) => state.done,

  score(state): SeatScore[] {
    const winTeam = state.winningTeam ?? 0;
    return [0, 1, 2, 3].map((seat) => ({
      seat: seat as Seat,
      result: team(seat as Seat) === winTeam ? "win" : "loss",
      points: team(seat as Seat) === winTeam ? 1 : 0,
    }));
  },

  redact(state, seat) {
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    return { ...state, hands };
  },
};
