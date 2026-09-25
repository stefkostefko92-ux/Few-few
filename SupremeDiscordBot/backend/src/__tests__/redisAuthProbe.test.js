// backend/src/__tests__/redisAuthProbe.test.js
// Проверката за Redis се АВТЕНТИКИРА, преди да пингва.
//
// ДЕФЕКТЪТ (реален деплой, 07.08.2026): `routes/status.js` пращаше гол `PING`
// по суров TCP. Откакто Redis върви с `--requirepass` (v40), сървърът отговаря
// `-NOAUTH Authentication required` и проверката обявяваше НАПЪЛНО ЗДРАВ Redis
// за паднал. Самото приложение се свързва вярно — паролата е в `REDIS_URL`.
//
// Тоест беше чиста фалшива тревога, и то от най-лошия вид: сондата,
// която току-що вързах към `/api/status/probe`, щеше да вдига аларма всяка
// минута, докато някой спре да ѝ вярва. Аларма, на която не вярваш, е по-лоша
// от липсваща.
//
// Тестът вдига ИСТИНСКИ TCP сървър, който говори RESP и иска AUTH — това е
// единственият начин да се докаже поведение по протокол, който мокът не знае.
import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import express from "express";
import request from "supertest";
import { vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: { $queryRaw: async () => [{ x: 1 }], server: { count: async () => 0 }, ticket: { findMany: async () => [] } },
}));
vi.mock("axios", () => ({ default: { get: async () => { throw new Error("бот недостъпен"); } } }));

/** Мъничък фалшив Redis: иска AUTH, преди да отговори на каквото и да е. */
function fakeRedis({ password, requireAuth = true }) {
  const srv = net.createServer((sock) => {
    let authed = !requireAuth;
    sock.on("data", (chunk) => {
      for (const line of chunk.toString().split("\r\n").filter(Boolean)) {
        const [cmd, ...args] = line.split(" ");
        if (/^AUTH$/i.test(cmd)) {
          const given = args[args.length - 1];
          if (given === password) { authed = true; sock.write("+OK\r\n"); }
          else sock.write("-ERR invalid password\r\n");
        } else if (!authed) {
          sock.write("-NOAUTH Authentication required.\r\n");
        } else if (/^PING$/i.test(cmd)) {
          sock.write("+PONG\r\n");
        }
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((res) => srv.listen(0, "127.0.0.1", () => res(srv)));
}

let server;
afterEach(() => { server?.close(); server = null; vi.resetModules(); });

async function cacheStatus(urlFor) {
  const port = server.address().port;
  process.env.REDIS_URL = urlFor(port);
  vi.resetModules();
  const { default: statusRouter } = await import("../routes/status.js");
  const app = express();
  app.use("/api/status", statusRouter);
  const res = await request(app).get("/api/status");
  return res.body?.services?.cache;
}

describe("сондата за Redis минава през AUTH", () => {
  it("Redis с парола → operational (това падаше в продукция)", async () => {
    server = await fakeRedis({ password: "тайна123" });
    const cache = await cacheStatus((p) => `redis://:тайна123@127.0.0.1:${p}`);
    expect(cache?.status, "здрав Redis с парола се обявява за паднал").toBe("operational");
  });

  it("Redis БЕЗ парола продължава да работи (не сме счупили стария случай)", async () => {
    server = await fakeRedis({ password: null, requireAuth: false });
    const cache = await cacheStatus((p) => `redis://127.0.0.1:${p}`);
    expect(cache?.status).toBe("operational");
  });

  it("ГРЕШНА парола → down, не фалшиво зелено", async () => {
    server = await fakeRedis({ password: "истинската" });
    const cache = await cacheStatus((p) => `redis://:грешната@127.0.0.1:${p}`);
    expect(cache?.status).toBe("down");
  });

  it("Redis 6 ACL с потребител също минава", async () => {
    server = await fakeRedis({ password: "тайна123" });
    const cache = await cacheStatus((p) => `redis://потребител:тайна123@127.0.0.1:${p}`);
    expect(cache?.status).toBe("operational");
  });

  it("паролата НЕ изтича в отговора — той е публичен", async () => {
    server = await fakeRedis({ password: "тайна123" });
    const port = server.address().port;
    process.env.REDIS_URL = `redis://:тайна123@127.0.0.1:${port}`;
    vi.resetModules();
    const { default: statusRouter } = await import("../routes/status.js");
    const app = express();
    app.use("/api/status", statusRouter);
    const res = await request(app).get("/api/status");
    expect(JSON.stringify(res.body)).not.toContain("тайна123");
  });
});
