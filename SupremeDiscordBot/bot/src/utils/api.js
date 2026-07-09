// bot/src/utils/api.js
import axios from "axios";

// API_SECRET е споделената тайна между бота и backend-а. Никога не падаме на
// слаб дефолт ("changeme") — това би оставило internal API-то отворено, ако
// тайната не е зададена. Fail-fast при стартиране вместо мълчалива несигурност.
const API_SECRET = process.env.API_SECRET;
if (!API_SECRET) {
  throw new Error("API_SECRET е задължителен (липсва в средата) — спирам стартирането.");
}

const api = axios.create({
  baseURL: process.env.API_URL || "http://localhost:3000/api",
  headers: { "x-bot-secret": API_SECRET },
  timeout: 10000,
});

export default api;

// Convenience helpers

export async function getServer(serverId) {
  const { data } = await api.get(`/bot/server/${serverId}`);
  return data;
}

export async function registerServer(guild) {
  const { data } = await api.post("/bot/server/register", {
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    ownerId: guild.ownerId,
  });
  return data;
}

export async function createTicket(serverId, panelId, creatorId, channelId, firstMessage) {
  try {
    const { data } = await api.post("/bot/ticket/create", {
      serverId, panelId, creatorId, channelId,
      firstMessage: firstMessage || null,
    });
    return data;
  } catch (err) {
    // Return the error payload so caller can handle maxOpenPerUser gracefully
    if (err?.response?.data?.code) return err.response.data;
    throw err;
  }
}

export async function logTicketMessage(ticketId, authorId, authorTag, content, attachments = []) {
  const { data } = await api.post(`/bot/ticket/${ticketId}/message`, {
    authorId, authorTag, content, attachments,
  });
  return data;
}

export async function closeTicketApi(ticketId, closedById, reason) {
  const { data } = await api.post(`/bot/ticket/${ticketId}/close`, { closedById, reason });
  return data;
}

export async function submitApplication(serverId, formId, userId, answers, reviewMessageId, reviewChannelId) {
  const { data } = await api.post("/bot/application/submit", {
    serverId, formId, userId, answers, reviewMessageId, reviewChannelId,
  });
  return data;
}

export async function getPanel(panelId) {
  const { data } = await api.get(`/bot/panel/${panelId}`);
  return data;
}

export async function markPanelSpawned(panelId, channelId, messageId) {
  const { data } = await api.patch(`/bot/panel/${panelId}/spawned`, { channelId, messageId });
  return data;
}

export async function updateApplicationReviewMessage(appId, reviewMessageId, reviewChannelId) {
  const { data } = await api.patch(`/bot/application/${appId}`, { reviewMessageId, reviewChannelId });
  return data;
}

export async function isBlacklisted(userId) {
  const { data } = await api.get(`/bot/user/${userId}/blacklisted`);
  return data.blacklisted;
}

// Native Discord monetization — forward a gateway entitlement event to the
// backend (mounted at /api/discord). `type` is "create" | "update" | "delete".
// The x-bot-secret header is already set on the `api` instance, so only the bot
// can grant/revoke Premium this way. Fields map from the discord.js Entitlement.
export async function sendEntitlement(type, entitlement) {
  const { data } = await api.post("/discord/entitlement", {
    type,
    entitlement: {
      id: entitlement.id,
      skuId: entitlement.skuId,
      guildId: entitlement.guildId ?? null,
      userId: entitlement.userId ?? null,
      endsAt: entitlement.endsTimestamp ?? null,
    },
  });
  return data;
}

// Startup convergence: POST the application's FULL active entitlement list so
// the backend can grant anything missed while offline and revoke servers whose
// entitlement expired/was refunded meanwhile. Discord never redelivers
// entitlement gateway events, so this sweep is the source of truth on boot.
export async function reconcileEntitlements(entitlements) {
  const { data } = await api.post("/discord/entitlements/reconcile", {
    entitlements: entitlements.map((e) => ({
      id: e.id,
      skuId: e.skuId,
      guildId: e.guildId ?? null,
      userId: e.userId ?? null,
      endsAt: e.endsTimestamp ?? null,
    })),
  });
  return data;
}
