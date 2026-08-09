// backend/src/__tests__/integration/applicationRace.integration.test.js
// ТУК се доказва това, което мокът никога не можа.
//
// `applicationRace.test.js` (unit) сам си пише в коментара, че мокнатата Prisma
// НЕ прилага Serializable семантика, значи оттам НЕ следва, че Postgres ще
// откаже втората едновременна заявка. Твърдеше само нашата страна на договора:
// че кодът минава през транзакция и превежда P2034 в 429.
//
// Този файл пуска ДВЕ НАИСТИНА едновременни подавания срещу ЖИВ Postgres и
// проверява резултата в базата. Ако Serializable не работеше, тук щяха да
// излязат два реда — точно дупката, която червеният екип възпроизведе.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, makeServer, makeUser } from "./db.js";

const { submitApplication } = await import("../../services/applicationSubmit.js");

let serverId;

beforeEach(async () => {
  await resetDb();
  const s = await makeServer({ isPremium: true, plan: "premium", planSource: "manual" });
  serverId = s.id;
  await makeUser("u1");
});

afterAll(async () => { await prisma.$disconnect(); });

async function makeForm(over = {}) {
  return prisma.form.create({
    data: { serverId, name: "Кандидатура", isApplication: true, ...over },
  });
}

describe("таванът на подаванията срещу ИСТИНСКИ Postgres", () => {
  it("две едновременни подавания при maxSubmissions:1 → точно ЕДИН ред", async () => {
    const form = await makeForm({ maxSubmissions: 1, cooldownSeconds: 0 });
    const body = { serverId, formId: form.id, userId: "u1", answers: { q: "да" } };

    // Promise.all стартира и двете, преди която и да е да е приключила — това е
    // реалното interleaving на два HTTP-а върху един pool.
    const results = await Promise.all([submitApplication(body), submitApplication(body)]);

    const accepted = results.filter((r) => r.ok).length;
    const rows = await prisma.application.count({ where: { formId: form.id } });

    expect(rows, "в базата има повече от една кандидатура — таванът се заобикаля").toBe(1);
    expect(accepted, "две подавания се обявиха за успешни").toBe(1);

    // Отказаната трябва да носи ПРИЧИНА, не общ срив.
    const rejected = results.find((r) => !r.ok);
    expect(["MAX_SUBMISSIONS", "CONCURRENT"]).toContain(rejected.code);
    expect(rejected.status).toBe(429);
  });

  it("пет едновременни при maxSubmissions:2 → точно ДВА реда", async () => {
    const form = await makeForm({ maxSubmissions: 2, cooldownSeconds: 0 });
    const body = { serverId, formId: form.id, userId: "u1", answers: { q: "да" } };

    const results = await Promise.all(Array.from({ length: 5 }, () => submitApplication(body)));
    const rows = await prisma.application.count({ where: { formId: form.id } });

    expect(rows).toBe(2);
    expect(results.filter((r) => r.ok).length).toBe(2);
  });

  it("броячът в базата съвпада с приетите — нула изгубени ъпдейти", async () => {
    const form = await makeForm({ maxSubmissions: 10, cooldownSeconds: 0 });
    const body = { serverId, formId: form.id, userId: "u1", answers: { q: "да" } };

    await Promise.all(Array.from({ length: 6 }, () => submitApplication(body)));

    const rows = await prisma.application.count({ where: { formId: form.id } });
    const cd = await prisma.formCooldown.findUnique({
      where: { formId_userId: { formId: form.id, userId: "u1" } },
    });
    // Класически изгубен ъпдейт: шест инкремента дават по-малко от шест.
    expect(cd.submissionCount, "броячът изостава от реалните редове").toBe(rows);
  });

  it("РАЗЛИЧНИ потребители не си пречат — 429 на невинен е дефект", async () => {
    // Хипотезата на червения екип, която той не можа да провери без жив Postgres.
    const form = await makeForm({ maxSubmissions: 1, cooldownSeconds: 0 });
    for (const u of ["a1", "a2", "a3", "a4"]) await makeUser(u);

    const results = await Promise.all(
      ["a1", "a2", "a3", "a4"].map((userId) =>
        submitApplication({ serverId, formId: form.id, userId, answers: { q: "да" } }),
      ),
    );

    expect(results.every((r) => r.ok), `отказан невинен: ${JSON.stringify(results.filter(r => !r.ok))}`).toBe(true);
    expect(await prisma.application.count({ where: { formId: form.id } })).toBe(4);
  });
});

describe("cooldown-ът важи срещу истински часовник и истинска база", () => {
  it("второто подаване веднага след първото пада", async () => {
    const form = await makeForm({ cooldownSeconds: 3600, maxSubmissions: null });
    const body = { serverId, formId: form.id, userId: "u1", answers: { q: "да" } };

    const first = await submitApplication(body);
    const second = await submitApplication(body);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: "COOLDOWN" });
    expect(second.remainingSeconds).toBeGreaterThan(3500);
    expect(await prisma.application.count({ where: { formId: form.id } })).toBe(1);
  });

  it("затворена форма не приема нищо", async () => {
    const form = await makeForm({ closedAt: new Date() });
    const r = await submitApplication({ serverId, formId: form.id, userId: "u1", answers: {} });
    expect(r).toMatchObject({ ok: false, status: 403, code: "FORM_CLOSED" });
    expect(await prisma.application.count({ where: { formId: form.id } })).toBe(0);
  });
});
