import { rankOf, suitOf, type Card, type Suit } from "./cards.js";

/**
 * Белот declarations (обяви) — терца / петдесет / сто / каре / белот (§4.1).
 * Pure, deterministic detection + resolution so it can be unit-tested and
 * replayed. Only the team with the single best sequence/carré scores all of
 * its sequence+carré declarations; belote (K+Q of trump) always scores.
 *
 * Contract modes: a plain Suit (that suit is trump), "AT" (всичко коз — every
 * suit is trump, belote counts in all four suits), "NT" (без коз — NO
 * declarations of any kind score).
 */

export type DeclMode = Suit | "AT" | "NT";

export type DeclKind = "tierce" | "fifty" | "hundred" | "carre" | "belote";

export interface Declaration {
  seat: number;
  kind: DeclKind;
  value: number;
  /** Natural index of the top card (sequences) or the rank's index (carré). */
  top: number;
  suit?: Suit;
  trump: boolean;
}

/** Natural card order for sequences (not the belote trick-strength order). */
const NATURAL: Record<string, number> = { "7": 0, "8": 1, "9": 2, T: 3, J: 4, Q: 5, K: 6, A: 7 };

const CARRE_VALUE: Record<string, number> = { J: 200, "9": 150, A: 100, T: 100, K: 100, Q: 100 };

const ALL_SUITS = ["S", "H", "D", "C"] as const satisfies readonly Suit[];

/** Detect all sequences (len>=3), carrés, and belote in a single hand. */
export function detectHand(hand: Card[], mode: DeclMode, seat: number): Declaration[] {
  if (mode === "NT") return []; // без коз: никакви обяви
  const out: Declaration[] = [];
  const trumpSuits: readonly Suit[] = mode === "AT" ? ALL_SUITS : [mode];

  // ── Sequences: per suit, runs of consecutive natural ranks. ──
  for (const suit of ALL_SUITS) {
    const idxs = hand
      .filter((c) => suitOf(c) === suit)
      .map((c) => NATURAL[rankOf(c)] ?? -1)
      .sort((a, b) => a - b);
    let runStart = 0;
    for (let i = 1; i <= idxs.length; i++) {
      const broken = i === idxs.length || idxs[i] !== (idxs[i - 1] ?? -99) + 1;
      if (broken) {
        const len = i - runStart;
        if (len >= 3) {
          const top = idxs[i - 1]!;
          const value = len >= 5 ? 100 : len === 4 ? 50 : 20;
          const kind: DeclKind = len >= 5 ? "hundred" : len === 4 ? "fifty" : "tierce";
          out.push({ seat, kind, value, top, suit, trump: trumpSuits.includes(suit) });
        }
        runStart = i;
      }
    }
  }

  // ── Carrés: four of a kind across suits (J/9/A/T/K/Q only). ──
  const byRank = new Map<string, number>();
  for (const c of hand) byRank.set(rankOf(c), (byRank.get(rankOf(c)) ?? 0) + 1);
  for (const [rank, count] of byRank) {
    if (count === 4 && CARRE_VALUE[rank]) {
      out.push({ seat, kind: "carre", value: CARRE_VALUE[rank]!, top: NATURAL[rank] ?? 0, trump: false });
    }
  }

  // ── Belote: King + Queen of a trump suit (all four suits in „всичко коз"). ──
  for (const suit of trumpSuits) {
    if (hand.includes(`K${suit}`) && hand.includes(`Q${suit}`)) {
      out.push({ seat, kind: "belote", value: 20, top: NATURAL["K"] ?? 6, suit, trump: true });
    }
  }

  return out;
}

/** Comparison key for a sequence/carré (higher wins the team comparison). */
function strength(d: Declaration): number {
  // carré category beats a same-value sequence; then value, top card, trump.
  const category = d.kind === "carre" ? 1 : 0;
  return d.value * 1000 + category * 500 + d.top * 10 + (d.trump ? 1 : 0);
}

export interface ResolvedDeclarations {
  /** Declaration points per team [A={0,2}, B={1,3}]. */
  teamPoints: [number, number];
  /** Declarations that actually scored (for display), incl. belote. */
  scored: Declaration[];
}

/**
 * Resolve declarations across all four hands. The team with the strongest single
 * sequence/carré scores ALL of its sequence+carré declarations; the other team
 * scores none of theirs. Belote is independent — each holder's team gets +20.
 * Exact tie on the best sequence/carré → neither team scores those (rare).
 */
export function resolveDeclarations(hands: Card[][], mode: DeclMode): ResolvedDeclarations {
  const teamOf = (seat: number) => seat % 2;
  const all = hands.flatMap((h, seat) => detectHand(h, mode, seat));

  const belotes = all.filter((d) => d.kind === "belote");
  const combos = all.filter((d) => d.kind !== "belote");

  const teamPoints: [number, number] = [0, 0];
  const scored: Declaration[] = [];

  // Belote always scores.
  for (const b of belotes) {
    teamPoints[teamOf(b.seat) as 0 | 1] += b.value;
    scored.push(b);
  }

  if (combos.length > 0) {
    const bestOf = (t: number) =>
      combos.filter((d) => teamOf(d.seat) === t).reduce((m, d) => Math.max(m, strength(d)), 0);
    const a = bestOf(0);
    const b = bestOf(1);
    const winner = a > b ? 0 : b > a ? 1 : -1; // -1 = exact tie, nobody scores
    if (winner >= 0) {
      for (const d of combos) {
        if (teamOf(d.seat) === winner) {
          teamPoints[winner as 0 | 1] += d.value;
          scored.push(d);
        }
      }
    }
  }

  return { teamPoints, scored };
}
