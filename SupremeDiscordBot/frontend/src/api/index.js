// frontend/src/api/index.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const isAuthCheck = err.config?.url?.includes("/auth/me");
      const isLoginPage = window.location.pathname === "/";
      if (!isAuthCheck && !isLoginPage) {
        window.location.href = "/";
      }
    }
    // v1.9 — Premium enforcement: broadcast a global event so any component
    // can show an upgrade prompt. Toast listener (PremiumToast) is mounted in Layout.jsx.
    if (err.response?.status === 403 && err.response?.data?.code === "PREMIUM_REQUIRED") {
      window.dispatchEvent(new CustomEvent("premium-required", {
        detail: err.response.data,
      }));
    }
    if (err.response?.status === 403 && err.response?.data?.code === "LIMIT_REACHED") {
      window.dispatchEvent(new CustomEvent("limit-reached", {
        detail: err.response.data,
      }));
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const getMe = () => api.get("/auth/me").then((r) => r.data);
// Обновява предпочитания на акаунта (език) — изборът пътува с потребителя.
export const updateMe = (data) => api.patch("/auth/me", data).then((r) => r.data);
export const logout = () => api.post("/auth/logout");

// ─── Servers ──────────────────────────────────────────────────────────────────
export const getServers = () => api.get("/servers").then((r) => r.data);
export const getServer = (id) => api.get(`/servers/${id}`).then((r) => r.data);
export const updateServer = (id, data) => api.patch(`/servers/${id}`, data).then((r) => r.data);

// ─── Panels ───────────────────────────────────────────────────────────────────
export const getPanels = (serverId) => api.get(`/panels/${serverId}`).then((r) => r.data);
export const createPanel = (serverId, data) => api.post(`/panels/${serverId}`, data).then((r) => r.data);
export const updatePanel = (serverId, panelId, data) => api.put(`/panels/${serverId}/${panelId}`, data).then((r) => r.data);
export const deletePanel = (serverId, panelId) => api.delete(`/panels/${serverId}/${panelId}`).then((r) => r.data);
export const spawnPanel = (serverId, panelId, channelId) =>
  api.post(`/panels/${serverId}/${panelId}/spawn`, { channelId }).then((r) => r.data);

// Няколко панела в ЕДНО съобщение (до 10 embed-а / 5 реда — таваните на Discord).
export const spawnPanelGroup = (serverId, panelIds, channelId, mode = "DROPDOWN") =>
  api.post(`/panels/${serverId}/spawn-group`, { panelIds, channelId, mode }).then((r) => r.data);

// ─── Forms ────────────────────────────────────────────────────────────────────
export const getForms = (serverId) => api.get(`/forms/${serverId}`).then((r) => r.data);
export const createForm = (serverId, data) => api.post(`/forms/${serverId}`, data).then((r) => r.data);
export const updateForm = (serverId, formId, data) => api.put(`/forms/${serverId}/${formId}`, data).then((r) => r.data);
export const deleteForm = (serverId, formId, force = false) =>
  api.delete(`/forms/${serverId}/${formId}${force ? "?force=true" : ""}`).then((r) => r.data);
export const spawnForm = (serverId, formId, channelId) =>
  api.post(`/forms/${serverId}/${formId}/spawn`, { channelId }).then((r) => r.data);

// ─── Reaction Roles (v33) ─────────────────────────────────────────────────────
export const getReactionRoles = (serverId) => api.get(`/reactionroles/${serverId}`).then((r) => r.data);
export const createReactionRole = (serverId, data) => api.post(`/reactionroles/${serverId}`, data).then((r) => r.data);
export const updateReactionRole = (serverId, id, data) => api.put(`/reactionroles/${serverId}/${id}`, data).then((r) => r.data);
export const deleteReactionRole = (serverId, id) => api.delete(`/reactionroles/${serverId}/${id}`).then((r) => r.data);
export const spawnReactionRole = (serverId, id, channelId) =>
  api.post(`/reactionroles/${serverId}/${id}/spawn`, { channelId }).then((r) => r.data);

// ─── Tickets ──────────────────────────────────────────────────────────────────
export const getTickets = (serverId, params) => api.get(`/tickets/${serverId}`, { params }).then((r) => r.data);
export const closeTicket = (serverId, ticketId, reason) =>
  api.post(`/tickets/${serverId}/${ticketId}/close`, { reason }).then((r) => r.data);
export const claimTicket = (serverId, ticketId) =>
  api.post(`/tickets/${serverId}/${ticketId}/claim`).then((r) => r.data);
export const replyToTicket = (serverId, ticketId, content) =>
  api.post(`/tickets/${serverId}/${ticketId}/reply`, { content }).then((r) => r.data);

// ─── Applications ─────────────────────────────────────────────────────────────
export const getApplications = (serverId, params) =>
  api.get(`/applications/${serverId}`, { params }).then((r) => r.data);
export const getApplication = (serverId, appId) =>
  api.get(`/applications/${serverId}/${appId}`).then((r) => r.data);
export const reviewApplication = (serverId, appId, action, note) =>
  api.post(`/applications/${serverId}/${appId}/review`, { action, note }).then((r) => r.data);

// ─── Admin ────────────────────────────────────────────────────────────────────
export const getAnalytics = () => api.get("/admin/analytics").then((r) => r.data);
// Единственият източник на приходни числа (MRR/ARPU/churn/trial фуния).
export const getRevenue = () => api.get("/admin/revenue").then((r) => r.data);
export const getAdminUsers = (params) => api.get("/admin/users", { params }).then((r) => r.data);
export const getAdminUser = (userId) => api.get(`/admin/users/${userId}`).then((r) => r.data);
export const updateUserRole = (userId, role) =>
  api.patch(`/admin/users/${userId}/role?confirm=true`, { role }).then((r) => r.data);
export const setUserBlacklisted = (userId, blacklisted) =>
  api.patch(`/admin/users/${userId}/blacklist?confirm=true`, { blacklisted }).then((r) => r.data);
export const getAdminServers = (params) => api.get("/admin/servers", { params }).then((r) => r.data);
export const getAdminServer = (serverId) => api.get(`/admin/servers/${serverId}`).then((r) => r.data);
export const updateAdminServer = (serverId, data) => api.patch(`/admin/servers/${serverId}`, data).then((r) => r.data);
export const deleteAdminServer = (serverId) => api.delete(`/admin/servers/${serverId}?confirm=true`).then((r) => r.data);
export const resetAdminServer = (serverId) => api.post(`/admin/servers/${serverId}/reset?confirm=true`).then((r) => r.data);
export const broadcastToServer = (serverId, channelId, title, message) =>
  api.post(`/admin/servers/${serverId}/broadcast`, { channelId, title, message }).then((r) => r.data);
export const setServerPlan = (serverId, plan, reason) =>
  api.patch(`/admin/servers/${serverId}/plan`, { plan, reason }).then((r) => r.data);
export const deleteAdminUser = (userId) => api.delete(`/admin/users/${userId}?confirm=true`).then((r) => r.data);
export const deleteAdminPayment = (paymentId) => api.delete(`/admin/payments/${paymentId}?confirm=true`).then((r) => r.data);
export const purgeAuditLogs = (olderThanDays) =>
  api.post("/admin/audit-logs/purge", { olderThanDays }).then((r) => r.data);
export const getPayments = (params) => api.get("/admin/payments", { params }).then((r) => r.data);
export const getAuditLogs = (params) => api.get("/admin/audit-logs", { params }).then((r) => r.data);

// ─── Stripe ───────────────────────────────────────────────────────────────────
// serverId е PATH параметър (минава през requireServerAdmin authz на backend-а).
// v3.0 — body носи plan ("premium" | "whitelabel"), interval ("month" | "year")
// и withdrawalConsent (чл. 16(а) — задължително преди checkout).
export const openPortal = (serverId) =>
  api.post(`/stripe/portal/${serverId}`).then((r) => r.data);
export const getStripeStatus = (serverId) =>
  api.get(`/stripe/status/${serverId}`).then((r) => r.data);

// v3.0 — Agency планове (до 5 / до 10 сървъра, един абонамент). Отделен
// endpoint, добавян от друг workstream; тук само окабеляваме извикването.
// plan: "agency5" | "agency10"; interval: "month" | "year".
export const createAgencyCheckout = (body = {}) =>
  api.post(`/agency/checkout`, body).then((r) => r.data);

// Agency управление (собственикът на агенцията): моят план + seats,
// закачане/махане на сървър seat, Stripe billing portal на агенцията.
export const getMyAgency = () => api.get(`/agency/mine`).then((r) => r.data);
export const attachAgencyServer = (agencyId, serverId) =>
  api.post(`/agency/${agencyId}/servers/${serverId}`).then((r) => r.data);
export const detachAgencyServer = (agencyId, serverId) =>
  api.delete(`/agency/${agencyId}/servers/${serverId}`).then((r) => r.data);
export const openAgencyPortal = () => api.post(`/agency/portal`).then((r) => r.data);

// ─── Export (Premium) ─────────────────────────────────────────────────────────
// These return Blob URLs for direct download — use with an anchor tag.

export async function exportTicketsCSV(serverId) {
  const res = await api.get(`/export/${serverId}/tickets`, { responseType: "blob" });
  return res.data;
}

export async function exportApplicationsCSV(serverId) {
  const res = await api.get(`/export/${serverId}/applications`, { responseType: "blob" });
  return res.data;
}

export async function exportTicketPDF(serverId, ticketId) {
  const res = await api.get(`/export/${serverId}/ticket/${ticketId}/pdf`, { responseType: "blob" });
  return res.data;
}

// ─── v1.7 Verification ────────────────────────────────────────────────────────
export const getVerificationPanels = (serverId) =>
  api.get(`/verification/${serverId}`).then((r) => r.data);
export const createVerificationPanel = (serverId, data) =>
  api.post(`/verification/${serverId}`, data).then((r) => r.data);
export const updateVerificationPanel = (serverId, panelId, data) =>
  api.put(`/verification/${serverId}/${panelId}`, data).then((r) => r.data);
export const deleteVerificationPanel = (serverId, panelId) =>
  api.delete(`/verification/${serverId}/${panelId}`).then((r) => r.data);
export const spawnVerificationPanel = (serverId, panelId, channelId) =>
  api.post(`/verification/${serverId}/${panelId}/spawn`, { channelId }).then((r) => r.data);

// ─── v1.8 Panel duplicate + Webhooks ──────────────────────────────────────────
export const duplicatePanel = (serverId, panelId) =>
  api.post(`/${serverId}/panels/${panelId}/duplicate`).then((r) => r.data);

export const getWebhooks = (serverId) =>
  api.get(`/${serverId}/webhooks`).then((r) => r.data);
export const createWebhook = (serverId, data) =>
  api.post(`/${serverId}/webhooks`, data).then((r) => r.data);
export const updateWebhook = (serverId, id, data) =>
  api.put(`/${serverId}/webhooks/${id}`, data).then((r) => r.data);
export const deleteWebhook = (serverId, id) =>
  api.delete(`/${serverId}/webhooks/${id}`).then((r) => r.data);
export const getWebhookEvents = () => api.get(`/events`).then((r) => r.data);

// ─── v32 Knowledge Base ────────────────────────────────────────────────────
export const getKbArticles = (serverId) =>
  api.get(`/kb/${serverId}`).then((r) => r.data);
export const createKbArticle = (serverId, data) =>
  api.post(`/kb/${serverId}`, data).then((r) => r.data);
export const updateKbArticle = (serverId, id, data) =>
  api.put(`/kb/${serverId}/${id}`, data).then((r) => r.data);
export const toggleKbArticle = (serverId, id) =>
  api.post(`/kb/${serverId}/${id}/toggle`).then((r) => r.data);
export const deleteKbArticle = (serverId, id) =>
  api.delete(`/kb/${serverId}/${id}`).then((r) => r.data);

// ─── v1.8 Automation (polls, giveaways, sticky, scheduled, webhooks) ──────────
export const getCommandsCatalog = () =>
  api.get(`/automation/commands-catalog`).then((r) => r.data);
export const getPremiumCatalog = () =>
  api.get(`/automation/premium-catalog`).then((r) => r.data);

export const getPolls       = (sid) => api.get(`/automation/${sid}/polls`).then((r) => r.data);
export const createPoll     = (sid, data) => api.post(`/automation/${sid}/polls`, data).then((r) => r.data);
export const closePoll      = (sid, id) => api.post(`/automation/${sid}/polls/${id}/close`).then((r) => r.data);
export const deletePoll     = (sid, id) => api.delete(`/automation/${sid}/polls/${id}`).then((r) => r.data);

export const getGiveaways   = (sid) => api.get(`/automation/${sid}/giveaways`).then((r) => r.data);
export const createGiveaway = (sid, data) => api.post(`/automation/${sid}/giveaways`, data).then((r) => r.data);
export const endGiveaway    = (sid, id) => api.post(`/automation/${sid}/giveaways/${id}/end`).then((r) => r.data);
export const rerollGiveaway = (sid, id) => api.post(`/automation/${sid}/giveaways/${id}/reroll`).then((r) => r.data);
export const deleteGiveaway = (sid, id) => api.delete(`/automation/${sid}/giveaways/${id}`).then((r) => r.data);

export const getStickies    = (sid) => api.get(`/automation/${sid}/stickies`).then((r) => r.data);
export const upsertSticky   = (sid, data) => api.post(`/automation/${sid}/stickies`, data).then((r) => r.data);
export const deleteSticky   = (sid, channelId) => api.delete(`/automation/${sid}/stickies/${channelId}`).then((r) => r.data);

export const getScheduled   = (sid) => api.get(`/automation/${sid}/scheduled`).then((r) => r.data);
export const createScheduled= (sid, data) => api.post(`/automation/${sid}/scheduled`, data).then((r) => r.data);
export const deleteScheduled= (sid, id) => api.delete(`/automation/${sid}/scheduled/${id}`).then((r) => r.data);

// ─── v2.0 Trial ─────────────────────────────────────────────────────────────
export const getTrialStatus = (sid) => api.get(`/trial/${sid}`).then((r) => r.data);
export const startTrial     = (sid) => api.post(`/trial/${sid}/start`).then((r) => r.data);

// ─── v2.1 Analytics 2.0 ────────────────────────────────────────────────────
export const getAnalyticsOverview    = (sid) => api.get(`/analytics/${sid}/overview`).then((r) => r.data);
export const getAnalyticsHeatmap     = (sid) => api.get(`/analytics/${sid}/heatmap`).then((r) => r.data);
export const getAnalyticsLeaderboard = (sid) => api.get(`/analytics/${sid}/leaderboard`).then((r) => r.data);
export const getAnalyticsFunnel      = (sid) => api.get(`/analytics/${sid}/funnel`).then((r) => r.data);
export const getAnalyticsTimeseries  = (sid, from, to, metric) =>
  api.get(`/analytics/${sid}/timeseries`, { params: { from, to, metric } }).then((r) => r.data);


// ─── v2.1 Public API keys ──────────────────────────────────────────────────
export const getApiKeys     = (sid) => api.get(`/apikeys/${sid}/api-keys`).then((r) => r.data);
export const createApiKey   = (sid, data) => api.post(`/apikeys/${sid}/api-keys`, data).then((r) => r.data);
export const revokeApiKey   = (sid, id) => api.delete(`/apikeys/${sid}/api-keys/${id}`).then((r) => r.data);
export const getApiScopes   = () => api.get(`/apikeys/scopes`).then((r) => r.data);

// ─── v2.1 Status ───────────────────────────────────────────────────────────
export const getStatus = () => api.get(`/status`).then((r) => r.data);
// Overview екранът — един call вместо пет (KPI + серия + разпределение + SLA)
export const getDashboard = (serverId, days = 14) =>
  api.get(`/analytics/${serverId}/dashboard`, { params: { days } }).then((r) => r.data);

// ─── v2.1 Application delete ────────────────────────────────────────────────
export const deleteApplication = (sid, appId) =>
  api.delete(`/applications/${sid}/${appId}`).then((r) => r.data);

// ─── v2.2 Application discussion ─────────────────────────────────────────────
export const openApplicationDiscussion = (sid, appId) =>
  api.post(`/applications/${sid}/${appId}/discuss`).then((r) => r.data);

// ─── v2.2 Trial cancellation ────────────────────────────────────────────────
export const cancelTrial = (sid) => api.post(`/trial/${sid}/cancel`).then((r) => r.data);
