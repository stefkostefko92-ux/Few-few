import type { ReactElement } from "react";

/** Vector suit symbols (paths, not Unicode) so cards render crisply at any size. */
export type SuitChar = "S" | "H" | "D" | "C";

export const SUIT_COLOR: Record<SuitChar, string> = {
  S: "var(--suit-spade)",
  C: "var(--suit-club)",
  H: "var(--suit-heart)",
  D: "var(--suit-diamond)",
};

export const isRed = (s: SuitChar): boolean => s === "H" || s === "D";

/** A suit glyph drawn inside a 0..100 box, centered, scalable via transform. */
export function SuitGlyph({ suit, size = 100, color }: { suit: SuitChar; size?: number; color?: string }): ReactElement {
  const fill = color ?? SUIT_COLOR[suit];
  const paths: Record<SuitChar, string> = {
    // Spade: heart-lobes inverted + stem.
    S: "M50 8 C 64 30 92 44 92 64 C 92 80 78 88 66 88 C 60 88 55 85 52 80 C 54 88 58 92 64 95 L36 95 C42 92 46 88 48 80 C45 85 40 88 34 88 C22 88 8 80 8 64 C8 44 36 30 50 8 Z",
    // Heart.
    H: "M50 92 C 14 64 8 44 8 30 C 8 16 19 8 30 8 C 39 8 46 13 50 22 C 54 13 61 8 70 8 C 81 8 92 16 92 30 C 92 44 86 64 50 92 Z",
    // Diamond.
    D: "M50 6 L88 50 L50 94 L12 50 Z",
    // Club: three lobes + stem.
    C: "M50 8 C 60 8 68 16 68 26 C 68 31 66 35 63 38 C 71 33 82 35 87 44 C 92 53 88 64 78 67 C 71 69 63 66 59 60 C 61 70 66 80 72 88 L28 88 C34 80 39 70 41 60 C37 66 29 69 22 67 C12 64 8 53 13 44 C18 35 29 33 37 38 C34 35 32 31 32 26 C32 16 40 8 50 8 Z",
  };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden focusable="false">
      <path d={paths[suit]} fill={fill} />
    </svg>
  );
}
