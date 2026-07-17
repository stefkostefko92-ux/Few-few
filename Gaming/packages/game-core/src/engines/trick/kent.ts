import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, hiddenLike, rankOf, type Card } from "./cards.js";
import { RANKS_52 } from "../cards.js";

/**
 * Кент / Купе — автентичните правила (сверено с bg.wikipedia.org/wiki/Кент_Купе).
 * 4 играча в два отбора {0,2} срещу {1,3}. Игра на СЪБИРАНЕ + таен сигнал, НЕ на
 * взятки и НЕ на симултанно подаване (старата имплементация беше друга игра).
 *
 *  - Пълно тесте от 52 карти. Всеки играч получава по 4 карти; 4 карти лежат с
 *    лице нагоре в центъра (talon/„борса"), останалите 32 са скрито тесте.
 *  - На своя ход играч сменя 1 своя карта с 1 централна (`SWAP`) или пасува
 *    (`PASS`). Ходът обикаля 0→1→2→3. Когато четиримата пасуват подред, 4-те
 *    централни карти се сменят с нови от тестето (`REPLACE`); ако тестето не
 *    стигне — раздава се наново (`REDEAL`), с таван на кръговете за терминиране.
 *  - Цел: 4 еднакви ранга в ръката („каре"). Тогава притежателят тайно дава знак
 *    на партньора си (`SIGNAL`) — виждан САМО от партньора (redact + redactEvent).
 *    Партньорът, щом види знака, вика „Купе!" (`CALL_KUPE`). Противник, който
 *    подозира, може да викне „Стоп!" (`CALL_STOP`).
 *  - Точкуване: коректен вик → точка за отбора на викащия; грешен вик → точка за
 *    противника. Мач до KENT_TARGET точки.
 *
 * ── Room-модел / инвариант (§8.3) ──────────────────────────────────────────────
 * Точно ЕДНО място има непразни legalActions по всяко време: това е `turn`.
 * Всички специални викове са ГЕЙТНАТИ към хода на съответното място:
 *   • `SIGNAL`   — само притежателят на каре, на своя ход (веднъж на кръг).
 *   • `CALL_KUPE`— само ако ПАРТНЬОРЪТ е сигнализирал (т.е. „видях знака"), на своя ход.
 *   • `CALL_STOP`— гамбит срещу противниците, на своя ход. Тъй като тайният сигнал
 *     ТРЯБВА да остане скрит (redact), не можем да изведем „подозрение" на противника
 *     от state-а, без да го изтечем; затова моделираме подозрението като ход-базиран
 *     облог, достъпен на своя ход. Така сигналът не изтича и инвариантът „едно място
 *     на ход" се пази (currentSeat взима първия seat с legalActions).
 * Извън своя ход legalActions на всяко място е ПРАЗЕН → няма бот-спам, няма два
 * едновременни on-turn seat-а.
 */

export const KENT_TARGET = 3;
const HAND = 4; // карти в ръка
const CENTER = 4; // централни карти
const MAX_ROUNDS = 40; // таван кръгове (терминиране)
const MAX_MOVES = 20_000; // глобален таван ходове (предпазна мрежа за терминиране)

export interface KentState {
  /** 4 ръце по 4 карти. */
  hands: Card[][];
  /** 4 централни карти с лице нагоре (talon/борса) — публични. */
  center: Card[];
  /** Скрито тесте (репликира се като скрити маркери). */
  deck: Card[];
  turn: Seat;
  /** Последователни пасове; при CENTER подред → подмяна на центъра. */
  passStreak: number;
  /** Кой е дал тайния знак този кръг. */
  signaled: boolean[];
  round: number;
  /** Глобален брояч на ходове (терминиране). */
  moves: number;
  matchScore: [number, number];
  /** Резултат от последния приключил кръг (за UI между кръговете). */
  lastRound: { caller: Seat; kind: "KUPE" | "STOP"; correct: boolean; winningTeam: number } | null;
  winningTeam: number | null;
  done: boolean;
}

export type KentAction =
  | { type: "SWAP"; handIndex: number; centerIndex: number }
  | { type: "PASS" }
  | { type: "SIGNAL"; seat: Seat }
  | { type: "CALL_KUPE"; seat: Seat }
  | { type: "CALL_STOP"; seat: Seat };

export type KentEvent =
  | { type: "SWAP"; seat: Seat; handIndex: number; centerIndex: number }
  | { type: "PASS"; seat: Seat }
  | { type: "REPLACE"; round: number }
  | { type: "SIGNAL"; seat: Seat }
  | { type: "KUPE"; caller: Seat; correct: boolean; winningTeam: number }
  | { type: "STOP_KENT"; caller: Seat; correct: boolean; winningTeam: number }
  | { type: "ROUND"; winningTeam: number; matchScore: [number, number] }
  | { type: "REDEAL"; round: number }
  | { type: "RESULT"; team: number };

const next4 = (s: Seat): Seat => ((s + 1) % 4) as Seat;
const team = (s: Seat): number => s % 2;
const partner = (s: Seat): Seat => ((s + 2) % 4) as Seat;

/** Каре: 4-те карти в ръката са с еднакъв ранг. */
function isKent(hand: Card[]): boolean {
  return hand.length === 4 && hand.every((c) => rankOf(c) === rankOf(hand[0]!));
}

function teamHasKent(state: KentState, t: number): boolean {
  return [0, 1, 2, 3].some((s) => team(s as Seat) === t && isKent(state.hands[s]!));
}

/** Раздава 4×4 ръце, 4 централни, останалото — тесте. */
function deal(rng: SeededRng): { hands: Card[][]; center: Card[]; deck: Card[] } {
  const d = rng.shuffle(buildDeck(RANKS_52));
  const hands = [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12), d.slice(12, 16)];
  const center = d.slice(16, 20);
  const deck = d.slice(20);
  return { hands, center, deck };
}

/** Нулира полетата за кръг и раздава наново (не пипа мач-резултата). */
function freshRound(state: KentState, rng: SeededRng, round: number): void {
  const dealt = deal(rng);
  state.hands = dealt.hands;
  state.center = dealt.center;
  state.deck = dealt.deck;
  state.passStreak = 0;
  state.signaled = [false, false, false, false];
  state.turn = 0;
  state.round = round;
}

function endMatch(state: KentState, events: KentEvent[]): void {
  // Решаващ край: при равенство печели отбор 0 (гарантирано 2 победители).
  state.winningTeam = state.matchScore[0] >= state.matchScore[1] ? 0 : 1;
  state.done = true;
  events.push({ type: "RESULT", team: state.winningTeam });
}

function settleRound(state: KentState, winningTeam: number, events: KentEvent[], rng: SeededRng): void {
  state.matchScore = [
    state.matchScore[0] + (winningTeam === 0 ? 1 : 0),
    state.matchScore[1] + (winningTeam === 1 ? 1 : 0),
  ];
  events.push({ type: "ROUND", winningTeam, matchScore: [state.matchScore[0], state.matchScore[1]] });
  const [a, b] = state.matchScore;
  if (a >= KENT_TARGET || b >= KENT_TARGET || state.round >= MAX_ROUNDS) {
    endMatch(state, events);
  } else {
    freshRound(state, rng, state.round + 1);
  }
}

export const kentEngine: GameEngine<KentState, KentAction, KentEvent> = {
  init(_opts: InitOpts, rng: SeededRng): KentState {
    const dealt = deal(rng);
    return {
      hands: dealt.hands,
      center: dealt.center,
      deck: dealt.deck,
      turn: 0,
      passStreak: 0,
      signaled: [false, false, false, false],
      round: 1,
      moves: 0,
      matchScore: [0, 0],
      lastRound: null,
      winningTeam: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done) return [];
    // Инвариант: само мястото на ход има действия (никакви извън-ход викове).
    if (seat !== state.turn) return [];
    const actions: KentAction[] = [];
    const hand = state.hands[seat]!;
    // Смяна: всяка своя карта ↔ всяка централна (16 изброими комбинации).
    for (let h = 0; h < hand.length; h++) {
      for (let c = 0; c < state.center.length; c++) {
        actions.push({ type: "SWAP", handIndex: h, centerIndex: c });
      }
    }
    actions.push({ type: "PASS" });
    // Притежателят на каре дава тайния знак (веднъж на кръг).
    if (isKent(hand) && !state.signaled[seat]) actions.push({ type: "SIGNAL", seat });
    // Партньорът, който е видял знака, вика „Купе!".
    if (state.signaled[partner(seat as Seat)]) actions.push({ type: "CALL_KUPE", seat });
    // „Стоп!" срещу противниците — ход-базиран облог (виж описанието горе).
    actions.push({ type: "CALL_STOP", seat });
    return actions;
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");

    const next: KentState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      center: state.center.slice(),
      deck: state.deck.slice(),
      signaled: state.signaled.slice(),
      matchScore: [state.matchScore[0], state.matchScore[1]],
    };
    const events: KentEvent[] = [];
    next.moves += 1;

    if (action.type === "CALL_KUPE") {
      const caller = action.seat;
      if (caller !== state.turn) throw new IllegalActionError("Not your turn");
      if (!next.signaled[partner(caller)]) throw new IllegalActionError("No signal from partner");
      const correct = teamHasKent(next, team(caller));
      const winningTeam = correct ? team(caller) : 1 - team(caller);
      next.lastRound = { caller, kind: "KUPE", correct, winningTeam };
      events.push({ type: "KUPE", caller, correct, winningTeam });
      settleRound(next, winningTeam, events, rng);
      return { state: next, events };
    }

    if (action.type === "CALL_STOP") {
      const caller = action.seat;
      if (caller !== state.turn) throw new IllegalActionError("Not your turn");
      // Хващаш противниците с готово каре, преди да са обявили „Купе".
      const correct = teamHasKent(next, 1 - team(caller));
      const winningTeam = correct ? team(caller) : 1 - team(caller);
      next.lastRound = { caller, kind: "STOP", correct, winningTeam };
      events.push({ type: "STOP_KENT", caller, correct, winningTeam });
      settleRound(next, winningTeam, events, rng);
      return { state: next, events };
    }

    if (action.type === "SIGNAL") {
      const s = action.seat;
      if (s !== state.turn) throw new IllegalActionError("Not your turn");
      if (!isKent(next.hands[s]!)) throw new IllegalActionError("No Kent to signal");
      if (next.signaled[s]) throw new IllegalActionError("Already signaled");
      next.signaled[s] = true;
      events.push({ type: "SIGNAL", seat: s });
      next.turn = next4(s as Seat);
      if (next.moves >= MAX_MOVES) endMatch(next, events);
      return { state: next, events };
    }

    if (action.type === "PASS") {
      const seat = state.turn;
      next.passStreak += 1;
      events.push({ type: "PASS", seat });
      // Четири паса подред → подмяна на центъра от тестето.
      if (next.passStreak >= 4) {
        next.passStreak = 0;
        if (next.deck.length >= CENTER) {
          next.center = next.deck.slice(0, CENTER);
          next.deck = next.deck.slice(CENTER);
          events.push({ type: "REPLACE", round: next.round });
          next.turn = next4(seat);
        } else {
          // Тестето свърши и никой не иска центъра → раздава се наново (bounded).
          events.push({ type: "REDEAL", round: next.round });
          if (next.round >= MAX_ROUNDS) {
            endMatch(next, events);
          } else {
            freshRound(next, rng, next.round + 1);
          }
        }
      } else {
        next.turn = next4(seat);
      }
      if (!next.done && next.moves >= MAX_MOVES) endMatch(next, events);
      return { state: next, events };
    }

    // SWAP
    if (action.type !== "SWAP") throw new IllegalActionError("Unknown action");
    const seat = state.turn;
    const { handIndex, centerIndex } = action;
    if (handIndex < 0 || handIndex >= next.hands[seat]!.length) throw new IllegalActionError("Bad hand index");
    if (centerIndex < 0 || centerIndex >= next.center.length) throw new IllegalActionError("Bad center index");
    const fromHand = next.hands[seat]![handIndex]!;
    const fromCenter = next.center[centerIndex]!;
    next.hands[seat]![handIndex] = fromCenter;
    next.center[centerIndex] = fromHand;
    next.passStreak = 0;
    events.push({ type: "SWAP", seat, handIndex, centerIndex });
    next.turn = next4(seat);
    if (next.moves >= MAX_MOVES) endMatch(next, events);
    return { state: next, events };
  },

  /** Bot: събирай към каре чрез smart swap; сигнализирай при каре; партньорът
   *  вика Купе при получен сигнал. Не викаме СТОП напосоки (то е облог за човек). */
  bot(state, seat, _rng) {
    if (state.done || seat !== state.turn) return null;
    const hand = state.hands[seat]!;
    // Видях знака на партньора → викам „Купе!".
    if (state.signaled[partner(seat as Seat)]) return { type: "CALL_KUPE", seat };
    // Имам каре → давам тайния знак (веднъж).
    if (isKent(hand) && !state.signaled[seat]) return { type: "SIGNAL", seat };
    // Иначе — най-добрата смяна към каре, иначе пас.
    const swap = bestSwap(hand, state.center);
    if (swap) return { type: "SWAP", handIndex: swap.handIndex, centerIndex: swap.centerIndex };
    return { type: "PASS" };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winTeam = state.winningTeam ?? 0;
    return [0, 1, 2, 3].map((seat) => ({
      seat: seat as Seat,
      result: team(seat as Seat) === winTeam ? "win" : "loss",
      points: team(seat as Seat) === winTeam ? state.matchScore[winTeam] ?? 0 : 0,
    }));
  },

  redact(state, seat) {
    // Своята ръка е видима; чуждите и тестето — скрити; центърът е публичен.
    const p = partner(seat as Seat);
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    const deck = hiddenLike(state.deck);
    const signaled = state.signaled.map((v, i) => (i === seat || i === p ? v : false));
    return { ...state, hands, deck, signaled };
  },

  /** Тайният сигнал е отборна тайна: SIGNAL-събитието стига само до сигнализиращия
   *  и партньора (иначе противникът би го „чул" през event stream-а). */
  redactEvent(event, seat) {
    if (event.type === "SIGNAL" && event.seat !== seat && partner(event.seat) !== seat) return null;
    return event;
  },
};

/** Евристика: върни смяна, която концентрира ръката към каре, или null. */
function bestSwap(hand: Card[], center: Card[]): { handIndex: number; centerIndex: number } | null {
  const counts = new Map<string, number>();
  for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  let best: { handIndex: number; centerIndex: number; gain: number } | null = null;
  for (let ci = 0; ci < center.length; ci++) {
    const r = rankOf(center[ci]!);
    const held = counts.get(r) ?? 0; // колко от този ранг вече държим
    if (held >= HAND) continue; // вече каре (не се случва тук, но за сигурност)
    // Изхвърли своя карта от ранга, който държим НАЙ-МАЛКО и е различен от r.
    let hi = -1;
    let minHeld = Infinity;
    for (let i = 0; i < hand.length; i++) {
      const hr = rankOf(hand[i]!);
      if (hr === r) continue;
      const hc = counts.get(hr) ?? 0;
      if (hc < minHeld) {
        minHeld = hc;
        hi = i;
      }
    }
    if (hi < 0) continue;
    // Взимаме, само ако концентрира (новото купче r надминава разбитото купче).
    if (held + 1 <= minHeld) continue;
    const gain = held + 1;
    if (!best || gain > best.gain) best = { handIndex: hi, centerIndex: ci, gain };
  }
  return best ? { handIndex: best.handIndex, centerIndex: best.centerIndex } : null;
}
