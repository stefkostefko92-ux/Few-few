// backend/src/__tests__/ticketActivity.test.js
// `lastActivityAt` и авто-затварянето по неактивност.
//
// Одит (07.08.2026): полето се вдигаше при създаване, claim/unclaim и смяна на
// приоритет — но НЕ при съобщение. А планировчикът затваря тикети, чийто
// `lastActivityAt` е по-стар от прага на панела. Резултат: тикет, в който хората
// активно си пишат, се брои за мъртъв и Premium функцията го затваря НАСРЕД
// разговора — точно обратното на това, за което клиентът плаща.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "test-bot-secret";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../services/botNotifier.js", () => ({ notifyBot: vi.fn(), dmUser: vi.fn(), reconcileWhitelabel: vi.fn() }));

const { default: botRouter } = await import("../routes/bot.js");

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botRouter);
  return a;
}
const post = (body) =>
  request(app()).post("/api/bot/ticket/t1/message").set("x-bot-secret", "test-bot-secret").send(body);

const lastTicketUpdate = () => prismaMock.ticket.update.mock.calls.at(-1)?.[0]?.data;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.ticketMessage.create.mockResolvedValue({ id: "m1" });
  prismaMock.ticket.update.mockResolvedValue({});
});

describe("POST /api/bot/ticket/:id/message", () => {
  it("вдига lastActivityAt при ВСЯКО съобщение", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ creatorId: "u1", firstResponseAt: new Date() });

    const res = await post({ authorId: "u1", authorTag: "user#1", content: "здрасти" });

    expect(res.status).toBe(200);
    expect(lastTicketUpdate()?.lastActivityAt).toBeInstanceOf(Date);
  });

  it("съобщение от СЪЗДАТЕЛЯ също брои за активност (не само отговорите на екипа)", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ creatorId: "u1", firstResponseAt: null });

    await post({ authorId: "u1", authorTag: "user#1", content: "още съм тук" });

    const data = lastTicketUpdate();
    expect(data?.lastActivityAt).toBeInstanceOf(Date);
    // Създателят НЕ вдига „първи отговор“ — това е отговор на ЕКИПА.
    expect(data?.firstResponseAt).toBeUndefined();
  });

  it("първото съобщение от НЕ-създателя вдига и firstResponseAt (SLA)", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ creatorId: "u1", firstResponseAt: null });

    await post({ authorId: "staff1", authorTag: "staff#1", content: "здравейте" });

    const data = lastTicketUpdate();
    expect(data?.lastActivityAt).toBeInstanceOf(Date);
    expect(data?.firstResponseAt).toBeInstanceOf(Date);
  });

  it("вече отбелязан първи отговор не се пренаписва", async () => {
    const was = new Date("2026-01-01");
    prismaMock.ticket.findUnique.mockResolvedValue({ creatorId: "u1", firstResponseAt: was });

    await post({ authorId: "staff1", authorTag: "staff#1", content: "пак аз" });

    expect(lastTicketUpdate()?.firstResponseAt).toBeUndefined();
  });
});
