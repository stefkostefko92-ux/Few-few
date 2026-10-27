import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { SOCKET_EVENTS } from "@aso/shared";
import type { GameRoom as GameRoomType } from "./room.js";

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

/** Minimal Socket.IO stand-in: records every emit per user room. */
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

/** Four human seats at a Кент table; seat 0 holds a caret and is on turn. */
function kentRoomWithCaret(log: Emit[]): GameRoomType {
  const seats = [0, 1, 2, 3].map((seat) => ({
    seat,
    userId: `u${seat}`,
    isBot: false,
    displayName: `P${seat}`,
  }));
  const room = new GameRoom(fakeIo(log), "m1", "KENT", seats, "seed");
  const inner = room as unknown as { state: Record<string, unknown> };
  inner.state = {
    ...inner.state,
    hands: [
      ["AS", "AH", "AD", "AC"],
      ["KS", "KH", "QD", "JC"],
      ["QS", "QH", "KD", "JH"],
      ["JS", "JD", "KC", "QC"],
    ],
    turn: 0,
  };
  return room;
}

describe("GameRoom — скрит ход (Кент SIGNAL)", () => {
  it("противниците не получават НИЩО (нито празен пакет, нито ново състояние/краен срок)", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = kentRoomWithCaret(log);
    room.start();
    const deadline = (
      log.find((e) => e.to === "u:u0" && e.event === SOCKET_EVENTS.GAME_STATE)!.payload as { turnEndsAt?: number }
    ).turnEndsAt;
    expect(deadline).toBeGreaterThan(0);
    log.length = 0;

    vi.advanceTimersByTime(1000);
    room.handleAction("u0", { type: "SIGNAL", seat: 0 });

    // Противниците (1 и 3): абсолютно никакъв трафик.
    expect(log.filter((e) => e.to === "u:u1" || e.to === "u:u3")).toEqual([]);
    // Партньорът (2) получава знака.
    const partnerEvents = log.find((e) => e.to === "u:u2" && e.event === SOCKET_EVENTS.GAME_EVENTS);
    expect(partnerEvents?.payload).toMatchObject({ events: [{ type: "SIGNAL", seat: 0 }] });
    // Сигнализиращият остава на ход със СЪЩИЯ краен срок (часовникът не се рестартира).
    const own = log.find((e) => e.to === "u:u0" && e.event === SOCKET_EVENTS.GAME_STATE);
    expect(own?.payload).toMatchObject({ turn: 0, turnEndsAt: deadline });
  });

  it("следващият видим ход изглежда за противника точно като ход без знак", () => {
    vi.useFakeTimers();
    const withSignal: Emit[] = [];
    const a = kentRoomWithCaret(withSignal);
    a.start();
    withSignal.length = 0;
    a.handleAction("u0", { type: "SIGNAL", seat: 0 });
    a.handleAction("u0", { type: "PASS" });

    const plain: Emit[] = [];
    const b = kentRoomWithCaret(plain);
    b.start();
    plain.length = 0;
    b.handleAction("u0", { type: "PASS" });

    // Сравняваме трафика към противник (без абсолютния краен срок — зависи от часа).
    const opp = (log: Emit[]) =>
      JSON.stringify(
        log
          .filter((e) => e.to === "u:u1")
          .map((e) => ({ ...e, payload: { ...(e.payload as object), turnEndsAt: undefined } })),
      );
    expect(opp(withSignal)).toBe(opp(plain));
  });
});

// ── Часовник на хода, таймаути, резервен ход на бота, авто-продължаване ──────

type StateMsg = {
  turn: number | null;
  turnEndsAt?: number;
  turnMs?: number;
  substituted?: number[];
  timeoutStrikes?: number;
  legalActions: unknown[];
  state: Record<string, unknown>;
};

const lastState = (log: Emit[], user: string): StateMsg =>
  log.filter((e) => e.to === `u:${user}` && e.event === SOCKET_EVENTS.GAME_STATE).at(-1)!.payload as StateMsg;

function humans(n: number) {
  return Array.from({ length: n }, (_, seat) => ({
    seat,
    userId: `u${seat}`,
    isBot: false,
    displayName: `P${seat}`,
  }));
}

/** Seat 1 plays its first legal move (a human acting on time). */
function humanMoves(room: GameRoomType, log: Emit[], seat: number): void {
  const legal = lastState(log, `u${seat}`).legalActions.find(
    (a) => (a as { type?: string }).type === "MOVE",
  );
  room.handleAction(`u${seat}`, legal);
}

describe("GameRoom — часовник на хода по игра + два поредни таймаута", () => {
  it("шахът има собствено (по-дълго) време за ход", () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "c0", "CHESS", humans(2), "seed");
    room.start();
    expect(lastState(log, "u0").turnMs).toBe(60_000);
    const war = new GameRoom(fakeIo(log), "w0", "WAR", humans(2), "seed");
    war.start();
    const warMsg = log.filter((e) => e.to === "u:u0" && e.event === SOCKET_EVENTS.GAME_STATE).at(-1)!.payload as StateMsg;
    expect(warMsg.turnMs).toBe(15_000);
  });

  it("1-ви таймаут: ботът изиграва САМО този ход, играчът остава; 2-ри пореден → бот-заместник", async () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "c1", "CHESS", humans(2), "seed");
    room.start();
    const presence = () => log.filter((e) => e.event === SOCKET_EVENTS.PRESENCE);

    await vi.advanceTimersByTimeAsync(60_000 + 400);
    // Ботът е изиграл хода на бялото, ходът е на черното, мястото не е заместено.
    expect(lastState(log, "u0").turn).toBe(1);
    expect(lastState(log, "u0").substituted).toBeUndefined();
    expect(lastState(log, "u0").timeoutStrikes).toBe(1);
    expect(presence()).toEqual([]);

    humanMoves(room, log, 1);
    expect(lastState(log, "u0").turn).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000 + 10);
    // Втори пореден таймаут → постоянен заместник (до reclaim).
    expect(presence().at(-1)?.payload).toMatchObject({ seat: 0, connected: false });
    await vi.advanceTimersByTimeAsync(400);
    expect(lastState(log, "u1").substituted).toEqual([0]);

    // reclaim продължава да работи и нулира брояча.
    room.reclaim("u0");
    expect(lastState(log, "u0").substituted).toBeUndefined();
    expect(lastState(log, "u0").timeoutStrikes).toBeUndefined();
  });

  it("собствен ход на играча нулира брояча (два непоредни таймаута не предават мястото)", async () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "c2", "CHESS", humans(2), "seed");
    room.start();
    await vi.advanceTimersByTimeAsync(60_000 + 400); // таймаут 1 (бял)
    humanMoves(room, log, 1);
    humanMoves(room, log, 0); // белият играе сам → броячът се нулира
    expect(lastState(log, "u0").timeoutStrikes).toBeUndefined();
    humanMoves(room, log, 1);
    await vi.advanceTimersByTimeAsync(60_000 + 400); // пак само 1 пореден
    expect(lastState(log, "u0").substituted).toBeUndefined();
    expect(lastState(log, "u0").timeoutStrikes).toBe(1);
    expect(log.filter((e) => e.event === SOCKET_EVENTS.PRESENCE)).toEqual([]);
  });

  it("Думи: изтекъл часовник = загубен живот (ботът НЕ казва дума вместо играча)", async () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "wd", "WORDS", humans(2), "seed");
    room.start();
    await vi.advanceTimersByTimeAsync(30_000 + 10);
    const events = log
      .filter((e) => e.to === "u:u1" && e.event === SOCKET_EVENTS.GAME_EVENTS)
      .flatMap((e) => (e.payload as { events: Array<{ type: string; seat?: number }> }).events);
    expect(events.some((e) => e.type === "PLAY")).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: "PASS", seat: 0 }));
    const st = lastState(log, "u0");
    expect((st.state.lives as number[])[0]).toBe(2);
    expect(st.turn).toBe(1);
    expect(st.timeoutStrikes).toBe(1);
  });
});

describe("GameRoom — бот, който хвърля, не замразява масата", () => {
  it("bot.pick хвърля → логва се и се играе първият легален ход", async () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const seats = [
      { seat: 0, userId: "u0", isBot: false, displayName: "P0" },
      {
        seat: 1,
        userId: null,
        isBot: true,
        displayName: "Bot",
        bot: {
          pick: () => {
            throw new Error("boom");
          },
        } as never,
      },
    ];
    const room = new GameRoom(fakeIo(log), "cb", "CHESS", seats, "seed");
    room.start();
    humanMoves(room, log, 0);
    expect(lastState(log, "u0").turn).toBe(1);
    await vi.advanceTimersByTimeAsync(400);
    // Черното е изиграло (първия легален ход) → пак е ред на бялото.
    expect(lastState(log, "u0").turn).toBe(0);
    expect(room.isDone).toBe(false);
  });
});

describe("GameRoom — Свара: открити карти без AFK наказание за място 0", () => {
  it("SHOWDOWN: никой не е на часовник; сървърът продължава сам след паузата", async () => {
    vi.useFakeTimers();
    const { AUTO_ADVANCE_MS } = await import("./room.js");
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "sv", "SVARA", humans(4), "seed");
    const inner = room as unknown as { state: Record<string, unknown> };
    inner.state = { ...inner.state, phase: "SHOWDOWN" };
    room.start();
    const st = lastState(log, "u0");
    expect(st.turn).toBeNull();
    expect(st.turnEndsAt).toBeUndefined();
    // Дълго след всеки нормален часовник — пак никой не е маркиран като AFK.
    await vi.advanceTimersByTimeAsync(AUTO_ADVANCE_MS + 50);
    expect(lastState(log, "u0").state.phase).toBe("BETTING");
    expect(log.filter((e) => e.event === SOCKET_EVENTS.PRESENCE)).toEqual([]);
    expect(lastState(log, "u0").substituted).toBeUndefined();
    expect(lastState(log, "u0").timeoutStrikes).toBeUndefined();
  });
});

describe("GameRoom — Думи: прекъсната връзка не източва животите", () => {
  it("изпаднал играч в Думи не пасува на всеки 350 ms; губи живот чак след пълния часовник", async () => {
    vi.useFakeTimers();
    const log: Emit[] = [];
    const room = new GameRoom(fakeIo(log), "wd2", "WORDS", humans(2), "seed");
    room.start();
    room.setConnected("u0", false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((lastState(log, "u1").state.lives as number[])[0]).toBe(3);
    await vi.advanceTimersByTimeAsync(25_100);
    expect((lastState(log, "u1").state.lives as number[])[0]).toBe(2);
    expect(lastState(log, "u1").turn).toBe(1);
  });
});
