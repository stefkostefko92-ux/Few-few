import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { GAME_SEATS, SOCKET_EVENTS, type GameKey } from "@aso/shared";
import { SeededRng } from "@aso/game-core";

/**
 * Every one of the 21 games played to the end through the real GameRoom — the
 * same object the socket server drives — with one human seat and bots in the
 * rest:
 *
 *  - "активен": the human answers each of its turns with a legal action taken
 *    from the GAME_STATE it was sent (exactly what a client renders and sends);
 *    the server must accept every one of them and the match must finish;
 *  - "AFK": the human never acts; the turn clock, the one-move bot cover and the
 *    bot substitute must still carry the match to GAME_OVER.
 *
 * A table that stalls, an action the server itself offered and then rejects,
 * or a throw anywhere in the loop fails the game by name. Persistence (ratings,
 * quests) is stubbed — this checks the game flow, not the database.
 */

vi.mock("./rating.js", () => ({
  finalizeMatch: vi.fn(async () => ({ deltas: {}, newRatings: {}, rewards: {} })),
}));
vi.mock("./progression.js", () => ({ notifyMatchResult: vi.fn(async () => undefined) }));

let GameRoom: typeof import("./room.js").GameRoom;
let RandomBot: typeof import("./bot.js").RandomBot;
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://aso:aso@localhost:5437/aso?schema=public";
  process.env.REDIS_URL ??= "redis://localhost:6383";
  process.env.JWT_SECRET ??= "test-access-secret-that-is-long-enough-1234567890";
  ({ GameRoom } = await import("./room.js"));
  ({ RandomBot } = await import("./bot.js"));
});

afterEach(() => {
  vi.useRealTimers();
});

interface Emit {
  to: string;
  event: string;
  payload: unknown;
}

function fakeIo(log: Emit[]): Server {
  return {
    to: (to: string) => ({
      emit: (event: string, payload: unknown) => {
        log.push({ to, event, payload });
        return true;
      },
    }),
  } as unknown as Server;
}

type StateMsg = { turn: number | null; legalActions: unknown[]; terminal: boolean };

/** Actions a person would not pick while trying to finish a game normally. */
const GIVE_UP = /RESIGN|DRAW_OFFER|DRAW_DECLINE|SURRENDER|CONCEDE/i;

const STEP_MS = 250;
/** Simulated time budget per match (long multi-round games: Реми до 501). */
const MAX_SIM_MS = 6 * 60 * 60 * 1000;

interface Outcome {
  over: boolean;
  humanActions: number;
  rejected: number;
  simMs: number;
}

async function playMatch(game: GameKey, mode: "active" | "afk", seed: string): Promise<Outcome> {
  const log: Emit[] = [];
  const seats = Array.from({ length: GAME_SEATS[game] }, (_, seat) =>
    seat === 0
      ? { seat, userId: "u0", isBot: false, displayName: "Човек" }
      : {
          seat,
          userId: null,
          isBot: true,
          displayName: "АСО Бот",
          bot: new RandomBot(`${seed}:bot:${seat}`, "NORMAL"),
        },
  );
  const room = new GameRoom(fakeIo(log), `m-${game}-${mode}`, game, seats, seed);
  const rng = new SeededRng(`${seed}:human`);
  room.start();

  let seen = 0; // index into log already inspected
  let pendingState: StateMsg | null = null;
  let humanActions = 0;
  let rejected = 0;
  let simMs = 0;

  while (!room.isDone && simMs < MAX_SIM_MS) {
    for (; seen < log.length; seen++) {
      const e = log[seen]!;
      if (e.to !== "u:u0") continue;
      if (e.event === SOCKET_EVENTS.GAME_STATE) pendingState = e.payload as StateMsg;
      if (e.event === SOCKET_EVENTS.ERROR) rejected++;
    }
    if (mode === "active" && pendingState && !pendingState.terminal) {
      const options = pendingState.legalActions.filter((a) => !GIVE_UP.test(JSON.stringify(a)));
      const pool = options.length > 0 ? options : pendingState.legalActions;
      pendingState = null;
      if (pool.length > 0) {
        const action = pool[rng.int(pool.length)];
        room.handleAction("u0", action);
        humanActions++;
        continue; // the answer may already be in the log — read it before time moves
      }
    }
    await vi.advanceTimersByTimeAsync(STEP_MS);
    simMs += STEP_MS;
  }
  // finish() is async (it persists ratings first): GAME_OVER lands a few
  // microtasks after the room flips to done.
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(20);
  for (; seen < log.length; seen++) {
    const e = log[seen]!;
    if (e.to === "u:u0" && e.event === SOCKET_EVENTS.ERROR) rejected++;
  }
  const over = log.some((e) => e.to === "u:u0" && e.event === SOCKET_EVENTS.GAME_OVER);
  return { over, humanActions, rejected, simMs };
}

const GAMES = Object.keys(GAME_SEATS) as GameKey[];

describe("пълен мач през GameRoom — човек + ботове, всички 21 игри", () => {
  it("покрива всички игри от каталога", () => {
    expect(GAMES).toHaveLength(21);
  });

  for (const game of GAMES) {
    it(`${game}: активен играч — всеки предложен ход се приема и мачът свършва`, async () => {
      vi.useFakeTimers();
      const r = await playMatch(game, "active", `full-${game}-active`);
      expect(r.rejected, `${game}: сървърът отхвърли ход, който сам предложи`).toBe(0);
      expect(r.over, `${game}: мачът не свърши за ${Math.round(r.simMs / 60000)} мин симулирано време`).toBe(true);
    }, 120_000);

    it(`${game}: играч, който не прави нищо — масата не засяда`, async () => {
      vi.useFakeTimers();
      const r = await playMatch(game, "afk", `full-${game}-afk`);
      expect(r.over, `${game}: мачът засядна без активен човек (${Math.round(r.simMs / 60000)} мин)`).toBe(true);
    }, 120_000);
  }
});
