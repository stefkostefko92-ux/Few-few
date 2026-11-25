// backend/src/__tests__/launchPublicApi.test.js
// А8 — публичният API връща 400 (не 500) при невалиден вход.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";
import { parsePaging, parseEnum, parseDate, parseExpiresInDays } from "../lib/publicApiQuery.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_q, _s, n) => n(),
  loadUser: (req, _s, n) => { req.user = { id: "111111111111111111" }; n(); },
  requireServerAdmin: (_q, _s, n) => n(),
}));
vi.mock("../lib/premium.js", async (orig) => ({ ...(await orig()), requirePremium: () => (_q, _s, n) => n() }));

const { apiKeyManagementRouter } = await import("../routes/publicApi.js");
const SID = "222222222222222222";
const app = () => { const a = express(); a.use(express.json()); a.use("/api/servers", apiKeyManagementRouter); a.use((e, _q, r, _n) => r.status(500).json({ error: e.message })); return a; };

beforeEach(() => { vi.resetAllMocks(); });

describe("А8 — валидация на заявки към публичния API", () => {
  it("А8: limit/offset — абв, отрицателно, дробно, нула → ok:false", () => {
    for (const q of [{ limit: "abc" }, { offset: "-1" }, { limit: "0" }, { limit: "1.5" }, { offset: "x" }, { limit: "" }]) {
      expect(parsePaging(q).ok, JSON.stringify(q)).toBe(false);
    }
  });
  it("А8: валиден limit се ограничава до 100; подразбиране 20/0", () => {
    expect(parsePaging({})).toEqual({ ok: true, limit: 20, offset: 0 });
    expect(parsePaging({ limit: "500", offset: "10" })).toEqual({ ok: true, limit: 100, offset: 10 });
  });
  it("А8: непознат status → ok:false; познат/липсващ → ok", () => {
    expect(parseEnum("BOGUS", ["OPEN"]).ok).toBe(false);
    expect(parseEnum(["OPEN"], ["OPEN"]).ok).toBe(false);
    expect(parseEnum(undefined, ["OPEN"])).toEqual({ ok: true, value: null });
    expect(parseEnum("OPEN", ["OPEN"]).value).toBe("OPEN");
  });
  it("А8: невалидна дата → ok:false", () => {
    expect(parseDate("не-дата").ok).toBe(false);
    expect(parseDate("2026-13-45").ok).toBe(false);
    expect(parseDate("2026-04-01").value).toBeInstanceOf(Date);
  });
  it("А8: expiresInDays — NaN, отрицателно, нула, дробно, низ → отказ", () => {
    for (const v of [NaN, -5, 0, 1.5, "7", 99999]) expect(parseExpiresInDays(v).ok, String(v)).toBe(false);
    expect(parseExpiresInDays(30)).toEqual({ ok: true, value: 30 });
    expect(parseExpiresInDays(undefined)).toEqual({ ok: true, value: null });
  });

  const body = (o) => ({ name: "k", scopes: ["tickets:read"], ...o });
  it("А8: POST api-keys с expiresInDays:-5 → 400 (не ключ, изтекъл при създаване)", async () => {
    const res = await request(app()).post(`/api/servers/${SID}/api-keys`).send(body({ expiresInDays: -5 }));
    expect(res.status).toBe(400);
    expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
  });
  it("А8: POST api-keys с expiresInDays:\"abc\" → 400 (не 500)", async () => {
    const res = await request(app()).post(`/api/servers/${SID}/api-keys`).send(body({ expiresInDays: "abc" }));
    expect(res.status).toBe(400);
  });

  it("А8: маршрутите за tickets/applications/analytics ползват валидатора (няма Number(limit))", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "routes", "publicApi.js"), "utf8");
    expect(src).not.toMatch(/Number\(limit\)|Number\(offset\)/);
    expect((src.match(/parsePaging\(/g) || []).length).toBe(2);
    expect((src.match(/parseEnum\(/g) || []).length).toBe(2);
    expect(src).toMatch(/parseDate\(req\.query\.from/);
  });
});
