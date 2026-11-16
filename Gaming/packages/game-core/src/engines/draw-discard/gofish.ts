import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, hiddenLike, rankOf, RANKS_52, type Card } from "../cards.js";

/**
 * Бръкни в морето (Go Fish) — 2–4p matching (§4.5). On your turn you ASK a
 * target player for a rank you hold. If they have cards of that rank they give
 * them all and you ask again; otherwise you "go fish" (draw from the ocean).
 * Fishing the very rank you asked for ("lucky fish") keeps the turn; any other
 * card passes it. Completing a set of 4 (a "book") scores a point. Game ends
 * when all 13 books are claimed; most books wins (ties: a WIN event per tied
 * seat). Deal: 7 cards each at 2 players, 5 at 3–4. Opponents' hands are
 * redacted.
 *
 * Everyone hears every ask, so the state keeps that public knowledge
 * (`noRank`): who was asked for which rank and had none — or just handed all
 * of it over — and has not picked up a card since. The bot never repeats such
 * an ask: once the ocean is empty a miss changes nothing, and the memoryless
 * bot used to repeat the same failing ask forever (≈ 1 in 5 four-bot tables
 * never finished).
 */

export interface GoFishState {
  hands: Card[][];
  ocean: Card[];
  books: number[]; // completed sets-of-4 per seat
  turn: Seat;
  seats: number;
  /** Public "seat:rank" pairs: that seat surely holds none of that rank (it
   *  was asked and had none, or gave all of it away) and has not picked up a
   *  card since. Optional for states saved before it existed. */
  noRank?: string[];
  winner: Seat | null;
  done: boolean;
}

export type GoFishAction = { type: "ASK"; target: Seat; rank: string };
export type GoFishEvent =
  | { type: "ASK"; seat: Seat; target: Seat; rank: string; got: number }
  /** `lucky` — fished exactly the asked rank, so the seat goes again. */
  | { type: "FISH"; seat: Seat; lucky: boolean }
  | { type: "BOOK"; seat: Seat; rank: string }
  | { type: "WIN"; seat: Seat };

const ranksInHand = (hand: Card[]): string[] => [...new Set(hand.map(rankOf))];
const noRankKey = (seat: Seat, rank: string): string => `${seat}:${rank}`;
/** `seat` picked up card(s): what we knew it lacked no longer holds. */
const forgetSeat = (state: GoFishState, seat: Seat): void => {
  state.noRank = (state.noRank ?? []).filter((k) => !k.startsWith(`${seat}:`));
};
/** Everyone now knows `seat` holds no `rank`. */
const learnNoRank = (state: GoFishState, seat: Seat, rank: string): void => {
  const k = noRankKey(seat, rank);
  if (!(state.noRank ?? []).includes(k)) state.noRank = [...(state.noRank ?? []), k];
};

export const goFishEngine: GameEngine<GoFishState, GoFishAction, GoFishEvent> = {
  init(opts: InitOpts, rng: SeededRng): GoFishState {
    const seats = Math.min(Math.max(opts.seats, 2), 4);
    const deck = rng.shuffle(buildDeck(RANKS_52));
    // Classic deal: 7 cards each head-to-head, 5 with 3-4 players.
    const handSize = seats === 2 ? 7 : 5;
    const hands: Card[][] = [];
    for (let s = 0; s < seats; s++) hands.push(deck.splice(0, handSize));
    const state: GoFishState = {
      hands,
      ocean: deck,
      books: new Array<number>(seats).fill(0),
      turn: 0,
      seats,
      noRank: [],
      winner: null,
      done: false,
    };
    for (let s = 0; s < seats; s++) collectBooks(state, s);
    return state;
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    const hand = state.hands[seat]!;
    if (hand.length === 0) return []; // resolved automatically in reduce flow
    const actions: GoFishAction[] = [];
    for (let target = 0; target < state.seats; target++) {
      if (target === seat) continue;
      if (state.hands[target]!.length === 0) continue;
      for (const rank of ranksInHand(hand)) actions.push({ type: "ASK", target, rank });
    }
    return actions;
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    if (action.type !== "ASK") throw new IllegalActionError("Only ASK");
    const seat = state.turn;
    const hand = state.hands[seat]!;
    if (!hand.some((c) => rankOf(c) === action.rank)) {
      throw new IllegalActionError("Must ask for a rank you hold");
    }
    if (action.target === seat || action.target < 0 || action.target >= state.seats) {
      throw new IllegalActionError("Bad target");
    }

    const next: GoFishState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      ocean: state.ocean.slice(),
      books: state.books.slice(),
      noRank: (state.noRank ?? []).slice(),
    };
    const events: GoFishEvent[] = [];
    const targetHand = next.hands[action.target]!;
    const matches = targetHand.filter((c) => rankOf(c) === action.rank);

    if (matches.length > 0) {
      next.hands[action.target] = targetHand.filter((c) => rankOf(c) !== action.rank);
      next.hands[seat]!.push(...matches);
      forgetSeat(next, seat);
      learnNoRank(next, action.target, action.rank); // handed over every one
      events.push({ type: "ASK", seat, target: action.target, rank: action.rank, got: matches.length });
      collectBooks(next, seat, events);
      // Same player asks again (turn unchanged) unless out of cards.
    } else {
      events.push({ type: "ASK", seat, target: action.target, rank: action.rank, got: 0 });
      learnNoRank(next, action.target, action.rank); // "go fish!" — heard by all
      const drawn = next.ocean.shift();
      // Lucky fish: drawing the very rank you asked for keeps the turn.
      let lucky = false;
      if (drawn) {
        next.hands[seat]!.push(drawn);
        forgetSeat(next, seat);
        lucky = rankOf(drawn) === action.rank;
        events.push({ type: "FISH", seat, lucky });
        collectBooks(next, seat, events);
      }
      if (!lucky) next.turn = nextActiveSeat(next, seat);
    }

    // Refill an empty hand from the ocean if possible; skip seats that can't act.
    replenish(next);
    if (allBooksClaimed(next)) return finish(next, events);
    if (next.hands[next.turn]!.length === 0) next.turn = nextActiveSeat(next, next.turn);
    if (next.hands.every((h) => h.length === 0)) return finish(next, events);

    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const max = Math.max(...state.books);
    return state.books.map((b, seat) => ({
      seat,
      result: b === max ? "win" : "loss",
      points: b,
    }));
  },

  redact(state, seat) {
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    return { ...state, hands, ocean: hiddenLike(state.ocean) };
  },

  /** Heuristic bot: ask for the rank it holds the MOST of (closest to a book),
   *  targeting the opponent with the biggest hand (likeliest to hold it) — but
   *  never an ask everyone already heard fail (`noRank`). */
  bot(state, seat, rng) {
    if (state.done || seat !== state.turn) return null;
    const legal = goFishEngine.legalActions(state, seat) as GoFishAction[];
    if (legal.length === 0) return null;
    // With an empty ocean there is always a fresh ask (the other copies of a
    // held rank sit in some hand nobody has ruled out), so this never stalls.
    const known = new Set(state.noRank ?? []);
    const fresh = legal.filter((a) => !known.has(noRankKey(a.target, a.rank)));
    const actions = fresh.length > 0 ? fresh : legal;
    const held: Record<string, number> = {};
    for (const c of state.hands[seat]!) held[rankOf(c)] = (held[rankOf(c)] ?? 0) + 1;
    let best = actions[0]!;
    let bestScore = -Infinity;
    for (const a of actions) {
      const score = (held[a.rank] ?? 1) * 10 + state.hands[a.target]!.length + rng.next();
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  },
};

/** Move any completed 4-of-a-kind from a seat's hand into its book count. */
function collectBooks(state: GoFishState, seat: Seat, events?: GoFishEvent[]): void {
  const counts = new Map<string, Card[]>();
  for (const c of state.hands[seat]!) {
    const arr = counts.get(rankOf(c)) ?? [];
    arr.push(c);
    counts.set(rankOf(c), arr);
  }
  for (const [rank, cards] of counts) {
    if (cards.length === 4) {
      state.hands[seat] = state.hands[seat]!.filter((c) => rankOf(c) !== rank);
      state.books[seat] = (state.books[seat] ?? 0) + 1;
      events?.push({ type: "BOOK", seat, rank });
    }
  }
}

function replenish(state: GoFishState): void {
  for (let s = 0; s < state.seats; s++) {
    if (state.hands[s]!.length === 0 && state.ocean.length > 0) {
      const drawn = state.ocean.shift();
      if (drawn) {
        state.hands[s]!.push(drawn);
        forgetSeat(state, s);
        collectBooks(state, s);
      }
    }
  }
}

function nextActiveSeat(state: GoFishState, from: Seat): Seat {
  for (let i = 1; i <= state.seats; i++) {
    const cand = (from + i) % state.seats;
    if (state.hands[cand]!.length > 0 || state.ocean.length > 0) return cand;
  }
  return from;
}

function allBooksClaimed(state: GoFishState): boolean {
  return state.books.reduce((a, b) => a + b, 0) >= 13;
}

function finish(state: GoFishState, events: GoFishEvent[]): { state: GoFishState; events: GoFishEvent[] } {
  const max = Math.max(...state.books);
  // On a tie every seat with the max gets a WIN event (consistent with score(),
  // which marks them all "win"); state.winner keeps the first for compat.
  const winner = state.books.findIndex((b) => b === max);
  for (let s = 0; s < state.seats; s++) {
    if (state.books[s] === max) events.push({ type: "WIN", seat: s });
  }
  return { state: { ...state, winner, done: true }, events };
}
