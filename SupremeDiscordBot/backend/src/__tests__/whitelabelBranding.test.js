// backend/src/__tests__/whitelabelBranding.test.js
// GET /api/bot/server/:id/branding — името и аватарът, готови за Discord.
//
// ЗАЩО СЪЩЕСТВУВА (докладвано от собственика, 07.08.2026): `customBotName` и
// `customBotAvatar` се записваха и се четяха САМО за брандиране на HTML
// транскрипта. Никъде не стигаха до Discord — в целия бот единственото
// `client.user.*` извикване беше `setActivity`. Клиент плаща White-label,
// попълва име и снимка, интерфейсът казва „запазено“, а ботът си остава със
// старото ЗАВИНАГИ. Главното обещание на тарифата не работеше.
//
// Този endpoint е новото звено. Той сваля ПОТРЕБИТЕЛСКИ URL от НАШАТА машина —
// класическа SSRF повърхност, затова гардовете тук са предмет на теста, не
// подробност.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "test-bot-secret";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

let tier = { hasWhiteLabel: true, plan: "whitelabel", isPremium: true };
vi.mock("../lib/premium.js", async (orig) => {
  const actual = await orig();
  return { ...actual, getServerTier: vi.fn(async () => tier) };
});

// SSRF гардът и HTTP клиентът — мокнати, за да съдим ПОВЕДЕНИЕТО им.
const validateWebhookUrl = vi.fn(async () => null);
vi.mock("../services/webhooks.js", () => ({
  ssrfSafeAgent: {},
  validateWebhookUrl: (...a) => validateWebhookUrl(...a),
  fireWebhooks: vi.fn(),
  VALID_EVENTS: [],
}));

const axiosGet = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a) => axiosGet(...a) } }));

const { default: botRouter } = await import("../routes/bot.js");

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botRouter);
  return a;
}
const get = () =>
  request(app()).get("/api/bot/server/s1/branding").set("x-bot-secret", "test-bot-secret");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

beforeEach(() => {
  vi.clearAllMocks();
  tier = { hasWhiteLabel: true, plan: "whitelabel", isPremium: true };
  validateWebhookUrl.mockResolvedValue(null);
  prismaMock.server.findUnique.mockResolvedValue({
    customBotName: "MySupport", customBotAvatar: "https://cdn.example.com/a.png",
  });
  axiosGet.mockResolvedValue({ data: PNG, headers: { "content-type": "image/png" } });
});

describe("брандирането стига до бота", () => {
  it("връща името и аватара като data URI (Discord иска ДАННИ, не адрес)", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("MySupport");
    expect(res.body.avatarDataUri).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
  });

  it("паднал tier → нула брандиране (същият гейт като /token)", async () => {
    tier = { hasWhiteLabel: false, plan: "premium", isPremium: true };
    const res = await get();
    expect(res.body).toEqual({ name: null, avatarDataUri: null });
    expect(axiosGet).not.toHaveBeenCalled();
  });
});

describe("свалянето на аватара е SSRF-безопасно", () => {
  it("адресът минава през validateWebhookUrl ПРЕДИ заявката", async () => {
    await get();
    expect(validateWebhookUrl).toHaveBeenCalledWith("https://cdn.example.com/a.png");
  });

  it("блокиран адрес (вътрешен/непозволен) не се сваля", async () => {
    validateWebhookUrl.mockResolvedValue("Webhook URLs must use https://");
    const res = await get();
    expect(axiosGet).not.toHaveBeenCalled();
    expect(res.body.avatarDataUri).toBeNull();
    // Името ОСТАВА — счупен аватар не бива да спира смяната на името.
    expect(res.body.name).toBe("MySupport");
  });

  it("заявката носи anti-rebinding агент, нула редиректи и таван на размера", async () => {
    await get();
    const opts = axiosGet.mock.calls[0][1];
    expect(opts.httpsAgent).toBeDefined();      // проверява реално свързвания IP
    expect(opts.maxRedirects).toBe(0);          // редирект може да отскочи навътре
    expect(opts.maxContentLength).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(opts.timeout).toBeGreaterThan(0);
  });

  it("не-изображение се отхвърля (HTML/JSON не става аватар)", async () => {
    axiosGet.mockResolvedValue({ data: Buffer.from("<html>"), headers: { "content-type": "text/html" } });
    const res = await get();
    expect(res.body.avatarDataUri).toBeNull();
    expect(res.body.name).toBe("MySupport");
  });

  it("провалено сваляне не поваля маршрута", async () => {
    axiosGet.mockRejectedValue(new Error("ETIMEDOUT"));
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.avatarDataUri).toBeNull();
  });
});
