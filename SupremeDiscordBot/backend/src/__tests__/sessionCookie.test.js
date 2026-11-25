// backend/src/__tests__/sessionCookie.test.js
// Сесийната бисквитка в продукция е `__Host-sid` (23.10.2026). Браузърът пази
// префикса САМО при Secure + Path=/ + без Domain — ако някое от трите се
// разминe, бисквитката тихо НЕ се записва и никой не може да влезе. Затова тук
// се гледа истинският Set-Cookie от express-session, не само константите.
import { describe, it, expect } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sessionCookieName, sessionCookieOptions, clearLegacySessionCookie, LEGACY_SESSION_COOKIE } from "../lib/sessionCookie.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (p) => readFileSync(join(SRC, p), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

function appFor(env) {
  const app = express();
  app.set("trust proxy", "loopback");
  app.use(clearLegacySessionCookie(env));
  app.use(session({
    name: sessionCookieName(env),
    secret: "test-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { ...sessionCookieOptions(env), maxAge: 60_000 },
  }));
  app.get("/login", (req, res) => { req.session.userId = "u1"; res.json({ ok: true }); });
  app.get("/ping", (req, res) => res.json({ ok: true }));
  return app;
}

describe("__Host- префиксът в продукция", () => {
  it("Set-Cookie е `__Host-sid` със Secure, Path=/ и БЕЗ Domain", async () => {
    const res = await request(appFor("production")).get("/login").set("X-Forwarded-Proto", "https");
    const cookie = (res.headers["set-cookie"] || []).find((c) => c.startsWith("__Host-sid="));
    expect(cookie, "сесийната бисквитка не е записана").toBeTruthy();
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*Path=\/(;|$)/);
    expect(cookie).not.toMatch(/;\s*Domain=/i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
  });

  it("в разработка (HTTP) остава `sid` без Secure — иначе браузърът я отхвърля", async () => {
    expect(sessionCookieName("development")).toBe("sid");
    const res = await request(appFor("development")).get("/login");
    const cookie = (res.headers["set-cookie"] || []).find((c) => c.startsWith("sid="));
    expect(cookie).toBeTruthy();
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });
});

describe("старата `sid` се трие веднъж", () => {
  it("в продукция заявка с `sid=` получава изтриването ѝ", async () => {
    const res = await request(appFor("production")).get("/ping").set("Cookie", "sid=s%3Aold.sig");
    const cleared = (res.headers["set-cookie"] || []).find((c) => c.startsWith(`${LEGACY_SESSION_COOKIE}=;`));
    expect(cleared, "старата бисквитка не се трие").toBeTruthy();
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("новата `__Host-sid` НЕ се бърка за старата", async () => {
    const res = await request(appFor("production")).get("/ping").set("Cookie", "__Host-sid=s%3Anew.sig");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("в разработка не се трие нищо (там `sid` е живата бисквитка)", async () => {
    const res = await request(appFor("development")).get("/ping").set("Cookie", "sid=s%3Alive.sig");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("едно място за името", () => {
  it("index.js и изходът ползват модула, без зашито „sid“", () => {
    const idx = code("index.js");
    expect(idx).toMatch(/name:\s*sessionCookieName\(\)/);
    expect(idx).toMatch(/app\.use\(clearLegacySessionCookie\(\)\)/);
    expect(idx).not.toMatch(/name:\s*"sid"/);
    const auth = code("routes/auth.js");
    expect(auth).toMatch(/res\.clearCookie\(sessionCookieName\(\),\s*sessionCookieOptions\(\)\)/);
    expect(auth).not.toMatch(/clearCookie\("sid"/);
  });
});
