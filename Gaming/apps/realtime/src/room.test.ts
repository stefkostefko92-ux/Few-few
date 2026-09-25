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
