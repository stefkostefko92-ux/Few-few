import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { SOCKET_EVENTS } from "@aso/shared";
import { BINGO_CLOSE_MS, BINGO_DRAW_MS, bingoHasLine, type BingoState } from "@aso/game-core";

// Краят на мача пише в базата и уведомява API-то — тук само проверяваме стаята.
vi.mock("./rating.js", () => ({
  finalizeMatch: async () => ({ deltas: {}, newRatings: {}, rewards: {} }),
}));
vi.mock("./progression.js", () => ({ notifyMatchResult: async () => undefined }));

// env.ts validates required vars at import; set them before importing room.ts.
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

interface BingoView {
  cards: number[][];
  drawn: number[];
  marks: number[][];
}

describe("GameRoom — действие на сървъра (Бинго: теглене по таймер)", () => {
  it("тегли по таймер без ход на играч; играчът маркира само своята карта; ботът маркира в паузата", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const seats = [
      { seat: 0, userId: "u0", isBot: false, displayName: "P0" },
      { seat: 1, userId: null, isBot: true, displayName: "Bot" },
    ];
    const room = new GameRoom(fakeIo(log), "b1", "BINGO", seats, "bingo-seed");
    room.start();
    const lastState = (): BingoView =>
      (log.filter((e) => e.to === "u:u0" && e.event === SOCKET_EVENTS.GAME_STATE).at(-1)!.payload as { state: BingoView })
        .state;
    expect(lastState().drawn).toEqual([]);

    // Изтегли числа, докато падне число от картата на играча.
    let cell = -1;
    for (let i = 0; i < 75 && cell < 0; i++) {
      vi.advanceTimersByTime(BINGO_DRAW_MS);
      const st = lastState();
      cell = st.cards[0]!.findIndex((n) => st.drawn.includes(n));
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    expect(lastState().marks[0]).toEqual([]); // никакво автоматично маркиране

    log.length = 0;
    room.handleAction("u0", { type: "MARK", seat: 1, cell }); // чуждо място → отказ
    expect(log.some((e) => e.event === SOCKET_EVENTS.ERROR)).toBe(true);
    room.handleAction("u0", { type: "MARK", seat: 0, cell });
    expect(lastState().marks[0]).toContain(cell);
    room.handleAction("u0", { type: "DRAW" }); // клиентът не тегли
    expect(log.filter((e) => e.event === SOCKET_EVENTS.ERROR)).toHaveLength(2);

    // Ботът маркира изтеглените числа от своята карта в паузата преди тегленето.
    vi.advanceTimersByTime(BINGO_DRAW_MS);
    const st = lastState();
    const botDue = st.cards[1]!.filter((n, i) => i !== 12 && st.drawn.slice(0, -1).includes(n)).length;
    expect(st.marks[1]!.length).toBeGreaterThanOrEqual(botDue);
  });
});

interface BingoMsg {
  state: BingoState;
  terminal: boolean;
}

describe("GameRoom — прозорец след вярно „Бинго!“ (BINGO_CLOSE_MS)", () => {
  const lastMsg = (log: Emit[], user: string): BingoMsg =>
    log.filter((e) => e.to === `u:${user}` && e.event === SOCKET_EVENTS.GAME_STATE).at(-1)!.payload as BingoMsg;

  it("викането на играча спира тегленето; краят идва точно BINGO_CLOSE_MS по-късно, не на стария таймер за теглене", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const seats = [
      { seat: 0, userId: "u0", isBot: false, displayName: "P0" },
      { seat: 1, userId: "u1", isBot: false, displayName: "P1" },
    ];
    const room = new GameRoom(fakeIo(log), "b2", "BINGO", seats, "bingo-close-seed");
    room.start();
    // Играч 0 маркира всяко свое изтеглено число, докато събере линия.
    for (let i = 0; i < 75 && !bingoHasLine(lastMsg(log, "u0").state, 0); i++) {
      vi.advanceTimersByTime(BINGO_DRAW_MS);
      const st = lastMsg(log, "u0").state;
      st.cards[0]!.forEach((n, cell) => {
        if (cell !== 12 && st.drawn.includes(n) && !st.marks[0]!.includes(cell)) {
          room.handleAction("u0", { type: "MARK", seat: 0, cell });
        }
      });
    }
    expect(bingoHasLine(lastMsg(log, "u0").state, 0)).toBe(true);

    // Вика 100 ms преди следващото теглене: старият таймер щеше да затвори почти веднага.
    vi.advanceTimersByTime(BINGO_DRAW_MS - 100);
    room.handleAction("u0", { type: "BINGO", seat: 0 });
    expect(lastMsg(log, "u0").state.closing).toBe(true);
    const drawnAtCall = lastMsg(log, "u0").state.drawn.length;
    vi.advanceTimersByTime(BINGO_CLOSE_MS - 1);
    expect(lastMsg(log, "u0").terminal).toBe(false);
    expect(lastMsg(log, "u0").state.drawn.length).toBe(drawnAtCall); // тегленето е спряно
    vi.advanceTimersByTime(1);
    expect(lastMsg(log, "u0").terminal).toBe(true);
    expect(lastMsg(log, "u1").state.winners).toEqual([0]);
  });

  it("бот извика вярно „Бинго!“ в тика: CLOSE не се прилага веднага — хората имат BINGO_CLOSE_MS", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const seats = [
      { seat: 0, userId: "u0", isBot: false, displayName: "P0" },
      { seat: 1, userId: null, isBot: true, displayName: "Bot" },
    ];
    const room = new GameRoom(fakeIo(log), "b3", "BINGO", seats, "bingo-bot-seed");
    room.start();
    // Човекът не маркира; ботът маркира всичко и вика при първата си линия.
    for (let i = 0; i < 80 && !lastMsg(log, "u0").state.closing; i++) vi.advanceTimersByTime(BINGO_DRAW_MS);
    const st = lastMsg(log, "u0");
    expect(st.state.closing).toBe(true);
    expect(st.state.winners).toEqual([1]);
    expect(st.terminal).toBe(false); // преди: CLOSE в същия тик — нулев прозорец за хората
    vi.advanceTimersByTime(BINGO_CLOSE_MS - 1);
    expect(lastMsg(log, "u0").terminal).toBe(false);
    vi.advanceTimersByTime(1);
    expect(lastMsg(log, "u0").terminal).toBe(true);
  });
});
