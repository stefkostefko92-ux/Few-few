// backend/src/__tests__/shopExpiry.test.js
// Изтичането на временните роли от магазина (одит 25.09.2026). Три дефекта:
//  1) задачата викаше notifyBot без импорт → нито една роля не изтичаше;
//  2) ролята се четеше от ТЕКУЩИЯ артикул (сменена/изтрита → чужда роля или вечна);
//  3) втора, още валидна покупка на същата роля губеше ролята с първата.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const botNotify = vi.fn();
vi.mock("../services/botNotifier.js", () => ({ notifyBot: (...a) => botNotify(...a) }));

const { expireShopPurchases } = await import("../lib/game/shopExpiry.js");
const NOW = new Date("2026-10-01T12:00:00Z");
const row = (over = {}) => ({ id: "p1", serverId: "S", userId: "U", itemId: null, itemType: "ROLE", roleId: "R1", expiresAt: new Date("2026-10-01T00:00:00Z"), revokedAt: null, ...over });

beforeEach(() => { vi.clearAllMocks(); prismaMock.shopPurchase.update.mockResolvedValue({}); });

describe("изтичане на роли от магазина", () => {
  it("маха ролята от СНИМКАТА на покупката (артикулът е изтрит → itemId null) през истинския notifyBot", async () => {
    prismaMock.shopPurchase.findMany.mockResolvedValueOnce([row()]);
    prismaMock.shopPurchase.count.mockResolvedValueOnce(0);
    botNotify.mockResolvedValueOnce({ ok: true });
    const out = await expireShopPurchases({ now: NOW });
    expect(botNotify).toHaveBeenCalledWith("GAME_ROLE_REVOKE", { serverId: "S", userId: "U", roleId: "R1", purchaseId: "p1" });
    expect(prismaMock.shopPurchase.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { revokedAt: expect.any(Date) } });
    expect(out).toMatchObject({ revoked: 1, kept: 0 });
  });

  it("друга валидна покупка на същата роля → ролята ОСТАВА, покупката само се отбелязва", async () => {
    prismaMock.shopPurchase.findMany.mockResolvedValueOnce([row()]);
    prismaMock.shopPurchase.count.mockResolvedValueOnce(1);
    const out = await expireShopPurchases({ now: NOW });
    expect(botNotify).not.toHaveBeenCalled();
    expect(prismaMock.shopPurchase.update).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ revoked: 1, kept: 1 });
    const where = prismaMock.shopPurchase.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: { not: "p1" }, serverId: "S", userId: "U", roleId: "R1", revokedAt: null });
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: NOW } }]);
  });

  it("ботът е недостъпен → покупката остава неотбелязана за следващото пускане", async () => {
    prismaMock.shopPurchase.findMany.mockResolvedValueOnce([row()]);
    prismaMock.shopPurchase.count.mockResolvedValueOnce(0);
    botNotify.mockResolvedValueOnce({ ok: false });
    const out = await expireShopPurchases({ now: NOW });
    expect(prismaMock.shopPurchase.update).not.toHaveBeenCalled();
    expect(out.revoked).toBe(0);
  });

  it("покупката пази снимка на ролята, а изтриването на артикул НЕ трие покупките", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const buy = readFileSync(join(here, "..", "routes", "bot_game.js"), "utf8");
    expect(buy).toMatch(/shopPurchase\.create\([\s\S]{0,200}roleId:/);
    const sql = readFileSync(join(here, "..", "..", "prisma", "migrations", "20260918000000_v50_server_season", "migration.sql"), "utf8");
    expect(sql).toMatch(/shop_purchases_itemId_fkey"[^;]*ON DELETE SET NULL/);
  });
});
