import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, hiddenLike, RANKS_52, rankOf, suitOf, type Card } from "../cards.js";

/**
 * Реми (Gin Rummy) — 2p melding (§4.11). Each player holds 10 cards. A turn is
 * DRAW (from stock or the discard top) then DISCARD one card — but never the
 * card just taken from the discard pile. You may KNOCK when your deadwood
 * (unmelded card points) is ≤ 10, or GIN at 0. Melds are runs (3+ same-suit
 * sequence, ace LOW: A-2-3 is a run, Q-K-A is not) and sets (3+ same rank).
 * Deadwood points: ace 1, pips face value, courts 10. On knock the lower
 * deadwood wins the difference; an undercut (defender ≤ knocker) awards the
 * defender with a bonus.
 *
 * Lay-offs supported (§4.11): on a knock (not gin), the defender lays off any
 * deadwood that extends the knocker's melds — chained, so 8♥ then 9♥ both fit
 * onto 5-6-7♥. When only two stock cards remain and nobody knocked, the hand
 * is DEAD: no points, redeal with the same first player. Deals repeat into a
 * running match to 100 points; final scoring adds a 25-point line bonus per
 * won deal and doubles a shutout. Big Gin (31, knock with 11 cards) and the
 * opening upcard ritual are deliberate simplifications — not implemented.
 *
 * Opponent hand + stock are redacted; `showdown` (the fully revealed previous
 * deal) is public by design so the defender can verify melds and lay-offs.
 */

export interface RummyShowdown {
  /** The deal this showdown describes (state.dealNo has already advanced). */
  dealNo: number;
  /** Knocking seat; null when the hand died with the stock. */
  knocker: Seat | null;
  winner: Seat | null;
  gin: boolean;
  undercut: boolean;
  /** Dead hand: two stock cards left, nobody knocked, no points. */
  dead: boolean;
  /** Revealed melds per seat (runs sorted low→high). */
  melds: [Card[][], Card[][]];
  /** Unmelded cards per seat (defender: after lay-offs). */
  unmatched: [Card[], Card[]];
  /** Defender cards laid off onto the knocker's melds. */
  layoffs: Card[];
  deadwood: [number, number];
  points: number;
  matchScore: [number, number];
}

export interface RummyState {
  hands: Card[][];
  stock: Card[];
  discard: Card[]; // top = last element
  turn: Seat;
  phase: "DRAW" | "DISCARD";
  winner: Seat | null;
  done: boolean;
  deadwood: [number, number] | null; // filled at deal end
  /** Running match score; first to MATCH_TARGET wins (gin/undercut bonuses). */
  matchScore: [number, number];
  dealNo: number;
  /** Who deals first this deal (loser of the previous deal draws first). */
  firstTurn: Seat;
  /** Card taken from the discard pile this turn — may not be discarded back
   *  (nor knocked with) in the same turn. Public info: the take was visible. */
  drawnFromDiscard: Card | null;
  /** Deals won per seat — 25-point line bonus each at final scoring. */
  dealsWon: [number, number];
  /** The previous deal fully revealed (melds, lay-offs, deadwood). Public. */
  showdown: RummyShowdown | null;
}

export type RummyAction =
  | { type: "DRAW"; from: "stock" | "discard" }
  | { type: "DISCARD"; card: Card }
  | { type: "KNOCK"; card: Card };

export type RummyEvent =
  | { type: "DRAW"; seat: Seat; from: "stock" | "discard" }
  | { type: "DISCARD"; seat: Seat; card: Card }
  | { type: "KNOCK"; seat: Seat; deadwood: number }
  | { type: "WIN"; seat: Seat }
  | {
      type: "DEAL_END";
      seat: Seat;
      points: number;
      matchScore: [number, number];
      gin: boolean;
      undercut: boolean;
    }
  | { type: "DEAD_HAND"; matchScore: [number, number] }
  | { type: "MATCH"; seat: Seat };

const HAND = 10;
/** Gin-rummy run order: ace is LOW (A-2-3 melds, Q-K-A does not). This differs
 *  from the shared poker RANK_VALUE (A=14), hence a local table. */
const GIN_ORDER: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13,
};
const ord = (c: Card): number => GIN_ORDER[rankOf(c)] ?? 0;
/** Deadwood points: ace = 1, pips = face value, T/J/Q/K = 10. */
const deadwoodValue = (r: string): number => Math.min(GIN_ORDER[r] ?? 0, 10);
/** Стандартен джин-реми мач: до 100 точки; джин +25, undercut +25. */
export const RUMMY_TARGET = 100;
const KNOCK_MAX = 10;
const GIN_BONUS = 25;
const UNDERCUT_BONUS = 25;
const LINE_BONUS = 25;

/** Deal fresh hands for the next deal (keeps match-level fields). */
function redeal(next: RummyState, firstTurn: Seat, rng: SeededRng): void {
  const deck = rng.shuffle(buildDeck(RANKS_52));
  next.hands = [deck.splice(0, HAND), deck.splice(0, HAND)];
  next.discard = [deck.shift()!];
  next.stock = deck;
  next.firstTurn = firstTurn;
  next.turn = firstTurn;
  next.phase = "DRAW";
  next.deadwood = null;
  next.drawnFromDiscard = null;
  next.dealNo += 1;
  next.winner = null;
}

/** Award deal points and either finish the match or deal again. Completes the
 *  showdown the caller stashed on `next.showdown` (winner/points/matchScore). */
function settleDeal(
  next: RummyState,
  winner: Seat,
  points: number,
  events: RummyEvent[],
  rng: SeededRng,
): { state: RummyState; events: RummyEvent[] } {
  next.matchScore = [
    next.matchScore[0] + (winner === 0 ? points : 0),
    next.matchScore[1] + (winner === 1 ? points : 0),
  ];
  next.dealsWon = [
    next.dealsWon[0] + (winner === 0 ? 1 : 0),
    next.dealsWon[1] + (winner === 1 ? 1 : 0),
  ];
  if (next.showdown) {
    next.showdown.winner = winner;
    next.showdown.points = points;
    next.showdown.matchScore = [next.matchScore[0], next.matchScore[1]];
  }
  events.push({ type: "WIN", seat: winner });
  events.push({
    type: "DEAL_END",
    seat: winner,
    points,
    matchScore: [...next.matchScore],
    gin: next.showdown?.gin ?? false,
    undercut: next.showdown?.undercut ?? false,
  });
  if ((next.matchScore[winner] ?? 0) >= RUMMY_TARGET) {
    events.push({ type: "MATCH", seat: winner });
    return { state: { ...next, winner, done: true }, events };
  }
  // Нова ръка: губещият започва пръв.
  redeal(next, winner === 0 ? 1 : 0, rng);
  return { state: next, events };
}

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
      matchScore: [0, 0],
      dealNo: 1,
      firstTurn: 0,
      drawnFromDiscard: null,
      dealsWon: [0, 0],
      showdown: null,
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
    // DISCARD phase: discard any card EXCEPT the one just taken from the
    // discard pile; knock with any allowed card if resulting deadwood ≤10.
    const hand = state.hands[seat]!;
    const actions: RummyAction[] = [];
    for (const card of hand) {
      if (card === state.drawnFromDiscard) continue;
      actions.push({ type: "DISCARD", card });
      const remaining = hand.filter((c) => c !== card);
      if (bestDeadwood(remaining) <= KNOCK_MAX) actions.push({ type: "KNOCK", card });
    }
    return actions;
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: RummyState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      stock: state.stock.slice(),
      discard: state.discard.slice(),
      matchScore: [state.matchScore[0], state.matchScore[1]],
      dealsWon: [state.dealsWon[0], state.dealsWon[1]],
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
      next.drawnFromDiscard = action.from === "discard" ? card : null;
      events.push({ type: "DRAW", seat, from: action.from });
      return { state: next, events };
    }

    const isKnock = action.type === "KNOCK";
    const card = action.card;
    if (next.phase !== "DISCARD") throw new IllegalActionError("Not discard phase");
    if (!next.hands[seat]!.includes(card)) throw new IllegalActionError("Card not in hand");
    if (card === next.drawnFromDiscard) {
      throw new IllegalActionError("Cannot discard the card just taken from the discard pile");
    }

    next.hands[seat] = next.hands[seat]!.filter((c) => c !== card);
    next.discard.push(card);
    next.drawnFromDiscard = null;
    events.push({ type: "DISCARD", seat, card });

    if (isKnock) {
      const mySplit = bestMeldSplit(next.hands[seat]!);
      const myDead = mySplit.deadwood;
      if (myDead > KNOCK_MAX) throw new IllegalActionError("Deadwood too high to knock");
      const opp: Seat = seat === 0 ? 1 : 0;
      const gin = myDead === 0;
      // Defender may lay off deadwood onto the knocker's melds — unless GIN
      // (a gin hand does not allow lay-offs).
      const oppSplit = gin
        ? { ...bestMeldSplit(next.hands[opp]!), laidOff: [] as Card[] }
        : layoffSplit(next.hands[opp]!, mySplit.melds);
      const oppDead = oppSplit.deadwood;
      events.push({ type: "KNOCK", seat, deadwood: myDead });
      // Knocker wins if strictly lower; tie or undercut → defender with bonus.
      const knockerWins = gin || myDead < oppDead;
      const winner: Seat = knockerWins ? seat : opp;
      next.deadwood = seat === 0 ? [myDead, oppDead] : [oppDead, myDead];
      const margin = Math.abs(myDead - oppDead);
      const points = knockerWins ? margin + (gin ? GIN_BONUS : 0) : margin + UNDERCUT_BONUS;
      next.showdown = {
        dealNo: next.dealNo,
        knocker: seat,
        winner: null, // settleDeal fills winner/points/matchScore
        gin,
        undercut: !knockerWins,
        dead: false,
        melds: seat === 0 ? [mySplit.melds, oppSplit.melds] : [oppSplit.melds, mySplit.melds],
        unmatched:
          seat === 0 ? [mySplit.unmatched, oppSplit.unmatched] : [oppSplit.unmatched, mySplit.unmatched],
        layoffs: oppSplit.laidOff,
        deadwood: seat === 0 ? [myDead, oppDead] : [oppDead, myDead],
        points: 0,
        matchScore: [next.matchScore[0], next.matchScore[1]],
      };
      return settleDeal(next, winner, Math.max(1, points), events, rng);
    }

    // No knock; with only two stock cards left the hand is DEAD (§4.11):
    // nobody scores, redeal with the same first player.
    if (next.stock.length <= 2) {
      const s0 = bestMeldSplit(next.hands[0]!);
      const s1 = bestMeldSplit(next.hands[1]!);
      next.showdown = {
        dealNo: next.dealNo,
        knocker: null,
        winner: null,
        gin: false,
        undercut: false,
        dead: true,
        melds: [s0.melds, s1.melds],
        unmatched: [s0.unmatched, s1.unmatched],
        layoffs: [],
        deadwood: [s0.deadwood, s1.deadwood],
        points: 0,
        matchScore: [next.matchScore[0], next.matchScore[1]],
      };
      events.push({ type: "DEAD_HAND", matchScore: [...next.matchScore] });
      redeal(next, next.firstTurn, rng);
      return { state: next, events };
    }

    next.turn = seat === 0 ? 1 : 0;
    next.phase = "DRAW";
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winner = state.winner ?? 0;
    const loser: Seat = winner === 0 ? 1 : 0;
    // Final tally: deal points + 25/won deal (line bonus); shutout doubles.
    const tally = (s: Seat) => (state.matchScore[s] ?? 0) + LINE_BONUS * (state.dealsWon?.[s] ?? 0);
    let winPts = tally(winner);
    const losePts = tally(loser);
    if ((state.matchScore[loser] ?? 0) === 0) winPts *= 2;
    return [
      { seat: winner, result: "win", points: winPts },
      { seat: loser, result: "loss", points: losePts },
    ];
  },

  redact(state, seat) {
    // `showdown` (previous deal, fully revealed) and `drawnFromDiscard` (the
    // take was public) intentionally survive redaction.
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    return { ...state, hands, stock: hiddenLike(state.stock) };
  },

  bot(state, seat) {
    if (state.done || seat !== state.turn) return null;
    const hand = state.hands[seat]!;
    if (state.phase === "DRAW") {
      // Take the upcard only when it actually melds (deadwood drops despite
      // the extra card); otherwise draw blind from the stock.
      const top = state.discard[state.discard.length - 1];
      if (top !== undefined && bestDeadwood([...hand, top]) < bestDeadwood(hand)) {
        return { type: "DRAW", from: "discard" };
      }
      if (state.stock.length > 0) return { type: "DRAW", from: "stock" };
      return top !== undefined ? { type: "DRAW", from: "discard" } : null;
    }
    // DISCARD phase: knock when possible (lowest remaining deadwood, so gin is
    // preferred); otherwise dump the card whose removal minimises deadwood.
    let discardCard: Card | null = null;
    let discardDead = Infinity;
    let knockCard: Card | null = null;
    let knockDead = Infinity;
    for (const c of hand) {
      if (c === state.drawnFromDiscard) continue;
      const dead = bestDeadwood(hand.filter((x) => x !== c));
      if (dead < discardDead) {
        discardDead = dead;
        discardCard = c;
      }
      if (dead <= KNOCK_MAX && dead < knockDead) {
        knockDead = dead;
        knockCard = c;
      }
    }
    if (knockCard !== null) return { type: "KNOCK", card: knockCard };
    return discardCard !== null ? { type: "DISCARD", card: discardCard } : null;
  },
};

/** Every candidate meld of `hand` as an index bitmask: sets (all size ≥3
 *  subsets, so 3-of-4 leaves the fourth free for a run) and runs (every
 *  same-suit consecutive sub-sequence of length ≥3, ace low). */
function candidateMelds(hand: Card[]): number[] {
  const masks: number[] = [];
  const maskOf = (idxs: number[]) => idxs.reduce((m, i) => m | (1 << i), 0);

  const byRank = new Map<string, number[]>();
  hand.forEach((c, i) => {
    const arr = byRank.get(rankOf(c)) ?? [];
    arr.push(i);
    byRank.set(rankOf(c), arr);
  });
  for (const idxs of byRank.values()) {
    if (idxs.length === 3) masks.push(maskOf(idxs));
    else if (idxs.length === 4) {
      masks.push(maskOf(idxs));
      for (let skip = 0; skip < 4; skip++) masks.push(maskOf(idxs.filter((_, k) => k !== skip)));
    }
  }

  const bySuit = new Map<string, number[]>();
  hand.forEach((c, i) => {
    const arr = bySuit.get(suitOf(c)) ?? [];
    arr.push(i);
    bySuit.set(suitOf(c), arr);
  });
  for (const idxs of bySuit.values()) {
    const sorted = idxs.slice().sort((a, b) => ord(hand[a]!) - ord(hand[b]!));
    let seg: number[] = [];
    let prev = -99;
    const flush = () => {
      for (let start = 0; start + 3 <= seg.length; start++) {
        for (let end = start + 3; end <= seg.length; end++) masks.push(maskOf(seg.slice(start, end)));
      }
    };
    for (const i of sorted) {
      const v = ord(hand[i]!);
      if (v === prev + 1) seg.push(i);
      else {
        flush();
        seg = [i];
      }
      prev = v;
    }
    flush();
  }
  return masks;
}

export interface MeldSplit {
  melds: Card[][];
  unmatched: Card[];
  deadwood: number;
}

/**
 * OPTIMAL meld cover of a hand: exhaustively picks non-overlapping candidate
 * melds minimising leftover points (exact, unlike the old greedy sets-first
 * pass, which e.g. broke 2-3-4-5-6♥ by stealing 4♥ into a set). A hand is
 * ≤11 cards, candidates are few — this is trivially fast and deterministic.
 */
export function bestMeldSplit(hand: Card[]): MeldSplit {
  const pts = hand.map((c) => deadwoodValue(rankOf(c)));
  const total = pts.reduce((a, b) => a + b, 0);
  const cands = candidateMelds(hand);
  const candPts = cands.map((m) => {
    let s = 0;
    for (let i = 0; i < hand.length; i++) if (m & (1 << i)) s += pts[i]!;
    return s;
  });

  let bestDead = total;
  let bestPick: number[] = [];
  const go = (from: number, used: number, saved: number, picked: number[]): void => {
    if (total - saved < bestDead) {
      bestDead = total - saved;
      bestPick = picked.slice();
    }
    for (let j = from; j < cands.length; j++) {
      const m = cands[j]!;
      if ((m & used) !== 0) continue;
      picked.push(j);
      go(j + 1, used | m, saved + candPts[j]!, picked);
      picked.pop();
    }
  };
  go(0, 0, 0, []);

  let usedMask = 0;
  const melds = bestPick.map((j) => {
    usedMask |= cands[j]!;
    const cards: Card[] = [];
    for (let i = 0; i < hand.length; i++) if (cands[j]! & (1 << i)) cards.push(hand[i]!);
    return cards.sort((a, b) => ord(a) - ord(b));
  });
  const unmatched = hand.filter((_, i) => (usedMask & (1 << i)) === 0);
  return { melds, unmatched, deadwood: bestDead };
}

/** Minimum deadwood for a hand (exact — see bestMeldSplit). */
export function bestDeadwood(hand: Card[]): number {
  return bestMeldSplit(hand).deadwood;
}

/** The optimal melds of a hand (sets of rank, runs of suit — ace low). */
export function meldsOf(hand: Card[]): Card[][] {
  return bestMeldSplit(hand).melds;
}

/** Can `card` extend one meld (set: 4th of the rank; run: adjacent low/high)? */
function extendsOne(card: Card, meld: Card[]): boolean {
  const r0 = rankOf(meld[0]!);
  if (meld.every((mc) => rankOf(mc) === r0)) return rankOf(card) === r0;
  if (suitOf(card) !== suitOf(meld[0]!)) return false;
  const vals = meld.map(ord);
  const cv = ord(card);
  return cv === Math.min(...vals) - 1 || cv === Math.max(...vals) + 1;
}

export interface LayoffSplit extends MeldSplit {
  /** Defender cards laid off onto (grown copies of) the knocker's melds. */
  laidOff: Card[];
}

/**
 * Defender's position after laying off onto the knocker's melds (§4.11):
 * deadwood that extends a knocker meld moves onto it, and lay-offs CHAIN —
 * after 8♥ joins 5-6-7♥ the run reaches 8, so 9♥ lays off too (fixpoint).
 * Lay-offs do not change the knocker's own count.
 */
export function layoffSplit(defenderHand: Card[], knockerMelds: Card[][]): LayoffSplit {
  const split = bestMeldSplit(defenderHand);
  const grown = knockerMelds.map((m) => m.slice());
  const remaining = split.unmatched.slice();
  const laidOff: Card[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const c = remaining[i]!;
      const target = grown.find((m) => extendsOne(c, m));
      if (!target) continue;
      target.push(c);
      laidOff.push(c);
      remaining.splice(i, 1);
      changed = true;
    }
  }
  const deadwood = remaining.reduce((s, c) => s + deadwoodValue(rankOf(c)), 0);
  return { melds: split.melds, unmatched: remaining, deadwood, laidOff };
}

/** Defender's deadwood after lay-offs (kept for tests/back-compat). */
export function deadwoodAfterLayoff(defenderHand: Card[], knockerMelds: Card[][]): number {
  return layoffSplit(defenderHand, knockerMelds).deadwood;
}
