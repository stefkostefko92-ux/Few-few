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
 * Doubling supported: opponents may DOUBLE a standing contract and the bidding
 * side may REDOUBLE; a fresh bid clears the double; the deal's worth is x2/x4.
 * Simplifications (harden later): no vulnerability, no dummy reveal; trick-point
 * scoring reduced to made/defeated × double multiplier. All-pass redeals via a
 * forced 1-No-Trump by dealer's team to keep play moving.
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
  /** Doubling: 0 none, 1 doubled, 2 redoubled. */
  doubled: number;
  // play
  tricksWon: [number, number];
  // ── match (rubber) ──
  matchPoints: [number, number];
  gamesWon: [number, number];
  vulnerable: [boolean, boolean];
  dealNo: number;
  lastDeal: { declarer: Seat; level: number; strain: Strain; doubled: number; made: boolean; tricks: number; declScore: number; defScore: number } | null;
  winningTeam: number | null;
  done: boolean;
}

export type BridgeAction =
  | { type: "PASS" }
  | { type: "BID"; level: number; strain: Strain }
  | { type: "DOUBLE" }
  | { type: "REDOUBLE" }
  | { type: "PLAY"; card: Card };

export type BridgeEvent =
  | { type: "BID"; seat: Seat; level: number; strain: Strain }
  | { type: "PASS"; seat: Seat }
  | { type: "DOUBLE"; seat: Seat }
  | { type: "REDOUBLE"; seat: Seat }
  | { type: "CONTRACT"; declarer: Seat; level: number; strain: Strain; doubled: number }
  | { type: "PLAY"; seat: Seat; card: Card }
  | { type: "TRICK"; seat: Seat }
  | { type: "RESULT"; team: number; made: boolean; tricks: number }
  | { type: "DEAL_END"; declTeam: number; declScore: number; defScore: number; matchPoints: [number, number] }
  | { type: "MATCH"; team: number };

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

/** Рубер: играе се до 2 спечелени гейма (или таван от MAX_DEALS раздавания). */
export const MAX_DEALS_BRIDGE = 16;

const isMinor = (s: Strain): boolean => s === "C" || s === "D";

/** Standard contract-bridge scoring for one finished deal. */
function scoreDeal(
  level: number,
  strain: Strain,
  doubled: number,
  declTricks: number,
  vul: boolean,
): { declScore: number; defScore: number; gameMade: boolean } {
  const need = 6 + level;
  const dmult = doubled === 2 ? 4 : doubled === 1 ? 2 : 1;
  const perTrick = isMinor(strain) ? 20 : 30;
  const trickPts = (strain === "NT" ? 40 + 30 * (level - 1) : perTrick * level) * dmult;

  if (declTricks >= need) {
    let score = trickPts;
    const over = declTricks - need;
    if (doubled === 0) score += over * (strain === "NT" ? 30 : perTrick);
    else score += over * (doubled === 2 ? (vul ? 400 : 200) : vul ? 200 : 100);
    const gameMade = trickPts >= 100;
    score += gameMade ? (vul ? 500 : 300) : 50; // game vs part-score bonus
    if (level === 6) score += vul ? 750 : 500; // small slam
    if (level === 7) score += vul ? 1500 : 1000; // grand slam
    if (doubled === 1) score += 50; // insult
    if (doubled === 2) score += 100;
    return { declScore: score, defScore: 0, gameMade };
  }

  // Defeated — defenders score undertrick penalties.
  const under = need - declTricks;
  let pen = 0;
  if (doubled === 0) {
    pen = under * (vul ? 100 : 50);
  } else {
    for (let i = 1; i <= under; i++) {
      if (vul) pen += i === 1 ? 200 : 300;
      else pen += i === 1 ? 100 : i <= 3 ? 200 : 300;
    }
    if (doubled === 2) pen *= 2;
  }
  return { declScore: 0, defScore: pen, gameMade: false };
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
      doubled: 0,
      tricksWon: [0, 0],
      matchPoints: [0, 0],
      gamesWon: [0, 0],
      vulnerable: [false, false],
      dealNo: 1,
      lastDeal: null,
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
      // Double: there is a standing bid, it's not yet doubled, and the current
      // contract belongs to the OPPONENTS of the seat to act.
      if (state.bidLevel > 0 && state.doubled === 0 && team(state.declarer!) !== team(seat)) {
        actions.push({ type: "DOUBLE" });
      }
      // Redouble: the contract is doubled and belongs to the seat's OWN side.
      if (state.bidLevel > 0 && state.doubled === 1 && team(state.declarer!) === team(seat)) {
        actions.push({ type: "REDOUBLE" });
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

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: BridgeState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      trick: state.trick.slice(),
      tricksWon: [state.tricksWon[0], state.tricksWon[1]],
      matchPoints: [state.matchPoints[0], state.matchPoints[1]],
      gamesWon: [state.gamesWon[0], state.gamesWon[1]],
      vulnerable: [state.vulnerable[0], state.vulnerable[1]],
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
        next.doubled = 0; // a fresh bid clears any double
        events.push({ type: "BID", seat, level: action.level, strain: action.strain });
        next.turn = next4(seat);
        return { state: next, events };
      }
      if (action.type === "DOUBLE") {
        if (next.bidLevel === 0 || next.doubled !== 0 || team(next.declarer!) === team(seat)) {
          throw new IllegalActionError("Cannot double");
        }
        next.doubled = 1;
        next.passes = 0;
        events.push({ type: "DOUBLE", seat });
        next.turn = next4(seat);
        return { state: next, events };
      }
      if (action.type === "REDOUBLE") {
        if (next.doubled !== 1 || team(next.declarer!) !== team(seat)) {
          throw new IllegalActionError("Cannot redouble");
        }
        next.doubled = 2;
        next.passes = 0;
        events.push({ type: "REDOUBLE", seat });
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
      settleDeal(next, events, rng);
    }
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winTeam = state.winningTeam ?? (state.matchPoints[0] >= state.matchPoints[1] ? 0 : 1);
    return [0, 1, 2, 3].map((seat) => ({
      seat,
      result: team(seat as Seat) === winTeam ? "win" : "loss",
      points: team(seat as Seat) === winTeam ? state.matchPoints[winTeam] : 0,
    }));
  },

  redact(state, seat) {
    // After the opening lead the dummy (declarer's partner) is public to all.
    const dummy = state.declarer !== null ? (((state.declarer + 2) % 4) as Seat) : null;
    const leadMade =
      state.phase === "PLAY" && (state.trick.length > 0 || state.tricksWon[0] + state.tricksWon[1] > 0);
    const hands = state.hands.map((h, i) =>
      i === seat || (leadMade && dummy !== null && i === dummy) ? h.slice() : hiddenLike(h),
    );
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
  events.push({ type: "CONTRACT", declarer: state.declarer!, level: state.bidLevel, strain, doubled: state.doubled });
  return { state, events };
}

/** Score the finished deal, update the rubber, and deal again or end the match. */
function settleDeal(state: BridgeState, events: BridgeEvent[], rng: SeededRng): void {
  const declTeam = team(state.declarer!);
  const defTeam = 1 - declTeam;
  const made = state.tricksWon[declTeam]! >= 6 + state.contractLevel;
  const { declScore, defScore, gameMade } = scoreDeal(
    state.contractLevel,
    state.bidStrain!,
    state.doubled,
    state.tricksWon[declTeam]!,
    state.vulnerable[declTeam as 0 | 1],
  );
  state.matchPoints[declTeam as 0 | 1] += declScore;
  state.matchPoints[defTeam as 0 | 1] += defScore;
  state.lastDeal = {
    declarer: state.declarer!,
    level: state.contractLevel,
    strain: state.bidStrain!,
    doubled: state.doubled,
    made,
    tricks: state.tricksWon[declTeam]!,
    declScore,
    defScore,
  };
  events.push({ type: "RESULT", team: made ? declTeam : defTeam, made, tricks: state.tricksWon[declTeam]! });

  if (gameMade) {
    state.gamesWon[declTeam as 0 | 1] += 1;
    state.vulnerable[declTeam as 0 | 1] = true;
  }
  events.push({ type: "DEAL_END", declTeam, declScore, defScore, matchPoints: [...state.matchPoints] });

  // Rubber over: a side won two games (bonus 700, or 500 if opponents vulnerable).
  if (state.gamesWon[declTeam as 0 | 1] >= 2) {
    state.matchPoints[declTeam as 0 | 1] += state.vulnerable[defTeam as 0 | 1] ? 500 : 700;
    state.winningTeam = declTeam;
    state.done = true;
    events.push({ type: "MATCH", team: declTeam });
    return;
  }
  if (state.dealNo >= MAX_DEALS_BRIDGE) {
    state.winningTeam = state.matchPoints[0] >= state.matchPoints[1] ? 0 : 1;
    state.done = true;
    events.push({ type: "MATCH", team: state.winningTeam });
    return;
  }

  // Next deal: rotate dealer, redeal, reset the auction.
  const deck = rng.shuffle(buildDeck(RANKS));
  state.hands = [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39, 52)];
  state.dealer = next4(state.dealer);
  state.phase = "AUCTION";
  state.turn = next4(state.dealer);
  state.leader = next4(state.dealer);
  state.trick = [];
  state.bidLevel = 0;
  state.bidStrain = null;
  state.declarer = null;
  state.passes = 0;
  state.trump = null;
  state.contractLevel = 0;
  state.doubled = 0;
  state.tricksWon = [0, 0];
  state.dealNo += 1;
}
