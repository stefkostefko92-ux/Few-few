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
  messages: (cid, { before, after, threadId, limit = 50 } = {}) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (before) q.set('before', before);
    if (after) q.set('after', after);
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
  notifications: () => api('GET', '/notifications?limit=50'),
  readNotifications: (body) => api('POST', '/notifications/read', body),
  quickResponses: () => api('GET', '/quick-responses'),
  people: (q) => api('GET', `/people?limit=30${q ? `&q=${id(q)}` : ''}`),
  timeline: (caseId) => api('GET', `/cases/${id(caseId)}/timeline`),
  assign: (caseId) => api('POST', `/cases/${id(caseId)}/assign`, {}),
};
