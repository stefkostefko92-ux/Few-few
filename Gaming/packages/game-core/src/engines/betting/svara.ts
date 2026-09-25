import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, rankOf, suitOf, hiddenLike, SUITS, type Card } from "../cards.js";

/**
 * Свара — 2–6p bluff/betting with VIRTUAL chips only (§4.3, §11.4). Played with
 * the Bulgarian 32-card deck (7–A). Each player antes, gets 3 cards; betting
 * proceeds CALL/RAISE/FOLD around the table until bets are matched, then a
 * showdown compares the hands' point totals. STRICTLY social gaming with
 * virtual chips — never real-money gambling, never cashed out.
 *
 * Hand value (традиционното броене):
 *   - card points: 7/8/9 по номинал, 10/J/Q/K = 10, A = 11;
 *   - cards of the SAME suit sum together; cards of the SAME rank also sum
 *     (две деветки = 18, два аса = 22, три аса = 33);
 *   - three of a kind = стойност×3; три седмици = 34 (най-силната ръка);
 *   - 7♣ е универсална: брои се като 11 към всяка комбинация (или сама);
 *   - без комбинация важи най-високата единична карта.
 *
 * Свара при равенство: потът остава на масата, равните играят под-игра;
 * останалите могат да се включат срещу вноска, равна на пота при обявяването.
 */

const ANTE = 10;
const RAISE_STEP = 10;
/** Свара се играе с 32 карти: 7–A. */
const RANKS = ["7", "8", "9", "T", "J", "Q", "K", "A"] as const;
/** Точки на картите: 7–9 по номинал, 10/J/Q/K = 10, A = 11. */
export const SVARA_CARD_POINTS: Record<string, number> = {
  "7": 7, "8": 8, "9": 9, T: 10, J: 10, Q: 10, K: 10, A: 11,
};
/** 7♣ — универсалната карта: винаги 11, комбинира се с всичко. */
const SEVEN_OF_CLUBS: Card = "7C";

const cardPoints = (c: Card): number =>
  c === SEVEN_OF_CLUBS ? 11 : (SVARA_CARD_POINTS[rankOf(c)] ?? 0);

/**
 * The point value of a 3-card Свара hand (see module doc for the rules).
 * Exported for tests and UI helpers.
 */
export function svaraPoints(cards: readonly Card[]): number {
  const ranks = cards.map(rankOf);
  // Три еднакви ранга: стойност×3 (три аса = 33); три седмици = 34 (най-силна).
  if (cards.length === 3 && ranks.every((r) => r === ranks[0])) {
    return ranks[0] === "7" ? 34 : (SVARA_CARD_POINTS[ranks[0]!] ?? 0) * 3;
  }
  const wild = cards.includes(SEVEN_OF_CLUBS);
  // Без комбинация важи най-високата единична карта.
  let best = 0;
  for (const c of cards) best = Math.max(best, cardPoints(c));
  // Сума по боя; 7♣ се добавя към всяка боя (в спатии влиза естествено с 11).
  for (const suit of SUITS) {
    let sum = 0;
    for (const c of cards) if (suitOf(c) === suit) sum += cardPoints(c);
    if (wild && suit !== "C") sum += 11;
    best = Math.max(best, sum);
  }
  // Сума по ранг (чифт); 7♣ се добавя и тук: A♥+A♠+7♣ = 33.
  for (const r of new Set(ranks)) {
    const same = cards.filter((c) => rankOf(c) === r);
    if (same.length < 2) continue;
    // Автентична особеност: ДВЕ седмици = 23 (бият дори чифт аса = 22); три
    // седмици вече са обработени по-горе (34). Всеки друг чифт е сума по номинал.
    let sum = r === "7" && same.length === 2 ? 23 : same.reduce((a, c) => a + cardPoints(c), 0);
    if (wild && r !== "7") sum += 11;
    best = Math.max(best, sum);
  }
  return best;
}

/**
 * BETTING  — нормален кръг на залагане.
 * SHOWDOWN — картите са разкрити (redact ги показва); чака се CONTINUE.
 * SVARA    — обявена свара: неравните решават JOIN/SKIP преди под-играта.
 */
export type SvaraPhase = "BETTING" | "SHOWDOWN" | "SVARA";

export interface SvaraState {
  hands: Card[][];
  chips: number[]; // virtual chips per seat
  bet: number[]; // current contribution to the pot this hand
  folded: boolean[];
  /** Whether each seat has acted at least once this betting round. */
  acted: boolean[];
  pot: number;
  current: number; // highest bet to match
  turn: Seat;
  seats: number;
  /** Раздаващият тази ръка; ротира се всяка ръка, първи говори следващият. */
  dealer: Seat;
  /** Номер на ръката; мачът свършва при 1 платежоспособен или MAX_HANDS_SVARA. */
  handNo: number;
  phase: SvaraPhase;
  /** Seats tied at the last showdown (свара) — играят под-играта безплатно. */
  svaraSeats: Seat[] | null;
  /** Вноска за включване на неравните в под-играта (= потът при обявяването). */
  svaraFee: number;
  /** Неравни места, които тепърва решават JOIN/SKIP (по ред на хода). */
  svaraPending: Seat[];
  /** Неравни места, платили вноската за под-играта. */
  svaraJoined: Seat[];
  /** Победителят в последната ръка (по време на SHOWDOWN) / в мача (при done). */
  winner: Seat | null;
  done: boolean;
}

export type SvaraAction =
  | { type: "CALL" }
  | { type: "RAISE" }
  | { type: "FOLD" }
  /** От showdown паузата към следващата ръка (позволено на всички места). */
  | { type: "CONTINUE" }
  /** Плати вноската и влез в свара под-играта. */
  | { type: "JOIN" }
  /** Остани извън свара под-играта. */
  | { type: "SKIP" };

export type SvaraEvent =
  | { type: "CALL"; seat: Seat; amount: number }
  | { type: "RAISE"; seat: Seat; to: number }
  | { type: "FOLD"; seat: Seat }
  /** Разкрита ръка на showdown — носи картите, за да ги видят всички клиенти. */
  | { type: "SHOWDOWN"; seat: Seat; hand: Card[]; points: number }
  /** Равенство на върха: потът остава, следва свара под-игра. */
  | { type: "SVARA"; seats: Seat[]; pot: number }
  | { type: "JOIN"; seat: Seat; fee: number }
  | { type: "WIN"; seat: Seat; pot: number }
  | { type: "HAND"; handNo: number }
  | { type: "MATCH"; seat: Seat };

export const SVARA_VIRTUAL_CHIPS_NOTICE =
  "Социална игра с виртуални чипове — не е хазарт за реални пари.";

const STARTING_CHIPS = 500;
/** Свара: ръце до 1 платежоспособен играч, но не повече от MAX_HANDS_SVARA. */
export const MAX_HANDS_SVARA = 20;

export const svaraEngine: GameEngine<SvaraState, SvaraAction, SvaraEvent> = {
  init(opts: InitOpts, rng: SeededRng): SvaraState {
    const seats = Math.min(Math.max(opts.seats, 2), 6);
    const state: SvaraState = {
      hands: Array.from({ length: seats }, () => [] as Card[]),
      chips: new Array<number>(seats).fill(STARTING_CHIPS),
      bet: new Array<number>(seats).fill(0),
      folded: new Array<boolean>(seats).fill(false),
      acted: new Array<boolean>(seats).fill(false),
      pot: 0,
      current: 0,
      turn: 0,
      seats,
      // dealHand ротира преди раздаване, така ръка 1 получава раздаващ 0.
      dealer: seats - 1,
      handNo: 0,
      phase: "BETTING",
      svaraSeats: null,
      svaraFee: 0,
      svaraPending: [],
      svaraJoined: [],
      winner: null,
      done: false,
    };
    dealNormalHand(state, rng, []);
    return state;
  },

  legalActions(state, seat) {
    if (state.done) return [];
    if (state.phase === "SHOWDOWN") return [{ type: "CONTINUE" }];
    if (state.phase === "SVARA") {
      if (seat !== state.turn) return [];
      return [{ type: "JOIN" }, { type: "SKIP" }];
    }
    if (seat !== state.turn || state.folded[seat]) return [];
    const actions: SvaraAction[] = [{ type: "FOLD" }];
    const toCall = state.current - (state.bet[seat] ?? 0);
    if ((state.chips[seat] ?? 0) >= toCall) actions.push({ type: "CALL" });
    if ((state.chips[seat] ?? 0) >= toCall + RAISE_STEP) actions.push({ type: "RAISE" });
    return actions;
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    if (state.phase === "SHOWDOWN") {
      if (action.type !== "CONTINUE") throw new IllegalActionError("Awaiting CONTINUE");
      return continueFromShowdown(state, rng);
    }
    if (state.phase === "SVARA") {
      if (action.type !== "JOIN" && action.type !== "SKIP")
        throw new IllegalActionError("Awaiting JOIN/SKIP decision");
      return svaraDecision(state, action.type === "JOIN", rng);
    }
    if (action.type !== "CALL" && action.type !== "RAISE" && action.type !== "FOLD")
      throw new IllegalActionError("Not in the betting phase");
    return reduceBetting(state, action, rng);
  },

  isTerminal: (s) => s.done,

  /** Прост евристичен бот: бяга със слаба ръка, плаща средна, вдига силна. */
  bot(state, seat, rng) {
    if (state.done) return null;
    if (state.phase === "SHOWDOWN") return { type: "CONTINUE" };
    if (state.phase === "SVARA") {
      if (seat !== state.turn) return null;
      // Влез само когато вноската е малка спрямо стека (сляпо раздаване).
      return (state.chips[seat] ?? 0) >= state.svaraFee * 3 ? { type: "JOIN" } : { type: "SKIP" };
    }
    if (seat !== state.turn || state.folded[seat]) return null;
    const points = svaraPoints(state.hands[seat] ?? []);
    const chips = state.chips[seat] ?? 0;
    const toCall = state.current - (state.bet[seat] ?? 0);
    // Силна ръка: вдигай, но с таван спрямо силата ѝ (без безкрайни войни).
    if (points >= 25 && chips >= toCall + RAISE_STEP && state.current < points * 2)
      return { type: "RAISE" };
    if (toCall === 0) return { type: "CALL" }; // чек без риск
    if (points >= 17 && chips >= toCall) return { type: "CALL" };
    // Слаба ръка срещу залог: предимно бягай, с малък шанс за блъф-плащане.
    if (points >= 14 && chips >= toCall && rng.next() < 0.25) return { type: "CALL" };
    return { type: "FOLD" };
  },

  score(state): SeatScore[] {
    const winner = state.winner ?? 0;
    return state.hands.map((_, seat) => ({
      seat,
      result: seat === winner ? "win" : "loss",
      points: state.chips[seat] ?? 0,
    }));
  },

  redact(state, seat) {
    // Извън BETTING (showdown пауза / свара решения) НЕпасналите ръце са открити
    // — това е разкриването на showdown. Пасналите остават скрити завинаги, а
    // ръка, спечелила с фолдове, никога не се показва (блъфът се пази).
    const reveal = state.phase !== "BETTING";
    const hands = state.hands.map((h, i) =>
      i === seat || (reveal && !state.folded[i]) ? h.slice() : hiddenLike(h),
    );
    return { ...state, hands };
  },
};

function clone(state: SvaraState): SvaraState {
  return {
    ...state,
    hands: state.hands.map((h) => h.slice()),
    chips: state.chips.slice(),
    bet: state.bet.slice(),
    folded: state.folded.slice(),
    acted: state.acted.slice(),
    svaraSeats: state.svaraSeats ? state.svaraSeats.slice() : null,
    svaraPending: state.svaraPending.slice(),
    svaraJoined: state.svaraJoined.slice(),
  };
}

/** One betting action inside the current hand. */
function reduceBetting(
  state: SvaraState,
  action: SvaraAction,
  rng: SeededRng,
): { state: SvaraState; events: SvaraEvent[] } {
  const seat = state.turn;
  if (state.folded[seat]) throw new IllegalActionError("Folded player cannot act");
  const next = clone(state);
  const events: SvaraEvent[] = [];
  const toCall = next.current - (next.bet[seat] ?? 0);
  next.acted[seat] = true; // this seat has now acted this round

  if (action.type === "FOLD") {
    next.folded[seat] = true;
    events.push({ type: "FOLD", seat });
  } else if (action.type === "CALL") {
    if ((next.chips[seat] ?? 0) < toCall) throw new IllegalActionError("Not enough chips");
    next.chips[seat]! -= toCall;
    next.bet[seat]! += toCall;
    next.pot += toCall;
    events.push({ type: "CALL", seat, amount: toCall });
  } else {
    const amount = toCall + RAISE_STEP;
    if ((next.chips[seat] ?? 0) < amount) throw new IllegalActionError("Not enough chips");
    next.chips[seat]! -= amount;
    next.bet[seat]! += amount;
    next.pot += amount;
    next.current = next.bet[seat]!;
    events.push({ type: "RAISE", seat, to: next.current });
  }

  // Last player standing wins immediately — no reveal (блъфът остава скрит).
  const active = activeSeats(next);
  if (active.length === 1) {
    award(next, active[0]!, events);
    endMatchOrNextHand(next, events, rng, /* pauseForReveal */ false);
    return { state: next, events };
  }

  // Showdown only once bets are matched AND every active player has acted at
  // least once — otherwise the opening round (all seats start at the ANTE, so
  // bets are already "matched") would end after the very first CALL, before
  // anyone else gets to raise/fold.
  next.turn = nextActive(next, seat);
  if (betsMatched(next) && activeSeats(next).every((s) => next.acted[s])) {
    return showdown(next, events, rng);
  }
  return { state: next, events };
}

/** Compare the point totals of every live hand; equal tops trigger a свара. */
function showdown(
  next: SvaraState,
  events: SvaraEvent[],
  rng: SeededRng,
): { state: SvaraState; events: SvaraEvent[] } {
  const active = activeSeats(next);
  let best = -1;
  const points = new Map<Seat, number>();
  for (const s of active) {
    const p = svaraPoints(next.hands[s]!);
    points.set(s, p);
    events.push({ type: "SHOWDOWN", seat: s, hand: next.hands[s]!.slice(), points: p });
    if (p > best) best = p;
  }
  // Разкриването: redact показва всички непаснали ръце, докато сме извън BETTING.
  next.phase = "SHOWDOWN";

  const tied = active.filter((s) => points.get(s) === best);
  if (tied.length > 1) {
    // СВАРА! Потът остава на масата; равните играят под-игра, другите могат
    // да се включат срещу вноска, равна на пота при обявяването.
    next.svaraSeats = tied;
    next.svaraFee = Math.max(ANTE, next.pot);
    next.winner = null;
    events.push({ type: "SVARA", seats: tied.slice(), pot: next.pot });
    return { state: next, events };
  }

  award(next, tied[0]!, events);
  endMatchOrNextHand(next, events, rng, /* pauseForReveal */ true);
  return { state: next, events };
}

/** CONTINUE from the showdown pause: свара под-игра or the next normal hand. */
function continueFromShowdown(
  state: SvaraState,
  rng: SeededRng,
): { state: SvaraState; events: SvaraEvent[] } {
  const next = clone(state);
  const events: SvaraEvent[] = [];
  if (next.svaraSeats && next.svaraSeats.length > 0) {
    // Неравните с достатъчно чипове решават (по ред) дали да се включат.
    const eligible: Seat[] = [];
    for (let s = 0; s < next.seats; s++) {
      if (next.svaraSeats.includes(s)) continue;
      if ((next.chips[s] ?? 0) >= next.svaraFee) eligible.push(s);
    }
    if (eligible.length > 0) {
      next.phase = "SVARA";
      next.svaraPending = eligible;
      next.svaraJoined = [];
      next.turn = eligible[0]!;
      return { state: next, events };
    }
    dealSvaraHand(next, rng, events);
    return { state: next, events };
  }
  dealNormalHand(next, rng, events);
  return { state: next, events };
}

/** One JOIN/SKIP decision before the свара под-игра. */
function svaraDecision(
  state: SvaraState,
  join: boolean,
  rng: SeededRng,
): { state: SvaraState; events: SvaraEvent[] } {
  const next = clone(state);
  const events: SvaraEvent[] = [];
  const seat = next.turn;
  next.svaraPending = next.svaraPending.filter((s) => s !== seat);
  if (join) {
    if ((next.chips[seat] ?? 0) < next.svaraFee) throw new IllegalActionError("Not enough chips");
    next.chips[seat]! -= next.svaraFee;
    next.pot += next.svaraFee;
    next.svaraJoined.push(seat);
    events.push({ type: "JOIN", seat, fee: next.svaraFee });
  }
  if (next.svaraPending.length > 0) {
    next.turn = next.svaraPending[0]!;
    return { state: next, events };
  }
  dealSvaraHand(next, rng, events);
  return { state: next, events };
}

/** After an awarded hand: end the match (1 платежоспособен / cap) or move on.
 *  `pauseForReveal` keeps the SHOWDOWN pause so clients can see the open cards
 *  (the next hand starts on CONTINUE); fold-wins deal again immediately. */
function endMatchOrNextHand(
  next: SvaraState,
  events: SvaraEvent[],
  rng: SeededRng,
  pauseForReveal: boolean,
): void {
  const alive: Seat[] = [];
  for (let s = 0; s < next.seats; s++) if ((next.chips[s] ?? 0) >= ANTE) alive.push(s);

  if (alive.length <= 1 || next.handNo >= MAX_HANDS_SVARA) {
    let winner: Seat = alive[0] ?? 0;
    for (let s = 0; s < next.seats; s++) {
      if ((next.chips[s] ?? 0) > (next.chips[winner] ?? 0)) winner = s as Seat;
    }
    next.winner = winner;
    next.done = true;
    events.push({ type: "MATCH", seat: winner });
    return;
  }
  if (pauseForReveal) {
    next.svaraSeats = null; // чиста победа — няма чакаща свара
    return; // остани в SHOWDOWN; следващата ръка тръгва при CONTINUE
  }
  dealNormalHand(next, rng, events);
}

/** Нова нормална ръка: ротирай раздаващия, анте от платежоспособните, раздай. */
function dealNormalHand(next: SvaraState, rng: SeededRng, events: SvaraEvent[]): void {
  const deck = rng.shuffle(buildDeck(RANKS));
  next.bet = new Array<number>(next.seats).fill(0);
  next.acted = new Array<boolean>(next.seats).fill(false);
  for (let s = 0; s < next.seats; s++) {
    next.folded[s] = (next.chips[s] ?? 0) < ANTE; // без чипове за анте → извън ръката
    next.hands[s] = [];
  }
  next.handNo += 1;
  next.dealer = nextActive(next, next.dealer); // ротация на раздаващия
  let pot = 0;
  for (let s = 0; s < next.seats; s++) {
    if (next.folded[s]) continue;
    next.hands[s] = deck.splice(0, 3);
    next.chips[s]! -= ANTE;
    next.bet[s] = ANTE;
    pot += ANTE;
  }
  next.pot = pot;
  next.current = ANTE;
  next.turn = nextActive(next, next.dealer); // първи говори след раздаващия
  next.phase = "BETTING";
  next.svaraSeats = null;
  next.svaraFee = 0;
  next.svaraPending = [];
  next.svaraJoined = [];
  next.winner = null;
  events.push({ type: "HAND", handNo: next.handNo });
}

/** Свара под-играта: равните + платилите вноска; потът се пренася, без анте. */
function dealSvaraHand(next: SvaraState, rng: SeededRng, events: SvaraEvent[]): void {
  const participants = new Set<Seat>([...(next.svaraSeats ?? []), ...next.svaraJoined]);
  const deck = rng.shuffle(buildDeck(RANKS));
  next.bet = new Array<number>(next.seats).fill(0);
  next.acted = new Array<boolean>(next.seats).fill(false);
  for (let s = 0; s < next.seats; s++) {
    next.folded[s] = !participants.has(s);
    next.hands[s] = next.folded[s] ? [] : deck.splice(0, 3);
  }
  next.handNo += 1;
  next.dealer = nextActive(next, next.dealer);
  next.current = 0; // без анте — залагането започва от чек
  next.turn = nextActive(next, next.dealer);
  next.phase = "BETTING";
  next.svaraSeats = null;
  next.svaraFee = 0;
  next.svaraPending = [];
  next.svaraJoined = [];
  next.winner = null;
  events.push({ type: "HAND", handNo: next.handNo });
}

function activeSeats(state: SvaraState): Seat[] {
  const out: Seat[] = [];
  for (let s = 0; s < state.seats; s++) if (!state.folded[s]) out.push(s);
  return out;
}

function nextActive(state: SvaraState, from: Seat): Seat {
  for (let i = 1; i <= state.seats; i++) {
    const cand = (from + i) % state.seats;
    if (!state.folded[cand]) return cand;
  }
  return from;
}

/** All active players have matched the current bet. */
function betsMatched(state: SvaraState): boolean {
  return activeSeats(state).every((s) => state.bet[s] === state.current);
}

/** Move the pot to the hand's winner (match-end bookkeeping stays elsewhere). */
function award(next: SvaraState, winner: Seat, events: SvaraEvent[]): void {
  next.chips[winner] = (next.chips[winner] ?? 0) + next.pot;
  events.push({ type: "WIN", seat: winner, pot: next.pot });
  next.pot = 0;
  next.winner = winner;
}
