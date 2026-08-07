// bot/src/events/guildBanAdd.js
// Server Event Logging — category "moderation", action "member_ban".
// Изисква GatewayIntentBits.GuildModeration.
// Актьор + reason best-effort от audit log (MemberBanAdd). Закача се и на
// white-label клиентите.

import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";

function tagOf(user) {
  if (!user) return null;
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

export default {
  name: "guildBanAdd",
  once: false,
  async execute(ban) {
    try {
      const guild = ban.guild;
      if (!guild?.id) return;

      // Гейт ПРЕДИ audit-log fetch (rate limit) — виж messageDelete.
      if (!(await isEventCategoryEnabled(guild.id, "moderation"))) return;

      const targetId = ban.user?.id;
      if (!targetId) return;

      const actor = await fetchAuditActor(guild, AuditLogEvent.MemberBanAdd, targetId);
      // ban.reason е налично директно от Discord (ако е подадено при бана).
      const reason = ban.reason || actor?.reason || null;

      await logServerEvent(ban.client, guild, {
        category: "moderation",
        action: "member_ban",
        targetId,
        targetTag: tagOf(ban.user),
        actorId: actor?.executorId || null,
        actorTag: actor?.executorTag || null,
        metadata: reason ? { reason } : null,
      });
    } catch (err) {
      console.warn(`[guildBanAdd] error: ${err?.message}`);
    }
  },
};
