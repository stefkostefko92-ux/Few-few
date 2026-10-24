import {
  arrangeMeld,
  bestMelds,
  extendMeld,
  isJoker,
  jokerSwapIndex,
  penaltyValue,
  rummyEngine,
  rummyRank,
  rummySuit,
  RUMMY_OPEN_MIN,
  type RummyAction,
  type RummyMeld,
  type RummyState,
} from "@aso/game-core";

/**
 * What the Реми spec decides — and ONLY decides; every move is then a click.
 * `nextStep` is a pure function of what the table shows, so the very same
 * decisions also run in an offline simulation against the engine (that is how
 * the pinned e2e deal was chosen).
 *
 * Besides playing sensibly (take a usable pile card, open as soon as ≥ 51,
 * meld, lay off, shed the least useful card) it ENGINEERS a joker swap when it
 * holds a spare joker: it lays down `M − x + жокер` keeping the natural `x`
 * (or lays the joker onto a table meld where `x` belongs), swaps `x` in and
 * lays the joker off again.
 */

export interface TableMeld {
  id: number;
  owner: number;
  kind: "run" | "set";
  /** In table order — a run's jokers keep their positions. */
  cards: string[];
}

export interface RummyView {
  seat: number;
  seats: number;
  phase: "DRAW" | "PLAY";
  hand: string[];
  melds: TableMeld[];
  opened: boolean;
  /** Cards that must be used this turn (taken from the pile / a swapped joker). */
  pending: string[];
  /** The pile's top card can be taken (the server offers TAKE). */
  takeable: boolean;
}

export type Step =
  | { kind: "draw" }
  | { kind: "take" }
  | { kind: "open"; melds: string[][]; points: number }
  | { kind: "meld"; cards: string[] }
  | { kind: "layoff"; card: string; meldId: number }
  | { kind: "swap"; card: string; meldId: number }
  | { kind: "discard"; card: string };

/** Carried between steps of one test run. */
export interface Memory {
  swapDone: boolean;
  /** A joker just laid down standing in for `keep` — swap it back next. */
  pendingSwap?: { joker: string; keep: string };
}

/** Would the server accept this move? (the engine's own validate) */
export type Accepts = (a: RummyAction) => boolean;

const asMeld = (m: TableMeld): RummyMeld => ({ id: m.id, owner: m.owner, kind: m.kind, cards: m.cards });

/** Replace one natural of a 3+-natural meld by `joker` (the natural is kept and
 *  is exactly what the joker stands for). */
function withJoker(meld: string[], joker: string): { cards: string[]; keep: string } | null {
  if (meld.some(isJoker) || meld.length < 3) return null;
  const value = arrangeMeld(meld)?.value;
  for (const keep of meld) {
    const cards = [...meld.filter((c) => c !== keep), joker];
    const p = arrangeMeld(cards);
    if (!p || p.value !== value) continue;
    if (jokerSwapIndex({ id: 0, owner: 0, kind: p.kind, cards: p.cards }, keep) < 0) continue;
    return { cards, keep };
  }
  return null;
}

/** The opening (≥ 51) to stage, if the hand has one; includes pending cards. */
export function planOpening(
  v: RummyView,
  engineerSwap: boolean,
): { melds: string[][]; points: number; swap?: { joker: string; keep: string } } | null {
  let plan = bestMelds(v.hand, v.pending[0]);
  if (!plan || plan.value < RUMMY_OPEN_MIN || plan.melds.length === 0) return null;
  if (!v.pending.every((c) => plan!.melds.flat().includes(c))) return null;
  if (engineerSwap && v.hand.some(isJoker) && !v.pending.some(isJoker)) {
    // Open with NATURALS when they already make 51 — the optimal plan would
    // usually spend the joker.
    const nat = bestMelds(v.hand.filter((c) => !isJoker(c)), v.pending[0]);
    if (nat && nat.value >= RUMMY_OPEN_MIN && v.pending.every((c) => nat.melds.flat().includes(c))) {
      const used = new Set(nat.melds.flat());
      const joker = v.hand.find(isJoker)!;
      // ≥ 2 cards must stay after opening: the kept natural, then one to discard.
      if (v.hand.length - used.size >= 2) {
        for (let i = 0; i < nat.melds.length; i++) {
          const w = withJoker(nat.melds[i]!, joker);
          if (!w) continue;
          const melds = nat.melds.slice();
          melds[i] = w.cards;
          return { melds, points: nat.value, swap: { joker, keep: w.keep } };
        }
      }
      plan = nat;
    }
  }
  return { melds: plan.melds, points: plan.value };
}

/** After opening: a new meld to lay down (optionally engineered for a swap). */
function planMeld(v: RummyView, engineerSwap: boolean): { cards: string[]; swap?: { joker: string; keep: string } } | null {
  if (!v.opened) return null;
  if (engineerSwap && v.pending.length === 0 && v.hand.some(isJoker)) {
    const joker = v.hand.find(isJoker)!;
    const nat = bestMelds(v.hand.filter((c) => !isJoker(c)));
    for (const base of nat?.melds ?? []) {
      if (v.hand.length - base.length < 2) continue;
      const w = withJoker(base, joker);
      if (w) return { cards: w.cards, swap: { joker, keep: w.keep } };
    }
  }
  const plan = bestMelds(v.hand, v.pending[0]);
  const meld = v.pending.length ? plan?.melds.find((m) => m.includes(v.pending[0]!)) : plan?.melds[0];
  if (!meld || v.hand.length - meld.length < 1) return null;
  return { cards: meld };
}

/** Lay a spare joker onto a table meld where it stands for a card I hold. */
function planJokerLayoffSwap(v: RummyView): { meldId: number; joker: string; keep: string } | null {
  if (!v.opened || v.pending.length > 0 || v.hand.length < 3) return null;
  const joker = v.hand.find(isJoker);
  if (!joker) return null;
  for (const m of v.melds) {
    const grown = extendMeld(asMeld(m), [joker]);
    if (!grown) continue;
    const g: RummyMeld = { ...asMeld(m), cards: grown };
    const keep = v.hand.find((c) => !isJoker(c) && jokerSwapIndex(g, c) >= 0);
    if (keep) return { meldId: m.id, joker, keep };
  }
  return null;
}

/** Cards that extend a table meld — pending cards first, then naturals, jokers last. */
function layoffCandidates(v: RummyView): Array<{ card: string; meldId: number }> {
  if (!v.opened || v.hand.length < 2) return [];
  const rank = (c: string) => (v.pending.includes(c) ? 0 : isJoker(c) ? 2 : 1);
  const order = [...v.hand].sort((a, b) => rank(a) - rank(b));
  const out: Array<{ card: string; meldId: number }> = [];
  for (const card of order) {
    for (const m of v.melds) if (extendMeld(asMeld(m), [card])) out.push({ card, meldId: m.id });
  }
  return out;
}

/** How close a card is to a meld in this hand (higher = keep it). */
function usefulness(hand: string[], card: string): number {
  if (isJoker(card)) return 1000;
  const ord: Record<string, number> = { A: 1, T: 10, J: 11, Q: 12, K: 13 };
  const o = (c: string) => ord[rummyRank(c)] ?? Number(rummyRank(c));
  let score = 0;
  const suits = new Set<string>();
  for (const c of hand) {
    if (c === card || isJoker(c)) continue;
    if (rummyRank(c) === rummyRank(card) && rummySuit(c) !== rummySuit(card)) suits.add(rummySuit(c));
    if (rummySuit(c) === rummySuit(card)) {
      const d = Math.abs(o(c) - o(card));
      if (d === 1) score += 2;
      else if (d === 2) score += 1;
    }
  }
  return score + 2 * suits.size;
}

/** The card to throw: the least useful, heaviest one. */
function discardChoice(hand: string[]): string {
  let best = hand[0]!;
  let bestScore = Infinity;
  for (const c of hand) {
    const s = usefulness(hand, c) * 20 - penaltyValue(c);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/** The next move for my turn (call again after each accepted move). */
export function nextStep(v: RummyView, mem: Memory, accepts: Accepts): Step {
  if (v.phase === "DRAW") return v.takeable ? { kind: "take" } : { kind: "draw" };

  // A joker laid down a moment ago in place of `keep`: swap `keep` in now.
  if (mem.pendingSwap) {
    const { joker, keep } = mem.pendingSwap;
    mem.pendingSwap = undefined;
    const m = v.melds.find((x) => x.cards.includes(joker));
    if (m && v.hand.includes(keep) && accepts({ type: "SWAP", meldId: m.id, card: keep })) {
      mem.swapDone = true;
      return { kind: "swap", card: keep, meldId: m.id };
    }
  }

  if (v.pending.length > 0 && v.opened) {
    const lay = layoffCandidates(v).find(
      (c) => c.card === v.pending[0] && accepts({ type: "LAYOFF", meldId: c.meldId, cards: [c.card] }),
    );
    if (lay) return { kind: "layoff", ...lay };
    const m = planMeld(v, false);
    if (m && accepts({ type: "MELD", cards: m.cards })) return { kind: "meld", cards: m.cards };
  }

  if (!v.opened) {
    const o = planOpening(v, !mem.swapDone);
    if (o && accepts({ type: "OPEN", melds: o.melds })) {
      if (o.swap) mem.pendingSwap = o.swap;
      return { kind: "open", melds: o.melds, points: o.points };
    }
  } else if (v.pending.length === 0) {
    if (!mem.swapDone) {
      // A joker on the table that a card in my hand stands for.
      for (const m of v.melds) {
        if (!m.cards.some(isJoker)) continue;
        const card = v.hand.find((c) => jokerSwapIndex(asMeld(m), c) >= 0 && accepts({ type: "SWAP", meldId: m.id, card: c }));
        if (card) {
          mem.swapDone = true;
          return { kind: "swap", card, meldId: m.id };
        }
      }
      const j = planJokerLayoffSwap(v);
      if (j && accepts({ type: "LAYOFF", meldId: j.meldId, cards: [j.joker] })) {
        mem.pendingSwap = { joker: j.joker, keep: j.keep };
        return { kind: "layoff", card: j.joker, meldId: j.meldId };
      }
    }
    const m = planMeld(v, !mem.swapDone);
    if (m && accepts({ type: "MELD", cards: m.cards })) {
      if (m.swap) mem.pendingSwap = m.swap;
      return { kind: "meld", cards: m.cards };
    }
    const lay = layoffCandidates(v).find((c) => accepts({ type: "LAYOFF", meldId: c.meldId, cards: [c.card] }));
    if (lay) return { kind: "layoff", ...lay };
  }
  return { kind: "discard", card: discardChoice(v.hand) };
}

/** The minimal engine state `rummyEngine.validate` needs for MY moves (my
 *  hand, the table, my opening flag and pending cards) — built from the view. */
export function stateFromView(v: RummyView): RummyState {
  const hands = Array.from({ length: v.seats }, (_, s) => (s === v.seat ? v.hand.slice() : []));
  const opened = Array.from({ length: v.seats }, (_, s) => (s === v.seat ? v.opened : false));
  return {
    seats: v.seats,
    hands,
    stock: [],
    discard: [],
    melds: v.melds.map((m) => ({ id: m.id, owner: m.owner, kind: m.kind, cards: m.cards.slice() })),
    nextMeldId: Math.max(0, ...v.melds.map((m) => m.id)) + 1,
    opened,
    openedThisTurn: false,
    turn: v.seat,
    phase: v.phase,
    mustUse: v.pending.slice(),
    scores: new Array<number>(v.seats).fill(0),
    round: 1,
    firstSeat: 0,
    lastRound: null,
    winners: [],
    done: false,
  };
}

/** `accepts` for a view: the engine's validate on the view-built state. */
export const acceptsFor =
  (v: RummyView): Accepts =>
  (a) =>
    rummyEngine.validate?.(stateFromView(v), v.seat, a) ?? false;
