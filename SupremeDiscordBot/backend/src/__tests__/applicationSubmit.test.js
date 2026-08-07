// backend/src/__tests__/applicationSubmit.test.js
// Правилата на формата важат за ВСЕКИ път на подаване.
//
// Дефектът (одит 07.08.2026): затворена форма, cooldown и таван на подаванията
// бяха реализирани цялостно в `routes/applications.js`, но ботът вика
// `POST /bot/application/submit`, който беше гол `prisma.application.create`
// БЕЗ нито една проверка. А формата се попълва ПРЕЗ БОТА — значи единственият
// реален път беше и единственият незащитен. Клиент включва „максимум 1
// кандидатура“ (Premium функция), а хората подават неограничено; затворена
// форма продължава да приема.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const { submitApplication } = await import("../services/applicationSubmit.js");

const BODY = { serverId: "s1", formId: "f1", userId: "u1", answers: { q1: "да" } };

function form(over = {}) {
  return { id: "f1", serverId: "s1", closedAt: null, cooldownSeconds: 0, maxSubmissions: null, pingRoleIds: [], ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.form.findUnique.mockResolvedValue(form());
  prismaMock.formCooldown.findUnique.mockResolvedValue(null);
  prismaMock.formCooldown.upsert.mockResolvedValue({});
  prismaMock.user.upsert.mockResolvedValue({});
  prismaMock.application.create.mockResolvedValue({ id: "a1" });
});

describe("успешен път", () => {
  it("създава кандидатурата и вдига брояча за cooldown", async () => {
    const r = await submitApplication(BODY);
    expect(r.ok).toBe(true);
    expect(prismaMock.application.create).toHaveBeenCalled();
    expect(prismaMock.formCooldown.upsert).toHaveBeenCalled();
  });

  it("създава stub потребител — FK към users е RESTRICT", async () => {
    // Кандидатстващият може никога да не е влизал в таблото.
    await submitApplication(BODY);
    expect(prismaMock.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
  });
});

describe("правилата на формата СПИРАТ подаването", () => {
  it("затворена форма → 403, нула запис", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form({ closedAt: new Date() }));
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 403, code: "FORM_CLOSED" });
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("достигнат таван на подаванията → 429, нула запис", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form({ maxSubmissions: 1 }));
    prismaMock.formCooldown.findUnique.mockResolvedValue({ submissionCount: 1, lastSubmittedAt: new Date(0) });
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 429, code: "MAX_SUBMISSIONS" });
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("активен cooldown → 429 с оставащото време", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form({ cooldownSeconds: 3600 }));
    prismaMock.formCooldown.findUnique.mockResolvedValue({ submissionCount: 1, lastSubmittedAt: new Date(Date.now() - 60_000) });
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 429, code: "COOLDOWN" });
    expect(r.remainingSeconds).toBeGreaterThan(3000);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("изтекъл cooldown ПУСКА подаването", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form({ cooldownSeconds: 60 }));
    prismaMock.formCooldown.findUnique.mockResolvedValue({ submissionCount: 1, lastSubmittedAt: new Date(Date.now() - 120_000) });
    const r = await submitApplication(BODY);
    expect(r.ok).toBe(true);
  });
});

describe("cross-tenant гард", () => {
  it("форма от ДРУГ сървър → 404 (не изтича съществуването ѝ)", async () => {
    prismaMock.form.findUnique.mockResolvedValue(form({ serverId: "чужд" }));
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("липсващи полета → 400 преди всяка заявка", async () => {
    const r = await submitApplication({ serverId: "s1" });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(prismaMock.form.findUnique).not.toHaveBeenCalled();
  });
});

describe("ЕДИН източник за двата маршрута", () => {
  it("и бот-пътят, и уеб-пътят викат услугата, а не свой create", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const base = join(dirname(fileURLToPath(import.meta.url)), "..", "routes");

    // Двата маршрута имат РАЗЛИЧЕН път: `/application/submit` (бот) и `/submit`
    // (уеб, зад bot-secret). Котвата е по реалния низ във всеки файл.
    for (const [f, anchor] of [["bot.js", '"/application/submit"'], ["applications.js", '"/submit"']]) {
      const src = readFileSync(join(base, f), "utf-8");
      const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      const at = code.indexOf(anchor);
      expect(at, `${f}: маршрутът ${anchor} изчезна`).toBeGreaterThan(-1);
      const handler = code.slice(at);
      const body = handler.slice(0, handler.indexOf("\n});"));
      expect(body, `${f} не вика споделената услуга`).toContain("submitApplication(");
      // Гол `application.create` в самия handler = върната дупка.
      expect(body, `${f} пак прави собствен create`).not.toMatch(/prisma\.application\.create/);
    }
  });
});
