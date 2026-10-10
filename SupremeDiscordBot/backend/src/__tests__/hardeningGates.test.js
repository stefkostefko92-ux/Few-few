// backend/src/__tests__/hardeningGates.test.js
// Втвърдяването от 10.10.2026, което няма свой тест другаде: лимитите по IPv6
// /56, Sentry без query и IP, access логът без архивния токен, лимитът за
// втория фактор и health check-ът на Redis без парола в argv.
//
// Всеки тест тук пада на кода отпреди поправката (проверено) — иначе е
// украса, не гейт.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ipKey } from "../lib/ipKey.js";
import { safeLogUrl } from "../lib/safeLogUrl.js";
import { scrubEvent } from "../instrument.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(SRC, "..", "..");
// Без редовете-коментари — директива, спомената само в коментар, лъже гейта.
const code = (p) => readFileSync(p, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

function jsFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "__tests__" || n === "node_modules") return [];
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith(".js") ? [p] : [];
  });
}

describe("лимитите групират IPv6 по /56", () => {
  it("адреси от една /56 са ЕДИН ключ, съседната /56 — друг", () => {
    // Един абонат получава цяла /56 и сменя адреса в нея на воля.
    const a = ipKey("2001:db8:abcd:12ff::1");
    expect(ipKey("2001:db8:abcd:1200:ffff:ffff:ffff:ffff")).toBe(a);
    expect(ipKey("2001:0db8:abcd:1234:5678::9")).toBe(a);
    expect(ipKey("2001:db8:abcd:1300::1")).not.toBe(a);
  });

  it("IPv4 и IPv4-mapped IPv6 остават по адрес", () => {
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("203.0.113.8")).not.toBe(ipKey("203.0.113.7"));
  });

  it("ВСЕКИ лимитер в backend-а ключува през ipKey (иначе IPv6 е по /128)", () => {
    const sites = [];
    for (const f of jsFiles(SRC)) {
      const src = code(f);
      let i = src.indexOf("rateLimit({");
      while (i !== -1) {
        const block = src.slice(i, src.indexOf("\n});", i));
        sites.push({ at: relative(SRC, f), block });
        i = src.indexOf("rateLimit({", i + 1);
      }
    }
    expect(sites.length, "няма лимитери — гейтът е сляп").toBeGreaterThanOrEqual(8);
    for (const s of sites) {
      expect(s.block, `${s.at}: лимитер без keyGenerator през ipKey`).toMatch(/keyGenerator:\s*(ipKeyGenerator\b|[^\n]*\bipKey\()/);
    }
  });
});

describe("Sentry не изнася архивния токен и IP адреса", () => {
  it("query, IP и потребителски полета се махат от събитие и транзакция", () => {
    const ev = {
      request: { url: "https://x.eu/archive/ticket/1?t=SECRET_TOKEN", query_string: "t=SECRET_TOKEN", env: { REMOTE_ADDR: "203.0.113.7" } },
      transaction: "GET /archive/ticket/1?t=SECRET_TOKEN",
      contexts: { trace: { data: { "http.url": "https://x.eu/archive/ticket/1?t=SECRET_TOKEN", "url.query": "?t=SECRET_TOKEN", client_ip: "203.0.113.7" } } },
      spans: [{ data: { "url.full": "https://x.eu/archive/ticket/1?t=SECRET_TOKEN", "net.peer.ip": "203.0.113.7" }, description: "GET https://x.eu/archive/ticket/1?t=SECRET_TOKEN" }],
      breadcrumbs: [{ data: { url: "/api/tickets/archives/1?t=SECRET_TOKEN" } }],
      user: { id: "u1", ip_address: "203.0.113.7", username: "someone" },
    };
    const out = JSON.stringify(scrubEvent(ev));
    expect(out).not.toContain("SECRET_TOKEN");
    expect(out).not.toContain("203.0.113.7");
    expect(out).not.toContain("someone");
    expect(ev.user).toEqual({ id: "u1" });
  });

  it("и двата пътя към Sentry минават през филтъра (транзакциите НЕ минават през beforeSend)", () => {
    const src = code(join(SRC, "instrument.js"));
    expect(src).toMatch(/beforeSendTransaction\(event\)\s*\{\s*return scrubEvent\(event\);/);
    expect(src).toMatch(/beforeSend\(event\)\s*\{\s*scrubEvent\(event\);/);
  });
});

describe("access логът — без архивния токен", () => {
  it("архивните адреси губят query, другите остават цели", () => {
    expect(safeLogUrl("/archive/ticket/42?t=SECRET_TOKEN")).toBe("/archive/ticket/42");
    expect(safeLogUrl("/archive?t=SECRET_TOKEN")).toBe("/archive");
    expect(safeLogUrl("/api/tickets/archives/42?t=SECRET_TOKEN")).toBe("/api/tickets/archives/42");
    expect(safeLogUrl("/api/servers/1/tickets?page=2")).toBe("/api/servers/1/tickets?page=2");
    expect(safeLogUrl("/archived-news?x=1")).toBe("/archived-news?x=1");
  });

  it("продукционният формат ползва :safe-url, не :url и не „combined“", () => {
    const src = code(join(SRC, "index.js"));
    expect(src).toMatch(/morgan\.token\("safe-url",[^\n]*safeLogUrl\(/);
    const fmt = src.match(/app\.use\(morgan\(process\.env\.NODE_ENV === "production"\s*\?\s*'([^']+)'/)?.[1];
    expect(fmt, "продукционният формат не е намерен").toBeTruthy();
    expect(fmt).toContain(":safe-url");
    expect(fmt).not.toMatch(/:url\b/);
  });
});

describe("вторият фактор има свой лимит по IP", () => {
  it("опитите (не-GET) под /api/auth/mfa минават през mfaLimiter: 30 за 15 минути", () => {
    const src = code(join(SRC, "index.js"));
    const block = src.slice(src.indexOf("const mfaLimiter = rateLimit({"), src.indexOf("\n});", src.indexOf("const mfaLimiter")));
    expect(block).toMatch(/windowMs:\s*15 \* 60 \* 1000/);
    expect(block).toMatch(/max:\s*30\b/);
    expect(src).toMatch(/app\.use\("\/api\/auth\/mfa",\s*\(req, res, next\) => \(req\.method === "GET" \? next\(\) : mfaLimiter\(req, res, next\)\)\);/);
  });
});

describe("Redis: паролата не е в argv на health check-а", () => {
  it("redis-cli се автентикира през REDISCLI_AUTH, не през -a", () => {
    const compose = readFileSync(join(ROOT, "docker-compose.yml"), "utf8");
    const redis = compose.slice(compose.indexOf("\n  redis:"), compose.indexOf("\n  backend:"));
    const test = redis.split("\n").find((l) => /^\s*test:/.test(l)) || "";
    expect(test, "health check-ът на Redis не е намерен").toContain("redis-cli");
    expect(test).toContain("REDISCLI_AUTH=");
    expect(test).not.toMatch(/redis-cli[^|]*\s-a\s/);
    // И пак проверява истински отговор, не само кода за изход (NOAUTH дава 0).
    expect(test).toMatch(/grep -q PONG/);
  });
});
