// bot/src/events/guildBanRemove.js
// Server Event Logging — category "moderation", action "member_unban".
// Изисква GatewayIntentBits.GuildModeration.
// Актьор best-effort от audit log (MemberBanRemove). Закача се и на white-label.

import { logServerEvent, fetchAuditActor, AuditLogEvent } from "../utils/serverEventLog.js";

function tagOf(user) {
  if (!user) return null;
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

export default {
  name: "guildBanRemove",
  once: false,
  async execute(ban) {
    try {
      const guild = ban.guild;
      if (!guild?.id) return;

      const targetId = ban.user?.id;
      if (!targetId) return;

      const actor = await fetchAuditActor(guild, AuditLogEvent.MemberBanRemove, targetId);

      await logServerEvent(ban.client, guild, {
        category: "moderation",
        action: "member_unban",
        targetId,
        targetTag: tagOf(ban.user),
        actorId: actor?.executorId || null,
        actorTag: actor?.executorTag || null,
        metadata: actor?.reason ? { reason: actor.reason } : null,
      });
    } catch (err) {
      console.warn(`[guildBanRemove] error: ${err?.message}`);
    }
  },
};
