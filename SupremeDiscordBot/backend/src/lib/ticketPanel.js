// backend/src/lib/ticketPanel.js
// Т5 — ЕДИН изчистен по план панел за тикет маршрутите на бота.
//
// ДЕФЕКТЪТ: `GET /bot/ticket/by-channel` връщаше панел само със `supportRoleIds`
// (затова `/ticket close` и `/escalate` работеха с непълен панел), а
// `GET /bot/ticket/:id` — суров, неизчистен панел (свален на Free сървър
// продължаваше да праща платени ЛС/оценка/категория). Тук е един път.
import { prisma } from "./prisma.js";
import { getServerTier, sanitizePanelForTier } from "./premium.js";

/**
 * Т19: „Лог канал“ на сървъра (`Server.logChannelId`) е РЕЗЕРВЕН за панела — точно като
 * `archiveChannelId` за транскриптите. Панел без свой лог канал ползва този на сървъра;
 * собственият печели. Преди това настройката не се четеше от никого.
 * Едно място: викат го всички пътища, които дават панел на бота.
 */
export function withServerLogFallback(panel, serverLogChannelId) {
  if (panel && !panel.logChannelId) panel.logChannelId = serverLogChannelId || null;
  return panel;
}

/**
 * Зарежда панел (без бутони) и го чисти по ефективния план на сървъра.
 * Изолация: ако е подаден `serverId`, панелът трябва да е от него.
 * @returns {Promise<object|null>}
 */
export async function loadSanitizedPanel(panelId, serverId) {
  if (!panelId) return null;
  const panel = await prisma.panel.findFirst({
    where: { id: panelId, ...(serverId && { serverId }) },
  });
  if (!panel) return null;
  const tier = await getServerTier(panel.serverId);
  // Чистим само при ЗНАЕН план (виж коментара в GET /bot/panel/:id).
  if (tier?.plan) sanitizePanelForTier(panel, tier.plan);
  if (!panel.logChannelId) {
    const srv = await prisma.server.findUnique({ where: { id: panel.serverId }, select: { logChannelId: true } }).catch(() => null);
    withServerLogFallback(panel, srv?.logChannelId);
  }
  return panel;
}

/** Тикет + изчистения му панел (`ticket.panel`). */
export async function withSanitizedPanel(ticket) {
  if (!ticket) return ticket;
  const panel = ticket.panelId ? await loadSanitizedPanel(ticket.panelId, ticket.serverId) : null;
  return { ...ticket, panel };
}
