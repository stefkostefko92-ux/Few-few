// backend/src/__tests__/applicationRace.test.js
// Таванът на подаванията се заявява АТОМАРНО — с условен ъпдейт, не с изолация.
//
// ИСТОРИЯТА (две поправки, втората заради първата):
//
// 1) Първоначално `submitApplication` четеше `formCooldown.submissionCount`,
//    решаваше и чак после пишеше — с await-точки помежду. Две едновременни
//    подавания четат `count = 0`, двете минават покрай `maxSubmissions: 1`,
//    двете записват. Платена функция, заобиколена с двоен клик.
//
// 2) Поправката обви всичко в Serializable транзакция. Инвариантът се спазваше,
//    но интеграционният тест срещу ЖИВ Postgres показа цената: четенето на
//    `formCooldown` е предикатно, Postgres заключва предикати по-широко от един
//    ред, и четирима РАЗЛИЧНИ потребители, подали едновременно, получиха ТРИ
//    отказа „CONCURRENT“. Тоест поправката правеше на невинни хора точно това,
//    от което пазеше сървъра.
//
// Сега атомарността идва от самата заявка: `updateMany` с условие в `where`
// заключва РЕДА на този потребител и или сработва, или връща 0. Различните
// потребители са различни редове.
//
// ГРАНИЦА: истинската едновременност се доказва в
// `integration/applicationRace.integration.test.js` срещу жив Postgres. Тук се
// проверява ФОРМАТА на договора — че решението е едно условно писане, а не
// четене-после-писане, и че всеки отказ носи вярна причина.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

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

/** Prisma грешка за нарушен уникален ключ. */
const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

beforeEach(() => {
  plan = "premium";
  vi.clearAllMocks();
  prismaMock.form.findUnique.mockResolvedValue(form({ maxSubmissions: 1 }));
  prismaMock.formCooldown.updateMany.mockResolvedValue({ count: 1 }); // мястото е заето
  prismaMock.formCooldown.create.mockResolvedValue({});
  prismaMock.formCooldown.findUnique.mockResolvedValue(null);
  prismaMock.user.upsert.mockResolvedValue({});
  prismaMock.application.create.mockResolvedValue({ id: "a1" });
});

describe("решението е ЕДНО условно писане, не четене-после-писане", () => {
  it("таванът влиза в `where` на ъпдейта, не в if след четене", async () => {
    await submitApplication(BODY);
    const where = prismaMock.formCooldown.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ formId: "f1", userId: "u1" });
    expect(where.submissionCount, "таванът не се проверява атомарно").toEqual({ lt: 1 });
  });

  it("cooldown-ът също влиза в `where`, като времева граница", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form({ cooldownSeconds: 3600 }));
    await submitApplication(BODY);
    const where = prismaMock.formCooldown.updateMany.mock.calls[0][0].where;
    expect(where.lastSubmittedAt?.lte).toBeInstanceOf(Date);
    // Границата е „преди един час“ — по-стар запис пуска подаването.
    const cutoff = where.lastSubmittedAt.lte.getTime();
    expect(Math.abs(Date.now() - cutoff - 3600_000)).toBeLessThan(5000);
  });

  it("НЕ се ползва Serializable — тя отказва невинни потребители", async () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "services", "applicationSubmit.js"),
      "utf-8",
    );
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    expect(code, "Serializable се върна — виж защо беше махната").not.toContain("Serializable");
  });

  it("успехът вдига брояча ТОЧНО веднъж", async () => {
    await submitApplication(BODY);
    expect(prismaMock.formCooldown.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.formCooldown.updateMany.mock.calls[0][0].data.submissionCount)
      .toEqual({ increment: 1 });
  });
});

describe("първо подаване — редът още не съществува", () => {
  it("ъпдейтът не хваща нищо → създава се ред и подаването минава", async () => {
    prismaMock.formCooldown.updateMany.mockResolvedValue({ count: 0 });
    const r = await submitApplication(BODY);
    expect(r.ok).toBe(true);
    expect(prismaMock.formCooldown.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ submissionCount: 1 }) }),
    );
    expect(prismaMock.application.create).toHaveBeenCalled();
  });
});

describe("отказът носи ВЯРНАТА причина", () => {
  beforeEach(() => {
    // Мястото не е заето и редът вече съществува → правилото е спряло.
    prismaMock.formCooldown.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.formCooldown.create.mockRejectedValue(p2002());
  });

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
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("загубено състезание БЕЗ нарушено правило → CONCURRENT", async () => {
    // Двоен клик в милисекунди: редът се появи между ъпдейта и създаването, но
    // нито таванът, нито cooldown-ът са нарушени.
    prismaMock.form.findUnique.mockResolvedValue(form({ maxSubmissions: 5 }));
    prismaMock.formCooldown.findUnique.mockResolvedValue({
      submissionCount: 1, lastSubmittedAt: new Date(),
    });
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 429, code: "CONCURRENT" });
  });

  it("истинска грешка в базата НЕ се маскира като отказ", async () => {
    prismaMock.formCooldown.create.mockRejectedValue(new Error("connection lost"));
    await expect(submitApplication(BODY)).rejects.toThrow("connection lost");
  });
});

describe("провал СЛЕД заетото място връща заявката назад", () => {
  it("паднало създаване на кандидатура намалява брояча", async () => {
    prismaMock.application.create.mockRejectedValue(new Error("диск пълен"));
    await expect(submitApplication(BODY)).rejects.toThrow("диск пълен");
    // Второто извикване е компенсацията.
    const calls = prismaMock.formCooldown.updateMany.mock.calls;
    expect(calls.length, "мястото остава заето при провал — клиентът го губи").toBe(2);
    expect(calls[1][0].data.submissionCount).toEqual({ decrement: 1 });
  });
});

describe("форма без правила", () => {
  it("минава без условия в `where`, но пак вдига брояча", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form());
    const r = await submitApplication(BODY);
    expect(r.ok).toBe(true);
    const where = prismaMock.formCooldown.updateMany.mock.calls[0][0].where;
    expect(where.submissionCount).toBeUndefined();
    expect(where.lastSubmittedAt).toBeUndefined();
  });
});
