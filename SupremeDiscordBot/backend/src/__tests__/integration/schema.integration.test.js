// backend/src/__tests__/integration/schema.integration.test.js
// Миграциите, ограниченията и мултинаемността — срещу ИСТИНСКА база.
//
// Нищо тук не може да се докаже с мок: мокът приема всяка форма на данните,
// няма чужди ключове, няма уникални индекси и няма представа дали миграциите
// изобщо се прилагат. Точно затова тези неща оцеляваха неоткрити.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { prisma, resetDb, makeServer, makeUser } from "./db.js";

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await resetDb(); });

describe("схемата описва базата — нулев дрейф", () => {
  it("`migrate diff` не намира разлика след `migrate deploy`", () => {
    // ТОВА Е ГЕЙТЪТ. Дълго време имаше седем разлики (типът на
    // `express_sessions.sid`, три `updatedAt` подразбирания, `polls.options`,
    // три индекса, един частичен). Всяка поотделно е дребна; заедно правеха
    // проверката вечно червена, значи безполезна — истинска разлика би се
    // изгубила в шума. (Одит с жив Postgres, 07.08.2026)
    const out = execFileSync("npx", [
      "prisma", "migrate", "diff",
      "--from-schema-datasource", "prisma/schema.prisma",
      "--to-schema-datamodel", "prisma/schema.prisma",
    ], { encoding: "utf-8", env: { ...process.env } });
    expect(out.trim(), `дрейф между схема и миграции:\n${out}`).toContain("No difference detected");
  });

  it("индексът от v42 наистина съществува (миграция може да мине и без ефект)", async () => {
    const rows = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'tickets' AND indexname = 'tickets_panelId_creatorId_status_idx'
    `;
    expect(rows.length, "индексът за гейта на отворените тикети липсва").toBe(1);
  });

  it("всяка приложена миграция е записана в дневника", async () => {
    const rows = await prisma.$queryRaw`
      SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at
    `;
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.every((r) => r.finished_at), "има миграция без finished_at — приложена наполовина").toBe(true);
  });
});

describe("чуждите ключове са ИСТИНСКИ", () => {
  it("кандидатура без потребител се отхвърля от базата (RESTRICT)", async () => {
    const s = await makeServer();
    const f = await prisma.form.create({ data: { serverId: s.id, name: "Ф", isApplication: true } });
    // Точната причина, заради която `submitApplication` прави stub потребител.
    await expect(prisma.application.create({
      data: { serverId: s.id, formId: f.id, userId: "никога_невиждан", answers: {}, status: "PENDING" },
    })).rejects.toThrow();
  });

  it("изтриването на сървър отнася подчинените му редове, не ги осиротява", async () => {
    const s = await makeServer();
    await prisma.panel.create({ data: { serverId: s.id, name: "П", title: "Заглавие" } });
    await prisma.form.create({ data: { serverId: s.id, name: "Ф" } });

    await prisma.server.delete({ where: { id: s.id } });

    expect(await prisma.panel.count({ where: { serverId: s.id } })).toBe(0);
    expect(await prisma.form.count({ where: { serverId: s.id } })).toBe(0);
  });
});

describe("уникалните ограничения държат", () => {
  it("два cooldown реда за същата двойка (форма, потребител) са невъзможни", async () => {
    const s = await makeServer();
    const f = await prisma.form.create({ data: { serverId: s.id, name: "Ф" } });
    await makeUser("u1");
    await prisma.formCooldown.create({ data: { formId: f.id, userId: "u1", submissionCount: 1, lastSubmittedAt: new Date() } });

    // Това ограничение е арбитърът в новия атомарен път на подаването —
    // ако падне, таванът се заобикаля.
    await expect(prisma.formCooldown.create({
      data: { formId: f.id, userId: "u1", submissionCount: 1, lastSubmittedAt: new Date() },
    })).rejects.toMatchObject({ code: "P2002" });
  });

  it("едно и също Stripe събитие не се обработва два пъти", async () => {
    await prisma.processedStripeEvent.create({ data: { id: "evt_1", type: "invoice.paid" } });
    await expect(prisma.processedStripeEvent.create({
      data: { id: "evt_1", type: "invoice.paid" },
    })).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("мултинаемността се държи на реални заявки", () => {
  it("скоупът по serverId не пропуска чужди редове", async () => {
    const a = await makeServer({ id: "srv_a" });
    const b = await makeServer({ id: "srv_b" });
    await prisma.form.create({ data: { serverId: a.id, name: "на А" } });
    await prisma.form.create({ data: { serverId: b.id, name: "на Б" } });

    const forA = await prisma.form.findMany({ where: { serverId: a.id } });
    expect(forA).toHaveLength(1);
    expect(forA[0].name).toBe("на А");

    // Точният гард в `applicationSubmit`: чужд formId + свой serverId → нула.
    const foreign = await prisma.form.findMany({ where: { serverId: a.id, name: "на Б" } });
    expect(foreign).toHaveLength(0);
  });
});

describe("фрагментите „ефективно платен“ работят срещу истински SQL", () => {
  it("гратисният период се хваща от заявката, не само от кода", async () => {
    const { effectivePremiumWhere, effectiveFreeWhere } = await import("../../lib/premium.js");
    const future = new Date(Date.now() + 5 * 86400_000);
    const past = new Date(Date.now() - 5 * 86400_000);

    await makeServer({ id: "жив_гратис", accessUntil: future, gracePlan: "premium" });
    await makeServer({ id: "изтекъл_гратис", accessUntil: past, gracePlan: "premium" });
    await makeServer({ id: "безплатен" });

    const paid = await prisma.server.findMany({ where: effectivePremiumWhere(), select: { id: true } });
    const free = await prisma.server.findMany({ where: effectiveFreeWhere(), select: { id: true } });

    expect(paid.map((s) => s.id)).toContain("жив_гратис");
    expect(paid.map((s) => s.id)).not.toContain("изтекъл_гратис");
    // `NOT { in: [...] }` изключва NULL редове — класически капан на Prisma,
    // затова безплатният сървър трябва изрично да е ТУК.
    expect(free.map((s) => s.id)).toContain("безплатен");
    expect(free.map((s) => s.id)).toContain("изтекъл_гратис");
  });
});
