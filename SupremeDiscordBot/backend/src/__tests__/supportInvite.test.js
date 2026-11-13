// backend/src/__tests__/supportInvite.test.js
// Поканата към сървъра за поддръжка се сменя от главния акаунт — без нов билд.
//
// ЗАЩО (13.11.2026): адресът беше зашит при билда на фронтенда (VITE_SUPPORT_URL) и
// резервната му стойност сочеше покана, която Discord връща като несъществуваща.
// Ботът пък пращаше хората към `/support` — адрес, който връщаше 404. Сега `/support`
// е пренасочване към поканата от базата, а поканата я задава само MAIN_OWNER със
// свеж втори фактор.
//
// Какво пази този файл:
//   1. Нищо освен покана в Discord не може да стане цел на пренасочването (иначе
//      `/support` е отворено пренасочване към произволен сайт).
//   2. Записва се само покана, която Discord потвърждава като съществуваща и БЕЗСРОЧНА.
//   3. Само главният собственик, със свеж втори фактор; всяка смяна е в одита.
//   4. `/support` никога не връща грешка и никога не води извън Discord или нашия сайт.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "bot-secret-test";
const prismaMock = createPrismaMock();
prismaMock.platformSetting = { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() };
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/redisClient.js", () => ({ getRedis: () => null }));

let USER, SESSION;
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = SESSION; next(); },
  loadUser: (req, _res, next) => { req.user = USER; next(); },
  requireSuperUser: (req, res, next) => (["MAIN_OWNER", "SUPER_USER"].includes(req.user?.globalRole) ? next() : res.status(403).json({ error: "no" })),
  requireMainOwner: (req, res, next) => (req.user?.globalRole === "MAIN_OWNER" ? next() : res.status(403).json({ error: "Main Owner access required" })),
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));
const axiosMock = vi.fn();
axiosMock.get = vi.fn();
vi.mock("axios", () => ({ default: Object.assign((cfg) => axiosMock(cfg), { get: (...a) => axiosMock.get(...a) }), __esModule: true }));

const { parseInviteUrl, SUPPORT_FALLBACK_PATH } = await import("../lib/supportInvite.js");
const { _resetPlatformSettingsCache, getPlatformSetting, setPlatformSetting } = await import("../lib/platformSettings.js");
const adminRouter = (await import("../routes/adminOps.js")).default;
const supportRouter = (await import("../routes/support.js")).default;

const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);
app.use("/support", supportRouter);

const fresh = () => ({ mfaVerifiedAt: Date.now() - 1000, mfaLastActivity: Date.now() });
const stale = () => ({ mfaVerifiedAt: Date.now() - 20 * 60 * 1000, mfaLastActivity: Date.now() });
const discordSays = (status, data) => axiosMock.get.mockResolvedValue({ status, data });
const PERMANENT = { code: "supreme", type: 0, expires_at: null, guild: { id: "111111111111111111", name: "Supreme Bot Support" }, approximate_member_count: 42 };
const stored = (value) => prismaMock.platformSetting.findUnique.mockResolvedValue(value === null ? null : { key: "support.inviteUrl", value });

beforeEach(() => {
  vi.resetAllMocks();
  _resetPlatformSettingsCache();
  USER = { id: "100000000000000001", username: "stefan", globalRole: "MAIN_OWNER", mfaEnabledAt: new Date() };
  SESSION = fresh();
  prismaMock.user.findUnique.mockResolvedValue({ id: USER.id }); // одитът проверява, че актьорът е наш потребител
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.platformSetting.upsert.mockResolvedValue({});
  prismaMock.platformSetting.deleteMany.mockResolvedValue({ count: 1 });
  stored(null);
});

describe("само покана в Discord може да бъде цел", () => {
  it("приема двете форми на покана и ги свежда до една", () => {
    expect(parseInviteUrl("https://discord.gg/supreme")).toEqual({ ok: true, code: "supreme", url: "https://discord.gg/supreme" });
    expect(parseInviteUrl("https://discord.com/invite/Ab-12_x")).toEqual({ ok: true, code: "Ab-12_x", url: "https://discord.gg/Ab-12_x" });
    expect(parseInviteUrl("  https://discord.gg/supreme/  ").url).toBe("https://discord.gg/supreme");
    expect(parseInviteUrl("discord.gg/supreme").url, "без https:// — удобство при поставяне").toBe("https://discord.gg/supreme");
  });

  it("отказва всичко друго — чужд домейн, подвеждащ домейн, друг протокол, път, параметри", () => {
    const bad = [
      "", "   ", null, undefined, 42, {},
      "https://evil.example/supreme",
      "https://discord.gg.evil.example/supreme",
      "https://evil.example/discord.gg/supreme",
      "https://discord.gg@evil.example/supreme",
      "https://evil.example#https://discord.gg/supreme",
      "http://discord.gg/supreme",
      "javascript:alert(1)//discord.gg/supreme",
      "//discord.gg/supreme",
      "https://discord.gg/",
      "https://discord.gg/a/b",
      "https://discord.gg/../x",
      "https://discord.gg/supreme?next=https://evil.example",
      "https://discord.gg/supreme#x",
      "https://discord.gg/sup reme",
      "https://discord.gg/supreme\nLocation: https://evil.example",
      "https://discord.com/supreme",
      "https://discord.com/invite/",
      "https://discordapp.com/invite/supreme",
      `https://discord.gg/${"a".repeat(65)}`,
    ];
    for (const v of bad) expect(parseInviteUrl(v).ok, JSON.stringify(v)).toBe(false);
  });
});

describe("PUT /api/admin/support-invite — само главният собственик, със свеж втори фактор", () => {
  const put = (body) => request(app).put("/api/admin/support-invite").send(body);

  it("друг от екипа (SUPER_USER) → 403, нищо не се записва", async () => {
    USER.globalRole = "SUPER_USER";
    discordSays(200, PERMANENT);
    const r = await put({ url: "https://discord.gg/supreme" });
    expect(r.status).toBe(403);
    expect(prismaMock.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("вторият фактор е потвърден преди повече от 10 минути → иска се наново", async () => {
    SESSION = stale();
    discordSays(200, PERMANENT);
    const r = await put({ url: "https://discord.gg/supreme" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("MFA_STEP_UP");
    expect(prismaMock.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("не е покана в Discord → 400, без заявка към Discord и без запис", async () => {
    const r = await put({ url: "https://evil.example/supreme" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_INVITE_URL");
    expect(axiosMock.get).not.toHaveBeenCalled();
    expect(prismaMock.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("Discord не познава поканата → 400 INVITE_NOT_FOUND, без запис", async () => {
    discordSays(404, { message: "Unknown Invite", code: 10006 });
    const r = await put({ url: "https://discord.gg/wpCRpy8B" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVITE_NOT_FOUND");
    expect(prismaMock.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("покана със срок → 400 INVITE_TEMPORARY (точно такава умря предишния път)", async () => {
    discordSays(200, { ...PERMANENT, expires_at: "2026-11-20T00:00:00+00:00" });
    const r = await put({ url: "https://discord.gg/supreme" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVITE_TEMPORARY");
    expect(prismaMock.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("покана, която не е към сървър (групов чат) → 400", async () => {
    discordSays(200, { code: "supreme", type: 1, expires_at: null });
    const r = await put({ url: "https://discord.gg/supreme" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVITE_NOT_A_SERVER");
  });

  it("Discord не отговаря → 503, без запис (непроверена покана не се пуска на живо)", async () => {
    axiosMock.get.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ECONNABORTED" }));
    const r = await put({ url: "https://discord.gg/supreme" });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("INVITE_CHECK_UNAVAILABLE");
    expect(prismaMock.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it("безсрочна покана към сървър → записва се сведена до една форма, с одит стара → нова", async () => {
    stored("https://discord.gg/old");
    discordSays(200, PERMANENT);
    const r = await put({ url: "https://discord.com/invite/supreme" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ url: "https://discord.gg/supreme", server: { name: "Supreme Bot Support", members: 42 } });
    expect(prismaMock.platformSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: "support.inviteUrl" },
      create: expect.objectContaining({ key: "support.inviteUrl", value: "https://discord.gg/supreme" }),
      update: expect.objectContaining({ value: "https://discord.gg/supreme" }),
    }));
    // Заявката към Discord е към точния код, на точния хост — нищо от входа не стига до адреса сурово.
    expect(axiosMock.get.mock.calls[0][0]).toBe("https://discord.com/api/v10/invites/supreme?with_counts=true&with_expiration=true");
    const audit = prismaMock.auditLog.create.mock.calls.map(([q]) => q.data).find((d) => d.action === "SUPPORT_INVITE_CHANGED");
    expect(audit).toBeTruthy();
    expect(audit.actorId).toBe(USER.id);
    expect(audit.metadata).toMatchObject({ from: "https://discord.gg/old", to: "https://discord.gg/supreme", guildId: "111111111111111111" });
  });

  it("празно → поканата се маха (и това е в одита); `/support` води към ръководствата", async () => {
    stored("https://discord.gg/old");
    const r = await put({ url: "" });
    expect(r.status).toBe(200);
    expect(r.body.url).toBeNull();
    expect(prismaMock.platformSetting.deleteMany).toHaveBeenCalledWith({ where: { key: "support.inviteUrl" } });
    expect(axiosMock.get).not.toHaveBeenCalled();
    const audit = prismaMock.auditLog.create.mock.calls.map(([q]) => q.data).find((d) => d.action === "SUPPORT_INVITE_CHANGED");
    expect(audit.metadata).toMatchObject({ from: "https://discord.gg/old", to: null });
  });
});

describe("GET /api/admin/support-invite — какво е зададено сега", () => {
  it("връща поканата и публичния адрес; видимо за екипа, без нужда от свеж фактор", async () => {
    USER.globalRole = "SUPER_USER";
    SESSION = stale();
    stored("https://discord.gg/supreme");
    const r = await request(app).get("/api/admin/support-invite");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ url: "https://discord.gg/supreme", publicPath: "/support" });
  });
});

describe("GET /support — публичното пренасочване", () => {
  it("зададена покана → 302 към нея, без кеширане (смяната важи веднага)", async () => {
    stored("https://discord.gg/supreme");
    const r = await request(app).get("/support");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("https://discord.gg/supreme");
    expect(r.headers["cache-control"]).toContain("no-store");
  });

  it("няма зададена покана → 302 към ръководствата на нашия сайт, не 404", async () => {
    const r = await request(app).get("/support");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(SUPPORT_FALLBACK_PATH);
    expect(SUPPORT_FALLBACK_PATH.startsWith("/")).toBe(true);
  });

  it("стойност в базата, която не е покана (подправен ред) → НЕ се следва", async () => {
    for (const evil of ["https://evil.example/phish", "javascript:alert(1)", "https://discord.gg.evil.example/x", "//evil.example"]) {
      _resetPlatformSettingsCache();
      stored(evil);
      const r = await request(app).get("/support");
      expect(r.status, evil).toBe(302);
      expect(r.headers.location, evil).toBe(SUPPORT_FALLBACK_PATH);
    }
  });

  it("базата е недостъпна → пак 302 към ръководствата, никога 500", async () => {
    prismaMock.platformSetting.findUnique.mockRejectedValue(new Error("db down"));
    const r = await request(app).get("/support");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(SUPPORT_FALLBACK_PATH);
  });

  it("параметрите от адреса не влизат в целта (без отворено пренасочване през ?next=)", async () => {
    stored("https://discord.gg/supreme");
    const r = await request(app).get("/support?next=https://evil.example&url=//evil.example");
    expect(r.headers.location).toBe("https://discord.gg/supreme");
  });

  it("смяната важи веднага — следващото пренасочване е към новата покана", async () => {
    stored("https://discord.gg/old");
    expect((await request(app).get("/support")).headers.location).toBe("https://discord.gg/old");
    discordSays(200, PERMANENT);
    await request(app).put("/api/admin/support-invite").send({ url: "https://discord.gg/supreme" });
    stored("https://discord.gg/supreme");
    expect((await request(app).get("/support")).headers.location).toBe("https://discord.gg/supreme");
  });
});

describe("кешът не връща стара стойност след запис", () => {
  // Ревю (Кодаджията, 13.11.2026): четене от базата, започнало ПРЕДИ записа и
  // завършило СЛЕД него, слагаше старата стойност върху новата в кеша — главният
  // акаунт вижда „Saved“, а /support води към предишната покана още 30 секунди.
  it("бавно четене, изпреварено от запис, не презаписва новата стойност", async () => {
    let finishRead;
    prismaMock.platformSetting.findUnique.mockReturnValueOnce(new Promise((resolve) => { finishRead = resolve; }));
    const slowRead = getPlatformSetting("support.inviteUrl"); // тръгва към базата, вижда старото
    await setPlatformSetting("support.inviteUrl", "https://discord.gg/new"); // записът приключва първи
    finishRead({ key: "support.inviteUrl", value: "https://discord.gg/old" });
    // Изпревареното четене връща по-новото, което вече знаем — не това, което е видяло.
    expect(await slowRead).toBe("https://discord.gg/new");
    expect(await getPlatformSetting("support.inviteUrl")).toBe("https://discord.gg/new");
    expect((await request(app).get("/support")).headers.location).toBe("https://discord.gg/new");
  });

  it("бавно четене, което ПАДА след запис, също не връща старото", async () => {
    let failRead;
    prismaMock.platformSetting.findUnique.mockReturnValueOnce(new Promise((_r, reject) => { failRead = reject; }));
    const slowRead = getPlatformSetting("support.inviteUrl");
    await setPlatformSetting("support.inviteUrl", "https://discord.gg/new");
    failRead(new Error("db down"));
    expect(await slowRead).toBe("https://discord.gg/new");
    expect(await getPlatformSetting("support.inviteUrl")).toBe("https://discord.gg/new");
  });
});
