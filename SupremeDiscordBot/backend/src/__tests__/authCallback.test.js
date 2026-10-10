// backend/src/__tests__/authCallback.test.js
// Обратното извикване на Discord OAuth (/api/auth/callback) — поведение, не текст.
//
// ЗАЩО (10.10.2026): Chrome показа предупреждение на Safe Browsing върху
// callback адреса, а след „Продължи“ входът падна с „Discord authentication
// failed“. Браузърът праща заявката ПРЕДИ да покаже предупреждението; сървърът
// я изпълнява (state и кодът се изразходват, старата сесия се унищожава), а при
// „Продължи“ същият адрес идва втори път. Досега всеки провал беше един и същ
// `oauth_failed` — изтекъл/повторен вход, отказ в Discord и сгрешен
// DISCORD_CLIENT_SECRET изглеждаха еднакво и за потребителя, и в дневника.
//
// Тестът пази:
//   1. пълният вход минава и СМЕНЯ идентификатора на сесията (session fixation)
//   2. повторено отваряне със СТАРАТА бисквитка → `oauth_expired`, не „провал“
//   3. повторено отваряне с НОВАТА (вписана) бисквитка → таблото, кодът НЕ се ползва
//   4. чужд state никога не стига до Discord (CSRF защитата е непокътната)
//   5. отказ в Discord → `oauth_denied`; изтекъл код → `oauth_expired`;
//      грешка в нашата настройка → `oauth_failed`
//   6. дневникът носи кода на грешката от Discord, но никога кода или токен
//   7. злонамерен вход (повторен параметър) се отхвърля без извикване към Discord
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.FRONTEND_URL = "https://app.test";
process.env.DISCORD_CLIENT_ID = "client-id-test";
process.env.DISCORD_CLIENT_SECRET = "client-secret-test";
process.env.DISCORD_REDIRECT_URI = "https://app.test/api/auth/callback";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/crypto.js", () => ({ encrypt: (v) => `enc(${v})`, decryptSafe: (v) => v }));

const axiosPost = vi.fn();
const axiosGet = vi.fn();
vi.mock("axios", () => ({ default: { post: (...a) => axiosPost(...a), get: (...a) => axiosGet(...a) } }));

const { default: authRouter } = await import("../routes/auth.js");

const AUTH_CODE = "discord-auth-code-123";
const ACCESS_TOKEN = "access-token-secret";

function makeApp() {
  const app = express();
  app.use(session({
    name: "sid",
    secret: "test-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  }));
  app.use("/api/auth", authRouter);
  return app;
}

const sidOf = (res) => (res.headers["set-cookie"] || []).map((c) => c.split(";")[0]).find((c) => c.startsWith("sid="));

async function startLogin(app) {
  const res = await request(app).get("/api/auth/login");
  expect(res.status).toBe(302);
  const state = new URL(res.headers.location).searchParams.get("state");
  return { cookie: sidOf(res), state };
}

function discordAnswers() {
  axiosPost.mockResolvedValue({ data: { access_token: ACCESS_TOKEN, refresh_token: "refresh-token-secret", expires_in: 604800 } });
  axiosGet.mockResolvedValue({ data: { id: "111", username: "tester", discriminator: "0", avatar: null, email: "t@example.com", verified: true } });
  prismaMock.user.upsert.mockResolvedValue({ id: "111", isBlacklisted: false, blacklistedUntil: null });
  prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.session.create.mockResolvedValue({});
}

const discordError = (status, error) => Object.assign(new Error(`Request failed with status code ${status}`), {
  response: { status, data: { error, error_description: "details" } },
});

let logs;
beforeEach(() => {
  vi.clearAllMocks();
  logs = [];
  const capture = (...a) => { logs.push(a.map(String).join(" ")); };
  vi.spyOn(console, "error").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/auth/callback", () => {
  it("пълният вход минава, сменя сесията и води към таблото", async () => {
    discordAnswers();
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=${AUTH_CODE}&state=${state}`).set("Cookie", cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://app.test/dashboard");
    const newCookie = sidOf(res);
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(cookie);
    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it("повторено отваряне със старата бисквитка → oauth_expired, без второ извикване към Discord", async () => {
    discordAnswers();
    const app = makeApp();
    const { cookie, state } = await startLogin(app);
    const url = `/api/auth/callback?code=${AUTH_CODE}&state=${state}`;
    await request(app).get(url).set("Cookie", cookie);

    const replay = await request(app).get(url).set("Cookie", cookie);

    expect(replay.headers.location).toBe("https://app.test/?error=oauth_expired");
    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it("повторено отваряне с новата (вписана) бисквитка → таблото, кодът не се ползва", async () => {
    discordAnswers();
    const app = makeApp();
    const { cookie, state } = await startLogin(app);
    const url = `/api/auth/callback?code=${AUTH_CODE}&state=${state}`;
    const first = await request(app).get(url).set("Cookie", cookie);

    const replay = await request(app).get(url).set("Cookie", sidOf(first));

    expect(replay.headers.location).toBe("https://app.test/dashboard");
    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it("чужд state не стига до Discord (CSRF), дори когато сесията има свой state", async () => {
    discordAnswers();
    const app = makeApp();
    const { cookie } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=${AUTH_CODE}&state=${"0".repeat(32)}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_expired");
    expect(axiosPost).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("state mismatch");
  });

  it("state без сесия (бисквитката липсва) → oauth_expired, без Discord", async () => {
    discordAnswers();
    const app = makeApp();
    const { state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=${AUTH_CODE}&state=${state}`);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_expired");
    expect(axiosPost).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("missing in session");
  });

  it("отказ в Discord (access_denied) → oauth_denied", async () => {
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?error=access_denied&state=${state}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_denied");
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("друга грешка от Discord (напр. temporarily_unavailable) не е „отказ“ → oauth_failed + дневник", async () => {
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?error=temporarily_unavailable&state=${state}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_failed");
    expect(logs.join("\n")).toContain("discord error=temporarily_unavailable");
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("стойност на error, която не е чист код, не влиза в дневника както е подадена", async () => {
    const res = await request(makeApp()).get(`/api/auth/callback?error=${encodeURIComponent("x\nFAKE log line")}`);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_failed");
    const log = logs.join("\n");
    expect(log).toContain("discord error=other");
    expect(log).not.toContain("FAKE log line");
  });

  it("без код и без грешка → no_code", async () => {
    const res = await request(makeApp()).get("/api/auth/callback");
    expect(res.headers.location).toBe("https://app.test/?error=no_code");
  });

  it("изтекъл/използван код (invalid_grant) → oauth_expired", async () => {
    discordAnswers();
    axiosPost.mockRejectedValueOnce(discordError(400, "invalid_grant"));
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=${AUTH_CODE}&state=${state}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_expired");
  });

  it("сгрешена настройка (invalid_client) → oauth_failed; дневникът назовава причината без тайни", async () => {
    discordAnswers();
    axiosPost.mockRejectedValueOnce(discordError(401, "invalid_client"));
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=${AUTH_CODE}&state=${state}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_failed");
    const log = logs.join("\n");
    expect(log).toContain("status=401 error=invalid_client");
    expect(log).not.toContain(AUTH_CODE);
    expect(log).not.toContain(ACCESS_TOKEN);
    expect(log).not.toContain(process.env.DISCORD_CLIENT_SECRET);
  });

  it("едновременно повторение (докато първата чака Discord) не праща кода втори път", async () => {
    discordAnswers();
    let release;
    axiosPost.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ data: { access_token: ACCESS_TOKEN, refresh_token: "r", expires_in: 604800 } });
    }));
    const app = makeApp();
    const { cookie, state } = await startLogin(app);
    const url = `/api/auth/callback?code=${AUTH_CODE}&state=${state}`;

    const first = request(app).get(url).set("Cookie", cookie).then((r) => r);
    await vi.waitFor(() => expect(axiosPost).toHaveBeenCalledTimes(1));
    const second = await request(app).get(url).set("Cookie", cookie);
    release();

    expect(second.headers.location).toBe("https://app.test/?error=oauth_expired");
    expect((await first).headers.location).toBe("https://app.test/dashboard");
    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it("провал след Discord (базата) → oauth_failed; дневникът назовава стъпката и вида, без данни", async () => {
    discordAnswers();
    prismaMock.user.upsert.mockRejectedValueOnce(new TypeError("boom t@example.com"));
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=${AUTH_CODE}&state=${state}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_failed");
    const log = logs.join("\n");
    expect(log).toContain("step=db");
    expect(log).toContain("type=TypeError");
    expect(log).not.toContain("t@example.com");
    expect(log).not.toContain(AUTH_CODE);
  });

  it("отказан /users/@me (401) → oauth_failed, не „изтекъл“", async () => {
    discordAnswers();
    axiosGet.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 401"), {
      response: { status: 401, data: { message: "401: Unauthorized", code: 0 } },
    }));
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=${AUTH_CODE}&state=${state}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_failed");
    expect(logs.join("\n")).toContain("step=me status=401");
  });

  it("„изтекъл“ значи САМО invalid_grant при обмяната на кода, не на по-късна стъпка", async () => {
    discordAnswers();
    axiosGet.mockRejectedValueOnce(discordError(400, "invalid_grant"));
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=${AUTH_CODE}&state=${state}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_failed");
  });

  it("повторен параметър (масив) се отхвърля без извикване към Discord", async () => {
    discordAnswers();
    const app = makeApp();
    const { cookie, state } = await startLogin(app);

    const res = await request(app).get(`/api/auth/callback?code=a&code=b&state=${state}`).set("Cookie", cookie);

    expect(res.headers.location).toBe("https://app.test/?error=oauth_failed");
    expect(axiosPost).not.toHaveBeenCalled();
  });
});
