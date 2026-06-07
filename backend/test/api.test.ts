import { describe, expect, it } from "vitest";
import request from "supertest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { AuthService } from "../src/auth/authService.js";
import { TokenService } from "../src/auth/tokens.js";
import { MemoryAuthRepository } from "../src/data/authRepository.js";
import { MemoryLedger } from "../src/data/ledger.js";
import { MemoryPlayerRepository } from "../src/data/memoryRepository.js";
import { createApp } from "../src/http/app.js";
import { GameService } from "../src/services/gameService.js";

const TEST_SECRET = "test-secret-0123456789abcdef";

function makeApp() {
  const game = new GameService({
    repo: new MemoryPlayerRepository(),
    ledger: new MemoryLedger(),
    config: defaultLiveOps,
  });
  const tokens = new TokenService(TEST_SECRET);
  const auth = new AuthService({
    authRepo: new MemoryAuthRepository(),
    tokens,
    createPlayer: (name) => game.createPlayer(name),
  });
  return createApp({ game, auth, tokens });
}

let deviceCounter = 0;
function newDeviceId() {
  return `device-${++deviceCounter}-${"x".repeat(8)}`;
}

async function registerPlayer(app: ReturnType<typeof makeApp>, name = "Hana") {
  const res = await request(app).post("/auth/register").send({ name, deviceId: newDeviceId() });
  return res;
}

describe("HTTP API", () => {
  it("GET /health returns ok", async () => {
    const res = await request(makeApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("publishes gacha drop rates (regulatory transparency §12.2)", async () => {
    const res = await request(makeApp()).get("/gacha/rates");
    expect(res.status).toBe(200);
    const { rates, pity } = res.body;
    const sum = rates.common + rates.rare + rates.epic + rates.mythic;
    expect(sum).toBeCloseTo(1, 6);
    expect(pity.mythic).toBe(defaultLiveOps.gacha.mythicPity);
  });

  it("registers a player and reads /me with the access token", async () => {
    const app = makeApp();
    const created = await registerPlayer(app);
    expect(created.status).toBe(201);
    expect(created.body.player.spins).toBe(defaultLiveOps.spins.startingBonus);
    expect(created.body.accessToken).toBeTruthy();
    expect(created.body.deviceSecret).toBeTruthy();

    const me = await request(app).get("/me").set("authorization", `Bearer ${created.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.player.id).toBe(created.body.player.id);
  });

  it("spin decrements spins and never leaks predetermined raid data", async () => {
    const app = makeApp();
    const created = await registerPlayer(app);
    const token = created.body.accessToken;
    const before = created.body.player.spins;

    const res = await request(app).post("/spin").set("authorization", `Bearer ${token}`).send({ betMultiplier: 1 });
    expect(res.status).toBe(200);
    expect(res.body.player.spins).toBe(before - 1);
    expect(res.body.outcome.reels).toHaveLength(3);
    if (res.body.player.pendingRaid) {
      expect(typeof res.body.player.pendingRaid.spots).toBe("number");
    }
  });

  it("rejects unauthenticated access with 401", async () => {
    const res = await request(makeApp()).get("/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a garbage token with 401", async () => {
    const res = await request(makeApp()).get("/me").set("authorization", "Bearer not.a.jwt");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid bet with a validation error", async () => {
    const app = makeApp();
    const created = await registerPlayer(app);
    const res = await request(app)
      .post("/spin")
      .set("authorization", `Bearer ${created.body.accessToken}`)
      .send({ betMultiplier: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(makeApp()).get("/nope");
    expect(res.status).toBe(404);
  });
});

describe("auth flow", () => {
  it("logs in again with the device secret", async () => {
    const app = makeApp();
    const deviceId = newDeviceId();
    const reg = await request(app).post("/auth/register").send({ name: "Hana", deviceId });
    const login = await request(app)
      .post("/auth/login")
      .send({ deviceId, deviceSecret: reg.body.deviceSecret });
    expect(login.status).toBe(200);
    expect(login.body.playerId).toBe(reg.body.player.id);
    expect(login.body.accessToken).toBeTruthy();
  });

  it("rejects login with a wrong secret", async () => {
    const app = makeApp();
    const deviceId = newDeviceId();
    await request(app).post("/auth/register").send({ name: "Hana", deviceId });
    const login = await request(app).post("/auth/login").send({ deviceId, deviceSecret: "wrong" });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe("BAD_CREDENTIALS");
  });

  it("rejects a second registration on the same device", async () => {
    const app = makeApp();
    const deviceId = newDeviceId();
    await request(app).post("/auth/register").send({ name: "Hana", deviceId });
    const dup = await request(app).post("/auth/register").send({ name: "Other", deviceId });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DEVICE_TAKEN");
  });

  it("refreshes an access token, and logout revokes the refresh token", async () => {
    const app = makeApp();
    const reg = await registerPlayer(app);
    const refreshToken = reg.body.refreshToken;
    const access = reg.body.accessToken;

    const refreshed = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    const out = await request(app).post("/auth/logout").set("authorization", `Bearer ${access}`);
    expect(out.status).toBe(200);

    // The old refresh token is now revoked (tokenVersion bumped).
    const afterLogout = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it("authenticates via httpOnly cookie as well as Bearer", async () => {
    const app = makeApp();
    const agent = request.agent(app);
    await agent.post("/auth/register").send({ name: "Hana", deviceId: newDeviceId() });
    // The agent stores the Set-Cookie; /me should work with no Authorization header.
    const me = await agent.get("/me");
    expect(me.status).toBe(200);
    expect(me.body.player).toBeTruthy();
  });
});
