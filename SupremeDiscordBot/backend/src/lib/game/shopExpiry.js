// backend/src/lib/game/shopExpiry.js
// Изтичане на временните роли от магазина (v50). Изнесено от scheduler.js,
// за да има поведенчески тест: вътре в задачата `notifyBot` се викаше БЕЗ
// импорт (останалите задачи го импортират динамично) — първата изтекла роля
// хвърляше ReferenceError и нито една временна роля не се махаше никога
// (визуален/агентски одит 25.09.2026).
import { prisma } from "../prisma.js";
import { notifyBot as defaultNotify } from "../../services/botNotifier.js";

/**
 * Маха изтеклите роли и отбелязва покупките като изтекли.
 * - Ролята е СНИМКАТА от покупката (`roleId`), не текущата роля на артикула:
 *   смяна или изтриване на артикула вече не маха чужда роля и не оставя вечна.
 * - Друга, още валидна покупка на същата роля → ролята остава, тази покупка
 *   само се отбелязва (иначе вторият платен срок изгаряше).
 * - Ботът недостъпен → покупката остава за следващото пускане (идемпотентно).
 */
export async function expireShopPurchases({ now = new Date(), notify = defaultNotify, take = 200 } = {}) {
  const due = await prisma.shopPurchase.findMany({
    where: { expiresAt: { lte: now }, revokedAt: null },
    orderBy: { expiresAt: "asc" },
    take,
  });
  let revoked = 0;
  let kept = 0;
  for (const p of due) {
    if (p.itemType === "ROLE" && p.roleId) {
      const stillPaid = await prisma.shopPurchase.count({
        where: {
          id: { not: p.id }, serverId: p.serverId, userId: p.userId, roleId: p.roleId, revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      if (stillPaid) {
        kept++;
      } else {
        const r = await notify("GAME_ROLE_REVOKE", { serverId: p.serverId, userId: p.userId, roleId: p.roleId, purchaseId: p.id });
        if (!r?.ok) continue;
      }
    }
    await prisma.shopPurchase.update({ where: { id: p.id }, data: { revokedAt: new Date() } });
    revoked++;
  }
  return { due: due.length, revoked, kept };
}
