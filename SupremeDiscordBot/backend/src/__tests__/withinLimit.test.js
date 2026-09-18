// backend/src/__tests__/withinLimit.test.js
// Регресии за атомарната проверка на плановите лимити (07.08.2026).
//
// Червеният екип възпроизведе TOCTOU срещу живия handler: две едновременни
// `POST /api/panels/:id` при безплатен план (лимит 1) върнаха 201/201 и оставиха
// ДВА реда. Между `count()` и `create()` нямаше нищо — нито транзакция, нито
// уникален индекс, нито брояч. Шаблонът се повтаряше на седем места.
import { describe, it, expect, vi, beforeEach } from "vitest";

let txBehaviour = null;
const prismaMock = {
  $transaction: vi.fn(async (fn, opts) => {
    prismaMock.__lastOpts = opts;
    return txBehaviour(fn);
  }),
  __lastOpts: null,
};
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const { createWithinLimit } = await import("../lib/withinLimit.js");

function txWithCount(count) {
  return (fn) => fn({ panel: { count: vi.fn(async () => count) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.__lastOpts = null;
});

describe("createWithinLimit", () => {
  it("създава, когато е под лимита", async () => {
    txBehaviour = txWithCount(0);
    const res = await createWithinLimit({
      model: "panel", where: { serverId: "s1" }, limit: 1,
      create: async () => ({ id: "p1" }),
    });
    expect(res).toEqual({ ok: true, row: { id: "p1" } });
  });

  it("отказва на лимита и НЕ вика create", async () => {
    txBehaviour = txWithCount(1);
    const create = vi.fn();
    const res = await createWithinLimit({
      model: "panel", where: { serverId: "s1" }, limit: 1, create,
    });
    expect(res.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("работи в SERIALIZABLE — иначе двете заявки пак минават", async () => {
    txBehaviour = txWithCount(0);
    await createWithinLimit({
      model: "panel", where: { serverId: "s1" }, limit: 5, create: async () => ({}),
    });
    expect(prismaMock.__lastOpts).toEqual({ isolationLevel: "Serializable" });
  });

  it("P2034 (сериализационен конфликт) се чете като достигнат лимит, не като 500", async () => {
    txBehaviour = () => { const e = new Error("conflict"); e.code = "P2034"; throw e; };
    const res = await createWithinLimit({
      model: "panel", where: { serverId: "s1" }, limit: 1, create: async () => ({}),
    });
    expect(res).toEqual({ ok: false, count: 1 });
  });

  it("чужда грешка се вдига нагоре — не я гълтаме като лимит", async () => {
    txBehaviour = () => { const e = new Error("нещо друго"); e.code = "P2002"; throw e; };
    await expect(createWithinLimit({
      model: "panel", where: { serverId: "s1" }, limit: 1, create: async () => ({}),
    })).rejects.toThrow("нещо друго");
  });
});

describe("маршрутите ползват помощника, а не гол count→create", () => {
  const files = [
    "panels.js", "forms.js", "kb.js", "verification.js",
    "reactionroles.js", "automation.js",
  ];

  it("всеки от шестте внася createWithinLimit", async () => {
    const { readFileSync } = await import("fs");
    const { fileURLToPath } = await import("url");
    const { dirname, join } = await import("path");
    const base = join(dirname(fileURLToPath(import.meta.url)), "../routes");
    for (const f of files) {
      const src = readFileSync(join(base, f), "utf-8");
      expect(src, `${f} не ползва помощника`).toContain("createWithinLimit");
    }
  });
});
