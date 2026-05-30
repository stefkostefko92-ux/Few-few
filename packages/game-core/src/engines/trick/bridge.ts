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
 * Бридж (Bridge) — 4p (2v2) trick-taking with a simplified auction (§4.14).
 * Full 52-card deck dealt 13 each. Teams {0,2} vs {1,3}. A simplified auction:
 * each seat in turn either bids a level+strain (higher than the last) or passes;
 * three passes after a bid close the auction and set the contract trump (or
 * no-trump). Then 13 tricks with standard follow-suit. The declaring side must
 * take (6 + level) tricks to make the contract. Scoring is win/loss by contract.
 *
 * Simplifications (harden later): no doubling, no vulnerability, no dummy reveal,
 * trick-point scoring reduced to made/defeated. All-pass redeals via a forced
 * 1-No-Trump by dealer's team to keep play moving.
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
const STRENGTH: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const STRAINS = ["C", "D", "H", "S", "NT"] as const;
type Strain = (typeof STRAINS)[number];

interface Play {
  seat: Seat;
  card: Card;
}

export interface BridgeState {
  phase: "AUCTION" | "PLAY";
  hands: Card[][];
  dealer: Seat;
  turn: Seat;
  leader: Seat;
  trick: Play[];
  // auction
  bidLevel: number; // 0 = none yet
  bidStrain: Strain | null;
  declarer: Seat | null;
  passes: number;
  // contract
  trump: Suit | null; // null for NT
  contractLevel: number;
  // play
  tricksWon: [number, number];
  winningTeam: number | null;
  done: boolean;
}

export type BridgeAction =
  | { type: "PASS" }
  | { type: "BID"; level: number; strain: Strain }
  | { type: "PLAY"; card: Card };

export type BridgeEvent =
  | { type: "BID"; seat: Seat; level: number; strain: Strain }
  | { type: "PASS"; seat: Seat }
  | { type: "CONTRACT"; declarer: Seat; level: number; strain: Strain }
  | { type: "PLAY"; seat: Seat; card: Card }
  | { type: "TRICK"; seat: Seat }
  | { type: "RESULT"; team: number; made: boolean; tricks: number };

const next4 = (s: Seat): Seat => ((s + 1) % 4) as Seat;
const team = (s: Seat): number => s % 2;
const strainRank = (s: Strain): number => STRAINS.indexOf(s);
const bidValue = (level: number, strain: Strain): number => level * 5 + strainRank(strain);

function beats(a: Card, b: Card, trump: Suit | null): boolean {
  const aT = trump !== null && suitOf(a) === trump;
  const bT = trump !== null && suitOf(b) === trump;
  if (aT && !bT) return true;
  if (!aT && bT) return false;
  if (suitOf(a) !== suitOf(b)) return false;
  return (STRENGTH[rankOf(a)] ?? 0) > (STRENGTH[rankOf(b)] ?? 0);
}

export const bridgeEngine: GameEngine<BridgeState, BridgeAction, BridgeEvent> = {
  init(_opts: InitOpts, rng: SeededRng): BridgeState {
    const deck = rng.shuffle(buildDeck(RANKS));
    const hands = [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39, 52)];
    const dealer: Seat = 0;
    return {
      phase: "AUCTION",
      hands,
      dealer,
      turn: next4(dealer),
      leader: next4(dealer),
      trick: [],
      bidLevel: 0,
      bidStrain: null,
      declarer: null,
      passes: 0,
      trump: null,
      contractLevel: 0,
      tricksWon: [0, 0],
      winningTeam: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    if (state.phase === "AUCTION") {
      const actions: BridgeAction[] = [{ type: "PASS" }];
      const floor = state.bidLevel === 0 ? 0 : bidValue(state.bidLevel, state.bidStrain!);
      for (let level = 1; level <= 7; level++) {
        for (const strain of STRAINS) {
          if (bidValue(level, strain) > floor) actions.push({ type: "BID", level, strain });
        }
      }
      return actions;
    }
    const hand = state.hands[seat]!;
    if (state.trick.length === 0) return hand.map((card) => ({ type: "PLAY", card }));
    const leadSuit = suitOf(state.trick[0]!.card);
    const sameSuit = hand.filter((c) => suitOf(c) === leadSuit);
    const pool = sameSuit.length > 0 ? sameSuit : hand;
    return pool.map((card) => ({ type: "PLAY", card }));
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: BridgeState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      trick: state.trick.slice(),
      tricksWon: [state.tricksWon[0], state.tricksWon[1]],
    };
    const events: BridgeEvent[] = [];

    if (next.phase === "AUCTION") {
      if (action.type === "PASS") {
        next.passes += 1;
        events.push({ type: "PASS", seat });
        // Three passes after a bid -> contract; four passes from start -> force.
        if (next.bidLevel > 0 && next.passes >= 3) {
          return openContract(next, events);
        }
        if (next.bidLevel === 0 && next.passes >= 4) {
          next.bidLevel = 1;
          next.bidStrain = "NT";
          next.declarer = next.dealer;
          return openContract(next, events);
        }
        next.turn = next4(seat);
        return { state: next, events };
      }
      if (action.type === "BID") {
        const floor = next.bidLevel === 0 ? 0 : bidValue(next.bidLevel, next.bidStrain!);
        if (bidValue(action.level, action.strain) <= floor) {
          throw new IllegalActionError("Bid must be higher");
        }
        next.bidLevel = action.level;
        next.bidStrain = action.strain;
        next.declarer = seat;
        next.passes = 0;
        events.push({ type: "BID", seat, level: action.level, strain: action.strain });
        next.turn = next4(seat);
        return { state: next, events };
      }
      throw new IllegalActionError("Expected auction action");
    }

    // PLAY
    if (action.type !== "PLAY") throw new IllegalActionError("Expected play");
    const legal = this.legalActions(next, seat) as Array<{ type: "PLAY"; card: Card }>;
    if (!legal.some((l) => l.card === action.card)) throw new IllegalActionError("Illegal card");
    next.hands[seat] = next.hands[seat]!.filter((c) => c !== action.card);
    next.trick.push({ seat, card: action.card });
    events.push({ type: "PLAY", seat, card: action.card });

    if (next.trick.length < 4) {
      next.turn = next4(seat);
      return { state: next, events };
    }

    let bestPlay = next.trick[0]!;
    for (const p of next.trick.slice(1)) {
      if (beats(p.card, bestPlay.card, next.trump)) bestPlay = p;
    }
    const winner = bestPlay.seat;
    const wTeam = team(winner);
    next.tricksWon[wTeam] = (next.tricksWon[wTeam] ?? 0) + 1;
    next.trick = [];
    next.leader = winner;
    next.turn = winner;
    events.push({ type: "TRICK", seat: winner });

    if (next.hands.every((h) => h.length === 0)) {
      const declTeam = team(next.declarer!);
      const need = 6 + next.contractLevel;
      const made = next.tricksWon[declTeam]! >= need;
      next.winningTeam = made ? declTeam : 1 - declTeam;
      next.done = true;
      events.push({
        type: "RESULT",
        team: next.winningTeam,
        made,
        tricks: next.tricksWon[declTeam]!,
      });
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

function openContract(
  state: BridgeState,
  events: BridgeEvent[],
): { state: BridgeState; events: BridgeEvent[] } {
  const strain = state.bidStrain!;
  state.phase = "PLAY";
  state.trump = strain === "NT" ? null : (strain as Suit);
  state.contractLevel = state.bidLevel;
  const first = next4(state.declarer!);
  state.leader = first;
  state.turn = first;
  events.push({ type: "CONTRACT", declarer: state.declarer!, level: state.bidLevel, strain });
  return { state, events };
}
