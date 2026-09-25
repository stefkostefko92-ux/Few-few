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
 * take (6 + level) tricks to make the contract.
 *
 * Declarer (§ pagat rubber-bridge rules): the DECLARER is the FIRST player of
 * the winning partnership who named the final contract's strain during the
 * auction — which may be the partner of the seat that made the last bid. Play
 * starts to the declarer's LEFT. The declarer's partner is the DUMMY: after the
 * opening lead the dummy's hand is turned face-up and the DECLARER plays BOTH
 * hands — on the dummy's turn the dummy is passive and the declarer chooses its
 * card. This is enforced entirely inside the engine via `legalActions`/`reduce`
 * (no realtime changes): on the dummy's turn only the declarer is offered the
 * dummy's legal cards, and `reduce` plays them from the dummy's hand.
 *
 * Doubling supported: opponents may DOUBLE a standing contract and the bidding
 * side may REDOUBLE; a fresh bid clears the double; the deal's worth is x2/x4.
 *
 * Scoring — RUBBER bridge (single, consistent system; NOT duplicate). Trick
 * points for a made contract go "below the line" and accumulate across deals;
 * reaching 100 below the line wins a GAME (and makes that side vulnerable),
 * which wipes both sides' part-scores. Overtricks, undertrick penalties, slam
 * bonuses and the doubled/redoubled insult go "above the line". There is NO
 * per-deal game bonus — the ONLY game bonus is the rubber bonus (700, or 500 if
 * the opponents are already vulnerable) awarded when a side wins its second
 * game. An all-pass deal is redealt by the next dealer.
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
  /** The seat that made the last (standing) bid — used for team/double logic. */
  lastBidder: Seat | null;
  /** First seat to NAME each [team*5 + strainRank] cell, or null. Declarer =
   *  firstNamed[winningTeam][finalStrain]. Length 10 (2 teams × 5 strains). */
  firstNamed: (Seat | null)[];
  /** The contract declarer (first of the winning side to name the strain). */
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
  /** Below-the-line trick points accumulated toward the current game (per team). */
  belowLine: [number, number];
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
/** Flat index into `firstNamed` for a seat's team naming a given strain. */
const namedIdx = (s: Seat, strain: Strain): number => team(s) * 5 + strainRank(strain);

/** Dummy = declarer's partner, or null before a contract is set. */
const dummyOf = (state: BridgeState): Seat | null =>
  state.declarer !== null ? (((state.declarer + 2) % 4) as Seat) : null;

/** The seat that must act now during PLAY: normally `turn`, but on the dummy's
 *  turn it is the DECLARER (who plays the dummy's hand). */
function playActor(state: BridgeState): Seat {
  const dummy = dummyOf(state);
  return dummy !== null && state.turn === dummy ? state.declarer! : state.turn;
}

/** The legal cards playable from a specific hand, honouring follow-suit. */
function legalCardsForHand(state: BridgeState, handSeat: Seat): Card[] {
  const hand = state.hands[handSeat]!;
  if (state.trick.length === 0) return hand;
  const leadSuit = suitOf(state.trick[0]!.card);
  const sameSuit = hand.filter((c) => suitOf(c) === leadSuit);
  return sameSuit.length > 0 ? sameSuit : hand;
}

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

/**
 * Rubber-bridge scoring for one finished deal. Returns the declaring side's
 * total (`declScore`), the defenders' penalty total (`defScore`) and the
 * portion of `declScore` that counts BELOW THE LINE toward a game (`trickPts`,
 * 0 when defeated). Above-the-line = overtricks + slam bonus + doubled insult.
 * There is deliberately NO per-deal game bonus here — the rubber bonus (added
 * once in `settleDeal`) is the only game reward.
 */
function scoreDeal(
  level: number,
  strain: Strain,
  doubled: number,
  declTricks: number,
  vul: boolean,
): { declScore: number; defScore: number; trickPts: number } {
  const need = 6 + level;
  const dmult = doubled === 2 ? 4 : doubled === 1 ? 2 : 1;
  const perTrick = isMinor(strain) ? 20 : 30;

  if (declTricks >= need) {
    // Below the line: contract trick value (doubled/redoubled included).
    const trickPts = (strain === "NT" ? 40 + 30 * (level - 1) : perTrick * level) * dmult;
    let above = 0;
    const over = declTricks - need;
    if (doubled === 0) above += over * (strain === "NT" ? 30 : perTrick);
    else above += over * (doubled === 2 ? (vul ? 400 : 200) : vul ? 200 : 100);
    if (level === 6) above += vul ? 750 : 500; // small slam
    if (level === 7) above += vul ? 1500 : 1000; // grand slam
    if (doubled === 1) above += 50; // insult for making a doubled contract
    if (doubled === 2) above += 100;
    return { declScore: trickPts + above, defScore: 0, trickPts };
  }

  // Defeated — defenders score undertrick penalties (all above the line).
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
  return { declScore: 0, defScore: pen, trickPts: 0 };
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
      lastBidder: null,
      firstNamed: new Array(10).fill(null),
      declarer: null,
      passes: 0,
      trump: null,
      contractLevel: 0,
      doubled: 0,
      tricksWon: [0, 0],
      matchPoints: [0, 0],
      belowLine: [0, 0],
      gamesWon: [0, 0],
      vulnerable: [false, false],
      dealNo: 1,
      lastDeal: null,
      winningTeam: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done) return [];
    if (state.phase === "AUCTION") {
      if (seat !== state.turn) return [];
      const actions: BridgeAction[] = [{ type: "PASS" }];
      const floor = state.bidLevel === 0 ? 0 : bidValue(state.bidLevel, state.bidStrain!);
      for (let level = 1; level <= 7; level++) {
        for (const strain of STRAINS) {
          if (bidValue(level, strain) > floor) actions.push({ type: "BID", level, strain });
        }
      }
      // Double: there is a standing bid, it's not yet doubled, and the current
      // contract belongs to the OPPONENTS of the seat to act.
      if (state.bidLevel > 0 && state.doubled === 0 && team(state.lastBidder!) !== team(seat)) {
        actions.push({ type: "DOUBLE" });
      }
      // Redouble: the contract is doubled and belongs to the seat's OWN side.
      if (state.bidLevel > 0 && state.doubled === 1 && team(state.lastBidder!) === team(seat)) {
        actions.push({ type: "REDOUBLE" });
      }
      return actions;
    }
    // PLAY: on the dummy's turn only the DECLARER may act (playing the dummy's
    // hand); the dummy itself is passive. Otherwise the seat plays its own hand.
    if (seat !== playActor(state)) return [];
    return legalCardsForHand(state, state.turn).map((card) => ({ type: "PLAY" as const, card }));
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: BridgeState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      trick: state.trick.slice(),
      firstNamed: state.firstNamed.slice(),
      tricksWon: [state.tricksWon[0], state.tricksWon[1]],
      matchPoints: [state.matchPoints[0], state.matchPoints[1]],
      belowLine: [state.belowLine[0], state.belowLine[1]],
      gamesWon: [state.gamesWon[0], state.gamesWon[1]],
      vulnerable: [state.vulnerable[0], state.vulnerable[1]],
    };
    const events: BridgeEvent[] = [];

    if (next.phase === "AUCTION") {
      if (action.type === "PASS") {
        next.passes += 1;
        events.push({ type: "PASS", seat });
        // Three passes after a bid -> contract; four passes from the start ->
        // the deal is passed out and redealt by the next dealer (authentic).
        if (next.bidLevel > 0 && next.passes >= 3) {
          return openContract(next, events);
        }
        if (next.bidLevel === 0 && next.passes >= 4) {
          redealOrEnd(next, events, rng);
          return { state: next, events };
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
        next.lastBidder = seat;
        // Record the FIRST seat of this side to name this strain (declarer rule).
        const idx = namedIdx(seat, action.strain);
        if (next.firstNamed[idx] === null) next.firstNamed[idx] = seat;
        next.passes = 0;
        next.doubled = 0; // a fresh bid clears any double
        events.push({ type: "BID", seat, level: action.level, strain: action.strain });
        next.turn = next4(seat);
        return { state: next, events };
      }
      if (action.type === "DOUBLE") {
        if (next.bidLevel === 0 || next.doubled !== 0 || team(next.lastBidder!) === team(seat)) {
          throw new IllegalActionError("Cannot double");
        }
        next.doubled = 1;
        next.passes = 0;
        events.push({ type: "DOUBLE", seat });
        next.turn = next4(seat);
        return { state: next, events };
      }
      if (action.type === "REDOUBLE") {
        if (next.doubled !== 1 || team(next.lastBidder!) !== team(seat)) {
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

    // PLAY. `seat` is the hand at `turn` — which may be the dummy (the declarer
    // acts for it). Validate against and remove from THAT hand; the card enters
    // the trick at the dummy's seat so trick-winner/rotation stay correct.
    if (action.type !== "PLAY") throw new IllegalActionError("Expected play");
    const legalCards = legalCardsForHand(next, seat);
    if (!legalCards.includes(action.card)) throw new IllegalActionError("Illegal card");
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

  /** Heuristic bot: HCP-based auction (never runaway-bids to slam without the
   *  points) and sensible follow-suit play (win cheaply, don't overtake a
   *  partner, discard low). Replaces uniform-random, which bid to 7NT. */
  bot(state, seat): BridgeAction | null {
    if (state.done) return null;
    if (state.phase === "AUCTION") {
      return seat === state.turn ? bidBot(state, seat) : null;
    }
    // The declarer also acts on the dummy's turn (`playActor`), so a bot in the
    // declarer's seat plays both hands; the dummy seat itself never acts.
    return seat === playActor(state) ? playBot(state, seat) : null;
  },

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
  // Declarer = the FIRST player of the winning side to have named this strain —
  // which may be the partner of the last bidder, not the last bidder itself.
  const winTeam = team(state.lastBidder!);
  state.declarer = state.firstNamed[winTeam * 5 + strainRank(strain)]!;
  const first = next4(state.declarer); // opening lead is to the declarer's left
  state.leader = first;
  state.turn = first;
  events.push({ type: "CONTRACT", declarer: state.declarer, level: state.bidLevel, strain, doubled: state.doubled });
  return { state, events };
}

/** Score the finished deal (rubber rules), update the rubber, and deal again or
 *  end the match. Trick points accrue below the line; 100+ wins a game; the
 *  rubber bonus is the only game reward, granted on a side's second game. */
function settleDeal(state: BridgeState, events: BridgeEvent[], rng: SeededRng): void {
  const declTeam = team(state.declarer!);
  const defTeam = 1 - declTeam;
  const made = state.tricksWon[declTeam]! >= 6 + state.contractLevel;
  const { declScore, defScore, trickPts } = scoreDeal(
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

  // Below the line: accumulate trick points; reaching 100 wins a game, makes
  // the side vulnerable and wipes BOTH sides' part-scores (a fresh game starts).
  if (trickPts > 0) {
    state.belowLine[declTeam as 0 | 1] += trickPts;
    if (state.belowLine[declTeam as 0 | 1] >= 100) {
      state.gamesWon[declTeam as 0 | 1] += 1;
      state.vulnerable[declTeam as 0 | 1] = true;
      state.belowLine = [0, 0];
    }
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
  redealOrEnd(state, events, rng);
}

/** Deal the next hand (rotating dealer, resetting the auction) or, at the deal
 *  cap, end the match on total points. Rubber-level totals — matchPoints,
 *  belowLine, gamesWon, vulnerable — persist across deals. Shared by the
 *  passed-out (all-pass) path and the post-scoring path. */
function redealOrEnd(state: BridgeState, events: BridgeEvent[], rng: SeededRng): void {
  if (state.dealNo >= MAX_DEALS_BRIDGE) {
    state.winningTeam = state.matchPoints[0] >= state.matchPoints[1] ? 0 : 1;
    state.done = true;
    events.push({ type: "MATCH", team: state.winningTeam });
    return;
  }
  const deck = rng.shuffle(buildDeck(RANKS));
  state.hands = [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39, 52)];
  state.dealer = next4(state.dealer);
  state.phase = "AUCTION";
  state.turn = next4(state.dealer);
  state.leader = next4(state.dealer);
  state.trick = [];
  state.bidLevel = 0;
  state.bidStrain = null;
  state.lastBidder = null;
  state.firstNamed = new Array(10).fill(null);
  state.declarer = null;
  state.passes = 0;
  state.trump = null;
  state.contractLevel = 0;
  state.doubled = 0;
  state.tricksWon = [0, 0];
  state.dealNo += 1;
}

// ── Bot heuristics ──────────────────────────────────────────────────────────
const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };
const handHcp = (hand: Card[]): number => hand.reduce((a, c) => a + (HCP[rankOf(c)] ?? 0), 0);

function suitLengths(hand: Card[]): Record<Suit, number> {
  const l: Record<string, number> = { C: 0, D: 0, H: 0, S: 0 };
  for (const c of hand) l[suitOf(c)] = (l[suitOf(c)] ?? 0) + 1;
  return l as Record<Suit, number>;
}

/** Longest suit, ties broken toward the higher-ranking (S>H>D>C). */
function longestSuit(hand: Card[]): Suit {
  const l = suitLengths(hand);
  let best: Suit = "C";
  for (const s of ["C", "D", "H", "S"] as Suit[]) if (l[s] >= l[best]) best = s;
  return best;
}

/** Longest biddable suit with ≥ minLen cards (prefer higher-ranking), or null. */
function bestBiddableSuit(hand: Card[], minLen = 4): Suit | null {
  const l = suitLengths(hand);
  let best: Suit | null = null;
  for (const s of ["C", "D", "H", "S"] as Suit[]) {
    if (l[s] >= minLen && (best === null || l[s] >= l[best])) best = s;
  }
  return best;
}

const strengthOf = (c: Card): number => STRENGTH[rankOf(c)] ?? 0;
const highest = (cards: Card[]): Card => cards.reduce((m, c) => (strengthOf(c) > strengthOf(m) ? c : m), cards[0]!);
const lowest = (cards: Card[]): Card => cards.reduce((m, c) => (strengthOf(c) < strengthOf(m) ? c : m), cards[0]!);

function bidBot(state: BridgeState, seat: Seat): BridgeAction {
  const hand = state.hands[seat]!;
  const hcp = handHcp(hand);
  const lengths = suitLengths(hand);
  const legal = bridgeEngine.legalActions(state, seat) as BridgeAction[];
  const canBid = (level: number, strain: Strain): boolean =>
    legal.some((a) => a.type === "BID" && a.level === level && a.strain === strain);
  // Points-based ceiling: bots never bid past what their hand can hold up. This
  // is what stops the old random policy from bidding 7NT on a bust.
  const maxLevel = hcp >= 22 ? 6 : hcp >= 19 ? 4 : hcp >= 15 ? 3 : hcp >= 11 ? 2 : 1;

  if (state.bidLevel === 0) {
    if (hcp < 12) return { type: "PASS" };
    const lens = Object.values(lengths);
    const balanced = !lens.includes(0) && lens.filter((v) => v <= 2).length <= 1 && !lens.some((v) => v >= 6);
    if (balanced && hcp >= 15 && hcp <= 17 && canBid(1, "NT")) return { type: "BID", level: 1, strain: "NT" };
    const suit = bestBiddableSuit(hand);
    if (suit && canBid(1, suit)) return { type: "BID", level: 1, strain: suit };
    return { type: "PASS" };
  }

  const partnerBid = team(state.lastBidder!) === team(seat);
  if (partnerBid) {
    // Raise partner one level only with extra values and headroom.
    if (hcp >= 11 && canBid(state.bidLevel + 1, state.bidStrain!) && state.bidLevel + 1 <= maxLevel) {
      return { type: "BID", level: state.bidLevel + 1, strain: state.bidStrain! };
    }
    return { type: "PASS" };
  }

  // Opponents hold the contract: penalty-double a high one, or overcall a good suit.
  if (hcp >= 16 && legal.some((a) => a.type === "DOUBLE")) return { type: "DOUBLE" };
  const overcall = bestBiddableSuit(hand, 5);
  if (overcall && hcp >= 10) {
    for (let lvl = 1; lvl <= maxLevel; lvl++) if (canBid(lvl, overcall)) return { type: "BID", level: lvl, strain: overcall };
  }
  return { type: "PASS" };
}

/** The seat currently winning the in-progress trick. */
function trickWinner(trick: Play[], trump: Suit | null): Play {
  return trick.reduce((best, p) => (beats(p.card, best.card, trump) ? p : best), trick[0]!);
}

function playBot(state: BridgeState, seat: Seat): BridgeAction {
  // `seat` is the actor (the declarer also plays for the dummy); the cards come
  // from the hand at `turn`, which is the dummy on the dummy's turn.
  const handSeat = state.turn;
  const cards = legalCardsForHand(state, handSeat);
  if (cards.length === 0) return { type: "PASS" };
  const trump = state.trump;
  void seat;

  if (state.trick.length === 0) {
    // Lead a high card from the longest suit of the hand being played.
    const suit = longestSuit(state.hands[handSeat]!);
    const inSuit = cards.filter((c) => suitOf(c) === suit);
    return { type: "PLAY", card: highest(inSuit.length ? inSuit : cards) };
  }

  const winner = trickWinner(state.trick, trump);
  if (team(winner.seat) === team(handSeat)) {
    return { type: "PLAY", card: lowest(cards) }; // our side is winning — don't waste
  }
  const canBeat = cards.filter((c) => beats(c, winner.card, trump));
  return { type: "PLAY", card: canBeat.length ? lowest(canBeat) : lowest(cards) };
}
