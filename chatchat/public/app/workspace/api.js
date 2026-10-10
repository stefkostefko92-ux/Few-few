// REST към работното пространство (§12.3). Източникът на истината е REST; потокът (SSE) само
// ускорява. Тънки обвивки — без състояние; кеширането е в model.js.

import { api } from '../api.js';

const id = encodeURIComponent;

export const wsApi = {
  conversations: (cursor) =>
    api('GET', `/conversations?limit=100${cursor ? `&cursor=${id(cursor)}` : ''}`),
  publicChannels: () => api('GET', '/conversations?scope=public'),
  conversation: (cid) => api('GET', `/conversations/${id(cid)}`),
  create: (body) => api('POST', '/conversations', body),
  messages: (cid, { before, after, around, threadId, limit = 50 } = {}) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (before) q.set('before', before);
    if (after) q.set('after', after);
    if (around) q.set('around', around);
    if (threadId) q.set('threadId', threadId);
    return api('GET', `/conversations/${id(cid)}/messages?${q}`);
  },
  post: (cid, body) => api('POST', `/conversations/${id(cid)}/messages`, body),
  read: (cid, messageId) => api('POST', `/conversations/${id(cid)}/read`, { messageId }),
  edit: (mid, text) => api('PATCH', `/messages/${id(mid)}`, { text }),
  remove: (mid) => api('DELETE', `/messages/${id(mid)}`),
  react: (mid, reaction, on) =>
    on
      ? api('POST', `/messages/${id(mid)}/reactions`, { reaction })
      : api('DELETE', `/messages/${id(mid)}/reactions?reaction=${id(reaction)}`),
  star: (cid, starred) => api('POST', `/conversations/${id(cid)}/star`, { starred }),
  prefs: (cid, notificationPref) =>
    api('PATCH', `/conversations/${id(cid)}/preferences`, { notificationPref }),
  addMembers: (cid, userIds) => api('POST', `/conversations/${id(cid)}/members`, { userIds }),
  removeMember: (cid, userId) => api('DELETE', `/conversations/${id(cid)}/members/${id(userId)}`),
  caseConversation: (caseId) => api('POST', `/cases/${id(caseId)}/conversation`, {}),
  presence: (userIds) => api('GET', `/presence?userIds=${userIds.map(id).join(',')}`),
  heartbeat: (status) => api('POST', '/presence/heartbeat', { status }),
  notifications: (cursor) =>
    api('GET', `/notifications?limit=50${cursor ? `&cursor=${id(cursor)}` : ''}`),
  readNotifications: (body) => api('POST', '/notifications/read', body),
  notificationPrefs: (body) => api('PATCH', '/notifications/preferences', body),
  // Търсене (FR-16) и действията по съобщение (§12.1).
  search: (q, cursor) =>
    api('GET', `/search/messages?q=${id(q)}&limit=20${cursor ? `&cursor=${id(cursor)}` : ''}`),
  markUnread: (mid) => api('POST', `/messages/${id(mid)}/unread`, {}),
  mark: (mid, kind, on) => api(on ? 'PUT' : 'DELETE', `/messages/${id(mid)}/marks/${kind}`),
  marked: (kind, cursor) =>
    api('GET', `/messages/marked?kind=${kind}&limit=30${cursor ? `&cursor=${id(cursor)}` : ''}`),
  quickResponses: () => api('GET', '/quick-responses'),
  people: (q) => api('GET', `/people?limit=30${q ? `&q=${id(q)}` : ''}`),
  timeline: (caseId) => api('GET', `/cases/${id(caseId)}/timeline`),
  assign: (caseId) => api('POST', `/cases/${id(caseId)}/assign`, {}),
};
