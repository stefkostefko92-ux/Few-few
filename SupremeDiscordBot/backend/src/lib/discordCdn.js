// backend/src/lib/discordCdn.js
// Едно определение за адреса на сървърната иконка.
//
// ДЕФЕКТЪТ (продукция, 07.08.2026): полето `icon` живееше в ДВЕ представи.
// `GET /api/servers` строеше пълен CDN адрес от Discord OAuth отговора, а всичко
// друго връщаше СУРОВИЯ хеш от базата (ботът го записва такъв —
// `bot/src/utils/api.js` праща `guild.icon`). Фронтендът рисува `<img src={…}>`
// на три места и приемаше „URL" навсякъде.
//
// Хеш в `src` е ОТНОСИТЕЛЕН адрес. Понеже фронтендът е SPA (`try_files …
// /index.html`), браузърът получава **200 с index.html** вместо картинка —
// затова иконките излизаха като счупени квадратчета и в герба на сървъра, и в
// списъка на агенцията. Нито 404, нито грешка в конзолата на сървъра: тих провал.
//
// Затова: API-то ВИНАГИ връща адрес или `null`. Никога хеш.

// Discord icon хешовете са 32 hex знака, анимираните с префикс `a_`. Валидираме,
// защото стойността влиза в URL: непозната форма → `null`, не „сглоби каквото
// дойде". (Фронтендът вече има fallback с първата буква от името.)
const ICON_HASH = /^(a_)?[a-f0-9]{32}$/i;

/**
 * @param {string} guildId  Discord snowflake на сървъра
 * @param {string|null} icon  хеш от базата (или вече готов адрес)
 * @param {number} [size]  128 по подразбиране; Discord приема степени на двойката
 * @returns {string|null}
 */
export function guildIconUrl(guildId, icon, size = 128) {
  if (!icon || typeof icon !== "string") return null;
  // Идемпотентност: ако някой вече е подал адрес, не го строим втори път.
  if (/^https:\/\/cdn\.discordapp\.com\//.test(icon)) return icon;
  if (!ICON_HASH.test(icon)) return null;
  if (!/^\d{5,25}$/.test(String(guildId || ""))) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

/** Същото, но върху обект `{ id, icon, … }` — връща НОВ обект. */
export function withIconUrl(row, size = 128) {
  if (!row) return row;
  return { ...row, icon: guildIconUrl(row.id, row.icon, size) };
}
