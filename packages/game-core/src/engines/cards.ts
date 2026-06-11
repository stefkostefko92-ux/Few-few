/** Shared card primitives, used across trick / betting / draw-discard engines. */

export type Suit = "S" | "H" | "D" | "C";
export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];

/** A card id is rank + suit, e.g. "AS", "TH" (T = ten), "9D". */
export type Card = string;

export const suitOf = (c: Card): Suit => c[c.length - 1] as Suit;
export const rankOf = (c: Card): string => c.slice(0, c.length - 1);

export const RANKS_52 = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
/** Poker rank strength (high). */
export const RANK_VALUE: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** Build a deck (one card per rank per suit) for the given ranks. */
export function buildDeck(ranks: readonly string[]): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of ranks) deck.push(`${r}${s}`);
  return deck;
}

/** Redaction placeholder for a hidden card. */
export const HIDDEN: Card = "?";
export const hiddenLike = (cards: readonly Card[]): Card[] => cards.map(() => HIDDEN);
