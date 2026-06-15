import { describe, expect, it, beforeAll } from "vitest";
import { teamOfSeat, type GameKey } from "@aso/shared";
import type { Lobby as LobbyType } from "./lobby.js";

// env.ts validates required vars at import; set them before importing lobby.ts.
let Lobby: typeof import("./lobby.js").Lobby;
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://aso:aso@localhost:5437/aso?schema=public";
  process.env.REDIS_URL ??= "redis://localhost:6383";
  process.env.JWT_SECRET ??= "test-access-secret-that-is-long-enough-1234567890";
  ({ Lobby } = await import("./lobby.js"));
});

const make = (game: GameKey = "MAGNAT"): LobbyType =>
  new Lobby(game, "custom", "public", "host1", "Хост", null);

describe("Lobby — seating", () => {
  it("seats the host at slot 0 and fills empty slots on join", () => {
    const l = make();
    expect(l.maxSeats).toBe(4);
    expect(l.isHost("host1")).toBe(true);
    expect(l.humans()).toBe(1);
    expect(l.join("u2", "Боян")).toBe(true);
    expect(l.humans()).toBe(2);
    expect(l.has("u2")).toBe(true);
  });

  it("rejects joining a full lobby", () => {
    const l = make();
    l.join("u2", "B");
    l.join("u3", "C");
    l.join("u4", "D");
    expect(l.join("u5", "E")).toBe(false);
  });

  it("can only start once every slot is filled (humans + bots)", () => {
    const l = make();
    expect(l.canStart()).toBe(false);
    l.join("u2", "B");
    expect(l.canStart()).toBe(false);
    expect(l.addBot()).toBe(true);
    expect(l.addBot()).toBe(true);
    expect(l.occupied()).toBe(4);
    expect(l.canStart()).toBe(true);
    expect(l.addBot()).toBe(false); // full
  });

  it("kicks a seat and frees it", () => {
    const l = make();
    l.join("u2", "B");
    expect(l.clearSlot(1)).toBe("u2");
    expect(l.has("u2")).toBe(false);
    expect(l.humans()).toBe(1);
  });

  it("promotes a new host when the host leaves", () => {
    const l = make();
    l.join("u2", "B");
    l.leave("host1");
    expect(l.isHost("host1")).toBe(false);
    expect(l.isHost("u2")).toBe(true);
    expect(l.humans()).toBe(1);
  });
});

describe("Lobby — teams", () => {
  it("a partnership game splits seats across two teams", () => {
    const l = new Lobby("BELOTE", "custom", "public", "h", "H", null);
    expect(l.teams).toBe(2);
    expect(teamOfSeat("BELOTE", 0)).toBe(0);
    expect(teamOfSeat("BELOTE", 1)).toBe(1);
    expect(teamOfSeat("BELOTE", 2)).toBe(0);
    expect(teamOfSeat("BELOTE", 3)).toBe(1);
  });

  it("setTeam relocates a player to a slot of the requested team", () => {
    const l = new Lobby("BELOTE", "custom", "public", "h", "H", null);
    l.join("u2", "B"); // slot 1 → team 1
    // move u2 (slot 1, team 1) to team 0 → should land on a team-0 slot
    expect(l.setTeam(1, 0)).toBe(true);
    const seatOfU2 = l.toSeats().find((s) => s.userId === "u2")!;
    expect(seatOfU2.team).toBe(0);
  });
});

describe("Lobby — handoff to a match", () => {
  it("produces room seats mirroring slots, with bots wired", () => {
    const l = make();
    l.join("u2", "B");
    l.addBot();
    l.addBot();
    const seats = l.toRoomSeats("seed-1");
    expect(seats).toHaveLength(4);
    expect(seats[0]).toMatchObject({ seat: 0, userId: "host1", isBot: false });
    expect(seats[1]).toMatchObject({ seat: 1, userId: "u2", isBot: false });
    expect(seats[2]!.isBot).toBe(true);
    expect(seats[2]!.userId).toBe(null);
    expect(seats[2]!.bot).toBeDefined();
  });
});
