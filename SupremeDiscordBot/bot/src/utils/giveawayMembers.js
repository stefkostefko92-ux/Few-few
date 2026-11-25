// bot/src/utils/giveawayMembers.js
// А4: кои от подадените участници още са в сървъра (за тегленето на победители).
//
// GDPR/Discord: НЕ теглим списъка с членове. Питаме Discord само за конкретните
// id-та на участниците в раздаването (`members.fetch({ user: [...] })`, ≤100 на
// заявка) — това е минимумът, нужен, за да не спечели човек, напуснал сървъра.
const SNOWFLAKE = /^\d{17,20}$/;
export const MEMBERS_CHECK_MAX = 100;

/**
 * @param {import('discord.js').Guild} guild
 * @param {unknown[]} userIds
 * @returns {Promise<string[]|null>} присъстващите id-та; null = не мога да разбера (викащият е fail-open)
 */
export async function presentMembers(guild, userIds) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).filter((x) => typeof x === "string" && SNOWFLAKE.test(x)))]
    .slice(0, MEMBERS_CHECK_MAX);
  if (!ids.length) return [];
  try {
    const found = await guild.members.fetch({ user: ids });
    return ids.filter((id) => found.has(id));
  } catch {
    return null;
  }
}
