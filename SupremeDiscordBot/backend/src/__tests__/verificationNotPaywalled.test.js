// backend/src/__tests__/verificationNotPaywalled.test.js
// Защитата срещу рейд НЕ се продава и НЕ отслабва при изтекъл план.
//
// ЗАЩО (решение 12.08.2026, след червения екип): „Math Captcha" и „Account Age
// Requirement" бяха платени функции. Това създаваше fail-open път, който
// работеше точно срещу целта си:
//   • безплатният план оставаше с BUTTON верификация — „натисни бутон" —
//     което бот прави тривиално, тоест защита нямаше точно там, където е
//     най-нужна;
//   • изтичането на плана СВАЛЯШЕ защитата ТИХО и със задна дата: панелът в
//     таблото изглежда същият, а ботът вече приема гол клик от вчерашен акаунт;
//   • вредата пада върху ТРЕТИ ЛИЦА — членовете, — не върху неплатилия клиент.
//
// CISA „Secure by Design" казва право: защитните функции трябва да са налични
// без допълнително заплащане. Тестът пази решението от тиха регресия.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "u1" }; next(); },
  requireServerAdmin: (req, _res, next) => next(),
  requireBotSecret: (req, _res, next) => next(),
}));

const { PREMIUM_FEATURES } = await import("../lib/premium.js");
const { default: verificationRouter } = await import("../routes/verification.js");

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/verification", verificationRouter);
  a.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => vi.clearAllMocks());

describe("верификацията не е зад каса", () => {
  it("двете защитни функции ги НЯМА в платената матрица", () => {
    // Проверката е за ОТСЪСТВИЕ от матрицата, не през planHasFeature.
    // Причината е важна: `featureMinRank` връща „premium" за НЕПОЗНАТ ключ —
    // нарочно fail-closed откъм приходи, за да не отваря печатна грешка платена
    // функция. Значи „свободна" функция = такава, която изобщо не се пита.
    expect(Object.keys(PREMIUM_FEATURES).filter((k) => k.startsWith("verification.")))
      .toEqual([]);
  });

  it("изтекъл план НЕ сваля MATH до BUTTON и НЕ нулира възрастовия праг", async () => {
    prismaMock.verificationPanel.findUnique.mockResolvedValue({
      id: "vp1", serverId: "s1", type: "MATH", minAccountAgeDays: 30,
      mathDifficulty: "HARD", maxAttempts: 5, cooldownMinutes: 10,
    });
    // Сървърът е FREE — преди това сваляше защитата.
    const res = await request(app()).get("/api/verification/bot/vp1");

    expect(res.status).toBe(200);
    expect(res.body.type, "MATH не бива да пада до BUTTON при изтекъл план").toBe("MATH");
    expect(res.body.minAccountAgeDays, "възрастовият праг не бива да се нулира").toBe(30);
  });

  it("FREE сървър може да СЪЗДАДЕ MATH панел с възрастов праг", async () => {
    prismaMock.verificationPanel.count.mockResolvedValue(0);
    prismaMock.verificationPanel.create.mockResolvedValue({ id: "vp2" });
    prismaMock.$transaction.mockImplementation(async (fn) =>
      typeof fn === "function" ? fn(prismaMock) : Promise.all(fn));

    const res = await request(app())
      .post("/api/verification/s1")
      .send({ name: "V", title: "Verify", type: "MATH", minAccountAgeDays: 30 });

    expect([200, 201]).toContain(res.status);
    expect(res.body.code, "не бива да иска Premium за защитна функция").not.toBe("PREMIUM_REQUIRED");
  });

  it("източникът не съдържа сваляща логика за верификацията", () => {
    const src = readFileSync(join(SRC, "routes/verification.js"), "utf8");
    expect(src).not.toMatch(/panel\.type\s*=\s*"BUTTON"/);
    expect(src).not.toMatch(/panel\.minAccountAgeDays\s*=\s*null/);
    expect(src).not.toMatch(/verification\.(mathCaptcha|accountAge)/);
  });
});
