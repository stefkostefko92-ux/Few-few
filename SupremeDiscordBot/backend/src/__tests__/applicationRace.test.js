// backend/src/__tests__/applicationRace.test.js
// Таванът на подаванията устоява на двоен клик.
//
// ДЕФЕКТЪТ (червен екип, 07.08.2026): `submitApplication` четеше
// `formCooldown.submissionCount`, решаваше, и чак после пишеше — с три
// await-точки между четенето и записа. Две едновременни подавания четат
// `count = 0`, двете минават покрай `maxSubmissions: 1`, двете записват.
// Платена функция (`form.cooldowns`), която се заобикаля с двоен клик.
//
// ГРАНИЦА НА ТОЗИ ТЕСТ — чети го честно: мокнатата Prisma НЕ прилага
// Serializable семантика, значи оттук НЕ следва, че Postgres ще откаже втората
// заявка. Доказуемо тук е само нашата страна на договора: (1) проверката и
// записът са в ЕДНА транзакция с явно `isolationLevel: "Serializable"`, и
// (2) сериализационният конфликт (P2034) се превръща в 429, а не в 500.
// Реалното състезание иска жив Postgres и остава непроверено.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

// Тарифата: тези тестове съдят ПРАВИЛАТА, значи планът трябва да ги покрива.
// (Санитайзърът по тарифа се тества отделно в `formTierStrip.test.js`.)
let plan = "premium";
vi.mock("../lib/premium.js", async (orig) => {
  const actual = await orig();
  return { ...actual, getServerTier: vi.fn(async () => ({ plan, isPremium: true })) };
});


const { submitApplication } = await import("../services/applicationSubmit.js");

const BODY = { serverId: "s1", formId: "f1", userId: "u1", answers: { q1: "да" } };
const form = (over = {}) => ({
  id: "f1", serverId: "s1", closedAt: null, cooldownSeconds: 0,
  maxSubmissions: null, pingRoleIds: [], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.form.findUnique.mockResolvedValue(form({ maxSubmissions: 1 }));
  prismaMock.formCooldown.findUnique.mockResolvedValue(null);
  prismaMock.formCooldown.upsert.mockResolvedValue({});
  prismaMock.user.upsert.mockResolvedValue({});
  prismaMock.application.create.mockResolvedValue({ id: "a1" });
});

describe("проверка и запис са неделими", () => {
  it("минават през една Serializable транзакция", async () => {
    await submitApplication(BODY);
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("нищо не се пише ИЗВЪН транзакцията", () => {
    // Ако някой върне гол `prisma.application.create` до транзакцията, дупката
    // се отваря наново, а горният тест пак ще е зелен.
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "services", "applicationSubmit.js"),
      "utf-8",
    );
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    for (const write of ["application.create", "formCooldown.upsert", "user.upsert"]) {
      expect(code, `${write} се вика извън транзакцията`).not.toContain(`prisma.${write}`);
      expect(code, `${write} изчезна от транзакцията`).toContain(`tx.${write}`);
    }
  });
});

describe("сериализационният конфликт е отказ, не срив", () => {
  it("P2034 → 429 CONCURRENT, нула 500", async () => {
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    prismaMock.$transaction.mockRejectedValueOnce(conflict);
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 429, code: "CONCURRENT" });
  });

  it("истинска грешка в базата НЕ се маскира като 429", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("connection lost"));
    await expect(submitApplication(BODY)).rejects.toThrow("connection lost");
  });
});

describe("отказите на правилата минават през транзакцията невредими", () => {
  it("достигнат таван → 429 MAX_SUBMISSIONS, нула запис", async () => {
    prismaMock.formCooldown.findUnique.mockResolvedValue({
      submissionCount: 1, lastSubmittedAt: new Date(0),
    });
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 429, code: "MAX_SUBMISSIONS" });
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("активен cooldown → 429 COOLDOWN с оставащото време", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form({ cooldownSeconds: 3600 }));
    prismaMock.formCooldown.findUnique.mockResolvedValue({
      submissionCount: 1, lastSubmittedAt: new Date(Date.now() - 60_000),
    });
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 429, code: "COOLDOWN" });
    expect(r.remainingSeconds).toBeGreaterThan(3000);
  });

  it("форма без правила не влиза в проверката, но пак пише в транзакция", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form());
    const r = await submitApplication(BODY);
    expect(r.ok).toBe(true);
    expect(prismaMock.formCooldown.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});
