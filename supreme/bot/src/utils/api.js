// bot/src/utils/api.js
import axios from "axios";

const api = axios.create({
  baseURL: process.env.API_URL || "http://localhost:3000/api",
  headers: { "x-bot-secret": process.env.API_SECRET || "changeme" },
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
