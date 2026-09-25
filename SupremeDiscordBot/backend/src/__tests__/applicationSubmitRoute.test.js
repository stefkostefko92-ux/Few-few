// backend/src/__tests__/applicationSubmitRoute.test.js
// Маршрутът, който ботът реално вика, УВАЖАВА отказа на услугата.
//
// ЗАЩО СЪЩЕСТВУВА (Изпитателят, одит 07.08.2026, доказано с мутация): правилата
// на формата вече живеят в един модул и `routes/bot.js` го вика — но нищо не
// проверяваше, че маршрутът СЕ СЪОБРАЗЯВА с отговора. Мутация на `if (!r.ok)`
// в `if (false)` остави всичките 27 теста зелени, а отхвърлена кандидатура
// минаваше с 200. Структурният тест („вика ли услугата“) не лови това: важно е
// не че я вика, а че ѝ се подчинява.
//
// Това е дефектен клас Г от този одит: гейт на записа, не на изпълнението.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "test-bot-secret";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const submitApplication = vi.fn();
vi.mock("../services/applicationSubmit.js", () => ({
  submitApplication: (...a) => submitApplication(...a),
}));

const { default: botRouter } = await import("../routes/bot.js");

function post(body = { serverId: "s1", formId: "f1", userId: "u1", answers: {} }) {
  const app = express();
  app.use(express.json());
  app.use("/api/bot", botRouter);
  // Грешките минават през error middleware-а, иначе 500 идва като HTML.
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return request(app)
    .post("/api/bot/application/submit")
    .set("x-bot-secret", "test-bot-secret")
    .send(body);
}

beforeEach(() => vi.clearAllMocks());

describe("отказът на услугата стига до бота с ВЕРНИЯ статус", () => {
  it("затворена форма → 403 FORM_CLOSED", async () => {
    submitApplication.mockResolvedValue({
      ok: false, status: 403, code: "FORM_CLOSED", error: "Applications are currently closed",
    });
    const res = await post();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORM_CLOSED");
  });

  it("достигнат таван → 429 MAX_SUBMISSIONS", async () => {
    submitApplication.mockResolvedValue({
      ok: false, status: 429, code: "MAX_SUBMISSIONS", error: "maximum reached",
    });
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("MAX_SUBMISSIONS");
  });

  it("cooldown → 429 и оставащото време стига до потребителя", async () => {
    submitApplication.mockResolvedValue({
      ok: false, status: 429, code: "COOLDOWN", error: "wait", remainingSeconds: 3540,
    });
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.body.remainingSeconds).toBe(3540);
  });

  it("чужда форма → 404, нула изтичане на подробности", async () => {
    submitApplication.mockResolvedValue({ ok: false, status: 404, error: "Form not found" });
    const res = await post();
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/serverId|formId/);
  });

  it("НИКОЙ отказ не се превръща в 200", async () => {
    for (const status of [400, 403, 404, 429]) {
      submitApplication.mockResolvedValue({ ok: false, status, error: "нет" });
      const res = await post();
      expect(res.status, `отказ ${status} мина като ${res.status}`).toBe(status);
    }
  });
});

describe("успешният път връща каквото ботът чака", () => {
  it("200 с кандидатурата и pingRoleIds", async () => {
    submitApplication.mockResolvedValue({
      ok: true, application: { id: "a1", status: "PENDING" }, pingRoleIds: ["r1", "r2"],
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "a1", status: "PENDING", pingRoleIds: ["r1", "r2"] });
  });

  it("тялото се подава на услугата непокътнато", async () => {
    submitApplication.mockResolvedValue({ ok: true, application: {}, pingRoleIds: [] });
    const body = { serverId: "s1", formId: "f1", userId: "u1", answers: { q: "a" }, reviewChannelId: "c1" };
    await post(body);
    expect(submitApplication).toHaveBeenCalledWith(expect.objectContaining(body));
  });
});

describe("маршрутът е зад bot-secret", () => {
  it("без хедър → не се стига до услугата", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/bot", botRouter);
    const res = await request(app).post("/api/bot/application/submit").send({ serverId: "s1" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(submitApplication).not.toHaveBeenCalled();
  });
});
