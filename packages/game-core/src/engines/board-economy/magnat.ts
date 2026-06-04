import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * МАГНАТ (Tycoon) — 2–6p property-trading board game on a Bulgarian-cities
 * board (§ new). A roll-and-move economic game in the public-domain lineage of
 * The Landlord's Game (1904): all mechanics, original theming and names, no
 * third-party IP.
 *
 * Server-authoritative and deterministic (all randomness via the injected rng).
 * Open information, so `redact` only hides the unseen card order. Guaranteed to
 * terminate: the last solvent player wins, or — if the turn cap is reached —
 * the highest net worth wins (ties broken by lowest seat, so there is always
 * exactly one winner).
 *
 * Turn FSM: ROLL → (resolve landing) → [BUY] → MANAGE → END. Doubles grant an
 * extra roll; three doubles or the "go to jail" tile send you to jail.
 */

const BOARD_SIZE = 40;
const GO_SALARY = 200;
const JAIL_TILE = 10;
const JAIL_FINE = 50;
const START_CASH = 1500;
const MAX_TURNS = 300; // hard cap → game always terminates

type TileType = "go" | "prop" | "chance" | "chest" | "tax" | "jail" | "free" | "gotojail" | "station" | "utility";
interface Tile {
  type: TileType;
  name: string;
  group: number; // 0..7 for properties, -1 otherwise
  price: number; // ownables only
  tax: number; // tax tiles only
}

function t(type: TileType, name: string, opts: Partial<Tile> = {}): Tile {
  return { type, name, group: opts.group ?? -1, price: opts.price ?? 0, tax: opts.tax ?? 0 };
}

/** The 40-tile board, Bulgarian-cities themed (stations use the four big cities). */
export const BOARD: Tile[] = [
  t("go", "Старт"),
  t("prop", "Видин", { group: 0, price: 60 }),
  t("chest", "Каса"),
  t("prop", "Враца", { group: 0, price: 60 }),
  t("tax", "Данък общ доход", { tax: 200 }),
  t("station", "Гара София", { price: 200 }),
  t("prop", "Монтана", { group: 1, price: 100 }),
  t("chance", "Късмет"),
  t("prop", "Ловеч", { group: 1, price: 100 }),
  t("prop", "Габрово", { group: 1, price: 120 }),
  t("jail", "Затвор"),
  t("prop", "Търговище", { group: 2, price: 140 }),
  t("utility", "ВиК", { price: 150 }),
  t("prop", "Разград", { group: 2, price: 140 }),
  t("prop", "Силистра", { group: 2, price: 160 }),
  t("station", "Гара Пловдив", { price: 200 }),
  t("prop", "Кърджали", { group: 3, price: 180 }),
  t("chest", "Каса"),
  t("prop", "Смолян", { group: 3, price: 180 }),
  t("prop", "Пазарджик", { group: 3, price: 200 }),
  t("free", "Безплатен паркинг"),
  t("prop", "Сливен", { group: 4, price: 220 }),
  t("chance", "Късмет"),
  t("prop", "Ямбол", { group: 4, price: 220 }),
  t("prop", "Хасково", { group: 4, price: 240 }),
  t("station", "Гара Варна", { price: 200 }),
  t("prop", "Благоевград", { group: 5, price: 260 }),
  t("prop", "Кюстендил", { group: 5, price: 260 }),
  t("utility", "Електроразпределение", { price: 150 }),
  t("prop", "Перник", { group: 5, price: 280 }),
  t("gotojail", "Отиваш в затвора"),
  t("prop", "Стара Загора", { group: 6, price: 300 }),
  t("prop", "Плевен", { group: 6, price: 300 }),
  t("chest", "Каса"),
  t("prop", "Русе", { group: 6, price: 320 }),
  t("station", "Гара Бургас", { price: 200 }),
  t("chance", "Късмет"),
  t("prop", "кв. Витоша", { group: 7, price: 350 }),
  t("tax", "Луксозен данък", { tax: 100 }),
  t("prop", "кв. Лозенец", { group: 7, price: 400 }),
];

const HOUSE_COST_BY_GROUP = [50, 50, 100, 100, 150, 150, 200, 200];
const GROUP_TILES: number[][] = (() => {
  const m: number[][] = Array.from({ length: 8 }, () => []);
  BOARD.forEach((tile, i) => {
    if (tile.type === "prop") m[tile.group]!.push(i);
  });
  return m;
})();
const STATIONS = BOARD.map((tile, i) => (tile.type === "station" ? i : -1)).filter((i) => i >= 0);
const UTILITIES = BOARD.map((tile, i) => (tile.type === "utility" ? i : -1)).filter((i) => i >= 0);

/* ── cards (safe effects only — no rent/recursion) ──────────────────────── */
type CardEffect =
  | { kind: "money"; amount: number }
  | { kind: "jail" }
  | { kind: "gojf" }
  | { kind: "payEach"; amount: number }
  | { kind: "collectEach"; amount: number }
  | { kind: "go" };
interface Card {
  text: string;
  effect: CardEffect;
}

export const CHANCE: Card[] = [
  { text: "Дивиденти от акции — получаваш 150", effect: { kind: "money", amount: 150 } },
  { text: "Глоба за превишена скорост — плащаш 50", effect: { kind: "money", amount: -50 } },
  { text: "Отиваш директно в затвора", effect: { kind: "jail" } },
  { text: "Карта „Излизане от затвора“", effect: { kind: "gojf" } },
  { text: "Печалба от лотарията — получаваш 100", effect: { kind: "money", amount: 100 } },
  { text: "Черпиш компанията — плащаш по 50 на всеки", effect: { kind: "payEach", amount: 50 } },
  { text: "Имен ден — всеки ти дава по 50", effect: { kind: "collectEach", amount: 50 } },
  { text: "Премести се на Старт (+200)", effect: { kind: "go" } },
];
export const CHEST: Card[] = [
  { text: "Наследство — получаваш 200", effect: { kind: "money", amount: 200 } },
  { text: "Връщане на надвзет данък — получаваш 100", effect: { kind: "money", amount: 100 } },
  { text: "Болнична сметка — плащаш 100", effect: { kind: "money", amount: -100 } },
  { text: "Награда за красота — получаваш 50", effect: { kind: "money", amount: 50 } },
  { text: "Отиваш директно в затвора", effect: { kind: "jail" } },
  { text: "Карта „Излизане от затвора“", effect: { kind: "gojf" } },
  { text: "Рожден ден — всеки ти дава по 25", effect: { kind: "collectEach", amount: 25 } },
  { text: "Училищна такса — плащаш 50", effect: { kind: "money", amount: -50 } },
];

export interface MagnatState {
  seats: number;
  turn: Seat;
  phase: "ROLL" | "BUY" | "MANAGE";
  cash: number[];
  pos: number[];
  inJail: boolean[];
  jailTurns: number[];
  gojf: number[];
  bankrupt: boolean[];
  owner: number[]; // per tile → seat, or -1
  houses: number[]; // per tile → 0..5 (5 = hotel)
  mortgaged: boolean[];
  dice: [number, number] | null;
  doubles: number; // consecutive doubles this turn
  extraRoll: boolean; // rolled doubles → roll again at END
  pendingBuy: number | null;
  chance: number[];
  chancePtr: number;
  chest: number[];
  chestPtr: number;
  turns: number; // total completed turns (for the cap)
  done: boolean;
  log: string[];
}

export type MagnatAction =
  | { type: "ROLL" }
  | { type: "BUY" }
  | { type: "DECLINE" }
  | { type: "BUILD"; tile: number }
  | { type: "SELL"; tile: number }
  | { type: "MORTGAGE"; tile: number }
  | { type: "UNMORTGAGE"; tile: number }
  | { type: "END" }
  | { type: "JAIL_PAY" }
  | { type: "JAIL_CARD" };

export type MagnatEvent =
  | { type: "ROLL"; seat: Seat; dice: [number, number] }
  | { type: "MOVE"; seat: Seat; to: number }
  | { type: "BUY"; seat: Seat; tile: number }
  | { type: "RENT"; seat: Seat; to: Seat; amount: number }
  | { type: "CARD"; seat: Seat; text: string }
  | { type: "JAIL"; seat: Seat }
  | { type: "BANKRUPT"; seat: Seat; to: Seat | null }
  | { type: "WIN"; seat: Seat };

/* ── helpers ────────────────────────────────────────────────────────────── */
const tile = (i: number): Tile => BOARD[i]!;
const isOwnable = (i: number): boolean => ["prop", "station", "utility"].includes(tile(i).type);
const houseCost = (i: number): number => HOUSE_COST_BY_GROUP[tile(i).group] ?? 0;
const mortgageValue = (i: number): number => Math.floor(tile(i).price / 2);
const unmortgageCost = (i: number): number => Math.ceil(mortgageValue(i) * 1.1);
const baseRent = (i: number): number => Math.max(1, Math.round(tile(i).price / 10));

function ownsGroup(s: MagnatState, seat: Seat, group: number): boolean {
  return GROUP_TILES[group]!.every((i) => s.owner[i] === seat);
}
function countOwned(s: MagnatState, seat: Seat, tiles: number[]): number {
  return tiles.reduce((n, i) => n + (s.owner[i] === seat ? 1 : 0), 0);
}

function rentFor(s: MagnatState, i: number, diceSum: number): number {
  const owner = s.owner[i]!;
  const tl = tile(i);
  if (tl.type === "station") return 25 * 2 ** (countOwned(s, owner, STATIONS) - 1);
  if (tl.type === "utility") return (countOwned(s, owner, UTILITIES) === 2 ? 10 : 4) * diceSum;
  const b = baseRent(i);
  const h = s.houses[i]!;
  if (h === 0) return ownsGroup(s, owner, tl.group) ? b * 2 : b;
  return [0, b * 5, b * 15, b * 40, b * 70, b * 100][h]!;
}

function netWorth(s: MagnatState, seat: Seat): number {
  let w = s.cash[seat]!;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (s.owner[i] !== seat) continue;
    w += s.mortgaged[i] ? mortgageValue(i) : tile(i).price;
    w += s.houses[i]! * Math.floor(houseCost(i) / 2);
  }
  return w;
}

function activeSeats(s: MagnatState): number[] {
  return s.cash.map((_, i) => i).filter((i) => !s.bankrupt[i]);
}

function pushLog(s: MagnatState, msg: string): void {
  s.log.push(msg);
  if (s.log.length > 12) s.log.shift();
}

/* ── build / mortgage predicates (shared by legalActions + reduce) ──────── */
function canBuild(s: MagnatState, seat: Seat, i: number): boolean {
  const tl = tile(i);
  if (tl.type !== "prop" || s.owner[i] !== seat) return false;
  if (!ownsGroup(s, seat, tl.group)) return false;
  const group = GROUP_TILES[tl.group]!;
  if (group.some((g) => s.mortgaged[g])) return false;
  if (s.houses[i]! >= 5) return false;
  if (s.cash[seat]! < houseCost(i)) return false;
  const min = Math.min(...group.map((g) => s.houses[g]!));
  return s.houses[i]! === min; // even build
}
function canSell(s: MagnatState, seat: Seat, i: number): boolean {
  const tl = tile(i);
  if (tl.type !== "prop" || s.owner[i] !== seat || s.houses[i]! === 0) return false;
  const group = GROUP_TILES[tl.group]!;
  const max = Math.max(...group.map((g) => s.houses[g]!));
  return s.houses[i]! === max; // even sell
}
function canMortgage(s: MagnatState, seat: Seat, i: number): boolean {
  if (!isOwnable(i) || s.owner[i] !== seat || s.mortgaged[i]) return false;
  const tl = tile(i);
  if (tl.type === "prop" && GROUP_TILES[tl.group]!.some((g) => s.houses[g]! > 0)) return false;
  return true;
}
function canUnmortgage(s: MagnatState, seat: Seat, i: number): boolean {
  return isOwnable(i) && s.owner[i] === seat && s.mortgaged[i] === true && s.cash[seat]! >= unmortgageCost(i);
}

/* ── money: charge with auto-liquidation, then bankruptcy ───────────────── */
function autoLiquidate(s: MagnatState, debtor: Seat, target: number): void {
  // sell houses (highest first), then mortgage unmortgaged ownables.
  let guard = 0;
  while (s.cash[debtor]! < target && guard++ < 500) {
    let best = -1;
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (s.owner[i] === debtor && s.houses[i]! > 0 && (best < 0 || s.houses[i]! > s.houses[best]!)) best = i;
    }
    if (best < 0) break;
    s.houses[best]!--;
    s.cash[debtor]! += Math.floor(houseCost(best) / 2);
  }
  guard = 0;
  while (s.cash[debtor]! < target && guard++ < 500) {
    let m = -1;
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (s.owner[i] === debtor && !s.mortgaged[i] && isOwnable(i)) {
        m = i;
        break;
      }
    }
    if (m < 0) break;
    s.mortgaged[m] = true;
    s.cash[debtor]! += mortgageValue(m);
  }
}

/** Move `amount` from debtor to creditor (-1 = bank). Liquidates/bankrupts as needed. */
function charge(s: MagnatState, debtor: Seat, amount: number, creditor: Seat | null, events: MagnatEvent[]): void {
  if (amount <= 0) return;
  if (s.cash[debtor]! < amount) autoLiquidate(s, debtor, amount);
  if (s.cash[debtor]! >= amount) {
    s.cash[debtor]! -= amount;
    if (creditor !== null) s.cash[creditor]! += amount;
    return;
  }
  // insolvent → bankrupt, transfer remaining estate to creditor (or bank).
  const to = creditor;
  if (to !== null) s.cash[to]! += s.cash[debtor]!;
  s.cash[debtor]! = 0;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (s.owner[i] !== debtor) continue;
    if (to !== null) {
      // houses sold to bank, proceeds to creditor; property (mortgaged) transfers.
      if (s.houses[i]! > 0) {
        s.cash[to]! += s.houses[i]! * Math.floor(houseCost(i) / 2);
        s.houses[i]! = 0;
      }
      s.owner[i] = to;
    } else {
      s.owner[i] = -1;
      s.houses[i]! = 0;
      s.mortgaged[i] = false;
    }
  }
  s.bankrupt[debtor] = true;
  s.inJail[debtor] = false;
  events.push({ type: "BANKRUPT", seat: debtor, to });
  pushLog(s, `${BOARD[s.pos[debtor]!]!.name}: играч ${debtor + 1} банкрутира`);
}

function sendToJail(s: MagnatState, seat: Seat, events: MagnatEvent[]): void {
  s.pos[seat] = JAIL_TILE;
  s.inJail[seat] = true;
  s.jailTurns[seat] = 0;
  s.doubles = 0;
  s.extraRoll = false;
  events.push({ type: "JAIL", seat });
  pushLog(s, `Играч ${seat + 1} отива в затвора`);
}

function clone(s: MagnatState): MagnatState {
  return {
    ...s,
    cash: s.cash.slice(),
    pos: s.pos.slice(),
    inJail: s.inJail.slice(),
    jailTurns: s.jailTurns.slice(),
    gojf: s.gojf.slice(),
    bankrupt: s.bankrupt.slice(),
    owner: s.owner.slice(),
    houses: s.houses.slice(),
    mortgaged: s.mortgaged.slice(),
    dice: s.dice ? [s.dice[0], s.dice[1]] : null,
    chance: s.chance.slice(),
    chest: s.chest.slice(),
    log: s.log.slice(),
  };
}

function endTurn(s: MagnatState): void {
  s.dice = null;
  s.doubles = 0;
  s.extraRoll = false;
  s.pendingBuy = null;
  s.phase = "ROLL";
  s.turns++;
  if (checkEnd(s)) return;
  let next = (s.turn + 1) % s.seats;
  let guard = 0;
  while (s.bankrupt[next] && guard++ < s.seats) next = (next + 1) % s.seats;
  s.turn = next;
}

/** End by last-solvent or turn cap; sets done + records the winner. */
function checkEnd(s: MagnatState): boolean {
  const active = activeSeats(s);
  if (active.length <= 1 || s.turns >= MAX_TURNS) {
    s.done = true;
    return true;
  }
  return false;
}

function winner(s: MagnatState): Seat {
  const active = activeSeats(s);
  if (active.length === 0) return 0;
  let best = active[0]!;
  let bestW = netWorth(s, best);
  for (const seat of active) {
    const w = netWorth(s, seat);
    if (w > bestW) {
      bestW = w;
      best = seat;
    }
  }
  return best; // ties resolved by iteration order → lowest seat
}

/* ── landing resolution ─────────────────────────────────────────────────── */
function applyCard(s: MagnatState, seat: Seat, card: Card, events: MagnatEvent[]): { jailed: boolean } {
  events.push({ type: "CARD", seat, text: card.text });
  pushLog(s, card.text);
  const eff = card.effect;
  switch (eff.kind) {
    case "money":
      if (eff.amount >= 0) s.cash[seat]! += eff.amount;
      else charge(s, seat, -eff.amount, null, events);
      return { jailed: false };
    case "jail":
      sendToJail(s, seat, events);
      return { jailed: true };
    case "gojf":
      s.gojf[seat]!++;
      return { jailed: false };
    case "collectEach":
      for (const o of activeSeats(s)) if (o !== seat) charge(s, o, eff.amount, seat, events);
      return { jailed: false };
    case "payEach":
      for (const o of activeSeats(s)) if (o !== seat) charge(s, seat, eff.amount, o, events);
      return { jailed: false };
    case "go":
      s.cash[seat]! += GO_SALARY;
      s.pos[seat] = 0;
      return { jailed: false };
  }
}

/** Resolve the tile the seat just landed on. Returns whether they were jailed. */
function resolveLanding(s: MagnatState, seat: Seat, diceSum: number, events: MagnatEvent[]): { jailed: boolean } {
  const i = s.pos[seat]!;
  const tl = tile(i);
  switch (tl.type) {
    case "gotojail":
      sendToJail(s, seat, events);
      return { jailed: true };
    case "tax":
      charge(s, seat, tl.tax, null, events);
      return { jailed: false };
    case "chance": {
      const card = CHANCE[s.chance[s.chancePtr % s.chance.length]!]!;
      s.chancePtr++;
      return applyCard(s, seat, card, events);
    }
    case "chest": {
      const card = CHEST[s.chest[s.chestPtr % s.chest.length]!]!;
      s.chestPtr++;
      return applyCard(s, seat, card, events);
    }
    case "prop":
    case "station":
    case "utility": {
      const owner = s.owner[i]!;
      if (owner === -1) {
        s.pendingBuy = i;
      } else if (owner !== seat && !s.mortgaged[i] && !s.bankrupt[owner]) {
        const rent = rentFor(s, i, diceSum);
        charge(s, seat, rent, owner, events);
        events.push({ type: "RENT", seat, to: owner, amount: rent });
        pushLog(s, `${tl.name}: наем ${rent} към играч ${owner + 1}`);
      }
      return { jailed: false };
    }
    default:
      return { jailed: false };
  }
}

function advance(s: MagnatState, seat: Seat, steps: number, events: MagnatEvent[]): number {
  const before = s.pos[seat]!;
  const to = (before + steps) % BOARD_SIZE;
  if (before + steps >= BOARD_SIZE) s.cash[seat]! += GO_SALARY; // passed Старт
  s.pos[seat] = to;
  events.push({ type: "MOVE", seat, to });
  return to;
}

/** Place the seat into BUY (if a buy is pending) or MANAGE; jailed → end turn. */
function afterResolve(s: MagnatState, jailed: boolean): void {
  if (jailed) {
    endTurn(s);
    return;
  }
  s.phase = s.pendingBuy !== null ? "BUY" : "MANAGE";
}

/* ── engine ─────────────────────────────────────────────────────────────── */
export const magnatEngine: GameEngine<MagnatState, MagnatAction, MagnatEvent> = {
  init(opts: InitOpts, rng: SeededRng): MagnatState {
    const seats = Math.min(Math.max(opts.seats, 2), 6);
    const shuffle = (n: number): number[] => {
      const a = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    };
    return {
      seats,
      turn: 0,
      phase: "ROLL",
      cash: new Array<number>(seats).fill(START_CASH),
      pos: new Array<number>(seats).fill(0),
      inJail: new Array<boolean>(seats).fill(false),
      jailTurns: new Array<number>(seats).fill(0),
      gojf: new Array<number>(seats).fill(0),
      bankrupt: new Array<boolean>(seats).fill(false),
      owner: new Array<number>(BOARD_SIZE).fill(-1),
      houses: new Array<number>(BOARD_SIZE).fill(0),
      mortgaged: new Array<boolean>(BOARD_SIZE).fill(false),
      dice: null,
      doubles: 0,
      extraRoll: false,
      pendingBuy: null,
      chance: shuffle(CHANCE.length),
      chancePtr: 0,
      chest: shuffle(CHEST.length),
      chestPtr: 0,
      turns: 0,
      done: false,
      log: [],
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn || state.bankrupt[seat]) return [];
    const s = state;
    if (s.phase === "ROLL") {
      if (s.inJail[seat]) {
        const acts: MagnatAction[] = [{ type: "ROLL" }];
        if (s.cash[seat]! >= JAIL_FINE) acts.push({ type: "JAIL_PAY" });
        if (s.gojf[seat]! > 0) acts.push({ type: "JAIL_CARD" });
        return acts;
      }
      return [{ type: "ROLL" }];
    }
    if (s.phase === "BUY") {
      const acts: MagnatAction[] = [{ type: "DECLINE" }];
      if (s.pendingBuy !== null && s.cash[seat]! >= tile(s.pendingBuy).price) acts.unshift({ type: "BUY" });
      return acts;
    }
    // MANAGE
    const acts: MagnatAction[] = [{ type: "END" }];
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (canBuild(s, seat, i)) acts.push({ type: "BUILD", tile: i });
      if (canSell(s, seat, i)) acts.push({ type: "SELL", tile: i });
      if (canMortgage(s, seat, i)) acts.push({ type: "MORTGAGE", tile: i });
      if (canUnmortgage(s, seat, i)) acts.push({ type: "UNMORTGAGE", tile: i });
    }
    return acts;
  },

  reduce(state, action, rng: SeededRng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    if (state.bankrupt[seat]) throw new IllegalActionError("Bankrupt");
    const s = clone(state);
    const events: MagnatEvent[] = [];

    const finish = (): { state: MagnatState; events: MagnatEvent[] } => {
      if (s.done) {
        const w = winner(s);
        if (!events.some((e) => e.type === "WIN")) events.push({ type: "WIN", seat: w });
      }
      return { state: s, events };
    };

    switch (action.type) {
      case "JAIL_PAY": {
        if (s.phase !== "ROLL" || !s.inJail[seat] || s.cash[seat]! < JAIL_FINE) {
          throw new IllegalActionError("Cannot pay bail");
        }
        charge(s, seat, JAIL_FINE, null, events);
        s.inJail[seat] = false;
        s.jailTurns[seat] = 0;
        return finish(); // still ROLL phase — player now rolls
      }
      case "JAIL_CARD": {
        if (s.phase !== "ROLL" || !s.inJail[seat] || s.gojf[seat]! <= 0) {
          throw new IllegalActionError("No release card");
        }
        s.gojf[seat]!--;
        s.inJail[seat] = false;
        s.jailTurns[seat] = 0;
        return finish();
      }
      case "ROLL": {
        if (s.phase !== "ROLL") throw new IllegalActionError("Not the roll phase");
        const d1 = rng.die();
        const d2 = rng.die();
        s.dice = [d1, d2];
        events.push({ type: "ROLL", seat, dice: [d1, d2] });
        const sum = d1 + d2;
        const doubles = d1 === d2;

        if (s.inJail[seat]) {
          if (doubles) {
            s.inJail[seat] = false;
            s.jailTurns[seat] = 0;
          } else {
            s.jailTurns[seat]!++;
            if (s.jailTurns[seat]! >= 3) {
              charge(s, seat, JAIL_FINE, null, events);
              s.inJail[seat] = false;
              s.jailTurns[seat] = 0;
            } else {
              endTurn(s);
              return finish();
            }
          }
          const to = advance(s, seat, sum, events);
          const r = resolveLanding(s, seat, sum, events);
          if (s.bankrupt[seat]) {
            endTurn(s);
            return finish();
          }
          void to;
          afterResolve(s, r.jailed);
          return finish();
        }

        if (doubles) {
          s.doubles++;
          if (s.doubles >= 3) {
            sendToJail(s, seat, events);
            endTurn(s);
            return finish();
          }
        }
        s.extraRoll = doubles;
        advance(s, seat, sum, events);
        const r = resolveLanding(s, seat, sum, events);
        if (s.bankrupt[seat]) {
          endTurn(s);
          return finish();
        }
        afterResolve(s, r.jailed);
        return finish();
      }
      case "BUY": {
        if (s.phase !== "BUY" || s.pendingBuy === null) throw new IllegalActionError("Nothing to buy");
        const i = s.pendingBuy;
        if (s.cash[seat]! < tile(i).price) throw new IllegalActionError("Can't afford");
        s.cash[seat]! -= tile(i).price;
        s.owner[i] = seat;
        s.pendingBuy = null;
        s.phase = "MANAGE";
        events.push({ type: "BUY", seat, tile: i });
        pushLog(s, `Играч ${seat + 1} купува ${tile(i).name}`);
        return finish();
      }
      case "DECLINE": {
        if (s.phase !== "BUY") throw new IllegalActionError("Nothing to decline");
        s.pendingBuy = null;
        s.phase = "MANAGE";
        return finish();
      }
      case "BUILD": {
        if (s.phase !== "MANAGE" || !canBuild(s, seat, action.tile)) throw new IllegalActionError("Cannot build");
        s.cash[seat]! -= houseCost(action.tile);
        s.houses[action.tile]!++;
        return finish();
      }
      case "SELL": {
        if (s.phase !== "MANAGE" || !canSell(s, seat, action.tile)) throw new IllegalActionError("Cannot sell");
        s.houses[action.tile]!--;
        s.cash[seat]! += Math.floor(houseCost(action.tile) / 2);
        return finish();
      }
      case "MORTGAGE": {
        if (s.phase !== "MANAGE" || !canMortgage(s, seat, action.tile)) throw new IllegalActionError("Cannot mortgage");
        s.mortgaged[action.tile] = true;
        s.cash[seat]! += mortgageValue(action.tile);
        return finish();
      }
      case "UNMORTGAGE": {
        if (s.phase !== "MANAGE" || !canUnmortgage(s, seat, action.tile)) {
          throw new IllegalActionError("Cannot unmortgage");
        }
        s.cash[seat]! -= unmortgageCost(action.tile);
        s.mortgaged[action.tile] = false;
        return finish();
      }
      case "END": {
        if (s.phase !== "MANAGE") throw new IllegalActionError("Not the manage phase");
        if (s.extraRoll && !s.inJail[seat]) {
          s.dice = null;
          s.extraRoll = false;
          s.pendingBuy = null;
          s.phase = "ROLL"; // doubles → roll again, same player
        } else {
          endTurn(s);
        }
        return finish();
      }
      default:
        throw new IllegalActionError("Unknown action");
    }
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const win = winner(state);
    return state.cash.map((_, seat) => ({
      seat,
      result: seat === win ? "win" : "loss",
      points: seat === win ? 1 : 0,
    }));
  },

  // Open information except the unseen card order.
  redact: (s) => ({ ...s, chance: [], chest: [] }),
};
