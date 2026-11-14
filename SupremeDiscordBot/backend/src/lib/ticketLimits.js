// backend/src/lib/ticketLimits.js
// Т12 — лимитът на отворени тикети като ЕДНА функция: ползва се и от
// `POST /bot/ticket/create` (авторитетна проверка), и от предварителната
// проверка преди ботът да създаде канал (без създаване-и-триене при отказ).
import { prisma } from "./prisma.js";

/**
 * @returns {Promise<{allowed:true}|{allowed:false, code:"MAX_TICKETS_REACHED"|"PANEL_LIMIT_REACHED", count:number, max:number, panelName?:string}>}
 */
export async function checkTicketLimits(db, { serverId, panelId, creatorId, panel }) {
  const client = db || prisma;
  const maxOpen = panel?.maxOpenPerUser ?? 1;
  const openCount = await client.ticket.count({
    where: { serverId, creatorId, status: { in: ["OPEN", "CLAIMED"] } },
  });
  if (openCount >= maxOpen) {
    return { allowed: false, code: "MAX_TICKETS_REACHED", count: openCount, max: maxOpen };
  }
  if (panel?.maxOpenPerUserPanel && panelId) {
    const panelOpenCount = await client.ticket.count({
      where: { panelId, creatorId, status: { in: ["OPEN", "CLAIMED"] } },
    });
    if (panelOpenCount >= panel.maxOpenPerUserPanel) {
      return {
        allowed: false, code: "PANEL_LIMIT_REACHED",
        count: panelOpenCount, max: panel.maxOpenPerUserPanel, panelName: panel.name,
      };
    }
  }
  return { allowed: true };
}
