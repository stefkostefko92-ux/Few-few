/**
 * Dev-only showcase fixtures. Drives every game's REAL engine to a lively
 * mid-game position, then redacts it for seat 0 — so the actual game views can
 * render a faithful table without a live server. Used by showcase.tsx via the
 * fake socket (socket.demo).
 */
import { getEngine, SeededRng } from "@aso/game-core";
import { seatsFor, type GameKey, type MatchPlayerInfo } from "@aso/shared";

export interface Fixture {
  matchId: string;
  game: GameKey;
  seat: number;
  players: MatchPlayerInfo[];
  state: unknown;
  legalActions: unknown[];
  turn: number | null;
}

/** How many half-moves to advance before presenting (a developed position). */
const MOVES: Partial<Record<GameKey, number>> = {
  CHESS: 8, DRAUGHTS: 6, BACKGAMMON: 2, LUDO: 6, DICE: 1,
  SANTASE: 5, BELOTE: 9, KENT: 3, BRIDGE: 6,
  WAR: 3, GOFISH: 4, DOMINO: 6, RUMMY: 4, SVARA: 3,
  BATTLESHIP: 7, BINGO: 6, WORDS: 3,
  EIGHTBALL: 0, NINEBALL: 0, SNOOKER: 0, MAGNAT: 30,
};

function actingSeat(engine: ReturnType<typeof getEngine>, state: unknown, seats: number): number {
  for (let s = 0; s < seats; s++) if (engine.legalActions(state, s).length > 0) return s;
  return -1;
}

export function buildFixture(game: GameKey): Fixture {
  const engine = getEngine(game);
  const seats = seatsFor(game);
  const rng = new SeededRng(`${game}-showcase`);
  let state = engine.init({ seats }, rng);
  const target = MOVES[game] ?? 4;

  let moves = 0;
  while (moves < 60 && !engine.isTerminal(state)) {
    const s = actingSeat(engine, state, seats);
    if (s < 0) break;
    // Once enough moves are in, stop on seat 0's turn for an interactive look.
    if (moves >= target && s === 0) break;
    const legal = engine.legalActions(state, s);
    const pick = (engine.bot && engine.bot(state, s, rng)) || legal[0];
    state = engine.reduce(state, pick, rng).state;
    moves++;
  }

  const seat = 0;
  const legalActions = engine.legalActions(state, seat);
  const redacted = engine.redact(state, seat) as Record<string, unknown>;
  const turn = typeof redacted.turn === "number" ? (redacted.turn as number) : 0;
  const players: MatchPlayerInfo[] = Array.from({ length: seats }, (_, i) => ({
    seat: i,
    displayName: i === 0 ? "Admin" : "АСО Бот",
    isBot: i !== 0,
  }));

  return { matchId: `demo-${game}`, game, seat, players, state: redacted, legalActions, turn };
}
