import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { buildDeck, hiddenLike, RANK_VALUE, RANKS_52, rankOf, type Card } from "../cards.js";

/**
 * Война (War) — 2p card duel (§4.4), reworked for drama and a real decision.
 *
 * Each FLIP both players reveal their top card; the higher rank sweeps the pile
 * to the bottom of the winner's deck. Ties trigger a **war**, and here the game
 * stops being pure luck: the player who flipped chooses how hard to commit —
 *   • FIGHT   — bury 3 cards face-down + 1 face-up (classic war, big swing);
 *   • SKIRMISH — bury 1 face-down + 1 face-up (shallow, protects your deck).
 * The two new face-up cards decide it; another tie escalates into a deeper war
 * (the "bounty" pile keeps growing). Winning three flips in a row triggers a
 * RAID — the momentum player steals an extra card off the top of the loser's
 * deck, so comebacks and hot streaks actually swing the match.
 *
 * Fully determined by the shuffle plus the FIGHT/SKIRMISH choices. A flip cap
 * guarantees termination; if reached, the player holding more cards wins.
 */

export interface WarState {
  hands: Card[][]; // remaining deck per seat (index 0 = top)
  pile: Card[]; // cards in contention this round (the "bounty")
  table: [Card | null, Card | null]; // currently revealed card per seat
  turn: Seat;
  phase: "FLIP" | "WAR"; // WAR = a tie occurred; the turn seat must choose how to commit
  flips: number;
  /** Current winning streak (seat + length), or null after any loss. */
  streak: { seat: Seat; count: number } | null;
  /** Cards at stake right now (== pile.length) — surfaced for the UI meter. */
  bounty: number;
  winner: Seat | null;
  done: boolean;
}

export type WarAction = { type: "FLIP" } | { type: "FIGHT" } | { type: "SKIRMISH" };
export type WarEvent =
  | { type: "FLIP"; cards: [Card, Card] }
  | { type: "TAKE"; seat: Seat; count: number }
  | { type: "WAR"; buried: number; bounty: number }
  | { type: "STREAK"; seat: Seat; count: number }
  | { type: "RAID"; seat: Seat }
  | { type: "WIN"; seat: Seat };

const MAX_FLIPS = 5000;
/** Winning this many flips in a row triggers a RAID (steal a card). */
const RAID_STREAK = 3;
const val = (c: Card): number => RANK_VALUE[rankOf(c)] ?? 0;

export const warEngine: GameEngine<WarState, WarAction, WarEvent> = {
  init(_opts: InitOpts, rng: SeededRng): WarState {
    const deck = rng.shuffle(buildDeck(RANKS_52));
    return {
      hands: [deck.slice(0, 26), deck.slice(26)],
      pile: [],
      table: [null, null],
      turn: 0,
      phase: "FLIP",
      flips: 0,
      streak: null,
      bounty: 0,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    // Mid-war the flipping player decides how deep to commit; a plain flip
    // otherwise (both top cards are revealed at once — no card choice).
    if (state.phase === "WAR") return [{ type: "FIGHT" }, { type: "SKIRMISH" }];
    return [{ type: "FLIP" }];
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");

    if (state.phase === "WAR") {
      if (action.type !== "FIGHT" && action.type !== "SKIRMISH")
        throw new IllegalActionError("Awaiting FIGHT/SKIRMISH");
      return resolveWar(state, action.type === "FIGHT" ? 3 : 1);
    }

    if (action.type !== "FLIP") throw new IllegalActionError("Only FLIP");
    const hands: Card[][] = [state.hands[0]!.slice(), state.hands[1]!.slice()];
    const pile = state.pile.slice();
    const events: WarEvent[] = [];

    const a = hands[0]!.shift();
    const b = hands[1]!.shift();
    if (!a || !b) return finish({ ...state, hands, pile, table: [null, null] }, !a ? 1 : 0, events);
    pile.push(a, b);
    events.push({ type: "FLIP", cards: [a, b] });

    if (val(a) === val(b)) {
      // Tie → war. Hold the revealed pair on the table; the flipper now chooses.
      events.push({ type: "WAR", buried: 0, bounty: pile.length });
      return {
        state: { ...state, hands, pile, table: [a, b], phase: "WAR", bounty: pile.length },
        events,
      };
    }
    const winner: Seat = val(a) > val(b) ? 0 : 1;
    return awardPile(state, hands, pile, winner, [a, b], events);
  },

  isTerminal: (s) => s.done,

  /** Heuristic bot: flip when asked; at a war, FIGHT while it can afford to bury
   *  a full stack, otherwise SKIRMISH to protect a thin deck. */
  bot(state, seat) {
    if (state.done || seat !== state.turn) return null;
    if (state.phase === "WAR") return (state.hands[seat]?.length ?? 0) >= 6 ? { type: "FIGHT" } : { type: "SKIRMISH" };
    return { type: "FLIP" };
  },

  score(state): SeatScore[] {
    const winner = state.winner ?? (state.hands[0]!.length >= state.hands[1]!.length ? 0 : 1);
    const loser: Seat = winner === 0 ? 1 : 0;
    return [
      { seat: winner, result: "win", points: 1 },
      { seat: loser, result: "loss", points: 0 },
    ];
  },

  // The decks and buried pile are face-down — never ship their identity/order.
  // Only the revealed `table` cards are public; counts are preserved for tallies.
  redact: (s) => ({
    ...s,
    hands: [hiddenLike(s.hands[0]!), hiddenLike(s.hands[1]!)],
    pile: hiddenLike(s.pile),
  }),
};

/** Resolve a war: each side buries `depth` face-down cards + 1 face-up, then
 *  the face-up cards decide. Running out mid-bury loses. */
function resolveWar(state: WarState, depth: number): { state: WarState; events: WarEvent[] } {
  const hands: Card[][] = [state.hands[0]!.slice(), state.hands[1]!.slice()];
  const pile = state.pile.slice();
  const events: WarEvent[] = [];

  // A player who cannot muster a face-up card loses the whole pile now.
  if (hands[0]!.length === 0 || hands[1]!.length === 0) {
    return finish({ ...state, hands, pile }, hands[0]!.length === 0 ? 1 : 0, events);
  }

  let buried = 0;
  for (const s of [0, 1] as const) {
    // Keep at least one card back for the deciding face-up flip.
    const canBury = Math.min(depth, hands[s]!.length - 1);
    for (let i = 0; i < canBury; i++) {
      pile.push(hands[s]!.shift()!);
      buried++;
    }
  }
  const upA = hands[0]!.shift()!;
  const upB = hands[1]!.shift()!;
  pile.push(upA, upB);
  events.push({ type: "WAR", buried, bounty: pile.length });

  if (val(upA) === val(upB)) {
    // Escalate: another war on the (now bigger) bounty, same flipper decides.
    return { state: { ...state, hands, pile, table: [upA, upB], phase: "WAR", bounty: pile.length }, events };
  }
  const winner: Seat = val(upA) > val(upB) ? 0 : 1;
  return awardPile(state, hands, pile, winner, [upA, upB], events);
}

/** Give the contested pile to `winner`, update the streak (raiding on a hot
 *  run), leave the deciding pair face-up, and pass the flip to the other seat. */
function awardPile(
  prev: WarState,
  hands: Card[][],
  pile: Card[],
  winner: Seat,
  revealed: [Card, Card],
  events: WarEvent[],
): { state: WarState; events: WarEvent[] } {
  hands[winner]!.push(...pile);
  events.push({ type: "TAKE", seat: winner, count: pile.length });

  // Streak + raid: three flips in a row steals a card off the loser's deck.
  const loser: Seat = winner === 0 ? 1 : 0;
  const count = prev.streak && prev.streak.seat === winner ? prev.streak.count + 1 : 1;
  let streak: WarState["streak"] = { seat: winner, count };
  events.push({ type: "STREAK", seat: winner, count });
  if (count >= RAID_STREAK && hands[loser]!.length > 0) {
    hands[winner]!.push(hands[loser]!.shift()!);
    events.push({ type: "RAID", seat: winner });
    streak = null; // reset the meter after a raid
  }

  const flips = prev.flips + 1;
  const next: WarState = {
    ...prev,
    hands,
    pile: [],
    table: revealed,
    phase: "FLIP",
    bounty: 0,
    streak,
    flips,
    turn: (flips % 2) as Seat,
  };

  if (hands[0]!.length === 0 || hands[1]!.length === 0) {
    return finish(next, hands[0]!.length === 0 ? 1 : 0, events);
  }
  if (flips >= MAX_FLIPS) {
    return finish(next, hands[0]!.length >= hands[1]!.length ? 0 : 1, events);
  }
  return { state: next, events };
}

function finish(state: WarState, winner: Seat, events: WarEvent[]): { state: WarState; events: WarEvent[] } {
  events.push({ type: "WIN", seat: winner });
  return { state: { ...state, winner, done: true, phase: "FLIP" }, events };
}
