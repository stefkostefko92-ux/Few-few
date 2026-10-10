// backend/src/__tests__/memberNames.test.js
// Имената на членовете за страницата „Игра“ в таблото (преглед 10.10.2026:
// Top 5, класацията, покупките, колекционерите, куестовете и trivia показваха
// сурови Discord ID). Маршрутът е прокси към бота — пазим трите неща:
//   1. само снежинки, без дубли, до 100 — нищо друго не стига до бота;
//   2. guildId е от ПЪТЯ (доказан от requireServerAdmin), секретът — от средата;
//   3. без бота таблото пак работи (празно, не 500), и се връщат само
//      поисканите ID-та — ботът не може да „добави“ чужди имена.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));
const axiosGet = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a) => axiosGet(...a), post: vi.fn() } }));

const router = (await import("../routes/servers.js")).default;
const app = express();
app.use(express.json());
app.use("/api/servers", router);

const SID = "222222222222222222";
const A = "333333333333333333";
const B = "444444444444444444";

beforeEach(() => { axiosGet.mockReset(); process.env.API_SECRET = "test-secret"; });

describe("GET /api/servers/:serverId/member-names", () => {
  it("праща на бота само снежинки, без дубли, с guildId от пътя и секрета", async () => {
    axiosGet.mockResolvedValueOnce({ data: { ok: true, members: { [A]: "Стефан", [B]: "Иван" } } });
    const r = await request(app).get(`/api/servers/${SID}/member-names`).query({ ids: `${A},${B},${A},abc,1,<script>` });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ members: { [A]: "Стефан", [B]: "Иван" } });
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(new RegExp(`/internal/guild/${SID}/members$`));
    expect(opts.params).toEqual({ ids: `${A},${B}` });
    expect(opts.headers["x-bot-secret"]).toBe("test-secret");
  });

  it("до 100 ID на заявка", async () => {
    axiosGet.mockResolvedValueOnce({ data: { members: {} } });
    const many = Array.from({ length: 150 }, (_, i) => String(100000000000000000n + BigInt(i))).join(",");
    await request(app).get(`/api/servers/${SID}/member-names`).query({ ids: many });
    expect(axiosGet.mock.calls[0][1].params.ids.split(",")).toHaveLength(100);
  });

  it("без валидни ID — нула заявки към бота", async () => {
    const r = await request(app).get(`/api/servers/${SID}/member-names`).query({ ids: "x,y" });
    expect(r.body).toEqual({ members: {} });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("ботът не отговаря → 200 с празно, таблото показва кратко ID", async () => {
    axiosGet.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await request(app).get(`/api/servers/${SID}/member-names`).query({ ids: A });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ members: {}, unavailable: true });
  });

  it("връща само поисканите ID-та и само текст", async () => {
    axiosGet.mockResolvedValueOnce({ data: { members: { [A]: "Стефан", [B]: "чужд", "555555555555555555": { evil: 1 } } } });
    const r = await request(app).get(`/api/servers/${SID}/member-names`).query({ ids: `${A},555555555555555555` });
    expect(r.body).toEqual({ members: { [A]: "Стефан" } });
  });
});
