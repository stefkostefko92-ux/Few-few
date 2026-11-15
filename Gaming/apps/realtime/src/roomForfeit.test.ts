import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { SOCKET_EVENTS } from "@aso/shared";
import type { GameRoom as GameRoomType } from "./room.js";

/**
 * Оттегляне/напускане: само последният останал печели в игра без отбори;
 * преди първия ход партията не се рейтингува (FIDE 5.1).
 */
const finalize = vi.fn(async (_o: unknown) => ({ deltas: {}, newRatings: {}, rewards: {} }));
vi.mock("./rating.js", () => ({ finalizeMatch: (o: unknown) => finalize(o) }));
vi.mock("./progression.js", () => ({ notifyMatchResult: vi.fn(async () => undefined) }));

let GameRoom: typeof import("./room.js").GameRoom;
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://aso:aso@localhost:5437/aso?schema=public";
  process.env.REDIS_URL ??= "redis://localhost:6383";
  process.env.JWT_SECRET ??= "test-access-secret-that-is-long-enough-1234567890";
  ({ GameRoom } = await import("./room.js"));
});
afterEach(() => {
  vi.useRealTimers();
  finalize.mockClear();
});

interface Emit {
  to: string;
  event: string;
  payload: unknown;
}
const fakeIo = (log: Emit[]): Server =>
  ({
    to: (to: string) => ({
      emit: (event: string, payload: unknown) => {
        log.push({ to, event, payload });
        return true;
      },
    }),
  }) as unknown as Server;

const humans = (n: number) =>
  Array.from({ length: n }, (_, seat) => ({ seat, userId: `u${seat}`, isBot: false, displayName: `P${seat}` }));

type Score = { seat: number; result: string }[];
const lastFinalize = () => finalize.mock.calls.at(-1)![0] as { score: Score; unrated: boolean };

/** Мястото на ход изиграва първия си легален ход (човек на време). */
function someoneMoves(room: GameRoomType, log: Emit[]): void {
  for (let s = 0; s < 4; s++) {
    const st = log.filter((e) => e.to === `u:u${s}` && e.event === SOCKET_EVENTS.GAME_STATE).at(-1)?.payload as
      | { turn: number | null; legalActions: unknown[] }
      | undefined;
    if (st && st.turn === s && st.legalActions[0]) {
      room.handleAction(`u${s}`, st.legalActions[0]);
      return;
    }
  }
  throw new Error("никой не е на ход");
}

describe("оттегляне в игра без отбори (Ludo, 4 места)", () => {
  it("с ≥2 останали: оттеглилият е loss, НИКОЙ не получава победа по пропуск, масата продължава с бот", async () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "ff1", "LUDO", humans(4), "seed");
    room.start();
    someoneMoves(room, log); // ply > 0
    room.resign("u0");
    expect(room.isDone).toBe(false); // не е „win“ за останалите трима
    expect(finalize).not.toHaveBeenCalled();
    const snap = room.snapshot();
    expect(snap.seats[0]!.substituted).toBe(true);
    // Оттеглилият не може да си вземе мястото обратно.
    room.reclaim("u0");
    room.setConnected("u0", true);
    expect(room.snapshot().seats[0]!.substituted).toBe(true);
  });

  it("последният останал печели; оттеглилите се са loss и мачът е рейтингован", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "ff2", "LUDO", humans(3), "seed");
    room.start();
    someoneMoves(room, log);
    room.resign("u0");
    room.resign("u1");
    expect(room.isDone).toBe(true);
    const call = lastFinalize();
    expect(call.unrated).toBe(false);
    expect(call.score).toEqual([
      { seat: 0, result: "loss" },
      { seat: 1, result: "loss" },
      { seat: 2, result: "win" },
    ]);
  });

  it("оттегляне преди първия ход (ply 0) не се рейтингува", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "ff3", "CHESS", humans(2), "seed");
    room.start();
    room.resign("u0");
    expect(room.isDone).toBe(true);
    expect(lastFinalize().unrated).toBe(true);
  });

  it("2 места след първия ход: оттеглилият губи, другият печели (рейтингова)", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "ff4", "CHESS", humans(2), "seed");
    room.start();
    someoneMoves(room, log);
    room.resign("u0");
    const call = lastFinalize();
    expect(call.unrated).toBe(false);
    expect(call.score).toEqual([
      { seat: 0, result: "loss" },
      { seat: 1, result: "win" },
    ]);
  });
});

describe("hasLiveSeat — оттеглилият се няма жива седалка (F4)", () => {
  it("след оттегляне в продължаваща маса мястото не е „живо“, останалите са", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "ls1", "LUDO", humans(4), "seed");
    room.start();
    someoneMoves(room, log);
    expect(room.hasLiveSeat("u0")).toBe(true);
    room.resign("u0");
    expect(room.isDone).toBe(false);
    expect(room.hasLiveSeat("u0")).toBe(false);
    expect(room.hasLiveSeat("u1")).toBe(true);
    expect(room.hasLiveSeat("непознат")).toBe(false);
  });
});

describe("Свара FFA: точките на оттеглилия се се замразяват (F5)", () => {
  it("ботът-заместник играе стека след оттеглянето, но уреждането ползва стека от момента на оттеглянето", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "sv5", "SVARA", humans(3), "seed");
    room.start();
    someoneMoves(room, log);
    const inner = room as unknown as { state: { chips: number[] } };
    const atLeave = inner.state.chips[0]!;
    room.resign("u0");
    expect(room.isDone).toBe(false);
    inner.state = { ...inner.state, chips: [atLeave + 777, ...inner.state.chips.slice(1)] }; // бот-заместникът „печели“
    room.resign("u1");
    expect(room.isDone).toBe(true);
    const pts = (lastFinalize().score as Array<{ seat: number; points?: number }>).find((s) => s.seat === 0)!.points;
    expect(pts).toBe(atLeave);
  });
});

describe("оттегляне при ply 0 в продължаваща FFA маса (F6)", () => {
  it("мястото не се рейтингува; останалите се уреждат нормално", async () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "ff6", "LUDO", humans(3), "seed");
    room.start();
    room.resign("u0"); // ply 0, остават 2 човека → масата продължава
    expect(room.isDone).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000); // ботът-заместник играе → ply > 0
    expect(room.snapshot().ply).toBeGreaterThan(0);
    room.resign("u1"); // останал само u2 → край
    expect(room.isDone).toBe(true);
    const call = lastFinalize() as unknown as { unrated: boolean; unratedSeats?: number[] };
    expect(call.unrated).toBe(false);
    expect(call.unratedSeats).toEqual([0]);
  });
});
