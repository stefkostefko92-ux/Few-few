import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, RANK_VALUE, RANKS_52, rankOf, suitOf, hiddenLike, type Card } from "../cards.js";

/**
 * Тексас Холдем — 2–9p with VIRTUAL chips only (§4.12, §11.4). Blinds, hole
 * cards, four streets (preflop/flop/turn/river), CHECK/CALL/BET/RAISE/FOLD, and
 * a 5-of-7 hand evaluator at showdown. STRICTLY social gaming with virtual
 * chips — never real-money gambling, never cashed out. Main + side pots are
 * distributed by contribution level (distributePots); all-in beyond stack is
 * clamped to the player's chips.
 */

const SMALL_BLIND = 5;
const BIG_BLIND = 10;
const STARTING_CHIPS = 1000;
/** Мачът: ръце до отпадане на всички освен един, но не повече от MAX_HANDS. */
export const MAX_HANDS = 25;

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export interface HoldemState {
  hole: Card[][]; // 2 per seat
  community: Card[]; // up to 5
  deck: Card[];
  chips: number[];
  bet: number[]; // contributed this street
  totalBet: number[]; // contributed across the hand (for pot)
  folded: boolean[];
  allIn: boolean[];
  pot: number;
  currentBet: number; // highest bet this street
  lastRaise: number; // size of last raise (min re-raise)
  street: Street;
  turn: Seat;
  button: Seat;
  actedThisStreet: boolean[];
  seats: number;
  /** Номер на текущата ръка; мачът свършва при 1 оцелял или MAX_HANDS. */
  handNo: number;
  winner: Seat | null;
  done: boolean;
}

export type HoldemAction =
  | { type: "FOLD" }
  | { type: "CHECK" }
  | { type: "CALL" }
  | { type: "BET" } // bet/raise by one step (BIG_BLIND)
  | { type: "RAISE" };

export type HoldemEvent =
  | { type: "BLIND"; seat: Seat; amount: number }
  | { type: "DEAL"; street: Street; community: Card[] }
  | { type: "FOLD"; seat: Seat }
  | { type: "CHECK"; seat: Seat }
  | { type: "CALL"; seat: Seat; amount: number }
  | { type: "BET"; seat: Seat; to: number }
  | { type: "RAISE"; seat: Seat; to: number }
  | { type: "SHOWDOWN"; seat: Seat; rank: number }
  | { type: "WIN"; seat: Seat; pot: number }
  | { type: "HAND"; handNo: number }
  | { type: "MATCH"; seat: Seat };

export const HOLDEM_VIRTUAL_CHIPS_NOTICE =
  "Социална игра с виртуални чипове — не е хазарт за реални пари.";

export const holdemEngine: GameEngine<HoldemState, HoldemAction, HoldemEvent> = {
  init(opts: InitOpts, rng: SeededRng): HoldemState {
    const seats = Math.min(Math.max(opts.seats, 2), 9);
    const deck = rng.shuffle(buildDeck(RANKS_52));
    const hole: Card[][] = [];
    for (let s = 0; s < seats; s++) hole.push(deck.splice(0, 2));

    const chips = new Array<number>(seats).fill(STARTING_CHIPS);
    const bet = new Array<number>(seats).fill(0);
    const totalBet = new Array<number>(seats).fill(0);

    const button = 0;
    const sbSeat = seats === 2 ? button : (button + 1) % seats;
    const bbSeat = seats === 2 ? (button + 1) % seats : (button + 2) % seats;
    postBlind(chips, bet, totalBet, sbSeat, SMALL_BLIND);
    postBlind(chips, bet, totalBet, bbSeat, BIG_BLIND);

    const state: HoldemState = {
      hole,
      community: [],
      deck,
      chips,
      bet,
      totalBet,
      folded: new Array<boolean>(seats).fill(false),
      allIn: new Array<boolean>(seats).fill(false),
      pot: SMALL_BLIND + BIG_BLIND,
      currentBet: BIG_BLIND,
      lastRaise: BIG_BLIND,
      street: "preflop",
      turn: (bbSeat + 1) % seats,
      button,
      actedThisStreet: new Array<boolean>(seats).fill(false),
      seats,
      handNo: 1,
      winner: null,
      done: false,
    };
    return state;
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    if (state.folded[seat] || state.allIn[seat]) return [];
    const toCall = state.currentBet - (state.bet[seat] ?? 0);
    const stack = state.chips[seat] ?? 0;
    const actions: HoldemAction[] = [{ type: "FOLD" }];
    if (toCall === 0) actions.push({ type: "CHECK" });
    if (toCall > 0 && stack > 0) actions.push({ type: "CALL" });
    // Bet (no current bet) or raise (facing a bet) by one step if affordable.
    if (toCall === 0 && stack >= BIG_BLIND) actions.push({ type: "BET" });
    if (toCall > 0 && stack >= toCall + state.lastRaise) actions.push({ type: "RAISE" });
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
    return state.hole.map((_, seat) => ({
      seat,
      result: seat === winner ? "win" : "loss",
      points: state.chips[seat] ?? 0,
    }));
  },

  redact(state, seat) {
    const hole = state.hole.map((h, i) => (i === seat || state.done ? h.slice() : hiddenLike(h)));
    return { ...state, hole, deck: hiddenLike(state.deck) };
  },
};

/** One betting action inside the current hand (the original single-hand reducer). */
function reduceHand(
  state: HoldemState,
  action: HoldemAction,
): { state: HoldemState; events: HoldemEvent[] } {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    if (state.folded[seat] || state.allIn[seat]) throw new IllegalActionError("Cannot act");
    const next = clone(state);
    const events: HoldemEvent[] = [];
    const toCall = next.currentBet - (next.bet[seat] ?? 0);
    next.actedThisStreet[seat] = true;

    switch (action.type) {
      case "FOLD":
        next.folded[seat] = true;
        events.push({ type: "FOLD", seat });
        break;
      case "CHECK":
        if (toCall !== 0) throw new IllegalActionError("Cannot check facing a bet");
        events.push({ type: "CHECK", seat });
        break;
      case "CALL": {
        const amt = Math.min(toCall, next.chips[seat] ?? 0);
        contribute(next, seat, amt);
        if ((next.chips[seat] ?? 0) === 0) next.allIn[seat] = true;
        events.push({ type: "CALL", seat, amount: amt });
        break;
      }
      case "BET": {
        if (toCall !== 0) throw new IllegalActionError("Use RAISE facing a bet");
        const amt = Math.min(BIG_BLIND, next.chips[seat] ?? 0);
        contribute(next, seat, amt);
        next.currentBet = next.bet[seat] ?? 0;
        next.lastRaise = amt;
        resetActed(next, seat);
        if ((next.chips[seat] ?? 0) === 0) next.allIn[seat] = true;
        events.push({ type: "BET", seat, to: next.currentBet });
        break;
      }
      case "RAISE": {
        if (toCall <= 0) throw new IllegalActionError("Nothing to raise");
        const amt = Math.min(toCall + next.lastRaise, next.chips[seat] ?? 0);
        contribute(next, seat, amt);
        next.lastRaise = (next.bet[seat] ?? 0) - next.currentBet;
        next.currentBet = next.bet[seat] ?? 0;
        resetActed(next, seat);
        if ((next.chips[seat] ?? 0) === 0) next.allIn[seat] = true;
        events.push({ type: "RAISE", seat, to: next.currentBet });
        break;
      }
    }

    // Only one player left -> they win the pot.
    if (activeSeats(next).length === 1) {
      return award(next, activeSeats(next)[0]!, events);
    }

    if (streetComplete(next)) {
      return advanceStreet(next, events);
    }
    next.turn = nextToAct(next, seat);
    return { state: next, events };
}

/** After a finished hand: end the match (1 survivor / hand cap) or deal again. */
function nextHandOrEnd(
  state: HoldemState,
  events: HoldemEvent[],
  rng: SeededRng,
): { state: HoldemState; events: HoldemEvent[] } {
  const alive: Seat[] = [];
  for (let s = 0; s < state.seats; s++) if ((state.chips[s] ?? 0) > 0) alive.push(s);

  if (alive.length <= 1 || state.handNo >= MAX_HANDS) {
    // Мачът свършва: печели чиплидерът.
    let winner: Seat = alive[0] ?? 0;
    for (let s = 0; s < state.seats; s++) {
      if ((state.chips[s] ?? 0) > (state.chips[winner] ?? 0)) winner = s as Seat;
    }
    events.push({ type: "MATCH", seat: winner });
    return { state: { ...state, winner, done: true }, events };
  }

  // Следваща ръка: местим бутона на следващия оцелял и раздаваме наново.
  const next = clone(state);
  next.done = false;
  next.winner = null;
  next.handNo += 1;
  const nextAlive = (from: Seat): Seat => {
    for (let i = 1; i <= next.seats; i++) {
      const cand = ((from + i) % next.seats) as Seat;
      if ((next.chips[cand] ?? 0) > 0) return cand;
    }
    return from;
  };
  next.button = nextAlive(next.button);

  const deck = rng.shuffle(buildDeck(RANKS_52));
  next.deck = deck;
  next.community = [];
  next.pot = 0;
  next.currentBet = 0;
  next.lastRaise = BIG_BLIND;
  next.street = "preflop";
  for (let s = 0; s < next.seats; s++) {
    const busted = (next.chips[s] ?? 0) <= 0;
    next.hole[s] = busted ? [] : next.deck.splice(0, 2);
    next.bet[s] = 0;
    next.totalBet[s] = 0;
    next.folded[s] = busted; // отпадналите са трайно извън играта
    next.allIn[s] = false;
    next.actedThisStreet[s] = false;
  }

  const sbSeat = alive.length === 2 ? next.button : nextAlive(next.button);
  const bbSeat = nextAlive(sbSeat);
  postBlind(next.chips, next.bet, next.totalBet, sbSeat, SMALL_BLIND);
  postBlind(next.chips, next.bet, next.totalBet, bbSeat, BIG_BLIND);
  if ((next.chips[sbSeat] ?? 0) === 0) next.allIn[sbSeat] = true;
  if ((next.chips[bbSeat] ?? 0) === 0) next.allIn[bbSeat] = true;
  next.pot = (next.bet[sbSeat] ?? 0) + (next.bet[bbSeat] ?? 0);
  next.currentBet = Math.max(next.bet[sbSeat] ?? 0, next.bet[bbSeat] ?? 0);
  next.turn = nextAlive(bbSeat);
  events.push({ type: "HAND", handNo: next.handNo });
  return { state: next, events };
}

// ---- helpers ----

function postBlind(
  chips: number[],
  bet: number[],
  totalBet: number[],
  seat: Seat,
  amount: number,
): void {
  const amt = Math.min(amount, chips[seat] ?? 0);
  chips[seat] = (chips[seat] ?? 0) - amt;
  bet[seat] = (bet[seat] ?? 0) + amt;
  totalBet[seat] = (totalBet[seat] ?? 0) + amt;
}

function clone(s: HoldemState): HoldemState {
  return {
    ...s,
    hole: s.hole.map((h) => h.slice()),
    community: s.community.slice(),
    deck: s.deck.slice(),
    chips: s.chips.slice(),
    bet: s.bet.slice(),
    totalBet: s.totalBet.slice(),
    folded: s.folded.slice(),
    allIn: s.allIn.slice(),
    actedThisStreet: s.actedThisStreet.slice(),
  };
}

function contribute(state: HoldemState, seat: Seat, amount: number): void {
  state.chips[seat] = (state.chips[seat] ?? 0) - amount;
  state.bet[seat] = (state.bet[seat] ?? 0) + amount;
  state.totalBet[seat] = (state.totalBet[seat] ?? 0) + amount;
  state.pot += amount;
}

function resetActed(state: HoldemState, raiser: Seat): void {
  for (let s = 0; s < state.seats; s++) {
    if (s !== raiser && !state.folded[s] && !state.allIn[s]) state.actedThisStreet[s] = false;
  }
}

function activeSeats(state: HoldemState): Seat[] {
  const out: Seat[] = [];
  for (let s = 0; s < state.seats; s++) if (!state.folded[s]) out.push(s);
  return out;
}

function canAct(state: HoldemState, seat: Seat): boolean {
  return !state.folded[seat] && !state.allIn[seat];
}

function nextToAct(state: HoldemState, from: Seat): Seat {
  for (let i = 1; i <= state.seats; i++) {
    const cand = (from + i) % state.seats;
    if (canAct(state, cand)) return cand;
  }
  return from;
}

function streetComplete(state: HoldemState): boolean {
  const actionable = [];
  for (let s = 0; s < state.seats; s++) if (canAct(state, s)) actionable.push(s);
  if (actionable.length === 0) return true;
  return actionable.every(
    (s) => state.actedThisStreet[s] && state.bet[s] === state.currentBet,
  );
}

function advanceStreet(
  state: HoldemState,
  events: HoldemEvent[],
): { state: HoldemState; events: HoldemEvent[] } {
  const next = state;
  // Reset per-street betting.
  for (let s = 0; s < next.seats; s++) {
    next.bet[s] = 0;
    next.actedThisStreet[s] = false;
  }
  next.currentBet = 0;
  next.lastRaise = BIG_BLIND;

  if (next.street === "preflop") {
    next.community.push(...next.deck.splice(0, 3));
    next.street = "flop";
    events.push({ type: "DEAL", street: "flop", community: next.community.slice() });
  } else if (next.street === "flop") {
    next.community.push(...next.deck.splice(0, 1));
    next.street = "turn";
    events.push({ type: "DEAL", street: "turn", community: next.community.slice() });
  } else if (next.street === "turn") {
    next.community.push(...next.deck.splice(0, 1));
    next.street = "river";
    events.push({ type: "DEAL", street: "river", community: next.community.slice() });
  } else {
    return showdown(next, events);
  }

  // If <2 players can still act, deal out remaining streets then showdown.
  if (activeSeats(next).filter((s) => canAct(next, s)).length < 2 && activeSeats(next).length >= 2) {
    return advanceStreet(next, events);
  }

  next.turn = firstToActPostflop(next);
  return { state: next, events };
}

function firstToActPostflop(state: HoldemState): Seat {
  return nextToAct(state, state.button);
}

function showdown(
  state: HoldemState,
  events: HoldemEvent[],
): { state: HoldemState; events: HoldemEvent[] } {
  // Evaluate each active hand once; folded seats are ineligible (rank -1).
  const ranks = new Array<number>(state.seats).fill(-1);
  for (const s of activeSeats(state)) {
    const rank = evaluate7([...state.hole[s]!, ...state.community]);
    ranks[s] = rank;
    events.push({ type: "SHOWDOWN", seat: s, rank });
  }
  return distributePots(state, (s) => ranks[s] ?? -1, events);
}

/** Award the whole pot to one seat (used when everyone else folded). */
function award(
  state: HoldemState,
  winner: Seat,
  events: HoldemEvent[],
): { state: HoldemState; events: HoldemEvent[] } {
  state.chips[winner] = (state.chips[winner] ?? 0) + state.pot;
  events.push({ type: "WIN", seat: winner, pot: state.pot });
  state.street = "showdown";
  return { state: { ...state, winner, done: true }, events };
}

/**
 * Distribute into main + side pots by each player's total contribution (§4.12).
 * Each pot layer is contested only by players who put in at least that layer and
 * haven't folded; it goes to the best eligible hand (split on ties, odd chip to
 * the earliest seat). Headline winner = largest single award.
 */
export function distributePots(
  state: HoldemState,
  rankOfSeat: (seat: Seat) => number,
  events: HoldemEvent[],
): { state: HoldemState; events: HoldemEvent[] } {
  const seats = state.seats;
  const contrib = state.totalBet.slice();
  const folded = state.folded.slice();
  const won = new Array<number>(seats).fill(0);

  const levels = [...new Set(contrib.filter((c) => c > 0))].sort((a, b) => a - b);
  let prev = 0;
  for (const level of levels) {
    const layerWidth = level - prev;
    if (layerWidth > 0) {
      const contributors: Seat[] = [];
      for (let s = 0; s < seats; s++) if ((contrib[s] ?? 0) >= level) contributors.push(s as Seat);
      const layerTotal = layerWidth * contributors.length;
      const eligible = contributors.filter((s) => !folded[s]);
      if (eligible.length > 0) {
        const best = Math.max(...eligible.map((s) => rankOfSeat(s)));
        const winners = eligible.filter((s) => rankOfSeat(s) === best);
        const share = Math.floor(layerTotal / winners.length);
        let remainder = layerTotal - share * winners.length;
        for (const w of winners) {
          won[w] = (won[w] ?? 0) + share + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
        }
      }
    }
    prev = level;
  }

  for (let s = 0; s < seats; s++) {
    if ((won[s] ?? 0) > 0) state.chips[s] = (state.chips[s] ?? 0) + (won[s] ?? 0);
  }
  let winner: Seat = 0;
  let bestWon = -1;
  for (let s = 0; s < seats; s++) {
    if ((won[s] ?? 0) > bestWon) {
      bestWon = won[s] ?? 0;
      winner = s as Seat;
    }
  }
  events.push({ type: "WIN", seat: winner, pot: state.pot });
  state.street = "showdown";
  return { state: { ...state, winner, done: true }, events };
}

/**
 * Evaluate the best 5-card hand from 7 cards, returning a comparable integer.
 * Category (8=straight flush .. 0=high card) in the high digits, then up to 5
 * kicker ranks in base-15.
 */
export function evaluate7(cards: Card[]): number {
  let best = 0;
  const idxs = cards.map((_, i) => i);
  // choose 5 of 7
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++) {
            const hand = [idxs[a]!, idxs[b]!, idxs[c]!, idxs[d]!, idxs[e]!].map((i) => cards[i]!);
            const r = evaluate5(hand);
            if (r > best) best = r;
          }
  return best;
}

function evaluate5(cards: Card[]): number {
  const vals = cards.map((c) => RANK_VALUE[rankOf(c)] ?? 0).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const isFlush = suits.every((s) => s === suits[0]);

  const uniq = [...new Set(vals)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5 && uniq[0]! - uniq[4]! === 4) straightHigh = uniq[0]!;
  // wheel A-2-3-4-5
  if (uniq.length === 5 && uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;

  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  const shape = groups.map((g) => g[1]);
  const ordered = groups.map((g) => g[0]);

  let category: number;
  if (straightHigh && isFlush) category = 8;
  else if (shape[0] === 4) category = 7;
  else if (shape[0] === 3 && shape[1] === 2) category = 6;
  else if (isFlush) category = 5;
  else if (straightHigh) category = 4;
  else if (shape[0] === 3) category = 3;
  else if (shape[0] === 2 && shape[1] === 2) category = 2;
  else if (shape[0] === 2) category = 1;
  else category = 0;

  const kickers = straightHigh && category === 4 ? [straightHigh] : ordered;
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (kickers[i] ?? 0);
  return score;
}
