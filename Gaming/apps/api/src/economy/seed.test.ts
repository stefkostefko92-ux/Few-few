import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fake Product таблица: seed-ът трябва само да СЪЗДАВА липсващи редове ──────
interface Row {
  sku: string;
  priceCents: number;
  active: boolean;
  gems: number | null;
}
const rows = new Map<string, Row>();
const upsert = vi.fn(
  async ({ where, create, update }: { where: { sku: string }; create: Row; update: Partial<Row> }) => {
    const prev = rows.get(where.sku);
    const next = prev ? { ...prev, ...update } : { ...create };
    rows.set(where.sku, next);
    return next;
  },
);

vi.mock("@aso/db", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(async ({ where }: { where: { sku: string } }) => {
        const r = rows.get(where.sku);
        return r ? { id: `prod_${r.sku}` } : null;
      }),
      upsert,
    },
  },
}));

const { seedProducts } = await import("./seed.js");
const { CATALOG } = await import("./catalog.js");

beforeEach(() => {
  rows.clear();
  upsert.mockClear();
});

describe("seedProducts — create-only", () => {
  it("на празна база създава целия начален каталог", async () => {
    await seedProducts();
    expect(rows.size).toBe(CATALOG.length);
    expect(rows.get("gems_small")).toMatchObject({ priceCents: 199, active: true, gems: 100 });
  });

  it("НЕ презаписва цена/active на съществуващ продукт (админ редакцията оцелява рестарт)", async () => {
    rows.set("gems_small", { sku: "gems_small", priceCents: 250, active: false, gems: 120 });
    await seedProducts();
    expect(rows.get("gems_small")).toEqual({ sku: "gems_small", priceCents: 250, active: false, gems: 120 });
    // Съществуващият ред изобщо не се upsert-ва.
    expect(upsert.mock.calls.some(([a]) => a.where.sku === "gems_small")).toBe(false);
  });
});
