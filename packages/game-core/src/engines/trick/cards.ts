/** Shared card primitives for the trick-taking engines (§7.2). */

export type Suit = "S" | "H" | "D" | "C";
export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];

/** A card id is rank + suit, e.g. "AS", "TH" (T = ten), "9D". */
export type Card = string;

export const suitOf = (c: Card): Suit => c[c.length - 1] as Suit;
export const rankOf = (c: Card): string => c.slice(0, c.length - 1);

/** Build a deck (one card per rank per suit) for the given ranks. */
export function buildDeck(ranks: readonly string[]): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of ranks) deck.push(`${r}${s}`);
  return deck;
}

/** Redaction placeholder for a hidden card. */
export const HIDDEN: Card = "?";
export const hiddenLike = (cards: readonly Card[]): Card[] => cards.map(() => HIDDEN);
