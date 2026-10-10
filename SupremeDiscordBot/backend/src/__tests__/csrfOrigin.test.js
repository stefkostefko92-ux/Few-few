// backend/src/__tests__/csrfOrigin.test.js
// CSRF от съседен поддомейн (Кодаджията, 10.10.2026): SameSite=Lax не пази
// между *.carbonstealth.eu — там са всички продукти на собственика. Сега всяка
// промяна под /api с браузърен Origin трябва да е от нашия сайт; webhook-ите,
// ботът и публичното API (без бисквитка) са изключени изрично.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { csrfOriginGuard, allowedOrigins } from "../middleware/csrfOrigin.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (p) => readFileSync(join(SRC, p), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const OURS = "https://supremebot.carbonstealth.eu";
let saved;
beforeEach(() => { saved = { ...process.env }; process.env.FRONTEND_URL = `${OURS}/`; process.env.NODE_ENV = "production"; });
afterEach(() => { process.env = saved; });

const app = express();
app.use(express.json());
app.use("/api", csrfOriginGuard);
app.all("/api/*", (_req, res) => res.json({ ok: true }));

describe("csrfOriginGuard", () => {
  it("нашият Origin минава (дори FRONTEND_URL да е с наклонена черта)", async () => {
    expect((await request(app).post("/api/gdpr/delete-account").set("Origin", OURS)).status).toBe(200);
  });
  it("съседен поддомейн, чужд сайт и http вариант на нашия → 403", async () => {
    for (const o of ["https://evil.carbonstealth.eu", "https://zabobovdol.carbonstealth.eu", "https://attacker.example", "http://supremebot.carbonstealth.eu", "null"]) {
      const r = await request(app).post("/api/gdpr/delete-account").set("Origin", o);
      expect(r.status, o).toBe(403);
      expect(r.body.code).toBe("CSRF_ORIGIN");
    }
  });
  it("всички методи с промяна са покрити; GET/HEAD/OPTIONS не", async () => {
    for (const m of ["put", "patch", "delete"]) expect((await request(app)[m]("/api/servers/1").set("Origin", "https://evil.carbonstealth.eu")).status).toBe(403);
    expect((await request(app).get("/api/servers/1").set("Origin", "https://evil.carbonstealth.eu")).status).toBe(200);
  });
  it("без Origin, но Sec-Fetch-Site не е same-origin → 403; без двете (curl/сървър) → минава", async () => {
    expect((await request(app).post("/api/servers/1").set("Sec-Fetch-Site", "same-site")).status).toBe(403);
    expect((await request(app).post("/api/servers/1").set("Sec-Fetch-Site", "cross-site")).status).toBe(403);
    expect((await request(app).post("/api/servers/1").set("Sec-Fetch-Site", "same-origin")).status).toBe(200);
    expect((await request(app).post("/api/servers/1")).status).toBe(200);
  });
  it("webhook-ите, ботът и публичното API са изключени (подпис/тайна/ключ, без бисквитка)", async () => {
    for (const p of ["/api/stripe/webhook", "/api/bot/game/battle", "/api/discord/webhook", "/api/topgg/vote", "/api/v1/tickets"]) {
      expect((await request(app).post(p).set("Origin", "https://stripe.com")).status, p).toBe(200);
    }
    // изключението е по пълния префикс — „/api/botnet“ не е „/api/bot/“
    expect((await request(app).post("/api/botnet").set("Origin", "https://evil.example")).status).toBe(403);
  });
  it("в разработка — и localhost вариантите", () => {
    process.env.NODE_ENV = "development";
    expect(allowedOrigins().has("http://localhost:5173")).toBe(true);
    process.env.NODE_ENV = "production";
    expect(allowedOrigins().has("http://localhost:5173")).toBe(false);
  });
});

describe("index.js — подредбата", () => {
  const idx = code("index.js");
  it("гардът е монтиран под /api ПРЕДИ рутерите", () => {
    expect(idx).toMatch(/app\.use\("\/api", csrfOriginGuard\)/);
    const guard = idx.indexOf('app.use("/api", csrfOriginGuard)');
    for (const r of ['app.use("/api/auth", authRouter)', 'app.use("/api/servers"', 'app.use("/api/gdpr"', 'app.use("/api", webhooksRouter)']) {
      expect(idx.indexOf(r), r).toBeGreaterThan(guard);
    }
  });
  it("няма парсер за HTML форми (класическата CSRF форма)", () => {
    expect(idx).not.toMatch(/express\.urlencoded\(/);
  });
  it("лимитът за вход е само на login/callback, не на целия /api/auth (иначе /me заключва входа)", () => {
    expect(idx).not.toMatch(/app\.use\("\/api\/auth", authLimiter\)/);
    expect(idx).toMatch(/app\.use\(\["\/api\/auth\/login", "\/api\/auth\/callback"\], authLimiter\)/);
  });
});
