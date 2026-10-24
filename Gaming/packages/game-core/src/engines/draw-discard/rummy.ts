import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { HIDDEN, SUITS, hiddenLike, type Card } from "../cards.js";

/**
 * Реми — българският вариант (§4.11), 2–4 играчи.
 *
 * Тесте: 2 стандартни тестета + 4 жокера = 108 карти. Всеки получава 14 карти,
 * първият играч — 15 и започва направо с хвърляне (купът започва празен).
 * Ход: ТЕГЛИ от тестето ИЛИ ВЗЕМИ горната карта от купа, после (по избор)
 * отваряш / полагаш / долепяш / сменяш жокер и накрая ХВЪРЛЯШ една карта.
 *
 * Комбинации: серия — 3+ поредни карти от една боя (асото е ниско A-2-3 или
 * високо Q-K-A, без завъртане K-A-2); група — 3–4 карти от един ранг в РАЗЛИЧНИ
 * бои. Жокерът замества всяка карта; всяка комбинация съдържа поне 2 истински
 * карти (така жокерът винаги има еднозначна стойност).
 *
 * Отваряне: първото полагане (едно действие OPEN, може няколко комбинации)
 * трябва да е ≥ 51 точки: 2–10 по номинал, J/Q/K = 10, асо = 11 (1 в A-2-3),
 * жокер = стойността на картата, която замества. Чак след отваряне можеш да
 * полагаш нови комбинации, да долепяш карти към своите И чуждите комбинации и
 * да вземеш жокер от масата, като го замениш с истинската карта (взетият
 * жокер трябва да се използва в същия ход).
 *
 * Купът: горната карта може да се вземе само ако веднага се използва —
 * неотворен играч само ако с нея отваря (OPEN трябва да я съдържа). Двигателят
 * предлага TAKE само когато такова използване съществува.
 *
 * Край на рунда: играчът хвърля последната си карта (винаги трябва да остане
 * поне една карта за хвърляне). Точкуване (наказателни точки, по-малко = по-добре):
 *   - излезлият: 0;
 *   - останалите: сборът на картите в ръка (асо 11, фигури 10, жокер 50);
 *   - неотворен играч: 100;
 *   - „Ръка“ (излизане в същия ход, в който играчът отваря — без предварително
 *     отваряне) удвоява наказанията на всички останали.
 * Ако тестето свърши (след хвърляне няма карти за теглене), рундът приключва
 * без излязъл и всички получават наказанията си (без удвояване) — опростяване
 * вместо разбъркване на купа, което гарантира край на всеки рунд.
 *
 * Мачът е многорунден (както Джин/Домино тук): след рунд, в който някой стигне
 * RUMMY_LIMIT (501) наказателни точки, мачът свършва и печели играчът (или
 * играчите при равенство) с НАЙ-МАЛКО точки. Първият играч се сменя по кръга.
 *
 * Карти: "<ранг><боя><тесте>" (напр. "TSa", "ASb"), жокери "*1".."*4" — уникални
 * id-та въпреки двете тестета. Ръцете на другите и тестето се скриват.
 */

export const RUMMY_LIMIT = 501;
export const RUMMY_OPEN_MIN = 51;
export const RUMMY_HAND = 14;
export const RUMMY_UNOPENED_PENALTY = 100;
export const RUMMY_JOKER_PENALTY = 50;
const MIN_NATURALS = 2;
const MAX_ACTION_CARDS = 16;
const MAX_OPEN_MELDS = 6;

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"] as const;
const RANK_ORD: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13,
};
const ORD_RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

export const isJoker = (c: Card): boolean => c.startsWith("*");
/** Ранг на естествена карта ("TSa" → "T"). */
export const rummyRank = (c: Card): string => c.slice(0, -2);
/** Боя на естествена карта ("TSa" → "S"). */
export const rummySuit = (c: Card): string => c.charAt(c.length - 2);
/** Лице за рендериране: "TSa" → "TS", жокер → "*", скрита → "?". */
export const rummyFace = (c: Card): string => (c === HIDDEN ? HIDDEN : isJoker(c) ? "*" : c.slice(0, -1));
const isValidCardId = (c: unknown): c is Card =>
  typeof c === "string" &&
  (/^\*[1-4]$/.test(c) || /^(A|[2-9]|T|J|Q|K)[SHDC][ab]$/.test(c));

/** Стойност на ранга в група / в ръка: асо 11, фигури 10, останалите по номинал. */
const rankValue = (r: string): number => (r === "A" ? 11 : Math.min(RANK_ORD[r] ?? 0, 10));
/** Стойност на позиция в серия: 1 (ниско асо), 2–10, 11–13 → 10, 14 (високо асо) → 11. */
const slotValue = (o: number): number => (o === 1 ? 1 : o === 14 ? 11 : Math.min(o, 10));
/** Наказателна стойност на карта в ръка в края на рунда. */
export const penaltyValue = (c: Card): number => (isJoker(c) ? RUMMY_JOKER_PENALTY : rankValue(rummyRank(c)));

export function buildRummyDeck(): Card[] {
  const deck: Card[] = [];
  for (const d of ["a", "b"]) for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}${d}`);
  deck.push("*1", "*2", "*3", "*4");
  return deck;
}

// ───────────────────────── комбинации ─────────────────────────

export interface ParsedMeld {
  kind: "run" | "set";
  /** Подредени карти (серия: по позиции, ниско → високо; жокерите на местата си). */
  cards: Card[];
  /** Точкова стойност (за отваряне). */
  value: number;
  /** Серия: начална позиция (1 = ниско асо … 14 = високо асо). */
  start?: number;
}

/** Серия в ДАДЕНИЯ ред (позициите са фиксирани). */
function parseRunOrdered(cards: Card[]): ParsedMeld | null {
  const len = cards.length;
  if (len < 3) return null;
  const nat = cards.map((c, i) => ({ c, i })).filter((x) => !isJoker(x.c));
  if (nat.length < MIN_NATURALS) return null;
  const suit = rummySuit(nat[0]!.c);
  if (nat.some((x) => rummySuit(x.c) !== suit)) return null;
  const first = nat[0]!;
  const ord0 = RANK_ORD[rummyRank(first.c)]!;
  const opts = rummyRank(first.c) === "A" ? [1, 14] : [ord0];
  for (const o of opts) {
    const s = o - first.i;
    const end = s + len - 1;
    if (s < 1 || end > 14 || (s === 1 && end === 14)) continue;
    const ok = nat.every(({ c, i }) => {
      const want = s + i;
      const r = rummyRank(c);
      return r === "A" ? want === 1 || want === 14 : RANK_ORD[r] === want;
    });
    if (!ok) continue;
    let value = 0;
    for (let i = 0; i < len; i++) value += slotValue(s + i);
    return { kind: "run", cards: cards.slice(), value, start: s };
  }
  return null;
}

function parseSet(cards: Card[]): ParsedMeld | null {
  if (cards.length < 3 || cards.length > 4) return null;
  const nat = cards.filter((c) => !isJoker(c));
  if (nat.length < MIN_NATURALS) return null;
  const r = rummyRank(nat[0]!);
  if (nat.some((c) => rummyRank(c) !== r)) return null;
  if (new Set(nat.map(rummySuit)).size !== nat.length) return null;
  const suitIdx = (c: Card) => (SUITS as readonly string[]).indexOf(rummySuit(c));
  const ordered = [...nat].sort((a, b) => suitIdx(a) - suitIdx(b));
  for (const c of cards) if (isJoker(c)) ordered.push(c);
  return { kind: "set", cards: ordered, value: cards.length * rankValue(r) };
}

/** Разпознава комбинация в произволен ред; връща нормализирана подредба или null. */
export function arrangeMeld(input: Card[]): ParsedMeld | null {
  const cards = input.slice();
  if (cards.length < 3 || new Set(cards).size !== cards.length) return null;
  const nat = cards.filter((c) => !isJoker(c));
  const jokers = cards.filter(isJoker);
  if (nat.length < MIN_NATURALS) return null;
  if (nat.every((c) => rummyRank(c) === rummyRank(nat[0]!))) return parseSet(cards);
  const suit = rummySuit(nat[0]!);
  if (nat.some((c) => rummySuit(c) !== suit)) return null;
  for (const aceHigh of [false, true]) {
    const ordOf = (c: Card) => (rummyRank(c) === "A" ? (aceHigh ? 14 : 1) : RANK_ORD[rummyRank(c)]!);
    const sorted = [...nat].sort((a, b) => ordOf(a) - ordOf(b));
    const ords = sorted.map(ordOf);
    if (new Set(ords).size !== ords.length) continue;
    const lo = ords[0]!;
    const hi = ords[ords.length - 1]!;
    const gaps = hi - lo + 1 - ords.length;
    if (gaps > jokers.length) continue;
    let extra = jokers.length - gaps;
    let top = hi;
    let bottom = lo;
    // Излишните жокери — първо нагоре (по-висока стойност), после надолу.
    while (extra > 0 && top < 14 && !(bottom === 1 && top + 1 === 14)) {
      top++;
      extra--;
    }
    while (extra > 0 && bottom > 1 && !(bottom - 1 === 1 && top === 14)) {
      bottom--;
      extra--;
    }
    if (extra > 0) continue;
    const out: Card[] = [];
    let j = 0;
    let n = 0;
    for (let o = bottom; o <= top; o++) {
      if (n < sorted.length && ords[n] === o) out.push(sorted[n++]!);
      else out.push(jokers[j++]!);
    }
    const parsed = parseRunOrdered(out);
    if (parsed) return parsed;
  }
  return null;
}

/** Долепване на `add` към комбинация → новата подредба или null. Серията
 *  запазва позициите си и расте само в краищата (жокерите не се местят). */
export function extendMeld(meld: RummyMeld, add: Card[]): Card[] | null {
  if (add.length === 0 || new Set([...meld.cards, ...add]).size !== meld.cards.length + add.length) return null;
  if (meld.kind === "set") {
    const p = parseSet([...meld.cards, ...add]);
    return p ? p.cards : null;
  }
  const cur = parseRunOrdered(meld.cards);
  if (!cur || cur.start === undefined) return null;
  const s = cur.start;
  const len = meld.cards.length;
  const nat = add.filter((c) => !isJoker(c));
  const jok = add.filter(isJoker);
  const suit = rummySuit(meld.cards.find((c) => !isJoker(c))!);
  if (nat.some((c) => rummySuit(c) !== suit)) return null;
  const total = len + add.length;
  for (let lo = s; lo >= s - add.length; lo--) {
    const hi = lo + total - 1;
    if (lo < 1 || hi > 14 || (lo === 1 && hi === 14) || hi < s + len - 1) continue;
    const free = new Set<number>();
    for (let o = lo; o < s; o++) free.add(o);
    for (let o = s + len; o <= hi; o++) free.add(o);
    const placed = new Map<number, Card>();
    let ok = true;
    for (const c of nat) {
      const r = rummyRank(c);
      const cands = r === "A" ? [1, 14] : [RANK_ORD[r]!];
      const o = cands.find((x) => free.has(x) && !placed.has(x));
      if (o === undefined) {
        ok = false;
        break;
      }
      placed.set(o, c);
    }
    if (!ok || free.size - placed.size !== jok.length) continue;
    const out: Card[] = [];
    let j = 0;
    for (let o = lo; o <= hi; o++) {
      if (o >= s && o < s + len) out.push(meld.cards[o - s]!);
      else out.push(placed.get(o) ?? jok[j++]!);
    }
    if (parseRunOrdered(out)) return out;
  }
  return null;
}

/** Може ли `card` да смени жокер в комбинацията → индексът на жокера или -1. */
export function jokerSwapIndex(meld: RummyMeld, card: Card): number {
  if (isJoker(card)) return -1;
  if (meld.kind === "set") {
    const nat = meld.cards.filter((c) => !isJoker(c));
    if (rummyRank(card) !== rummyRank(nat[0]!)) return -1;
    if (nat.some((c) => rummySuit(c) === rummySuit(card))) return -1;
    return meld.cards.findIndex(isJoker);
  }
  const p = parseRunOrdered(meld.cards);
  if (!p || p.start === undefined) return -1;
  const suit = rummySuit(meld.cards.find((c) => !isJoker(c))!);
  if (rummySuit(card) !== suit) return -1;
  for (let i = 0; i < meld.cards.length; i++) {
    if (!isJoker(meld.cards[i]!)) continue;
    const want = p.start + i;
    if (ORD_RANK[want] === rummyRank(card)) return i;
  }
  return -1;
}

// ───────────────────── оптимално търсене (бот / проверки) ─────────────────────

interface Cand {
  mask: number;
  jokers: number;
  value: number;
  /** Слотове: индекс на естествена карта или -1 за жокер. */
  slots: number[];
}

function candidates(nat: Card[], jokerCount: number): Cand[] {
  const out: Cand[] = [];
  // Групи: по ранг, по една карта от боя (всички копия), 2–4 естествени + жокери.
  const byRank = new Map<string, Map<string, number[]>>();
  nat.forEach((c, i) => {
    const r = rummyRank(c);
    const m = byRank.get(r) ?? new Map<string, number[]>();
    const arr = m.get(rummySuit(c)) ?? [];
    arr.push(i);
    m.set(rummySuit(c), arr);
    byRank.set(r, m);
  });
  for (const [r, suits] of byRank) {
    const lists = [...suits.values()];
    const v = rankValue(r);
    const rec = (k: number, picked: number[]) => {
      if (k === lists.length) {
        if (picked.length < MIN_NATURALS) return;
        for (let j = 0; j <= jokerCount && picked.length + j <= 4; j++) {
          const size = picked.length + j;
          if (size < 3) continue;
          out.push({
            mask: picked.reduce((m, i) => m | (1 << i), 0),
            jokers: j,
            value: size * v,
            slots: [...picked, ...new Array<number>(j).fill(-1)],
          });
        }
        return;
      }
      rec(k + 1, picked);
      for (const i of lists[k]!) rec(k + 1, [...picked, i]);
    };
    rec(0, []);
  }
  // Серии: всеки прозорец [s, s+len-1] във всяка боя; слот без карта → жокер.
  for (const suit of SUITS) {
    const at = new Map<number, number>();
    nat.forEach((c, i) => {
      if (rummySuit(c) !== suit) return;
      const r = rummyRank(c);
      const os = r === "A" ? [1, 14] : [RANK_ORD[r]!];
      for (const o of os) if (!at.has(o)) at.set(o, i);
    });
    if (at.size < MIN_NATURALS) continue;
    for (let s = 1; s <= 12; s++) {
      for (let e = s + 2; e <= 14; e++) {
        if (s === 1 && e === 14) continue;
        const slots: number[] = [];
        let jokers = 0;
        let value = 0;
        let mask = 0;
        for (let o = s; o <= e; o++) {
          const i = at.get(o);
          if (i === undefined || mask & (1 << i)) {
            slots.push(-1);
            jokers++;
          } else {
            slots.push(i);
            mask |= 1 << i;
          }
          value += slotValue(o);
        }
        if (jokers > jokerCount || slots.length - jokers < MIN_NATURALS) continue;
        out.push({ mask, jokers, value, slots });
      }
    }
  }
  return out;
}

export interface MeldPlan {
  melds: Card[][];
  value: number;
  /** Брой използвани карти от ръката. */
  used: number;
}

/**
 * Максимална по точки съвкупност от непресичащи се НОВИ комбинации от `hand`
 * (точно търсене с мемоизация по маска). `mustInclude` — карта, която трябва да
 * участва. Винаги оставя поне една карта (за хвърляне). null, ако mustInclude
 * не може да участва.
 */
export function bestMelds(hand: Card[], mustInclude?: Card): MeldPlan | null {
  const plan = bestMeldsRaw(hand, mustInclude);
  if (!plan || plan.used < hand.length) return plan;
  // Покрива цялата ръка → махаме по една карта и взимаме най-доброто.
  let best: MeldPlan | null = null;
  for (let k = 0; k < hand.length; k++) {
    if (hand[k] === mustInclude) continue;
    const p = bestMeldsRaw(hand.filter((_, i) => i !== k), mustInclude);
    if (p && (!best || p.value > best.value)) best = p;
  }
  return best;
}

function bestMeldsRaw(hand: Card[], mustInclude?: Card): MeldPlan | null {
  const nat = hand.filter((c) => !isJoker(c));
  const jokerCards = hand.filter(isJoker);
  const J = jokerCards.length;
  const mustJoker = mustInclude !== undefined && isJoker(mustInclude);
  const mustIdx = mustInclude !== undefined && !mustJoker ? nat.indexOf(mustInclude) : -1;
  const cands = candidates(nat, J);
  const byIdx: Cand[][] = nat.map(() => []);
  for (const c of cands) {
    for (let i = 0; i < nat.length; i++) {
      if (c.mask & (1 << i)) {
        byIdx[i]!.push(c);
        break; // индексиран по най-малкия си индекс
      }
    }
  }
  // „Реши най-малкия нерешен индекс i“: или остава извън комбинация, или влиза
  // в кандидат, чийто най-малък индекс е i (по-ранните вече са решени).
  const NEG = -1e9;
  const memo = new Map<number, number>();
  const choice = new Map<number, Cand | null>();
  const full = nat.length;
  const go = (mask: number, jl: number): number => {
    let i = 0;
    while (i < full && mask & (1 << i)) i++;
    if (i === full) return mustJoker && jl === J ? NEG : 0;
    const key = mask * 8 + jl;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let best = i === mustIdx ? NEG : go(mask | (1 << i), jl);
    let pick: Cand | null = null;
    for (const c of byIdx[i]!) {
      if (c.mask & mask || c.jokers > jl) continue;
      const v = c.value + go(mask | c.mask, jl - c.jokers);
      if (v > best) {
        best = v;
        pick = c;
      }
    }
    memo.set(key, best);
    choice.set(key, pick);
    return best;
  };
  const total = go(0, J);
  if (total <= NEG / 2) return null;
  // Реконструкция.
  const melds: Card[][] = [];
  let mask = 0;
  let jl = J;
  let used = 0;
  let jUsed = 0;
  for (;;) {
    let i = 0;
    while (i < full && mask & (1 << i)) i++;
    if (i === full) break;
    const c = choice.get(mask * 8 + jl) ?? null;
    if (!c) {
      mask |= 1 << i;
      continue;
    }
    melds.push(c.slots.map((s) => (s === -1 ? jokerCards[jUsed++]! : nat[s]!)));
    used += c.slots.length;
    mask |= c.mask;
    jl -= c.jokers;
  }
  return { melds, value: total, used };
}

// ───────────────────────── състояние ─────────────────────────

export interface RummyMeld {
  id: number;
  owner: Seat;
  kind: "run" | "set";
  cards: Card[];
}

export interface RummyRoundResult {
  round: number;
  /** Излезлият играч; null, ако тестето е свършило. */
  outSeat: Seat | null;
  /** „Ръка“ — излизане без предварително отваряне (наказанията ×2). */
  hand: boolean;
  exhausted: boolean;
  penalties: number[];
  /** Ръцете в края на рунда — публично разкрити. */
  hands: Card[][];
  scores: number[];
}

export interface RummyState {
  seats: number;
  hands: Card[][];
  stock: Card[];
  discard: Card[]; // горната = последната
  melds: RummyMeld[];
  nextMeldId: number;
  opened: boolean[];
  /** Текущият играч отвори в този ход (за „Ръка“). */
  openedThisTurn: boolean;
  turn: Seat;
  phase: "DRAW" | "PLAY";
  /** Карти, които трябва да се използват преди хвърляне (взетата от купа,
   *  смененият жокер). Публично — вземането е видимо. */
  mustUse: Card[];
  /** Натрупани наказателни точки. */
  scores: number[];
  round: number;
  firstSeat: Seat;
  lastRound: RummyRoundResult | null;
  winners: Seat[];
  done: boolean;
}

export type RummyAction =
  | { type: "DRAW" }
  | { type: "TAKE" }
  | { type: "OPEN"; melds: Card[][] }
  | { type: "MELD"; cards: Card[] }
  | { type: "LAYOFF"; meldId: number; cards: Card[] }
  | { type: "SWAP"; meldId: number; card: Card }
  | { type: "DISCARD"; card: Card };

export type RummyEvent =
  | { type: "DRAW"; seat: Seat }
  | { type: "TAKE"; seat: Seat; card: Card }
  | { type: "OPEN"; seat: Seat; points: number }
  | { type: "MELD"; seat: Seat; meldId: number }
  | { type: "LAYOFF"; seat: Seat; meldId: number }
  | { type: "SWAP"; seat: Seat; meldId: number }
  | { type: "DISCARD"; seat: Seat; card: Card }
  | { type: "ROUND_END"; seat?: Seat; hand: boolean; exhausted: boolean; penalties: number[]; scores: number[] }
  | { type: "WIN"; seat: Seat }
  | { type: "MATCH"; seat: Seat; winners: Seat[] };

function deal(next: RummyState, firstSeat: Seat, rng: SeededRng): void {
  const deck = rng.shuffle(buildRummyDeck());
  next.hands = [];
  for (let s = 0; s < next.seats; s++) next.hands.push(deck.splice(0, RUMMY_HAND));
  next.hands[firstSeat]!.push(deck.shift()!);
  next.stock = deck;
  next.discard = [];
  next.melds = [];
  next.nextMeldId = 1;
  next.opened = new Array<boolean>(next.seats).fill(false);
  next.openedThisTurn = false;
  next.firstSeat = firstSeat;
  next.turn = firstSeat;
  next.phase = "PLAY"; // първият започва с хвърляне
  next.mustUse = [];
  next.round += 1;
}

function clone(state: RummyState): RummyState {
  return {
    ...state,
    hands: state.hands.map((h) => h.slice()),
    stock: state.stock.slice(),
    discard: state.discard.slice(),
    melds: state.melds.map((m) => ({ ...m, cards: m.cards.slice() })),
    opened: state.opened.slice(),
    mustUse: state.mustUse.slice(),
    scores: state.scores.slice(),
    winners: state.winners.slice(),
  };
}

/** Наказанията на играчите в края на рунда. */
export function roundPenalties(
  hands: Card[][],
  opened: boolean[],
  outSeat: Seat | null,
  handBonus: boolean,
): number[] {
  return hands.map((h, s) => {
    if (s === outSeat) return 0;
    const base = opened[s] ? h.reduce((a, c) => a + penaltyValue(c), 0) : RUMMY_UNOPENED_PENALTY;
    return handBonus ? base * 2 : base;
  });
}

function endRound(next: RummyState, outSeat: Seat | null, events: RummyEvent[], rng: SeededRng): void {
  const handBonus = outSeat !== null && next.openedThisTurn;
  const penalties = roundPenalties(next.hands, next.opened, outSeat, handBonus);
  next.scores = next.scores.map((v, s) => v + (penalties[s] ?? 0));
  next.lastRound = {
    round: next.round,
    outSeat,
    hand: handBonus,
    exhausted: outSeat === null,
    penalties,
    hands: next.hands.map((h) => h.slice()),
    scores: next.scores.slice(),
  };
  events.push({
    type: "ROUND_END",
    ...(outSeat !== null ? { seat: outSeat } : {}),
    hand: handBonus,
    exhausted: outSeat === null,
    penalties,
    scores: next.scores.slice(),
  });
  if (Math.max(...next.scores) >= RUMMY_LIMIT) {
    const min = Math.min(...next.scores);
    next.winners = next.scores.map((v, s) => (v === min ? s : -1)).filter((s) => s >= 0);
    next.done = true;
    next.mustUse = [];
    for (const w of next.winners) events.push({ type: "WIN", seat: w });
    events.push({ type: "MATCH", seat: next.winners[0]!, winners: next.winners.slice() });
    return;
  }
  deal(next, (next.firstSeat + 1) % next.seats, rng);
}

// ───────────────────────── проверки на ходове ─────────────────────────

const allInHand = (hand: Card[], cards: Card[]): boolean =>
  new Set(cards).size === cards.length && cards.every((c) => hand.includes(c));

const without = (hand: Card[], cards: Card[]): Card[] => hand.filter((c) => !cards.includes(c));

/** Проверено ОТВАРЯНЕ → нормализираните комбинации и точките, или причина. */
export function checkOpen(state: RummyState, seat: Seat, melds: Card[][]): { melds: ParsedMeld[]; points: number } | string {
  if (state.opened[seat]) return "Already opened";
  if (melds.length === 0 || melds.length > MAX_OPEN_MELDS) return "Bad meld count";
  const hand = state.hands[seat]!;
  const flat = melds.flat();
  if (!allInHand(hand, flat)) return "Cards not in hand";
  if (hand.length - flat.length < 1) return "Must keep a card to discard";
  for (const c of state.mustUse) if (!flat.includes(c)) return "Opening must use the taken card";
  const parsed: ParsedMeld[] = [];
  for (const m of melds) {
    const p = arrangeMeld(m);
    if (!p) return "Invalid meld";
    parsed.push(p);
  }
  const points = parsed.reduce((a, p) => a + p.value, 0);
  if (points < RUMMY_OPEN_MIN) return `Opening needs ${RUMMY_OPEN_MIN}+ points`;
  return { melds: parsed, points };
}

/** Начин опреден играч да използва `card` (вече в ръката му) — за TAKE/SWAP
 *  проверки, легалните действия и бота. */
function planUse(state: RummyState, seat: Seat, card: Card): RummyAction | null {
  const hand = state.hands[seat]!;
  if (!state.opened[seat]) {
    const plan = bestMelds(hand, card);
    return plan && plan.value >= RUMMY_OPEN_MIN ? { type: "OPEN", melds: plan.melds } : null;
  }
  if (hand.length >= 2) {
    for (const m of state.melds) if (extendMeld(m, [card])) return { type: "LAYOFF", meldId: m.id, cards: [card] };
  }
  const plan = bestMelds(hand, card);
  const meld = plan?.melds.find((m) => m.includes(card));
  return meld ? { type: "MELD", cards: meld } : null;
}

/** След OPEN/MELD/LAYOFF/SWAP всяка чакаща карта трябва още да има приложение —
 *  иначе ходът би оставил играча без легален изход (не може да хвърли). */
function assertPendingUsable(next: RummyState, seat: Seat): void {
  for (const c of next.mustUse) {
    if (next.hands[seat]!.includes(c) && !planUse(next, seat, c)) {
      throw new IllegalActionError("That would leave the taken card unusable");
    }
  }
}

function canTake(state: RummyState, seat: Seat): boolean {
  const top = state.discard[state.discard.length - 1];
  if (top === undefined) return false;
  const probe: RummyState = { ...state, hands: state.hands.slice() };
  probe.hands[seat] = [...state.hands[seat]!, top];
  return planUse(probe, seat, top) !== null;
}

function swapOk(state: RummyState, seat: Seat, meldId: number, card: Card): RummyState | null {
  if (!state.opened[seat]) return null;
  const hand = state.hands[seat]!;
  if (!hand.includes(card) || hand.length < 2) return null;
  const meld = state.melds.find((m) => m.id === meldId);
  if (!meld) return null;
  const idx = jokerSwapIndex(meld, card);
  if (idx < 0) return null;
  const joker = meld.cards[idx]!;
  const next = clone(state);
  const nm = next.melds.find((m) => m.id === meldId)!;
  nm.cards[idx] = card;
  next.hands[seat] = [...without(hand, [card]), joker];
  next.mustUse.push(joker);
  // Жокерът трябва да може да се използва веднага.
  return planUse(next, seat, joker) ? next : null;
}

function isActionShape(a: unknown): a is RummyAction {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  const cardList = (v: unknown): boolean =>
    Array.isArray(v) && v.length > 0 && v.length <= MAX_ACTION_CARDS && v.every(isValidCardId);
  switch (o.type) {
    case "DRAW":
    case "TAKE":
      return true;
    case "OPEN":
      return Array.isArray(o.melds) && o.melds.length > 0 && o.melds.length <= MAX_OPEN_MELDS && o.melds.every(cardList);
    case "MELD":
      return cardList(o.cards);
    case "LAYOFF":
      return Number.isInteger(o.meldId) && cardList(o.cards);
    case "SWAP":
      return Number.isInteger(o.meldId) && isValidCardId(o.card);
    case "DISCARD":
      return isValidCardId(o.card);
    default:
      return false;
  }
}

// ───────────────────────── бот: полезност на карта ─────────────────────────

/** Колко „близо до комбинация“ е картата в тази ръка (по-голямо = по-ценна). */
function usefulness(hand: Card[], card: Card): number {
  if (isJoker(card)) return 1000;
  const r = rummyRank(card);
  const s = rummySuit(card);
  const os = r === "A" ? [1, 14] : [RANK_ORD[r]!];
  const sameRankSuits = new Set<string>();
  let score = 0;
  for (const c of hand) {
    if (c === card || isJoker(c)) continue;
    if (rummyRank(c) === r && rummySuit(c) !== s) sameRankSuits.add(rummySuit(c));
    if (rummySuit(c) === s) {
      const co = rummyRank(c) === "A" ? [1, 14] : [RANK_ORD[rummyRank(c)]!];
      let d = 99;
      for (const a of os) for (const b of co) d = Math.min(d, Math.abs(a - b));
      if (d === 1) score += 2;
      else if (d === 2) score += 1;
    }
  }
  return score + 2 * sameRankSuits.size;
}

function pickDiscard(state: RummyState, seat: Seat): Card | null {
  const hand = state.hands[seat]!;
  if (hand.length === 0) return null;
  const nextSeat = (seat + 1) % state.seats;
  let best: Card | null = null;
  let bestScore = Infinity;
  for (const c of hand) {
    let score = usefulness(hand, c) * 20 - penaltyValue(c);
    // Не подавай на следващия карта, която долепя към масата, ако е отворен.
    if (!isJoker(c) && state.opened[nextSeat] && state.melds.some((m) => extendMeld(m, [c]))) score += 15;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function botPlay(state: RummyState, seat: Seat): RummyAction | null {
  const hand = state.hands[seat]!;
  if (state.mustUse.length > 0) {
    const card = state.mustUse.find((c) => hand.includes(c));
    if (card !== undefined) return planUse(state, seat, card);
  }
  if (!state.opened[seat]) {
    const plan = bestMelds(hand);
    if (plan && plan.value >= RUMMY_OPEN_MIN) return { type: "OPEN", melds: plan.melds };
  } else {
    const plan = bestMelds(hand);
    if (plan && plan.melds.length > 0) return { type: "MELD", cards: plan.melds[0]! };
    if (hand.length >= 2) {
      // Първо истинските карти, после жокерите (жокер в ръка = 50 наказателни).
      const order = [...hand.filter((c) => !isJoker(c)), ...hand.filter(isJoker)];
      for (const c of order) {
        for (const m of state.melds) if (extendMeld(m, [c])) return { type: "LAYOFF", meldId: m.id, cards: [c] };
      }
      // Вземи жокер от масата, ако имаш истинската карта (после го полага).
      for (const m of state.melds) {
        if (!m.cards.some(isJoker)) continue;
        for (const c of hand) {
          if (swapOk(state, seat, m.id, c)) return { type: "SWAP", meldId: m.id, card: c };
        }
      }
    }
  }
  const d = pickDiscard(state, seat);
  return d !== null ? { type: "DISCARD", card: d } : null;
}

// ───────────────────────── двигател ─────────────────────────

export const rummyEngine: GameEngine<RummyState, RummyAction, RummyEvent> = {
  init(opts: InitOpts, rng: SeededRng): RummyState {
    const seats = Math.min(Math.max(opts.seats, 2), 4);
    const state: RummyState = {
      seats,
      hands: [],
      stock: [],
      discard: [],
      melds: [],
      nextMeldId: 1,
      opened: [],
      openedThisTurn: false,
      turn: 0,
      phase: "PLAY",
      mustUse: [],
      scores: new Array<number>(seats).fill(0),
      round: 0,
      firstSeat: 0,
      lastRound: null,
      winners: [],
      done: false,
    };
    deal(state, 0, rng);
    return state;
  },

  /** Изброимите действия (теглене, вземане, хвърляне). Полагането е
   *  свободен вход през `validate`; когато има карта за задължително
   *  използване, се предлага поне един легален начин (бот/таймер не засядат). */
  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    if (state.phase === "DRAW") {
      const out: RummyAction[] = [];
      if (state.stock.length > 0) out.push({ type: "DRAW" });
      if (canTake(state, seat)) out.push({ type: "TAKE" });
      return out;
    }
    const hand = state.hands[seat]!;
    const pending = state.mustUse.find((c) => hand.includes(c));
    if (pending !== undefined) {
      const a = planUse(state, seat, pending);
      return a ? [a] : [];
    }
    return [...new Set(hand)].map((card) => ({ type: "DISCARD" as const, card }));
  },

  validate(state, seat, action) {
    if (state.done || seat !== state.turn || !isActionShape(action)) return false;
    try {
      const hand = state.hands[seat]!;
      switch (action.type) {
        case "DRAW":
          return state.phase === "DRAW" && state.stock.length > 0;
        case "TAKE":
          return state.phase === "DRAW" && canTake(state, seat);
        case "DISCARD":
          return state.phase === "PLAY" && hand.includes(action.card) && !state.mustUse.some((c) => hand.includes(c));
        default:
          if (state.phase !== "PLAY") return false;
          rummyEngine.reduce(state, action, { shuffle: <T>(a: T[]) => a.slice() } as unknown as SeededRng);
          return true;
      }
    } catch {
      return false;
    }
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next = clone(state);
    const events: RummyEvent[] = [];
    const hand = next.hands[seat]!;

    if (action.type === "DRAW" || action.type === "TAKE") {
      if (next.phase !== "DRAW") throw new IllegalActionError("Not draw phase");
      if (action.type === "DRAW") {
        const c = next.stock.shift();
        if (c === undefined) throw new IllegalActionError("Empty stock");
        hand.push(c);
        events.push({ type: "DRAW", seat });
      } else {
        if (!canTake(state, seat)) throw new IllegalActionError("The discard top cannot be used");
        const c = next.discard.pop()!;
        hand.push(c);
        next.mustUse = [c];
        events.push({ type: "TAKE", seat, card: c });
      }
      next.phase = "PLAY";
      return { state: next, events };
    }

    if (next.phase !== "PLAY") throw new IllegalActionError("Draw first");

    switch (action.type) {
      case "OPEN": {
        const res = checkOpen(next, seat, action.melds);
        if (typeof res === "string") throw new IllegalActionError(res);
        for (const p of res.melds) {
          next.melds.push({ id: next.nextMeldId++, owner: seat, kind: p.kind, cards: p.cards });
        }
        next.hands[seat] = without(hand, action.melds.flat());
        next.mustUse = next.mustUse.filter((c) => next.hands[seat]!.includes(c));
        next.opened[seat] = true;
        next.openedThisTurn = true;
        assertPendingUsable(next, seat);
        events.push({ type: "OPEN", seat, points: res.points });
        return { state: next, events };
      }
      case "MELD": {
        if (!next.opened[seat]) throw new IllegalActionError("Open first");
        if (!allInHand(hand, action.cards)) throw new IllegalActionError("Cards not in hand");
        if (hand.length - action.cards.length < 1) throw new IllegalActionError("Must keep a card to discard");
        const p = arrangeMeld(action.cards);
        if (!p) throw new IllegalActionError("Invalid meld");
        const id = next.nextMeldId++;
        next.melds.push({ id, owner: seat, kind: p.kind, cards: p.cards });
        next.hands[seat] = without(hand, action.cards);
        next.mustUse = next.mustUse.filter((c) => next.hands[seat]!.includes(c));
        assertPendingUsable(next, seat);
        events.push({ type: "MELD", seat, meldId: id });
        return { state: next, events };
      }
      case "LAYOFF": {
        if (!next.opened[seat]) throw new IllegalActionError("Open first");
        if (!allInHand(hand, action.cards)) throw new IllegalActionError("Cards not in hand");
        if (hand.length - action.cards.length < 1) throw new IllegalActionError("Must keep a card to discard");
        const meld = next.melds.find((m) => m.id === action.meldId);
        if (!meld) throw new IllegalActionError("No such meld");
        const grown = extendMeld(meld, action.cards);
        if (!grown) throw new IllegalActionError("Cards do not fit the meld");
        meld.cards = grown;
        next.hands[seat] = without(hand, action.cards);
        next.mustUse = next.mustUse.filter((c) => next.hands[seat]!.includes(c));
        assertPendingUsable(next, seat);
        events.push({ type: "LAYOFF", seat, meldId: meld.id });
        return { state: next, events };
      }
      case "SWAP": {
        const after = swapOk(next, seat, action.meldId, action.card);
        if (!after) throw new IllegalActionError("Cannot swap that joker");
        assertPendingUsable(after, seat);
        events.push({ type: "SWAP", seat, meldId: action.meldId });
        return { state: after, events };
      }
      case "DISCARD": {
        if (!hand.includes(action.card)) throw new IllegalActionError("Card not in hand");
        if (next.mustUse.some((c) => hand.includes(c))) throw new IllegalActionError("Use the taken card first");
        next.hands[seat] = without(hand, [action.card]);
        next.discard.push(action.card);
        events.push({ type: "DISCARD", seat, card: action.card });
        if (next.hands[seat]!.length === 0) {
          endRound(next, seat, events, rng);
          return { state: next, events };
        }
        if (next.stock.length === 0) {
          endRound(next, null, events, rng);
          return { state: next, events };
        }
        next.turn = (seat + 1) % next.seats;
        next.phase = "DRAW";
        next.openedThisTurn = false;
        next.mustUse = [];
        return { state: next, events };
      }
      default:
        throw new IllegalActionError("Unknown action");
    }
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const all = state.winners.length === state.seats;
    return state.scores.map((points, seat) => ({
      seat,
      result: all ? "draw" : state.winners.includes(seat) ? "win" : "loss",
      points,
    }));
  },

  redact(state, seat) {
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    return { ...state, hands, stock: hiddenLike(state.stock) };
  },

  bot(state, seat) {
    if (state.done || seat !== state.turn) return null;
    if (state.phase === "DRAW") {
      if (canTake(state, seat)) return { type: "TAKE" };
      return state.stock.length > 0 ? { type: "DRAW" } : null;
    }
    return botPlay(state, seat);
  },
};
