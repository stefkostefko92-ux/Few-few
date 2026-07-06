// bot/src/utils/ticketCaches.js
// Споделени кешове за тикет-канали и sticky съобщения, ползвани от event
// модулите messageCreate/channelDelete. Живеят на ниво процес — споделят се
// между главния клиент и всеки white-label клиент.
//
// Изнесени тук (от index.js), за да могат messageCreate и channelDelete да
// бъдат самостоятелни event модули под /events/ (loadEventModules чете само
// /events/) и така да се закачат И на главния, И на всеки white-label клиент.

// Кеш на Discord канал ID-та, които са активни тикети (изтича след 10 мин).
// channelId → { ticketId, expiresAt }
export const ticketChannelCache = new Map();
export const CACHE_TTL = 10 * 60 * 1000; // 10 минути

// Sticky справките също се кешират — без това всяко съобщение в guild-а бие
// backend GET, което удря API rate limiter-а на скалата.
// channelId → { sticky, expiresAt }
export const stickyCache = new Map();
export const STICKY_CACHE_TTL = 60 * 1000; // 1 минута — dashboard промените се разпространяват бързо

// Периодично почистване, за да не растат кешовете безкрайно за канали, които
// повече не получават съобщение (бавен memory leak при големи ботове).
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ticketChannelCache) if (v.expiresAt <= now) ticketChannelCache.delete(k);
  for (const [k, v] of stickyCache) if (v.expiresAt <= now) stickyCache.delete(k);
}, CACHE_TTL).unref();
