import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, hiddenLike, rankOf, suitOf, type Card, type Suit } from "./cards.js";
import { resolveDeclarations, type DeclMode, type Declaration } from "./declarations.js";

/**
 * Белот — пълните български правила (§4.1). 32 карти (7…A), 4 играчи в два
 * отбора {0,2} срещу {1,3}. Server-authoritative; чуждите ръце са скрити.
 *
 * НАДДАВАНЕ: започва вляво от раздаващия. Всеки казва „пас" или обявява
 * ПО-ВИСОК договор от текущия: ♣ < ♦ < ♥ < ♠ < Без коз < Всичко коз.
 * Противниците могат да обявят КОНТРА (x2), а отборът на договора — РЕКОНТРА
 * (x4). Три поредни паса след обявен договор затварят наддаването; четири
 * паса без договор → ново раздаване от следващия раздаващ.
 *
 * ИГРА: 8 взятки. Задълженията са истинските:
 *  - отговаряш на боята; ако боята е коз — качваш (надцакваш) ако можеш;
 *  - без боя: цакаш с коз, ОСВЕН ако партньорът ти държи взятката;
 *  - при цакане върху чужд коз — надцакваш ако можеш (иначе даваш малък коз);
 *  - „всичко коз": качването в боята е задължително; „без коз": само отговаряш.
 *
 * ТОЧКИ: коз J=20, 9=14, A=11, 10=10, K=4, Q=3; без коз A=11, 10=10, K=4, Q=3,
 * J=2 (удвоени → 260 общо); всичко коз: всички бои по козовата стълбица (258).
 * Последна взятка +10. Обяви: терца 20 / 50 / 100, каре (J 200, 9 150, др.
 * 100), белот 20 (във „всичко коз" — във всяка боя; в „без коз" — нищо).
 *
 * РАЗДАВАНЕ → МАЧ: точките се закръглят на десетици; „вътре" дава всичко на
 * противника; равенство = „висящи" към победителя на следващото раздаване;
 * валат (всички взятки) +90 и анулира обявите на губещите. Контра/реконтра:
 * победителят взима всичко x2/x4. Играе се до 151 точки.
 */

const RANKS = ["7", "8", "9", "T", "J", "Q", "K", "A"] as const;
const TRUMP_VALUE: Record<string, number> = { J: 20, "9": 14, A: 11, T: 10, K: 4, Q: 3, "8": 0, "7": 0 };
const PLAIN_VALUE: Record<string, number> = { A: 11, T: 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 };
const TRUMP_STRENGTH: Record<string, number> = { J: 8, "9": 7, A: 6, T: 5, K: 4, Q: 3, "8": 2, "7": 1 };
const PLAIN_STRENGTH: Record<string, number> = { A: 8, T: 7, K: 6, Q: 5, J: 4, "9": 3, "8": 2, "7": 1 };

export type Contract = Suit | "NT" | "AT";
/** Bidding ladder: ♣ < ♦ < ♥ < ♠ < Без коз < Всичко коз. */
export const CONTRACT_ORDER: readonly Contract[] = ["C", "D", "H", "S", "NT", "AT"];
const contractRank = (c: Contract): number => CONTRACT_ORDER.indexOf(c);

export const MATCH_TARGET = 151;
const VALAT_BONUS = 90;

interface Play {
  seat: Seat;
  card: Card;
}

/** Per-deal result summary, kept for the UI scoreboard. */
export interface DealSummary {
  dealNo: number;
  contract: Contract;
  declarer: Seat;
  doubling: 1 | 2 | 4;
  /** Raw card+declaration totals per team for the deal. */
  raw: [number, number];
  /** Match points actually awarded per team (after rounding/inside/contra). */
  awarded: [number, number];
  inside: boolean;
  hung: number;
  valat: number | null; // team that made valat, if any
}

export interface BeloteState {
  phase: "BID" | "PLAY";
  hands: Card[][];
  dealer: Seat;
  turn: Seat;
  leader: Seat;
  // ── bidding ──
  contract: Contract | null;
  declarer: Seat | null;
  doubling: 1 | 2 | 4;
  passes: number; // consecutive passes
  // ── current deal ──
  trick: Play[];
  teamPoints: [number, number]; // raw card points this deal (incl. declarations)
  tricksTaken: [number, number];
  declPoints: [number, number];
  declarations: Declaration[];
  lastTrickWinner: Seat | null;
  // ── match ──
  matchPoints: [number, number];
  hanging: number; // „висящи" points awaiting the next deal's winner
  dealNo: number;
  lastDeal: DealSummary | null;
  winningTeam: number | null;
  done: boolean;
  /** Kept for backwards compatibility with the UI ("S"|"H"|"D"|"C"|null). */
  trump: Suit | null;
}

export type BeloteAction =
  | { type: "PASS" }
  | { type: "BID"; contract: Contract }
  | { type: "CALL"; suit: Suit } // legacy alias of BID for plain suits
  | { type: "CONTRA" }
  | { type: "RECONTRA" }
  | { type: "PLAY"; card: Card };

export type BeloteEvent =
  | { type: "BID"; seat: Seat; contract: Contract }
  | { type: "PASS"; seat: Seat }
  | { type: "CONTRA"; seat: Seat }
  | { type: "RECONTRA"; seat: Seat }
  | { type: "REDEAL" }
  | { type: "CONTRACT"; contract: Contract; declarer: Seat; doubling: number }
  | { type: "DECLARATIONS"; declarations: Declaration[]; teamPoints: [number, number] }
  | { type: "PLAY"; seat: Seat; card: Card }
  | { type: "TRICK"; seat: Seat; points: number }
  | { type: "DEAL_END"; summary: DealSummary; matchPoints: [number, number] }
  | { type: "RESULT"; team: number };

const next4 = (s: Seat): Seat => ((s + 1) % 4) as Seat;
const team = (s: Seat): number => s % 2;
const at2 = (t: [number, number], i: number): number => (i === 0 ? t[0] : t[1]);

function cardValue(c: Card, contract: Contract): number {
  const r = rankOf(c);
  if (contract === "AT") return TRUMP_VALUE[r] ?? 0;
  if (contract === "NT") return PLAIN_VALUE[r] ?? 0;
  return suitOf(c) === contract ? (TRUMP_VALUE[r] ?? 0) : (PLAIN_VALUE[r] ?? 0);
}

function strengthOf(c: Card, contract: Contract): number {
  const r = rankOf(c);
  if (contract === "AT") return TRUMP_STRENGTH[r] ?? 0;
  if (contract === "NT") return PLAIN_STRENGTH[r] ?? 0;
  return suitOf(c) === contract ? (TRUMP_STRENGTH[r] ?? 0) : (PLAIN_STRENGTH[r] ?? 0);
}

/** Does card `a` beat the current winning card `b` under `contract`? */
function beats(a: Card, b: Card, contract: Contract): boolean {
  if (contract === "AT" || contract === "NT") {
    // Only cards of the led (= b's effective) suit compete; no cross-trumping.
    if (suitOf(a) !== suitOf(b)) return false;
    return strengthOf(a, contract) > strengthOf(b, contract);
  }
  const trump = contract;
  const aT = suitOf(a) === trump;
  const bT = suitOf(b) === trump;
  if (aT && !bT) return true;
  if (!aT && bT) return false;
  if (suitOf(a) !== suitOf(b)) return false;
  return strengthOf(a, contract) > strengthOf(b, contract);
}

/** The play currently winning the (non-empty) trick. */
function trickWinner(trick: Play[], contract: Contract): Play {
  let best = trick[0]!;
  for (const p of trick.slice(1)) if (beats(p.card, best.card, contract)) best = p;
  return best;
}

/** Legal cards for `seat` given the real Bulgarian obligations. */
function legalCards(state: BeloteState, seat: Seat): Card[] {
  const hand = state.hands[seat]!;
  const contract = state.contract!;
  if (state.trick.length === 0) return hand.slice();

  const ledSuit = suitOf(state.trick[0]!.card);
  const best = trickWinner(state.trick, contract);
  const partnerWinning = team(best.seat) === team(seat);
  const inLed = hand.filter((c) => suitOf(c) === ledSuit);

  if (contract === "NT") {
    // Без коз: само отговаряш на боята.
    return inLed.length > 0 ? inLed : hand.slice();
  }

  if (contract === "AT") {
    // Всичко коз: отговаряш и КАЧВАШ в боята, ако можеш.
    if (inLed.length === 0) return hand.slice();
    const higher = inLed.filter((c) => beats(c, best.card, contract));
    return higher.length > 0 ? higher : inLed;
  }

  const trump = contract;
  if (inLed.length > 0) {
    if (ledSuit === trump) {
      // Боята е коз → надцакваш ако можеш.
      const higher = inLed.filter((c) => beats(c, best.card, contract));
      return higher.length > 0 ? higher : inLed;
    }
    return inLed;
  }

  // Без карта от боята: цакаш, освен ако партньорът държи взятката.
  const trumps = hand.filter((c) => suitOf(c) === trump);
  if (trumps.length === 0 || partnerWinning) return hand.slice();
  const bestIsTrump = suitOf(best.card) === trump;
  if (bestIsTrump) {
    const over = trumps.filter((c) => beats(c, best.card, contract));
    return over.length > 0 ? over : trumps; // подцакваш, ако не можеш да надцакаш
  }
  return trumps;
}

function dealHands(rng: SeededRng): Card[][] {
  const deck = rng.shuffle(buildDeck(RANKS));
  return [deck.slice(0, 8), deck.slice(8, 16), deck.slice(16, 24), deck.slice(24, 32)];
}

/** Reset per-deal fields and deal the next hand (dealer already rotated). */
function freshDeal(state: BeloteState, rng: SeededRng): void {
  state.hands = dealHands(rng);
  state.phase = "BID";
  state.contract = null;
  state.trump = null;
  state.declarer = null;
  state.doubling = 1;
  state.passes = 0;
  state.trick = [];
  state.teamPoints = [0, 0];
  state.tricksTaken = [0, 0];
  state.declPoints = [0, 0];
  state.declarations = [];
  state.lastTrickWinner = null;
  state.turn = next4(state.dealer);
  state.leader = next4(state.dealer);
  state.dealNo += 1;
}

function startPlay(state: BeloteState, events: BeloteEvent[]): void {
  state.phase = "PLAY";
  const contract = state.contract!;
  state.trump = contract === "NT" || contract === "AT" ? null : contract;
  const first = next4(state.dealer);
  state.leader = first;
  state.turn = first;
  events.push({ type: "CONTRACT", contract, declarer: state.declarer!, doubling: state.doubling });

  // Обяви (терца/50/100/каре/белот) — без коз няма обяви.
  const mode: DeclMode = contract;
  const { teamPoints, scored } = resolveDeclarations(state.hands, mode);
  state.declPoints = teamPoints;
  state.declarations = scored;
  state.teamPoints[0] += teamPoints[0];
  state.teamPoints[1] += teamPoints[1];
  if (scored.length > 0) {
    events.push({ type: "DECLARATIONS", declarations: scored, teamPoints });
  }
}

/** Score a finished deal into match points; start the next deal unless over. */
function settleDeal(state: BeloteState, rng: SeededRng, events: BeloteEvent[]): void {
  const contract = state.contract!;
  const declTeam = team(state.declarer!);
  const oppTeam = 1 - declTeam;
  const mult = contract === "NT" ? 2 : 1; // без коз: точките се удвояват (общо 260)

  const raw: [number, number] = [state.teamPoints[0] * mult, state.teamPoints[1] * mult];
  let valat: number | null = null;
  for (const t of [0, 1]) {
    if (state.tricksTaken[t === 0 ? 1 : 0] === 0 && at2(state.tricksTaken, t) === 8) {
      valat = t;
      // Валат: губещите губят и обявите си; победителите получават +90.
      raw[t === 0 ? 1 : 0] = 0;
      raw[t as 0 | 1] += VALAT_BONUS;
    }
  }

  // Rounding follows the table convention instead of plain Math.round:
  // на боя remainder 5 rounds DOWN (95:67 → 9:7, не 10:7); на всичко коз
  // remainder 4 rounds UP for the NON-declaring team (134:124 → 13:13 = 26).
  const roundFor = (points: number, teamIdx: number): number => {
    const rem = points % 10;
    if (contract === "AT" && rem === 4 && teamIdx !== declTeam) return Math.ceil(points / 10);
    if (contract !== "AT" && contract !== "NT" && rem === 5) return Math.floor(points / 10);
    return Math.round(points / 10);
  };
  const rounded: [number, number] = [roundFor(raw[0], 0), roundFor(raw[1], 1)];
  const awarded: [number, number] = [0, 0];
  let inside = false;
  let hungNow = 0;

  if (raw[declTeam as 0 | 1] > raw[oppTeam as 0 | 1]) {
    // Договорът е изпълнен.
    if (state.doubling > 1) {
      awarded[declTeam as 0 | 1] = (rounded[0] + rounded[1]) * state.doubling;
    } else {
      awarded[0] = rounded[0];
      awarded[1] = rounded[1];
    }
    awarded[declTeam as 0 | 1] += state.hanging;
    state.hanging = 0;
  } else if (raw[declTeam as 0 | 1] < raw[oppTeam as 0 | 1]) {
    // „Вътре" — противникът взима всичко.
    inside = true;
    awarded[oppTeam as 0 | 1] = (rounded[0] + rounded[1]) * state.doubling + state.hanging;
    state.hanging = 0;
  } else if (state.doubling > 1) {
    // Равни при контра/реконтра: ЦЕЛИЯТ удвоен сбор виси — никой не записва.
    hungNow = (rounded[0] + rounded[1]) * state.doubling;
    state.hanging += hungNow;
  } else {
    // Равни → точките на обявилия отбор „висят" за следващото раздаване.
    awarded[oppTeam as 0 | 1] = rounded[oppTeam as 0 | 1];
    hungNow = rounded[declTeam as 0 | 1] * state.doubling;
    state.hanging += hungNow;
  }

  state.matchPoints = [state.matchPoints[0] + awarded[0], state.matchPoints[1] + awarded[1]];
  const summary: DealSummary = {
    dealNo: state.dealNo,
    contract,
    declarer: state.declarer!,
    doubling: state.doubling,
    raw,
    awarded,
    inside,
    hung: hungNow,
    valat,
  };
  state.lastDeal = summary;
  events.push({ type: "DEAL_END", summary, matchPoints: [...state.matchPoints] });

  const [a, b] = state.matchPoints;
  if ((a >= MATCH_TARGET || b >= MATCH_TARGET) && a !== b) {
    state.winningTeam = a > b ? 0 : 1;
    state.done = true;
    events.push({ type: "RESULT", team: state.winningTeam });
    return;
  }

  state.dealer = next4(state.dealer);
  freshDeal(state, rng);
}

/** Hand strength estimate used by the bot to pick a bid (rough but sane). */
function bidStrength(hand: Card[], contract: Contract): number {
  if (contract === "AT") {
    const jacks = hand.filter((c) => rankOf(c) === "J").length;
    const nines = hand.filter((c) => rankOf(c) === "9").length;
    return jacks * 22 + nines * 11;
  }
  if (contract === "NT") {
    const aces = hand.filter((c) => rankOf(c) === "A").length;
    const tens = hand.filter((c) => rankOf(c) === "T").length;
    return aces * 16 + tens * 8;
  }
  const suit = contract;
  const inSuit = hand.filter((c) => suitOf(c) === suit);
  let s = inSuit.length * 6;
  for (const c of inSuit) s += TRUMP_VALUE[rankOf(c)] ?? 0;
  for (const c of hand) if (suitOf(c) !== suit && rankOf(c) === "A") s += 8;
  return s;
}

export const beloteEngine: GameEngine<BeloteState, BeloteAction, BeloteEvent> = {
  init(_opts: InitOpts, rng: SeededRng): BeloteState {
    const dealer: Seat = 0;
    const state: BeloteState = {
      phase: "BID",
      hands: dealHands(rng),
      dealer,
      turn: next4(dealer),
      leader: next4(dealer),
      contract: null,
      trump: null,
      declarer: null,
      doubling: 1,
      passes: 0,
      trick: [],
      teamPoints: [0, 0],
      tricksTaken: [0, 0],
      declPoints: [0, 0],
      declarations: [],
      lastTrickWinner: null,
      matchPoints: [0, 0],
      hanging: 0,
      dealNo: 1,
      lastDeal: null,
      winningTeam: null,
      done: false,
    };
    return state;
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    if (state.phase === "BID") {
      const actions: BeloteAction[] = [{ type: "PASS" }];
      const from = state.contract ? contractRank(state.contract) + 1 : 0;
      for (const c of CONTRACT_ORDER.slice(from)) actions.push({ type: "BID", contract: c });
      if (state.contract && state.declarer !== null) {
        const myTeam = team(seat);
        const ownerTeam = team(state.declarer);
        if (state.doubling === 1 && myTeam !== ownerTeam) actions.push({ type: "CONTRA" });
        if (state.doubling === 2 && myTeam === ownerTeam) actions.push({ type: "RECONTRA" });
      }
      return actions;
    }
    return legalCards(state, seat).map((card) => ({ type: "PLAY", card }));
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    // Legacy CALL → BID alias (older clients).
    if (action.type === "CALL") action = { type: "BID", contract: action.suit };
    const seat = state.turn;
    const legal = this.legalActions(state, seat);
    const matches = (a: BeloteAction, b: BeloteAction): boolean => {
      if (a.type !== b.type) return false;
      if (a.type === "BID" && b.type === "BID") return a.contract === b.contract;
      if (a.type === "PLAY" && b.type === "PLAY") return a.card === b.card;
      return true;
    };
    if (!legal.some((l) => matches(l, action))) {
      throw new IllegalActionError(`Illegal belote action ${JSON.stringify(action)}`);
    }

    const next: BeloteState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      trick: state.trick.slice(),
      teamPoints: [state.teamPoints[0], state.teamPoints[1]],
      tricksTaken: [state.tricksTaken[0], state.tricksTaken[1]],
      matchPoints: [state.matchPoints[0], state.matchPoints[1]],
    };
    const events: BeloteEvent[] = [];

    if (next.phase === "BID") {
      if (action.type === "PASS") {
        next.passes += 1;
        events.push({ type: "PASS", seat });
        if (next.contract === null) {
          if (next.passes >= 4) {
            // Четири паса без договор → ново раздаване от следващия раздаващ.
            events.push({ type: "REDEAL" });
            next.dealer = next4(next.dealer);
            freshDeal(next, rng);
          } else {
            next.turn = next4(seat);
          }
        } else if (next.passes >= 3) {
          startPlay(next, events);
        } else {
          next.turn = next4(seat);
        }
        return { state: next, events };
      }
      if (action.type === "BID") {
        next.contract = action.contract;
        next.declarer = seat;
        next.doubling = 1;
        next.passes = 0;
        next.turn = next4(seat);
        events.push({ type: "BID", seat, contract: action.contract });
        return { state: next, events };
      }
      if (action.type === "CONTRA") {
        next.doubling = 2;
        next.passes = 0;
        next.turn = next4(seat);
        events.push({ type: "CONTRA", seat });
        return { state: next, events };
      }
      if (action.type === "RECONTRA") {
        next.doubling = 4;
        next.passes = 0;
        next.turn = next4(seat);
        events.push({ type: "RECONTRA", seat });
        return { state: next, events };
      }
      throw new IllegalActionError("Expected bid action");
    }

    // PLAY
    if (action.type !== "PLAY") throw new IllegalActionError("Expected play action");
    next.hands[seat] = next.hands[seat]!.filter((c) => c !== action.card);
    next.trick.push({ seat, card: action.card });
    events.push({ type: "PLAY", seat, card: action.card });

    if (next.trick.length < 4) {
      next.turn = next4(seat);
      return { state: next, events };
    }

    // Resolve the trick.
    const contract = next.contract!;
    const best = trickWinner(next.trick, contract);
    const pts = next.trick.reduce((acc, p) => acc + cardValue(p.card, contract), 0);
    const winner = best.seat;
    const wTeam = team(winner);
    next.teamPoints[wTeam] = at2(next.teamPoints, wTeam) + pts;
    next.tricksTaken[wTeam] = at2(next.tricksTaken, wTeam) + 1;
    next.lastTrickWinner = winner;
    next.trick = [];
    next.leader = winner;
    next.turn = winner;
    events.push({ type: "TRICK", seat: winner, points: pts });

    if (next.hands.every((h) => h.length === 0)) {
      next.teamPoints[wTeam] = at2(next.teamPoints, wTeam) + 10; // последна взятка
      settleDeal(next, rng, events);
    }

    return { state: next, events };
  },

  /** Heuristic bot: bids on real strength, plays cheapest winning card. */
  bot(state, seat, _rng) {
    if (state.done || seat !== state.turn) return null;
    if (state.phase === "BID") {
      const hand = state.hands[seat]!;
      const from = state.contract ? contractRank(state.contract) + 1 : 0;
      // Bid the MINIMUM sufficient contract: strength scales across contracts
      // are incomparable, so "highest score wins" made every bot leapfrog to
      // Всичко коз and human suit bids stayed permanently locked out.
      for (const c of CONTRACT_ORDER.slice(from)) {
        const s = bidStrength(hand, c);
        // NT/AT only on genuinely strong hands (two jacks / two nines класа).
        const threshold = c === "AT" ? 66 : c === "NT" ? 52 : 46;
        if (s >= threshold) return { type: "BID", contract: c };
      }
      return { type: "PASS" };
    }
    const cards = legalCards(state, seat);
    if (cards.length === 0) return null;
    const contract = state.contract!;
    const cheapest = (pool: Card[]): Card =>
      pool.reduce((m, c) => (cardValue(c, contract) < cardValue(m, contract) ? c : m));
    if (state.trick.length > 0) {
      const best = trickWinner(state.trick, contract);
      const partnerWinning = team(best.seat) === team(seat);
      const winning = cards.filter((c) => beats(c, best.card, contract));
      if (partnerWinning && state.trick.length === 3) {
        // Партньорът държи последен — дай му точки или се освободи евтино.
        return { type: "PLAY", card: cheapest(cards) };
      }
      if (winning.length > 0) {
        // Спечели възможно най-евтино.
        return { type: "PLAY", card: cheapest(winning) };
      }
      return { type: "PLAY", card: cheapest(cards) };
    }
    // Водиш: извади най-силната си карта (груба, но смислена линия).
    const strongest = cards.reduce((m, c) =>
      strengthOf(c, contract) + cardValue(c, contract) > strengthOf(m, contract) + cardValue(m, contract) ? c : m,
    );
    return { type: "PLAY", card: strongest };
  },

  isTerminal: (state) => state.done,

  score(state): SeatScore[] {
    const winTeam = state.winningTeam ?? 0;
    return [0, 1, 2, 3].map((seat) => ({
      seat: seat as Seat,
      result: team(seat as Seat) === winTeam ? "win" : "loss",
      points: team(seat as Seat) === winTeam ? 1 : 0,
    }));
  },

  redact(state, seat) {
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : hiddenLike(h)));
    return { ...state, hands };
  },
};
