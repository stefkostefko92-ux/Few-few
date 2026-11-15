/**
 * Подредба на ръката за ПОКАЗВАНЕ (само визуално — правилата и сървърът не се
 * пипат). Боите са групирани с редуващи се цветове ♠ ♥ ♣ ♦; козът (ако е известен)
 * е първата група вляво; в боята — от най-силната към най-слабата по силата на
 * САМАТА игра (сверено с двигателя, виж `game-core/src/engines/…`).
 */

export type SuitId = "S" | "H" | "C" | "D";

/** ♠ ♥ ♣ ♦ — черно, червено, черно, червено. */
export const SUIT_ORDER: readonly SuitId[] = ["S", "H", "C", "D"];

/** Естествен ред (бридж, Кент, Свара, Риба): A K Q J T 9 … 2. */
export const NATURAL_DESC: readonly string[] = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
/** Белот, коз и „Всичко коз“ (belote.ts TRUMP_STRENGTH): J 9 A T K Q 8 7. */
export const BELOTE_TRUMP_DESC: readonly string[] = ["J", "9", "A", "T", "K", "Q", "8", "7"];
/** Белот, некоз и „Без коз“ (belote.ts PLAIN_STRENGTH): A T K Q J 9 8 7. */
export const BELOTE_PLAIN_DESC: readonly string[] = ["A", "T", "K", "Q", "J", "9", "8", "7"];
/** Сантасе (santase.ts STRENGTH): A T K Q J 9. */
export const SANTASE_DESC: readonly string[] = ["A", "T", "K", "Q", "J", "9"];
/** Реми (rummy.ts RANKS): възходящо за поредиците; асото е ниско (ниско/високо в двигателя е 1/14). */
export const RUMMY_ASC: readonly string[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];

export interface SortOptions {
  /** Ред на ранговете в обикновена боя (първият е най-вляво). */
  order?: readonly string[];
  /** Козова боя — първа вляво (и по `trumpOrder`, ако е зададен). */
  trump?: SuitId | null;
  /** Ред на ранговете в козовата боя (по подразбиране като `order`). */
  trumpOrder?: readonly string[];
  /** Всички бои са „коз“ (Белот „Всичко коз“): навсякъде `trumpOrder`. */
  allTrump?: boolean;
  /** "rank": групирай по ранг (Риба — комплекти), в ранга по боя. По подразбиране "suit". */
  group?: "suit" | "rank";
}

interface Parsed {
  suit: SuitId | null;
  rank: string;
  kind: "card" | "joker" | "unknown";
}

/** "KS", "TH", "7C" и картите на Реми ("TSa", жокер "*1"; скрита "?"). */
function parse(card: string): Parsed {
  if (card.startsWith("*")) return { suit: null, rank: "", kind: "joker" };
  const m = /^([2-9TJQKA])([SHCD])[ab]?$/.exec(card);
  if (!m) return { suit: null, rank: "", kind: "unknown" };
  return { suit: m[2] as SuitId, rank: m[1]!, kind: "card" };
}

const posIn = (order: readonly string[], rank: string): number => {
  const i = order.indexOf(rank);
  return i < 0 ? order.length : i; // непознат ранг — след познатите
};

/** Подредена КОПИЕ на ръката; не променя входа. Стабилна (равните запазват реда си). */
export function sortHand<T extends string>(hand: readonly T[], opts: SortOptions = {}): T[] {
  const order = opts.order ?? NATURAL_DESC;
  const trumpOrder = opts.trumpOrder ?? order;
  const suitRank = (s: SuitId): number => {
    const base = SUIT_ORDER.indexOf(s);
    return opts.trump === s ? -1 : base;
  };
  const rankPos = (p: Parsed): number => {
    const useTrump = opts.allTrump || (!!opts.trump && p.suit === opts.trump);
    return posIn(useTrump ? trumpOrder : order, p.rank);
  };
  const rows = hand.map((card, i) => ({ card, i, p: parse(card) }));
  rows.sort((a, b) => {
    // жокери и непознати (скрити) карти — накрая, в първоначалния ред
    const ka = a.p.kind === "card" ? 0 : a.p.kind === "joker" ? 1 : 2;
    const kb = b.p.kind === "card" ? 0 : b.p.kind === "joker" ? 1 : 2;
    if (ka !== kb) return ka - kb;
    if (ka !== 0) return a.i - b.i;
    const sa = suitRank(a.p.suit!);
    const sb = suitRank(b.p.suit!);
    if (opts.group === "rank") {
      return posIn(order, a.p.rank) - posIn(order, b.p.rank) || sa - sb || a.i - b.i;
    }
    return sa - sb || rankPos(a.p) - rankPos(b.p) || a.i - b.i;
  });
  return rows.map((r) => r.card);
}

export type BeloteContract = "S" | "H" | "C" | "D" | "NT" | "AT";

/**
 * Белот. `contract` е известен само във фаза PLAY — по време на наддаването подай
 * `null` (без коз, некозов ред). „Всичко коз“ → всички бои по козовия ред;
 * „Без коз“ → по некозовия; боя → тя е първа по козовия ред.
 */
export function sortBelote(hand: readonly string[], contract: BeloteContract | null): string[] {
  return sortHand(hand, {
    order: BELOTE_PLAIN_DESC,
    trumpOrder: BELOTE_TRUMP_DESC,
    trump: contract === "S" || contract === "H" || contract === "C" || contract === "D" ? contract : null,
    allTrump: contract === "AT",
  });
}

/** Сантасе: козът първи, A T K Q J 9. */
export function sortSantase(hand: readonly string[], trump: string | null | undefined): string[] {
  return sortHand(hand, { order: SANTASE_DESC, trump: asSuit(trump) });
}

/** Бридж (коз от договора; null при без коз/наддаване), Кент, Свара: естествен ред. */
export function sortNatural(hand: readonly string[], trump?: string | null): string[] {
  return sortHand(hand, { order: NATURAL_DESC, trump: asSuit(trump) });
}

/** Риба: по ранг (A K Q … 2), в ранга по боя — там се събират комплекти от ранг. */
export function sortByRank(hand: readonly string[]): string[] {
  return sortHand(hand, { order: NATURAL_DESC, group: "rank" });
}

/** Реми: по боя, възходящо A 2 … K (за поредиците); жокерите накрая. */
export function sortRummy(hand: readonly string[]): string[] {
  return sortHand(hand, { order: RUMMY_ASC });
}

function asSuit(s: string | null | undefined): SuitId | null {
  return s === "S" || s === "H" || s === "C" || s === "D" ? s : null;
}
