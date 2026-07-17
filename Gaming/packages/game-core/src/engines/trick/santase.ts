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
 * Сантасе / 66 — 2-player trick-taking with a trump and marriages (§4.2).
 * 24-card deck (9,J,Q,K,T,A x 4). Server-authoritative; opponent's hand and the
 * face-down stock are redacted per seat.
 *
 * Phase 1 (stock open, not closed): no obligation to follow suit; after each
 * trick the winner draws the top stock card, the loser the next. A player on
 * lead may also close the stock, exchange the trump nine for the face-up trump
 * (only AFTER having won a trick), or declare a marriage (K+Q same suit: 20, or
 * 40 in trump). A marriage may be declared even before winning any trick (an
 * opening marriage), but its 20/40 are CONDITIONAL: they are held pending and
 * only score once the announcer wins at least one trick; if the announcer never
 * takes a trick, the pending points are discarded (schwarz → opponent 3).
 * Phase 2 (stock closed or exhausted): must follow suit and head the trick when
 * able; if void of the led suit, must play a trump.
 *
 * Closed-stock penalty enforced (§4.2): if the closer fails to reach 66, the
 * opponent wins 2 game points (3 if the closer had taken no trick when closing).
 * If neither side reaches 66 in open play, the last trick's winner takes the
 * deal at 1 game point.
 */

const RANKS = ["9", "J", "Q", "K", "T", "A"] as const;
const VALUE: Record<string, number> = { A: 11, T: 10, K: 4, Q: 3, J: 2, "9": 0 };
const STRENGTH: Record<string, number> = { A: 6, T: 5, K: 4, Q: 3, J: 2, "9": 1 };

interface Play {
  seat: Seat;
  card: Card;
}

export interface SantaseState {
  hands: Card[][];
  stock: Card[];
  trump: Suit;
  trumpCard: Card | null;
  turn: Seat;
  leader: Seat;
  trick: Play[];
  points: [number, number];
  wonTrick: [boolean, boolean];
  /** Conditional marriage points per seat, awaiting a first trick (§4.2). */
  pendingMarriage: [number, number];
  closed: boolean;
  /** Seat that closed the talon (null if never closed). */
  closedBy: Seat | null;
  /** Whether the OPPONENT had a trick when the talon was closed (penalty 2 vs 3). */
  oppHadTrickAtClose: boolean;
  /** Game points the winner earned in the LAST finished deal (1/2/3). */
  gamePoints: number;
  lastTrickWinner: Seat | null;
  /** Running match points; first to MATCH_TARGET_GP (11) wins the match. */
  matchPoints: [number, number];
  dealNo: number;
  /** Who leads the first trick of the current deal (alternates per deal). */
  firstLeader: Seat;
  /** Winner of the last finished deal (display between deals). */
  lastDealWinner: Seat | null;
  winner: Seat | null;
  done: boolean;
}

export type SantaseAction =
  | { type: "PLAY"; card: Card; marriage?: boolean }
  | { type: "CLOSE" }
  | { type: "EXCHANGE" };

export type SantaseEvent =
  | { type: "PLAY"; seat: Seat; card: Card }
  | { type: "MARRIAGE"; seat: Seat; suit: Suit; value: number }
  | { type: "EXCHANGE"; seat: Seat }
  | { type: "CLOSE"; seat: Seat }
  | { type: "TRICK"; seat: Seat; points: number }
  | { type: "WIN"; seat: Seat }
  | { type: "DEAL_END"; seat: Seat; gamePoints: number; matchPoints: [number, number] }
  | { type: "MATCH"; seat: Seat };

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);
const isPhase2 = (s: SantaseState): boolean =>
  s.closed || (s.stock.length === 0 && s.trumpCard === null);

function beats(a: Card, b: Card, leadSuit: Suit, trump: Suit): boolean {
  const aT = suitOf(a) === trump;
  const bT = suitOf(b) === trump;
  if (aT && !bT) return true;
  if (!aT && bT) return false;
  if (suitOf(a) !== suitOf(b)) return suitOf(a) === leadSuit && suitOf(b) !== leadSuit;
  return (STRENGTH[rankOf(a)] ?? 0) > (STRENGTH[rankOf(b)] ?? 0);
}

function hasMarriagePartner(hand: Card[], card: Card): boolean {
  const r = rankOf(card);
  if (r !== "K" && r !== "Q") return false;
  const partner = (r === "K" ? "Q" : "K") + suitOf(card);
  return hand.includes(partner);
}

/** Standard game points for a normal win, by the loser's card points. */
function normalGamePoints(loserPoints: number): number {
  return loserPoints === 0 ? 3 : loserPoints < 33 ? 2 : 1;
}

/** Мачът се играе до 11 точки (раздаванията носят 1/2/3). */
export const MATCH_TARGET_GP = 11;

/** Reset all per-deal fields and deal the next hand. */
function freshDeal(state: SantaseState, rng: SeededRng): void {
  const deck = rng.shuffle(buildDeck(RANKS));
  const trumpCard = deck[12]!;
  state.hands = [deck.slice(0, 6), deck.slice(6, 12)];
  state.stock = deck.slice(13);
  state.trump = suitOf(trumpCard);
  state.trumpCard = trumpCard;
  state.trick = [];
  state.points = [0, 0];
  state.wonTrick = [false, false];
  state.pendingMarriage = [0, 0];
  state.closed = false;
  state.closedBy = null;
  state.oppHadTrickAtClose = false;
  state.lastTrickWinner = null;
  state.firstLeader = other(state.firstLeader);
  state.leader = state.firstLeader;
  state.turn = state.firstLeader;
  state.dealNo += 1;
}

/** Award `gp` to the deal winner; end the match at 11 or deal again. */
function settle(
  state: SantaseState,
  winner: Seat,
  gp: number,
  events: SantaseEvent[],
  rng: SeededRng,
): { state: SantaseState; events: SantaseEvent[] } {
  state.gamePoints = gp;
  state.lastDealWinner = winner;
  state.matchPoints = [
    state.matchPoints[0] + (winner === 0 ? gp : 0),
    state.matchPoints[1] + (winner === 1 ? gp : 0),
  ];
  events.push({ type: "WIN", seat: winner });
  events.push({ type: "DEAL_END", seat: winner, gamePoints: gp, matchPoints: [...state.matchPoints] });
  if ((state.matchPoints[winner] ?? 0) >= MATCH_TARGET_GP) {
    state.winner = winner;
    state.done = true;
    events.push({ type: "MATCH", seat: winner });
  } else {
    freshDeal(state, rng);
  }
  return { state, events };
}

function finish(
  state: SantaseState,
  winner: Seat,
  events: SantaseEvent[],
  rng: SeededRng,
): { state: SantaseState; events: SantaseEvent[] } {
  return settle(state, winner, normalGamePoints(state.points[other(winner)] ?? 0), events, rng);
}

/**
 * Finish after a CLOSED talon. If the closer reached 66 they win normally; if
 * they failed, the OPPONENT wins and is awarded a penalty: 3 game points if the
 * closer had no trick when closing, otherwise 2 (and at least what they'd score
 * normally). This is the traditional "затваряне" penalty (§4.2).
 */
function finishClosed(
  state: SantaseState,
  events: SantaseEvent[],
  rng: SeededRng,
): { state: SantaseState; events: SantaseEvent[] } {
  const closer = state.closedBy!;
  const opp = other(closer);
  if ((state.points[closer] ?? 0) >= 66) {
    return finish(state, closer, events, rng);
  }
  // Closer failed → opponent wins with a penalty.
  // 3 точки, ако противникът е бил без взятка при затварянето; иначе 2.
  const penalty = state.oppHadTrickAtClose ? 2 : 3;
  return settle(state, opp, Math.max(penalty, normalGamePoints(state.points[closer] ?? 0)), events, rng);
}

export const santaseEngine: GameEngine<SantaseState, SantaseAction, SantaseEvent> = {
  init(_opts: InitOpts, rng: SeededRng): SantaseState {
    const deck = rng.shuffle(buildDeck(RANKS));
    const trumpCard = deck[12]!;
    return {
      hands: [deck.slice(0, 6), deck.slice(6, 12)],
      stock: deck.slice(13),
      trump: suitOf(trumpCard),
      trumpCard,
      turn: 0,
      leader: 0,
      trick: [],
      points: [0, 0],
      wonTrick: [false, false],
      pendingMarriage: [0, 0],
      closed: false,
      closedBy: null,
      oppHadTrickAtClose: false,
      gamePoints: 1,
      lastTrickWinner: null,
      matchPoints: [0, 0],
      dealNo: 1,
      firstLeader: 0,
      lastDealWinner: null,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    const hand = state.hands[seat]!;
    const onLead = state.trick.length === 0;
    const actions: SantaseAction[] = [];

    if (onLead) {
      const canDraw = state.stock.length >= 1 && state.trumpCard !== null && !state.closed;
      if (canDraw) actions.push({ type: "CLOSE" });
      // Размяна на трупната 9 — само след поне една спечелена взятка (Pagat 66).
      if (canDraw && state.wonTrick[seat] && hand.includes(`9${state.trump}`)) {
        actions.push({ type: "EXCHANGE" });
      }
      for (const card of hand) {
        actions.push({ type: "PLAY", card });
        // Женитбата може да се обяви и без спечелена взятка (встъпителна) —
        // точките са условни (виж reduce), но обявата е винаги позволена.
        if (hasMarriagePartner(hand, card)) {
          actions.push({ type: "PLAY", card, marriage: true });
        }
      }
      return actions;
    }

    const lead = state.trick[0]!.card;
    const leadSuit = suitOf(lead);
    if (!isPhase2(state)) {
      for (const card of hand) actions.push({ type: "PLAY", card });
      return actions;
    }
    const sameSuit = hand.filter((c) => suitOf(c) === leadSuit);
    if (sameSuit.length > 0) {
      const winning = sameSuit.filter((c) => beats(c, lead, leadSuit, state.trump));
      const pool = winning.length > 0 ? winning : sameSuit;
      for (const card of pool) actions.push({ type: "PLAY", card });
      return actions;
    }
    const trumps = hand.filter((c) => suitOf(c) === state.trump);
    const pool = trumps.length > 0 ? trumps : hand;
    for (const card of pool) actions.push({ type: "PLAY", card });
    return actions;
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const legal = this.legalActions(state, seat);
    const matches = (a: SantaseAction, b: SantaseAction): boolean => {
      if (a.type !== b.type) return false;
      if (a.type === "PLAY" && b.type === "PLAY") {
        return a.card === b.card && Boolean(a.marriage) === Boolean(b.marriage);
      }
      return true;
    };
    if (!legal.some((l) => matches(l, action))) {
      throw new IllegalActionError(`Illegal santase action ${JSON.stringify(action)}`);
    }

    const next: SantaseState = {
      ...state,
      hands: [state.hands[0]!.slice(), state.hands[1]!.slice()],
      stock: state.stock.slice(),
      trick: state.trick.slice(),
      points: [state.points[0], state.points[1]],
      wonTrick: [state.wonTrick[0], state.wonTrick[1]],
      pendingMarriage: [state.pendingMarriage[0], state.pendingMarriage[1]],
      matchPoints: [state.matchPoints[0], state.matchPoints[1]],
    };
    const events: SantaseEvent[] = [];

    if (action.type === "EXCHANGE") {
      // 24-картово Сантасе: разменя се ДЕВЕТКАТА на коза (не Валето — това е
      // правилото на 20-картовия Schnapsen).
      const nine = `9${next.trump}`;
      next.hands[seat] = next.hands[seat]!.filter((c) => c !== nine);
      next.hands[seat]!.push(next.trumpCard!);
      next.trumpCard = nine;
      events.push({ type: "EXCHANGE", seat });
      return { state: next, events };
    }

    if (action.type === "CLOSE") {
      next.closed = true;
      next.closedBy = seat;
      next.oppHadTrickAtClose = next.wonTrick[other(seat)] ?? false;
      events.push({ type: "CLOSE", seat });
      return { state: next, events };
    }

    if (action.marriage) {
      const suit = suitOf(action.card);
      const value = suit === next.trump ? 40 : 20;
      events.push({ type: "MARRIAGE", seat, suit, value });
      if (next.wonTrick[seat]) {
        // Обявяващият вече има взятка → 20/40 се зачитат веднага.
        next.points[seat] = (next.points[seat] ?? 0) + value;
        // Reaching 66 via a marriage in a CLOSED game must apply the closing
        // rules (closer-failed penalty) too — mirror the trick path below.
        if ((next.points[seat] ?? 0) >= 66) {
          if (next.closed) return finishClosed(next, events, rng);
          return finish(next, seat, events, rng);
        }
      } else {
        // Встъпителна женитба: точките са УСЛОВНИ — реализират се едва щом
        // обявяващият спечели взятка; анулират се ако не спечели никоя.
        next.pendingMarriage[seat] = (next.pendingMarriage[seat] ?? 0) + value;
      }
    }

    next.hands[seat] = next.hands[seat]!.filter((c) => c !== action.card);
    next.trick.push({ seat, card: action.card });
    events.push({ type: "PLAY", seat, card: action.card });

    if (next.trick.length < 2) {
      next.turn = other(seat);
      return { state: next, events };
    }

    const [first, second] = next.trick as [Play, Play];
    const leadSuit = suitOf(first.card);
    const winner = beats(second.card, first.card, leadSuit, next.trump) ? second.seat : first.seat;
    const pts = (VALUE[rankOf(first.card)] ?? 0) + (VALUE[rankOf(second.card)] ?? 0);
    next.points[winner] = (next.points[winner] ?? 0) + pts;
    next.wonTrick[winner] = true;
    // Първата взятка реализира натрупаните условни встъпителни женитби.
    if ((next.pendingMarriage[winner] ?? 0) > 0) {
      next.points[winner] = (next.points[winner] ?? 0) + (next.pendingMarriage[winner] ?? 0);
      next.pendingMarriage[winner] = 0;
    }
    next.lastTrickWinner = winner;
    next.trick = [];
    next.leader = winner;
    next.turn = winner;
    events.push({ type: "TRICK", seat: winner, points: pts });

    // Reaching 66: in a closed game the closer must be the one to reach it.
    if ((next.points[winner] ?? 0) >= 66) {
      if (next.closed) return finishClosed(next, events, rng);
      return finish(next, winner, events, rng);
    }

    if (!isPhase2(next)) {
      if (next.stock.length >= 2) {
        next.hands[winner]!.push(next.stock.shift()!);
        next.hands[other(winner)]!.push(next.stock.shift()!);
      } else if (next.stock.length === 1) {
        next.hands[winner]!.push(next.stock.shift()!);
        next.hands[other(winner)]!.push(next.trumpCard!);
        next.trumpCard = null;
      }
    }

    if (next.hands[0]!.length === 0 && next.hands[1]!.length === 0) {
      // Hands exhausted. If closed and the closer never reached 66, they failed.
      if (next.closed) return finishClosed(next, events, rng);
      // Открита игра: последната взятка носи +10 точки.
      next.points[winner] = (next.points[winner] ?? 0) + 10;
      return finish(next, next.lastTrickWinner ?? winner, events, rng);
    }

    return { state: next, events };
  },

  isTerminal: (state) => state.done,

  /** Heuristic bot: exchanges the trump nine, closes only near 66, announces
   *  marriages, wins valuable tricks cheaply and leads low otherwise. */
  bot(state, seat, _rng) {
    if (state.done || seat !== state.turn) return null;
    const acts = santaseEngine.legalActions(state, seat);
    if (acts.length === 0) return null;
    const exchange = acts.find((a) => a.type === "EXCHANGE");
    if (exchange) return exchange;
    const close = acts.find((a) => a.type === "CLOSE");
    if (close && (state.points[seat] ?? 0) >= 56) return close;
    const plays = acts.filter((a): a is Extract<SantaseAction, { type: "PLAY" }> => a.type === "PLAY");
    if (plays.length === 0) return null;
    const val = (c: Card) => VALUE[rankOf(c)] ?? 0;
    if (state.trick.length === 0) {
      const marriage = plays.find((a) => a.marriage);
      if (marriage) return marriage;
      // lead cheap, keep trumps for later
      return plays.reduce((m, a) =>
        val(a.card) + (suitOf(a.card) === state.trump ? 5 : 0) <
        val(m.card) + (suitOf(m.card) === state.trump ? 5 : 0)
          ? a
          : m,
      );
    }
    const led = state.trick[0]!;
    const winners = plays.filter((a) => beats(a.card, led.card, suitOf(led.card), state.trump));
    if (winners.length > 0 && val(led.card) >= 4) {
      // take valuable tricks with the cheapest winning card
      return winners.reduce((m, a) => (val(a.card) < val(m.card) ? a : m));
    }
    return plays.reduce((m, a) => (val(a.card) < val(m.card) ? a : m));
  },

  score(state): SeatScore[] {
    const winner = state.winner ?? 0;
    const loser = other(winner);
    return [
      { seat: winner, result: "win", points: state.matchPoints[winner] ?? 0 },
      { seat: loser, result: "loss", points: state.matchPoints[loser] ?? 0 },
    ];
  },

  redact(state, seat) {
    const opp = other(seat);
    const hands = [state.hands[0]!.slice(), state.hands[1]!.slice()] as Card[][];
    hands[opp] = hiddenLike(hands[opp]!);
    return { ...state, hands, stock: hiddenLike(state.stock) };
  },
};
