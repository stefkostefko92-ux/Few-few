/**
 * Shared МАГНАТ (Tycoon) board data + state/action types. Lives in @aso/shared
 * so both the authoritative engine (@aso/game-core) and the web 3D view can use
 * the same board layout, names, prices and colours without the view pulling in
 * the engine bundle (mirrors the cue-sports split).
 *
 * Original property-trading game in the public-domain lineage of The Landlord's
 * Game (1904); Bulgarian-cities theming, no third-party IP.
 */

export const BOARD_SIZE = 40;

export type TileType =
  | "go"
  | "prop"
  | "chance"
  | "chest"
  | "tax"
  | "jail"
  | "free"
  | "gotojail"
  | "station"
  | "utility";

export interface Tile {
  type: TileType;
  name: string;
  group: number; // 0..7 for properties, -1 otherwise
  price: number; // ownables only
  tax: number; // tax tiles only
}

function t(type: TileType, name: string, opts: Partial<Tile> = {}): Tile {
  return { type, name, group: opts.group ?? -1, price: opts.price ?? 0, tax: opts.tax ?? 0 };
}

/** The 40-tile board, Bulgarian-cities themed (the four big cities are stations). */
export const BOARD: Tile[] = [
  t("go", "Старт"),
  t("prop", "Дупница", { group: 0, price: 60 }),
  t("chest", "Каса"),
  t("prop", "Бобов дол", { group: 0, price: 60 }),
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

/** Colour per property group (hex), used by the 3D board + UI. */
export const GROUP_COLORS = [
  "#7a4a25", // 0 brown
  "#8fd0ff", // 1 light blue
  "#d6489b", // 2 pink
  "#e8862b", // 3 orange
  "#cc2b2b", // 4 red
  "#e8c531", // 5 yellow
  "#2faa55", // 6 green
  "#1f5fb0", // 7 dark blue
] as const;

export const HOUSE_COST_BY_GROUP = [50, 50, 100, 100, 150, 150, 200, 200];

export const GROUP_TILES: number[][] = (() => {
  const m: number[][] = Array.from({ length: 8 }, () => []);
  BOARD.forEach((tile, i) => {
    if (tile.type === "prop") m[tile.group]!.push(i);
  });
  return m;
})();
export const STATIONS = BOARD.map((tile, i) => (tile.type === "station" ? i : -1)).filter((i) => i >= 0);
export const UTILITIES = BOARD.map((tile, i) => (tile.type === "utility" ? i : -1)).filter((i) => i >= 0);

export type CardEffect =
  | { kind: "money"; amount: number }
  | { kind: "jail" }
  | { kind: "gojf" }
  | { kind: "payEach"; amount: number }
  | { kind: "collectEach"; amount: number }
  | { kind: "go" };
export interface Card {
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
  turn: number;
  phase: "ROLL" | "BUY" | "MANAGE" | "AUCTION" | "TRADE";
  config: MagnatConfig;
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
  doubles: number;
  extraRoll: boolean;
  pendingBuy: number | null;
  /** Free-parking pot (only used when config.freeParkingPot). */
  pot: number;
  /** Live auction (config.auctions): bidding rotates via `turn`. */
  auction: {
    tile: number;
    high: number; // current high bid (0 = no bid yet)
    highBidder: number; // seat, or -1
    live: boolean[]; // still in the auction
    resumeTurn: number; // seat to hand the turn back to afterwards
  } | null;
  /** Pending trade offer awaiting the recipient's response. */
  trade: {
    from: number;
    to: number;
    give: TradeBundle; // from → to
    want: TradeBundle; // to → from
    resumeTurn: number;
  } | null;
  chance: number[];
  chancePtr: number;
  chest: number[];
  chestPtr: number;
  turns: number;
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
  | { type: "JAIL_CARD" }
  | { type: "BID"; amount: number }
  | { type: "PASS_BID" }
  | { type: "TRADE_OFFER"; to: number; give: TradeBundle; want: TradeBundle }
  | { type: "TRADE_ACCEPT" }
  | { type: "TRADE_DECLINE" };

export type MagnatEvent =
  | { type: "ROLL"; seat: number; dice: [number, number] }
  | { type: "MOVE"; seat: number; to: number }
  | { type: "BUY"; seat: number; tile: number }
  | { type: "RENT"; seat: number; to: number; amount: number }
  | { type: "CARD"; seat: number; text: string }
  | { type: "JAIL"; seat: number }
  /** A jailed player rolled and failed to throw doubles (attempt = 1..2 of 3). */
  | { type: "JAIL_STAY"; seat: number; dice: [number, number]; attempt: number }
  /** Third failed attempt: the fine is paid and the player walks. */
  | { type: "JAIL_FEE"; seat: number; amount: number }
  | { type: "BANKRUPT"; seat: number; to: number | null }
  | { type: "AUCTION_START"; tile: number }
  | { type: "AUCTION_BID"; seat: number; amount: number; tile: number }
  | { type: "AUCTION_WON"; seat: number; tile: number; amount: number }
  | { type: "AUCTION_PASSED"; tile: number }
  | { type: "POT"; seat: number; amount: number }
  | { type: "TRADE_OFFER"; from: number; to: number }
  | { type: "TRADE_DONE"; from: number; to: number }
  | { type: "TRADE_REJECTED"; from: number; to: number }
  | { type: "WIN"; seat: number };

export const isOwnable = (i: number): boolean => ["prop", "station", "utility"].includes(BOARD[i]!.type);

/* ── session configuration (personalised rooms) ─────────────────────────── */

/** Per-session rules. Defaults mirror the classic game; a room can override. */
export interface MagnatConfig {
  /** Starting cash per player. */
  startingCash: number;
  /** Auction a property when the player who landed on it declines/can't buy. */
  auctions: boolean;
  /** Taxes & fees feed a pot that the next player to land on Безплатен паркинг collects. */
  freeParkingPot: boolean;
  /** Bonus cash for landing exactly on Старт (0 = off). */
  goBonus: number;
  /** Allow property/cash trades between players. */
  trading: boolean;
  /** Hard cap on turns before the richest player wins. */
  maxTurns: number;
  /** Preferred seconds per turn (the realtime host may read this). */
  turnSeconds: number;
}

export const DEFAULT_MAGNAT_CONFIG: MagnatConfig = {
  startingCash: 1500,
  auctions: true,
  freeParkingPot: false,
  goBonus: 0,
  trading: true,
  maxTurns: 300,
  turnSeconds: 30,
};

/** A few curated presets a lobby can expose as one-tap "house styles". */
export const MAGNAT_PRESETS: Record<string, Partial<MagnatConfig>> = {
  classic: {},
  blitz: { startingCash: 2500, goBonus: 300, maxTurns: 160, turnSeconds: 20 },
  tycoon: { startingCash: 4000, freeParkingPot: true, goBonus: 400, maxTurns: 220 },
  friendly: { startingCash: 2000, auctions: false, freeParkingPot: true, goBonus: 200 },
};

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(hi, Math.max(lo, v));
};

/**
 * Merge a partial config (e.g. a preset or a client room override) onto the
 * defaults, clamping every field to a safe range — the override can come
 * straight from a lobby host, so it must never produce a degenerate game.
 */
export function resolveMagnatConfig(over?: Partial<MagnatConfig> | null): MagnatConfig {
  const o = over ?? {};
  return {
    startingCash: clamp(o.startingCash, 500, 50000, DEFAULT_MAGNAT_CONFIG.startingCash),
    auctions: typeof o.auctions === "boolean" ? o.auctions : DEFAULT_MAGNAT_CONFIG.auctions,
    freeParkingPot:
      typeof o.freeParkingPot === "boolean" ? o.freeParkingPot : DEFAULT_MAGNAT_CONFIG.freeParkingPot,
    goBonus: clamp(o.goBonus, 0, 1000, DEFAULT_MAGNAT_CONFIG.goBonus),
    trading: typeof o.trading === "boolean" ? o.trading : DEFAULT_MAGNAT_CONFIG.trading,
    maxTurns: clamp(o.maxTurns, 50, 1000, DEFAULT_MAGNAT_CONFIG.maxTurns),
    turnSeconds: clamp(o.turnSeconds, 10, 120, DEFAULT_MAGNAT_CONFIG.turnSeconds),
  };
}

/** Cash + properties offered or requested in a trade. */
export interface TradeBundle {
  cash: number;
  tiles: number[];
}
