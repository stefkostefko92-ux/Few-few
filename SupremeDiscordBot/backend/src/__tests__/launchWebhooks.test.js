// backend/src/__tests__/launchWebhooks.test.js
// Готовност за пускане, поток И — изходящи webhooks (А2). Номерът на критерия
// е в името на всеки тест.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const axiosPost = vi.fn();
vi.mock("axios", () => ({ default: { post: (...a) => axiosPost(...a) } }));
// Публичен адрес — SSRF проверката не е предмет тук (виж ssrfIpForms.test.js).
const dnsLookup = vi.fn();
vi.mock("dns/promises", () => ({ lookup: (...a) => dnsLookup(...a) }));

vi.mock("../lib/premium.js", async (orig) => {
  const real = await orig();
  return {
    ...real,
    getServerTier: vi.fn().mockResolvedValue({ plan: "premium", isPremium: true, limits: real.PREMIUM_LIMITS }),
    planHasFeature: vi.fn().mockReturnValue(true),
    requirePremium: () => (_req, _res, next) => next(),
  };
});
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const svc = await import("../services/webhooks.js");
const webhooksRouter = (await import("../routes/webhooks.js")).default;

const SID = "222222222222222222";
const hook = (o = {}) => ({ id: "wh1", serverId: SID, url: "https://example.com/hook", secret: "s3cret-value", enabled: true, events: ["GIVEAWAY_ENDED"], ...o });
const noSleep = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.resetAllMocks();
  noSleep.mockResolvedValue(undefined);
  dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  prismaMock.webhook.update.mockResolvedValue({});
  prismaMock.webhook.findUnique.mockResolvedValue({ failCount: 0 });
});

describe("А2 — всяко събитие от VALID_EVENTS има изпращач", () => {
  /** Всички .js файлове в backend/src без тестове. */
  function sources(dir = SRC, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "__tests__") sources(p, out); }
      else if (name.endsWith(".js")) out.push(p);
    }
    return out;
  }
  const callers = sources()
    .filter((f) => !/services[\\/]webhooks\.js$/.test(f) && !/routes[\\/]webhooks\.js$/.test(f))
    .map((f) => ({ f, text: readFileSync(f, "utf8") }))
    .filter(({ text }) => /fireWebhooks\(/.test(text));

  // ЧЕРВЕН, докато другите потоци (тикети, верификация) и оркестраторът
  // (планировчик) не добавят своите извиквания — не се заглушава.
  for (const ev of svc.VALID_EVENTS) {
    it(`А2: ${ev} се изпраща от поне едно място в backend/src`, () => {
      const hits = callers.filter(({ text }) => text.includes(`"${ev}"`)).map(({ f }) => f);
      expect(hits, `няма fireWebhooks за ${ev}`).not.toEqual([]);
    });
  }

  it("А2: анкетата и раздаването се изпращат и от планировчика (всички пътища)", () => {
    const sch = readFileSync(join(SRC, "services", "scheduler.js"), "utf8");
    expect(sch).toMatch(/firePollClosed\(/);
    expect(sch).toMatch(/fireGiveawayEnded\(/);
  });

  it("А2: таблото изпраща POLL_CLOSED и GIVEAWAY_ENDED през общия помощник", () => {
    const auto = readFileSync(join(SRC, "routes", "automation.js"), "utf8");
    expect(auto).toMatch(/firePollClosed\(/);
    expect(auto).toMatch(/fireGiveawayEnded\(/);
    const bot18 = readFileSync(join(SRC, "routes", "bot_v18.js"), "utf8");
    expect(bot18).toMatch(/firePollClosed\(|fireGiveawayEnded\(/);
  });
});

describe("А2 — повторен опит с нарастваща пауза", () => {
  it("А2: 503 → повторен опит → успех; failCount се нулира, не расте", async () => {
    axiosPost.mockResolvedValueOnce({ status: 503 }).mockResolvedValueOnce({ status: 200 });
    await svc.deliverWebhook(hook(), '{"a":1}', { sleep: noSleep });
    expect(axiosPost).toHaveBeenCalledTimes(2);
    expect(prismaMock.webhook.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.webhook.update.mock.calls[0][0].data).toMatchObject({ lastStatus: 200, failCount: 0 });
  });

  it("А2: паузите растат (всяка по-дълга от предишната)", async () => {
    axiosPost.mockResolvedValue({ status: 502 });
    await svc.deliverWebhook(hook(), "{}", { sleep: noSleep });
    const waits = noSleep.mock.calls.map((c) => c[0]);
    expect(waits.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < waits.length; i++) expect(waits[i]).toBeGreaterThan(waits[i - 1]);
  });

  it("А2: след изчерпване на опитите failCount расте ВЕДНЪЖ (не по веднъж на опит)", async () => {
    axiosPost.mockResolvedValue({ status: 500 });
    await svc.deliverWebhook(hook(), "{}", { sleep: noSleep });
    const incs = prismaMock.webhook.update.mock.calls.filter((c) => c[0].data.failCount?.increment === 1);
    expect(incs).toHaveLength(1);
  });

  it("А2: мрежова грешка (без статус) също се повтаря", async () => {
    axiosPost.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce({ status: 204 });
    await svc.deliverWebhook(hook(), "{}", { sleep: noSleep });
    expect(axiosPost).toHaveBeenCalledTimes(2);
  });

  it("А2: траен 4xx (напр. 404) не се повтаря", async () => {
    axiosPost.mockResolvedValue({ status: 404 });
    await svc.deliverWebhook(hook(), "{}", { sleep: noSleep });
    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });

  it("А2: 429 и 408 са преходни — повтарят се", async () => {
    axiosPost.mockResolvedValueOnce({ status: 429 }).mockResolvedValueOnce({ status: 408 }).mockResolvedValueOnce({ status: 200 });
    await svc.deliverWebhook(hook(), "{}", { sleep: noSleep });
    expect(axiosPost).toHaveBeenCalledTimes(3);
  });
});

describe("А2 — подписът покрива и времето", () => {
  it("А2: старият хедър X-SupremeBot-Signature остава (HMAC само на тялото)", async () => {
    axiosPost.mockResolvedValue({ status: 200 });
    const body = '{"event":"GIVEAWAY_ENDED"}';
    await svc.deliverWebhook(hook(), body, { sleep: noSleep });
    const headers = axiosPost.mock.calls[0][2].headers;
    const expected = crypto.createHmac("sha256", "s3cret-value").update(body).digest("hex");
    expect(headers["X-SupremeBot-Signature"]).toBe(`sha256=${expected}`);
  });

  it("А2: новият хедър подписва `${timestamp}.${тяло}` и носи времето", async () => {
    axiosPost.mockResolvedValue({ status: 200 });
    const body = '{"event":"GIVEAWAY_ENDED"}';
    await svc.deliverWebhook(hook(), body, { sleep: noSleep });
    const headers = axiosPost.mock.calls[0][2].headers;
    const ts = headers["X-SupremeBot-Timestamp"];
    expect(ts).toMatch(/^\d{10}$/);
    const expected = crypto.createHmac("sha256", "s3cret-value").update(`${ts}.${body}`).digest("hex");
    expect(headers["X-SupremeBot-Signature-V2"]).toBe(`sha256=${expected}`);
  });

  it("А2: без тайна няма подписи (както досега)", async () => {
    axiosPost.mockResolvedValue({ status: 200 });
    await svc.deliverWebhook(hook({ secret: null }), "{}", { sleep: noSleep });
    const headers = axiosPost.mock.calls[0][2].headers;
    expect(headers["X-SupremeBot-Signature"]).toBeUndefined();
    expect(headers["X-SupremeBot-Signature-V2"]).toBeUndefined();
  });

  it("А2: всички опити на една доставка носят ЕДИН идентификатор (приемникът дедуплицира)", async () => {
    axiosPost.mockResolvedValueOnce({ status: 503 }).mockResolvedValueOnce({ status: 200 });
    await svc.deliverWebhook(hook(), "{}", { sleep: noSleep });
    const ids = axiosPost.mock.calls.map((c) => c[2].headers["X-SupremeBot-Delivery"]);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).toBe(ids[1]);
  });
});

describe("А2 — включване наново нулира failCount", () => {
  const app = () => { const a = express(); a.use(express.json()); a.use("/api/servers", webhooksRouter); return a; };

  it("А2: PUT с enabled:true нулира failCount", async () => {
    prismaMock.webhook.findFirst.mockResolvedValue({ id: "wh1" });
    prismaMock.webhook.update.mockResolvedValue(hook());
    const res = await request(app()).put(`/api/servers/${SID}/webhooks/wh1`).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(prismaMock.webhook.update.mock.calls[0][0].data).toMatchObject({ enabled: true, failCount: 0 });
  });

  it("А2: PUT без enabled:true не пипа failCount", async () => {
    prismaMock.webhook.findFirst.mockResolvedValue({ id: "wh1" });
    prismaMock.webhook.update.mockResolvedValue(hook());
    await request(app()).put(`/api/servers/${SID}/webhooks/wh1`).send({ name: "ново име" });
    expect(prismaMock.webhook.update.mock.calls[0][0].data).not.toHaveProperty("failCount");
  });
});
