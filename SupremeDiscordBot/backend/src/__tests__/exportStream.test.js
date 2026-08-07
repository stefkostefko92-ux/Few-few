// backend/src/__tests__/exportStream.test.js
// CSV експортът дърпаше ЦЯЛАТА таблица с `findMany` без `take`, после сглобяваше
// един низ и го подаваше на `res.send` — три копия в паметта наведнъж (редове →
// масив низове → съединен низ). Сървър с 100k тикета поваля процеса, и то през
// напълно легитимна, платена функция. Нищо не сочеше проблема.
//
// Тук пазим свойствата на курсорния стрийм: партиди, стабилна подредба, видимо
// (не тихо) отрязване и това, че формула-инжекцията още е обезвредена.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "u1" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));

const getServerTier = vi.fn();
vi.mock("../lib/premium.js", () => ({ getServerTier: (...a) => getServerTier(...a) }));

const { default: exportRouter } = await import("../routes/export.js");

function app() {
  const a = express();
  a.use("/api/export", exportRouter);
  return a;
}

/** Тикет с формата, която маршрутът очаква. */
const ticket = (n) => ({
  id: `t${String(n).padStart(6, "0")}`,
  status: "closed",
  creator: { username: `user${n}` },
  assignee: null,
  panel: { name: "Support" },
  _count: { messages: 3 },
  closeReason: null,
  createdAt: new Date("2026-01-01"),
  closedAt: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  getServerTier.mockResolvedValue({ isPremium: true });
});

describe("GET /api/export/:serverId/tickets", () => {
  it("иска Premium", async () => {
    getServerTier.mockResolvedValue({ isPremium: false });
    const res = await request(app()).get("/api/export/s1/tickets");
    expect(res.status).toBe(403);
    expect(prismaMock.ticket.findMany).not.toHaveBeenCalled();
  });

  it("вади на ПАРТИДИ по курсор, не цялата таблица наведнъж", async () => {
    // Две пълни партиди (1000) + една непълна → три заявки, после спира.
    const batch = Array.from({ length: 1000 }, (_, i) => ticket(i));
    prismaMock.ticket.findMany
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce([ticket(9999)]);

    const res = await request(app()).get("/api/export/s1/tickets");

    expect(res.status).toBe(200);
    expect(prismaMock.ticket.findMany).toHaveBeenCalledTimes(3);
    // Нито една заявка без `take` — точно това липсваше.
    for (const [args] of prismaMock.ticket.findMany.mock.calls) {
      expect(args.take, "заявка без take").toBe(1000);
    }
  });

  it("подрежда стабилно (createdAt + id) и стъпва на курсор след първата партида", async () => {
    const batch = Array.from({ length: 1000 }, (_, i) => ticket(i));
    prismaMock.ticket.findMany.mockResolvedValueOnce(batch).mockResolvedValueOnce([]);

    await request(app()).get("/api/export/s1/tickets");

    const [first, second] = prismaMock.ticket.findMany.mock.calls.map((c) => c[0]);
    // `createdAt` не е уникален — без `id` курсорът прескача или повтаря редове.
    expect(first.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(first.cursor).toBeUndefined();
    expect(second.cursor).toEqual({ id: batch.at(-1).id });
    expect(second.skip).toBe(1);
  });

  it("пише BOM и заглавен ред, после данните", async () => {
    prismaMock.ticket.findMany.mockResolvedValueOnce([ticket(1)]);

    const res = await request(app()).get("/api/export/s1/tickets");

    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="tickets-s1-/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM за Excel
    expect(res.text).toContain('"Ticket ID","Status"');
    expect(res.text).toContain('"t000001"');
  });

  it("обезврежда формула-инжекцията (потребителско име, започващо с =)", async () => {
    const evil = ticket(1);
    evil.creator = { username: "=HYPERLINK(\"http://evil\",\"click\")" };
    prismaMock.ticket.findMany.mockResolvedValueOnce([evil]);

    const res = await request(app()).get("/api/export/s1/tickets");

    // Апострофът пред = кара таблицата да го третира като текст, не формула.
    expect(res.text).toContain("\"'=HYPERLINK");
  });

  it("празна таблица дава само заглавния ред", async () => {
    prismaMock.ticket.findMany.mockResolvedValueOnce([]);

    const res = await request(app()).get("/api/export/s1/tickets");

    expect(res.status).toBe(200);
    expect(res.text.trim().split("\r\n")).toHaveLength(1);
  });
});

describe("GET /api/export/:serverId/applications", () => {
  it("също стриймва на партиди", async () => {
    prismaMock.application.findMany.mockResolvedValueOnce([
      { id: "a1", status: "approved", user: { username: "u" }, form: { name: "f" },
        reviewNote: null, createdAt: new Date(), updatedAt: new Date(), answers: {} },
    ]);

    const res = await request(app()).get("/api/export/s1/applications");

    expect(res.status).toBe(200);
    expect(prismaMock.application.findMany.mock.calls[0][0].take).toBe(1000);
    expect(res.text).toContain('"Application ID"');
  });
});
