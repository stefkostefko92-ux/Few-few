"use strict";
// Тестовете вървят срещу истински PostgreSQL: TEST_DATABASE_URL към база, чието име завършва на _test.
// Всеки тестов файл започва от празна схема (DROP SCHEMA + prisma db push) и чисти данни.
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
const pino = require("pino");
const { createApp } = require("../src/app");
const { seed } = require("../src/seed");
const { hashPin } = require("../src/security");
const { createLoginLimiter } = require("../src/limiter");

const SECRET = "sklad-test-secret-0123456789abcdef0123456789";
const BACKEND = path.join(__dirname, "..");

function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL липсва (postgresql://…/sklad_test)");
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/_test$/.test(name)) throw new Error(`отказ: тестовата база трябва да завършва на _test (а е „${name}“)`);
  return url;
}

async function freshDatabase() {
  const url = testDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: BACKEND,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  await seed(prisma, {});
  return prisma;
}

async function startServer(prisma, { limiter = createLoginLimiter() } = {}) {
  const config = { env: "test", port: 0, jwtSecret: SECRET, trustProxy: 0, secureCookies: false, logLevel: "silent" };
  const app = createApp({ prisma, config, log: pino({ level: "silent" }), limiter });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, config, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Клиент с една бисквитка (сесията), както браузърът. */
function client(base) {
  let cookie = "";
  async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.getSetCookie();
    for (const c of setCookie) {
      const pair = c.split(";")[0];
      if (pair.startsWith("sklad_session=")) cookie = pair === "sklad_session=" ? "" : pair;
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data, headers: res.headers, setCookie };
  }
  return {
    call,
    login: (email, pin) => call("POST", "/api/auth/login", { email, pin }),
    get cookie() {
      return cookie;
    },
    set cookie(v) {
      cookie = v;
    },
  };
}

async function makeUser(prisma, { nome = "Тест", email, ruolo = "VIEWER", pin = "246810" }) {
  return prisma.user.create({ data: { nome, email, ruolo, pin: await hashPin(pin) } });
}

module.exports = { SECRET, freshDatabase, startServer, client, makeUser };
