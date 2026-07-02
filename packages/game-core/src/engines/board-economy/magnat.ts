import {
  BOARD,
  BOARD_SIZE,
  CHANCE,
  CHEST,
  GROUP_TILES,
  HOUSE_COST_BY_GROUP,
  STATIONS,
  UTILITIES,
  isOwnable,
  resolveMagnatConfig,
  type Card,
  type MagnatAction,
  type MagnatConfig,
  type MagnatEvent,
  type MagnatState,
  type Tile,
  type TradeBundle,
} from "@aso/shared";
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

const GO_SALARY = 200;
const JAIL_TILE = 10;
const JAIL_FINE = 50;

/* ── helpers ────────────────────────────────────────────────────────────── */
const tile = (i: number): Tile => BOARD[i]!;
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
  // A bankrupt debtor can't be charged again within the same reduce (would emit
  // a duplicate BANKRUPT and misdirect the already-transferred estate).
  if (amount <= 0 || s.bankrupt[debtor]) return;
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

/** A fee paid to the bank; under the free-parking-pot rule it feeds the pot. */
function feeToBank(s: MagnatState, debtor: Seat, amount: number, events: MagnatEvent[]): void {
  if (amount <= 0) return;
  const wasBankrupt = s.bankrupt[debtor];
  charge(s, debtor, amount, null, events);
  if (s.config.freeParkingPot && !wasBankrupt && !s.bankrupt[debtor]) s.pot += amount;
}

/* ── auctions ───────────────────────────────────────────────────────────── */
function nextLiveBidder(s: MagnatState, from: Seat): Seat {
  const a = s.auction!;
  for (let k = 1; k <= s.seats; k++) {
    const cand = (from + k) % s.seats;
    if (a.live[cand]) return cand;
  }
  return from; // only one left
}

/** Begin auctioning `tile` among all solvent seats; bidding rotates via `turn`. */
function startAuction(s: MagnatState, tile: number, events: MagnatEvent[]): void {
  const live = s.cash.map((_, i) => !s.bankrupt[i]);
  s.auction = { tile, high: 0, highBidder: -1, live, resumeTurn: s.turn };
  s.pendingBuy = null;
  s.phase = "AUCTION";
  events.push({ type: "AUCTION_START", tile });
  // first bidder = the player to the left of whoever passed on the buy
  s.turn = nextLiveBidder(s, s.auction.resumeTurn);
  // (the player who landed also bids, so include them via the rotation start)
  if (s.auction.live[s.auction.resumeTurn]) s.turn = s.auction.resumeTurn;
}

/** End the auction: high bidder buys (proceeds to bank), then resume MANAGE. */
function resolveAuction(s: MagnatState, events: MagnatEvent[]): void {
  const a = s.auction!;
  if (a.highBidder >= 0 && a.high > 0) {
    charge(s, a.highBidder, a.high, null, events);
    s.owner[a.tile] = a.highBidder;
    events.push({ type: "AUCTION_WON", seat: a.highBidder, tile: a.tile, amount: a.high });
    pushLog(s, `Търг: играч ${a.highBidder + 1} печели ${tile(a.tile).name} за ${a.high}`);
  } else {
    events.push({ type: "AUCTION_PASSED", tile: a.tile });
    pushLog(s, `Търг: ${tile(a.tile).name} остава непродаден`);
  }
  const resume = a.resumeTurn;
  s.auction = null;
  s.turn = resume;
  s.phase = "MANAGE";
}

/* ── trades ─────────────────────────────────────────────────────────────── */
/** A tradable property: owned by `seat`, no houses anywhere in its colour group. */
function tradableBy(s: MagnatState, seat: Seat, i: number): boolean {
  if (!isOwnable(i) || s.owner[i] !== seat) return false;
  const tl = tile(i);
  if (tl.type === "prop" && GROUP_TILES[tl.group]!.some((g) => s.houses[g]! > 0)) return false;
  return true;
}

/** Minimal shape of any action: a non-null object with a string `type`. */
function isActionShape(a: unknown): boolean {
  return typeof a === "object" && a !== null && typeof (a as { type?: unknown }).type === "string";
}

/**
 * Structural guard for a client-supplied trade bundle. TRADE_OFFER payloads
 * reach validate()/reduce() as raw socket input, so every field must be
 * shape-checked BEFORE any board lookup — `{ tiles: [999] }` or a missing
 * bundle used to TypeError straight out of the socket handler (P0: one
 * malformed packet could take down the whole realtime node).
 */
function isBundleShape(b: unknown): b is TradeBundle {
  if (typeof b !== "object" || b === null) return false;
  const { cash, tiles } = b as { cash?: unknown; tiles?: unknown };
  if (typeof cash !== "number" || !Number.isInteger(cash) || cash < 0) return false;
  if (!Array.isArray(tiles) || tiles.length > BOARD_SIZE) return false;
  return tiles.every((i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < BOARD_SIZE);
}

function validBundle(s: MagnatState, owner: Seat, b: TradeBundle): boolean {
  if (!Number.isInteger(b.cash) || b.cash < 0 || b.cash > s.cash[owner]!) return false;
  const seen = new Set<number>();
  for (const i of b.tiles) {
    if (seen.has(i) || !tradableBy(s, owner, i)) return false;
    seen.add(i);
  }
  return true;
}

/** Full TRADE_OFFER validation over untrusted input: shapes first, rules after. */
function canOffer(s: MagnatState, seat: Seat, to: unknown, give: unknown, want: unknown): boolean {
  if (!s.config.trading || s.phase !== "MANAGE" || seat !== s.turn) return false;
  if (typeof to !== "number" || !Number.isInteger(to)) return false;
  if (to === seat || to < 0 || to >= s.seats || s.bankrupt[to]) return false;
  if (!isBundleShape(give) || !isBundleShape(want)) return false;
  if (give.tiles.length === 0 && want.tiles.length === 0 && give.cash === 0 && want.cash === 0) return false;
  return validBundle(s, seat, give) && validBundle(s, to, want);
}

function applyTrade(s: MagnatState, events: MagnatEvent[]): void {
  const t = s.trade!;
  // re-validate at acceptance time (state may have changed since the offer)
  if (validBundle(s, t.from, t.give) && validBundle(s, t.to, t.want)) {
    for (const i of t.give.tiles) s.owner[i] = t.to;
    for (const i of t.want.tiles) s.owner[i] = t.from;
    s.cash[t.from]! += t.want.cash - t.give.cash;
    s.cash[t.to]! += t.give.cash - t.want.cash;
    events.push({ type: "TRADE_DONE", from: t.from, to: t.to });
    pushLog(s, `Сделка: играч ${t.from + 1} ↔ играч ${t.to + 1}`);
  } else {
    events.push({ type: "TRADE_REJECTED", from: t.from, to: t.to });
  }
  const resume = t.resumeTurn;
  s.trade = null;
  s.turn = resume;
  s.phase = "MANAGE";
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
    auction: s.auction ? { ...s.auction, live: s.auction.live.slice() } : null,
    trade: s.trade
      ? {
          ...s.trade,
          give: { cash: s.trade.give.cash, tiles: s.trade.give.tiles.slice() },
          want: { cash: s.trade.want.cash, tiles: s.trade.want.tiles.slice() },
        }
      : null,
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
  if (active.length <= 1 || s.turns >= s.config.maxTurns) {
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
      else feeToBank(s, seat, -eff.amount, events);
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
      for (const o of activeSeats(s)) {
        if (s.bankrupt[seat]) break; // a bankrupt payer can't keep paying
        if (o !== seat) charge(s, seat, eff.amount, o, events);
      }
      return { jailed: false };
    case "go":
      // Landing on Старт via the card pays the salary AND the configured
      // exact-landing bonus, matching a dice landing (advance()).
      s.cash[seat]! += GO_SALARY + s.config.goBonus;
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
      feeToBank(s, seat, tl.tax, events);
      return { jailed: false };
    case "free":
      if (s.config.freeParkingPot && s.pot > 0) {
        s.cash[seat]! += s.pot;
        events.push({ type: "POT", seat, amount: s.pot });
        pushLog(s, `Безплатен паркинг: играч ${seat + 1} прибира ${s.pot}`);
        s.pot = 0;
      }
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
  if (to === 0) s.cash[seat]! += s.config.goBonus; // landed exactly on Старт
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
    const config = resolveMagnatConfig(opts.config as Partial<MagnatConfig> | undefined);
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
      config,
      cash: new Array<number>(seats).fill(config.startingCash),
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
      pot: 0,
      auction: null,
      trade: null,
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
    if (s.phase === "AUCTION" && s.auction) {
      const acts: MagnatAction[] = [{ type: "PASS_BID" }];
      const minBid = s.auction.high + 10;
      if (s.cash[seat]! >= minBid) acts.unshift({ type: "BID", amount: minBid });
      return acts;
    }
    if (s.phase === "TRADE" && s.trade && seat === s.trade.to) {
      const acts: MagnatAction[] = [{ type: "TRADE_DECLINE" }];
      if (s.cash[seat]! >= s.trade.want.cash) acts.unshift({ type: "TRADE_ACCEPT" });
      return acts;
    }
    if (s.phase !== "MANAGE") return [];
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

  validate(state, seat, action) {
    if (state.done || seat !== state.turn || state.bankrupt[seat]) return false;
    // Raw socket input: reject anything that isn't an action-shaped object
    // before touching its fields (a string/null/number here used to throw).
    if (!isActionShape(action)) return false;
    const a = action as MagnatAction;
    if (a.type === "BID") {
      return (
        state.phase === "AUCTION" &&
        !!state.auction &&
        state.auction.live[seat] === true &&
        Number.isInteger(a.amount) &&
        // Same minimum raise the UI/bot use (high + 10) — otherwise a modified
        // client could grind the auction with +1 micro-bids honest clients can't.
        a.amount >= state.auction.high + 10 &&
        a.amount <= state.cash[seat]!
      );
    }
    if (a.type === "TRADE_OFFER") return canOffer(state, seat, a.to, a.give, a.want);
    // everything else is enumerable — match the legal set by shape.
    return magnatEngine
      .legalActions(state, seat)
      .some((l) => l.type === a.type && (l as { tile?: number }).tile === (a as { tile?: number }).tile);
  },

  reduce(state, action, rng: SeededRng) {
    if (state.done) throw new IllegalActionError("Game over");
    // Same raw-input guard as validate(): reduce must never TypeError on a
    // malformed action — IllegalActionError is the contract for bad input.
    if (!isActionShape(action)) throw new IllegalActionError("Malformed action");
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
        feeToBank(s, seat, JAIL_FINE, events);
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
            pushLog(s, `Играч ${seat + 1} хвърли чифт и излиза от затвора`);
          } else {
            s.jailTurns[seat]!++;
            if (s.jailTurns[seat]! >= 3) {
              // Third failed attempt: pay the fine and move on the rolled sum.
              feeToBank(s, seat, JAIL_FINE, events);
              events.push({ type: "JAIL_FEE", seat, amount: JAIL_FINE });
              pushLog(s, `Играч ${seat + 1} плаща ${JAIL_FINE} и излиза от затвора`);
              s.inJail[seat] = false;
              s.jailTurns[seat] = 0;
            } else {
              // Failed attempt 1 or 2: surface it (event + log) — previously the
              // turn just skipped with zero feedback and looked like a bug.
              events.push({ type: "JAIL_STAY", seat, dice: [d1, d2], attempt: s.jailTurns[seat]! });
              pushLog(s, `Играч ${seat + 1} хвърли ${d1}+${d2} — остава в затвора (${s.jailTurns[seat]}/3)`);
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
        if (s.phase !== "BUY" || s.pendingBuy === null) throw new IllegalActionError("Nothing to decline");
        const i = s.pendingBuy;
        // House rule: a declined property goes to auction among solvent players.
        if (s.config.auctions && activeSeats(s).length > 1) {
          startAuction(s, i, events);
          return finish();
        }
        s.pendingBuy = null;
        s.phase = "MANAGE";
        return finish();
      }
      case "BID": {
        if (s.phase !== "AUCTION" || !s.auction || !s.auction.live[seat]) throw new IllegalActionError("Not bidding");
        const amt = action.amount;
        // Enforce the same minimum raise as legalActions/validate (high + 10).
        if (!Number.isInteger(amt) || amt < s.auction.high + 10 || amt > s.cash[seat]!) {
          throw new IllegalActionError("Bad bid");
        }
        s.auction.high = amt;
        s.auction.highBidder = seat;
        events.push({ type: "AUCTION_BID", seat, amount: amt, tile: s.auction.tile });
        pushLog(s, `Търг: играч ${seat + 1} наддава ${amt} за ${tile(s.auction.tile).name}`);
        // uncontested (everyone else already passed) → they win immediately.
        if (s.auction.live.filter(Boolean).length <= 1) resolveAuction(s, events);
        else s.turn = nextLiveBidder(s, seat);
        return finish();
      }
      case "PASS_BID": {
        if (s.phase !== "AUCTION" || !s.auction || !s.auction.live[seat]) throw new IllegalActionError("Not bidding");
        s.auction.live[seat] = false;
        const live = s.auction.live.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
        if (live.length <= 1) {
          if (s.auction.highBidder >= 0) resolveAuction(s, events); // a bid stands → winner
          else if (live.length === 1) s.turn = live[0]!; // nobody bid yet; lone player acts
          else resolveAuction(s, events); // nobody bid, nobody left → unsold
        } else {
          s.turn = nextLiveBidder(s, seat);
        }
        return finish();
      }
      case "TRADE_OFFER": {
        if (!canOffer(s, seat, action.to, action.give, action.want)) throw new IllegalActionError("Bad trade");
        // Rebuild the bundles from the validated fields only — never store the
        // raw client object (it may carry extra junk that would be broadcast).
        s.trade = {
          from: seat,
          to: action.to,
          give: { cash: action.give.cash, tiles: [...action.give.tiles] },
          want: { cash: action.want.cash, tiles: [...action.want.tiles] },
          resumeTurn: seat,
        };
        s.phase = "TRADE";
        s.turn = action.to;
        events.push({ type: "TRADE_OFFER", from: seat, to: action.to });
        pushLog(s, `Играч ${seat + 1} предлага сделка на играч ${action.to + 1}`);
        return finish();
      }
      case "TRADE_ACCEPT": {
        if (s.phase !== "TRADE" || !s.trade || seat !== s.trade.to) throw new IllegalActionError("No trade");
        if (s.cash[seat]! < s.trade.want.cash) throw new IllegalActionError("Can't afford trade");
        applyTrade(s, events);
        return finish();
      }
      case "TRADE_DECLINE": {
        if (s.phase !== "TRADE" || !s.trade || seat !== s.trade.to) throw new IllegalActionError("No trade");
        const t = s.trade;
        events.push({ type: "TRADE_REJECTED", from: t.from, to: t.to });
        s.trade = null;
        s.turn = t.resumeTurn;
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

  bot: magnatBot,

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

/**
 * Heuristic bot: buys aggressively while keeping a cash cushion, completes and
 * develops colour groups, unmortgages when flush, and never voluntarily sells
 * (auto-liquidation handles debt). It always returns one legal action and, in
 * MANAGE, eventually returns END (each build/unmortgage spends cash, so the
 * cushion check terminates the development loop).
 */
export function magnatBot(s: MagnatState, seat: Seat, rng: SeededRng): MagnatAction | null {
  const acts = magnatEngine.legalActions(s, seat);
  if (acts.length === 0) return null;
  const cash = s.cash[seat]!;

  if (s.phase === "ROLL") {
    if (s.inJail[seat] && acts.some((a) => a.type === "JAIL_CARD")) return { type: "JAIL_CARD" };
    return { type: "ROLL" };
  }

  if (s.phase === "AUCTION" && s.auction) {
    // bid up to ~70% of the tile's price (a touch more if it completes a group).
    const i = s.auction.tile;
    const tl = tile(i);
    const synergy = tl.type === "prop" && GROUP_TILES[tl.group]!.some((g) => g !== i && s.owner[g] === seat);
    const ceiling = Math.floor(tl.price * (synergy ? 0.95 : 0.65));
    const next = s.auction.high + 10;
    if (s.auction.highBidder !== seat && next <= ceiling && next <= cash) return { type: "BID", amount: next };
    return { type: "PASS_BID" };
  }

  if (s.phase === "TRADE" && s.trade && seat === s.trade.to) {
    // accept only clearly favourable offers (value in ≥ value out + small margin).
    const valueOf = (b: typeof s.trade.give) => b.cash + b.tiles.reduce((n, i) => n + tile(i).price, 0);
    const incoming = valueOf(s.trade.give); // what `to` receives
    const outgoing = valueOf(s.trade.want); // what `to` gives up
    if (incoming >= outgoing * 1.1 && cash >= s.trade.want.cash) return { type: "TRADE_ACCEPT" };
    return { type: "TRADE_DECLINE" };
  }

  if (s.phase === "BUY") {
    if (!acts.some((a) => a.type === "BUY") || s.pendingBuy === null) return { type: "DECLINE" };
    const i = s.pendingBuy;
    const tl = tile(i);
    const synergy =
      tl.type === "prop"
        ? GROUP_TILES[tl.group]!.some((g) => g !== i && s.owner[g] === seat)
        : countOwned(s, seat, tl.type === "station" ? STATIONS : UTILITIES) > 0;
    if (cash - tl.price >= 80 || synergy) return { type: "BUY" };
    return { type: "DECLINE" };
  }

  // MANAGE — develop while keeping a cushion, else end.
  const builds = acts.filter((a): a is { type: "BUILD"; tile: number } => a.type === "BUILD");
  if (builds.length > 0 && cash >= 250) return builds[rng.int(builds.length)] ?? { type: "END" };
  const unmort = acts.find((a) => a.type === "UNMORTGAGE");
  if (unmort && cash >= 350) return unmort;
  return { type: "END" };
}
