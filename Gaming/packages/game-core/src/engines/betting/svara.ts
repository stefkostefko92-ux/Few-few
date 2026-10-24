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
 *
 * All-in и странични потове: играч с по-малко чипове от залога за изравняване
 * може да влезе с всичко (ALLIN) — тогава печели най-много толкова от всеки
 * съперник, колкото е вложил сам. Над нивото му се образува страничен пот само
 * за останалите. На showdown страничните потове се решават веднага (при равни
 * точки се делят поравно, остатъкът — по реда на хода от раздаващия), а при
 * равенство за ОСНОВНИЯ пот важи сварата (под-игра, както по-горе); all-in
 * играч с 0 чипа участва в нея безплатно и просто не залага.
 *
 * Вдигане с избор на размер (no-limit): RAISE носи `to` — новото ниво на залога.
 * Минимум = текущото ниво + последното вдигане (в началото на ръката базовият
 * залог RAISE_STEP); максимум = целият стек (таван на масата няма — стекът е
 * таванът). Вдигане на целия стек е all-in. Само виртуални чипове.
 */

const ANTE = 10;
/** Базовият (минимален) размер на вдигане в началото на всяка ръка. */
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

/** Един пот на масата: основният (индекс 0) и страничните след all-in. */
export interface SvaraPot {
  amount: number;
  /** Непасналите места, които имат право на този пот. */
  eligible: Seat[];
}

export interface SvaraState {
  hands: Card[][];
  chips: number[]; // virtual chips per seat
  bet: number[]; // current contribution to the pot this hand
  folded: boolean[];
  /** Whether each seat has acted at least once this betting round. */
  acted: boolean[];
  pot: number;
  current: number; // highest bet to match
  /** Минималният размер на следващото вдигане (= последното пълно вдигане). */
  minRaise: number;
  /** Основен + странични потове (за изгледа); сумата им е `pot`. */
  pots: SvaraPot[];
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
  /** Вдигане до ниво `to` (общият залог на мястото в ръката след вдигането). */
  | { type: "RAISE"; to: number }
  /** Всички оставащи чипове: изравняване „за по-малко“ или вдигане all-in. */
  | { type: "ALLIN" }
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
  | { type: "ALLIN"; seat: Seat; amount: number; to: number }
  | { type: "FOLD"; seat: Seat }
  /** Разкрита ръка на showdown — носи картите, за да ги видят всички клиенти. */
  | { type: "SHOWDOWN"; seat: Seat; hand: Card[]; points: number }
  /** Равенство на върха: потът остава, следва свара под-игра. */
  | { type: "SVARA"; seats: Seat[]; pot: number }
  | { type: "JOIN"; seat: Seat; fee: number }
  /** Спечелен пот (или дял при делене); `potIndex` 0 = основен, ≥1 = страничен. */
  | { type: "WIN"; seat: Seat; pot: number; potIndex?: number; split?: boolean }
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
      minRaise: RAISE_STEP,
      pots: [],
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
    const chips = state.chips[seat] ?? 0;
    if (chips <= 0) return []; // all-in: без повече решения в ръката
    const actions: SvaraAction[] = [{ type: "FOLD" }];
    const toCall = state.current - (state.bet[seat] ?? 0);
    if (chips >= toCall) actions.push({ type: "CALL" });
    // Краен набор размери за ботове/авто-игра; точният размер на човека се
    // проверява от validate (произволно `to` в границите).
    for (const to of raiseCandidates(state, seat)) actions.push({ type: "RAISE", to });
    if (chips < toCall || (chips > toCall && otherActorExists(state, seat)))
      actions.push({ type: "ALLIN" });
    return actions;
  },

  validate(state, seat, action) {
    if (!action || typeof action !== "object") return false;
    const a = action as { type?: unknown; to?: unknown };
    const keys = Object.keys(a).length;
    if (a.type === "RAISE") {
      const b = svaraRaiseBounds(state, seat);
      return (
        !!b && keys === 2 && typeof a.to === "number" && Number.isInteger(a.to) &&
        a.to >= b.min && a.to <= b.max
      );
    }
    return keys === 1 && svaraEngine.legalActions(state, seat).some((l) => l.type === a.type);
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
    if (
      action.type !== "CALL" &&
      action.type !== "RAISE" &&
      action.type !== "ALLIN" &&
      action.type !== "FOLD"
    )
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
    const legal = svaraEngine.legalActions(state, seat);
    if (legal.length === 0) return null;
    const find = (t: SvaraAction["type"]) => legal.find((a) => a.type === t) ?? null;
    const raises = legal.filter((a) => a.type === "RAISE");
    const points = svaraPoints(state.hands[seat] ?? []);
    const chips = state.chips[seat] ?? 0;
    const toCall = state.current - (state.bet[seat] ?? 0);
    // Силна ръка: вдигай — по-голям размер с по-силна ръка, но с таван спрямо
    // силата ѝ (без безкрайни войни). Чудовище без място за вдигане → all-in.
    if (points >= 25 && state.current < points * 2) {
      if (raises.length > 0) {
        const idx = points >= 31 ? raises.length - 1 : points >= 28 ? Math.floor(raises.length / 2) : 0;
        return raises[idx]!;
      }
      if (points >= 30 && find("ALLIN")) return find("ALLIN");
    }
    if (toCall === 0) return find("CALL"); // чек без риск
    // Не стига за изравняване: all-in „за по-малко“ само с прилична ръка.
    if (chips < toCall)
      return points >= 20 || (points >= 17 && rng.next() < 0.3) ? find("ALLIN") : find("FOLD");
    if (points >= 17) return find("CALL");
    // Слаба ръка срещу залог: предимно бягай, с малък шанс за блъф-плащане.
    if (points >= 14 && rng.next() < 0.25) return find("CALL");
    return find("FOLD");
  },

  score(state): SeatScore[] {
    // Класиране по чипове: единствен лидер → "win"; няколко с равен максимум →
    // "draw" за тях (победител няма); всички останали → "loss".
    const top = topSeats(state);
    return state.hands.map((_, seat) => ({
      seat,
      result: !top.includes(seat) ? "loss" : top.length === 1 ? "win" : "draw",
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
    pots: state.pots.map((p) => ({ amount: p.amount, eligible: p.eligible.slice() })),
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
  const chips0 = state.chips[seat] ?? 0;
  if (chips0 <= 0) throw new IllegalActionError("All-in player cannot act");
  const next = clone(state);
  const events: SvaraEvent[] = [];
  const bet0 = next.bet[seat] ?? 0;
  const toCall = next.current - bet0;
  next.acted[seat] = true; // this seat has now acted this round

  if (action.type === "FOLD") {
    next.folded[seat] = true;
    events.push({ type: "FOLD", seat });
  } else if (action.type === "CALL") {
    if (chips0 < toCall) throw new IllegalActionError("Not enough chips");
    putChips(next, seat, toCall);
    events.push({ type: "CALL", seat, amount: toCall });
  } else if (action.type === "RAISE") {
    const b = svaraRaiseBounds(state, seat);
    const to = action.to;
    if (!b || !Number.isInteger(to) || to < b.min || to > b.max)
      throw new IllegalActionError("Illegal raise size");
    next.minRaise = Math.max(next.minRaise, to - next.current);
    putChips(next, seat, to - bet0);
    next.current = to;
    if ((next.chips[seat] ?? 0) === 0) events.push({ type: "ALLIN", seat, amount: to - bet0, to });
    else events.push({ type: "RAISE", seat, to });
  } else {
    // ALLIN: изравняване „за по-малко“ или вдигане с целия стек.
    if (chips0 > toCall && !otherActorExists(state, seat))
      throw new IllegalActionError("Nobody left to call an all-in raise");
    const to = bet0 + chips0;
    putChips(next, seat, chips0);
    if (to > next.current) {
      // Непълно all-in вдигане не мести минимума за следващото вдигане.
      const inc = to - next.current;
      if (inc >= next.minRaise) next.minRaise = inc;
      next.current = to;
    }
    events.push({ type: "ALLIN", seat, amount: chips0, to });
  }

  // Last player standing wins immediately — no reveal (блъфът остава скрит).
  const active = activeSeats(next);
  if (active.length === 1) {
    award(next, active[0]!, events);
    endMatchOrNextHand(next, events, rng, /* pauseForReveal */ false);
    return { state: next, events };
  }

  // Showdown only once every player who can still bet has acted and matched
  // the level (all-in seats are done) — otherwise the opening round (all seats
  // start at the ANTE, so bets are already "matched") would end after the very
  // first CALL, before anyone else gets to raise/fold.
  next.turn = nextActor(next, seat);
  next.pots = svaraPots(next);
  if (roundOver(next)) return showdown(next, events, rng);
  return { state: next, events };
}

/**
 * Compare the point totals of every live hand. Side pots (index ≥ 1) are
 * settled right away (равни точки → делене); a tie for the MAIN pot keeps it
 * on the table and triggers a свара.
 */
function showdown(
  next: SvaraState,
  events: SvaraEvent[],
  rng: SeededRng,
): { state: SvaraState; events: SvaraEvent[] } {
  const active = activeSeats(next);
  const points = new Map<Seat, number>();
  for (const s of active) {
    const p = svaraPoints(next.hands[s]!);
    points.set(s, p);
    events.push({ type: "SHOWDOWN", seat: s, hand: next.hands[s]!.slice(), points: p });
  }
  // Разкриването: redact показва всички непаснали ръце, докато сме извън BETTING.
  next.phase = "SHOWDOWN";

  const pots = svaraPots(next);
  let sideTotal = 0;
  for (let i = pots.length - 1; i >= 1; i--) {
    const pot = pots[i]!;
    sideTotal += pot.amount;
    splitPot(next, bestOf(pot.eligible, points), pot.amount, i, events);
  }
  next.pot -= sideTotal;

  const tied = bestOf(pots[0]?.eligible ?? active, points);
  if (tied.length > 1) {
    // СВАРА! Основният пот остава на масата; равните играят под-игра, другите
    // могат да се включат срещу вноска, равна на пота при обявяването.
    next.svaraSeats = tied;
    next.svaraFee = Math.max(ANTE, next.pot);
    next.winner = null;
    next.pots = [{ amount: next.pot, eligible: tied.slice() }];
    events.push({ type: "SVARA", seats: tied.slice(), pot: next.pot });
    return { state: next, events };
  }

  award(next, tied[0]!, events);
  next.pots = [];
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
    // Неравните с достатъчно чипове решават дали да се включат — по реда на
    // хода: по часовниковата стрелка, започвайки от мястото след раздаващия.
    const eligible: Seat[] = [];
    for (let i = 1; i <= next.seats; i++) {
      const s = (next.dealer + i) % next.seats;
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
    next.pots = [{ amount: next.pot, eligible: [...(next.svaraSeats ?? []), ...next.svaraJoined] }];
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
    // Победител е единственият с най-много чипове; при равенство на върха
    // победител няма (winner = null) — score() дава "draw" на равните.
    const top = topSeats(next);
    next.winner = top.length === 1 ? top[0]! : null;
    next.done = true;
    if (next.winner !== null) events.push({ type: "MATCH", seat: next.winner });
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
  next.minRaise = RAISE_STEP;
  next.turn = nextActor(next, next.dealer); // първи говори след раздаващия
  next.phase = "BETTING";
  next.svaraSeats = null;
  next.svaraFee = 0;
  next.svaraPending = [];
  next.svaraJoined = [];
  next.winner = null;
  events.push({ type: "HAND", handNo: next.handNo });
  next.pots = svaraPots(next);
  // Всички (без един) са all-in още с антето → направо showdown.
  if (roundOver(next)) showdown(next, events, rng);
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
  next.minRaise = RAISE_STEP;
  next.turn = nextActor(next, next.dealer);
  next.phase = "BETTING";
  next.svaraSeats = null;
  next.svaraFee = 0;
  next.svaraPending = [];
  next.svaraJoined = [];
  next.winner = null;
  events.push({ type: "HAND", handNo: next.handNo });
  next.pots = svaraPots(next);
  // All-in участник с 0 чипа не залага; ако никой друг не може да залага —
  // под-играта отива направо на showdown.
  if (roundOver(next)) showdown(next, events, rng);
}

/** Местата с най-много чипове (повече от едно = равенство на върха). */
function topSeats(state: SvaraState): Seat[] {
  const max = Math.max(...state.chips.slice(0, state.seats));
  const out: Seat[] = [];
  for (let s = 0; s < state.seats; s++) if ((state.chips[s] ?? 0) === max) out.push(s);
  return out;
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

/** Next seat after `from` that can still bet (не е паснал и има чипове). */
function nextActor(state: SvaraState, from: Seat): Seat {
  for (let i = 1; i <= state.seats; i++) {
    const cand = (from + i) % state.seats;
    if (!state.folded[cand] && (state.chips[cand] ?? 0) > 0) return cand;
  }
  return from;
}

/** Има ли друг непаснал играч с чипове, който може да отговори на вдигане. */
function otherActorExists(state: SvaraState, seat: Seat): boolean {
  for (let s = 0; s < state.seats; s++)
    if (s !== seat && !state.folded[s] && (state.chips[s] ?? 0) > 0) return true;
  return false;
}

/**
 * The betting round is over when every seat that can still bet has acted and
 * matched the level; all-in seats are done. A lone bettor facing only all-in
 * players doesn't need to act once they cover the highest bet.
 */
function roundOver(state: SvaraState): boolean {
  const active = activeSeats(state);
  const actors = active.filter((s) => (state.chips[s] ?? 0) > 0);
  if (actors.length === 0) return true;
  const maxBet = Math.max(...active.map((s) => state.bet[s] ?? 0));
  if (actors.length === 1) return (state.bet[actors[0]!] ?? 0) >= maxBet;
  return actors.every((s) => state.acted[s] && state.bet[s] === state.current);
}

function putChips(next: SvaraState, seat: Seat, amount: number): void {
  next.chips[seat] = (next.chips[seat] ?? 0) - amount;
  next.bet[seat] = (next.bet[seat] ?? 0) + amount;
  next.pot += amount;
}

/** Местата с най-много точки сред `seats`. */
function bestOf(seats: Seat[], points: Map<Seat, number>): Seat[] {
  let best = -1;
  for (const s of seats) best = Math.max(best, points.get(s) ?? -1);
  return seats.filter((s) => (points.get(s) ?? -1) === best);
}

/** Раздели пот поравно; остатъкът отива по един чип по реда на хода от раздаващия. */
function splitPot(
  next: SvaraState,
  winners: Seat[],
  amount: number,
  potIndex: number,
  events: SvaraEvent[],
): void {
  if (winners.length === 0 || amount <= 0) return;
  const dist = (x: Seat) => (x - next.dealer - 1 + next.seats) % next.seats;
  const order = winners.slice().sort((a, b) => dist(a) - dist(b));
  const share = Math.floor(amount / order.length);
  let rem = amount - share * order.length;
  for (const s of order) {
    const got = share + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    next.chips[s] = (next.chips[s] ?? 0) + got;
    events.push({ type: "WIN", seat: s, pot: got, potIndex, split: order.length > 1 });
  }
}

/**
 * Основен + странични потове от вноските в текущата ръка. Нивата са залозите
 * на all-in играчите (0 чипа) плюс най-високият непаснал залог; всяко ниво е
 * пот само за непасналите, вложили поне толкова. Пренесеният пот на сварата
 * (pot − Σbet) влиза в основния. Сумата на потовете винаги е `pot`.
 */
export function svaraPots(state: SvaraState): SvaraPot[] {
  const active = activeSeats(state);
  const bets = state.bet.slice(0, state.seats).map((b) => b ?? 0);
  const sumBet = bets.reduce((a, b) => a + b, 0);
  if (active.length === 0) return state.pot > 0 ? [{ amount: state.pot, eligible: [] }] : [];
  const levels = new Set<number>();
  for (const s of active) if ((state.chips[s] ?? 0) === 0) levels.add(bets[s]!);
  levels.add(Math.max(...active.map((s) => bets[s]!)));
  const pots: SvaraPot[] = [];
  let prev = 0;
  for (const level of [...levels].sort((a, b) => a - b)) {
    let amount = 0;
    for (const b of bets) amount += Math.min(b, level) - Math.min(b, prev);
    if (pots.length === 0) amount += state.pot - sumBet; // пренесен пот (свара)
    else if (amount === 0) continue;
    pots.push({ amount, eligible: active.filter((s) => bets[s]! >= level) });
    prev = level;
  }
  // Залози на паснали над най-високото ниво (рядко) отиват в последния пот.
  const allocated = pots.reduce((a, p) => a + p.amount, 0);
  if (pots.length > 0 && allocated < state.pot) pots[pots.length - 1]!.amount += state.pot - allocated;
  return pots;
}

/**
 * Границите на вдигане за `seat` (общо ниво `to`): мин = текущото ниво +
 * последното вдигане, макс = целият стек. null — вдигане не е възможно (не е
 * негов ход, няма кой да отговори или стекът не стига дори за минимума — тогава
 * остава само ALLIN).
 */
export function svaraRaiseBounds(state: SvaraState, seat: Seat): { min: number; max: number } | null {
  if (state.done || state.phase !== "BETTING" || seat !== state.turn || state.folded[seat]) return null;
  const chips = state.chips[seat] ?? 0;
  if (chips <= 0 || !otherActorExists(state, seat)) return null;
  const max = (state.bet[seat] ?? 0) + chips;
  const min = state.current + state.minRaise;
  return min <= max ? { min, max } : null;
}

/** Краен набор размери: минимум, ½ пот и пот (строго под all-in нивото). */
function raiseCandidates(state: SvaraState, seat: Seat): number[] {
  const b = svaraRaiseBounds(state, seat);
  if (!b) return [];
  const toCall = state.current - (state.bet[seat] ?? 0);
  const base = state.pot + toCall;
  const cands = [b.min, state.current + Math.floor(base / 2), state.current + base];
  return [...new Set(cands.filter((t) => t >= b.min && t < b.max))].sort((x, y) => x - y);
}

/** Размерите на бутоните в изгледа: мин / ½ пот / пот / all-in (клампнати). */
export function svaraRaisePresets(
  state: SvaraState,
  seat: Seat,
): { min: number; halfPot: number; pot: number; allIn: number } | null {
  const b = svaraRaiseBounds(state, seat);
  if (!b) return null;
  const toCall = state.current - (state.bet[seat] ?? 0);
  const base = state.pot + toCall;
  const clamp = (t: number) => Math.min(b.max, Math.max(b.min, t));
  return {
    min: b.min,
    halfPot: clamp(state.current + Math.floor(base / 2)),
    pot: clamp(state.current + base),
    allIn: b.max,
  };
}

/** Move the pot to the hand's winner (match-end bookkeeping stays elsewhere). */
function award(next: SvaraState, winner: Seat, events: SvaraEvent[]): void {
  next.chips[winner] = (next.chips[winner] ?? 0) + next.pot;
  events.push({ type: "WIN", seat: winner, pot: next.pot });
  next.pot = 0;
  next.winner = winner;
}
