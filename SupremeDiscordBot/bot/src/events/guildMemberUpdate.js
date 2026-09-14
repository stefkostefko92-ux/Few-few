// bot/src/events/guildMemberUpdate.js
// Server Event Logging — category "members". Diff-ва old/new member и логва:
//   role_add / role_remove (metadata.roleIds), nickname_change (before/after),
//   timeout_add / timeout_remove (communicationDisabledUntil).
// Изисква GatewayIntentBits.GuildMembers (вече наличен).
//
// Актьорът е best-effort от audit log — само при реална промяна, за да не
// хабим fetchAuditLogs rate limit-а. Закача се и на white-label клиентите.

import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";

function tagOf(user) {
  if (!user) return null;
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

const isTimedOut = (ts) => typeof ts === "number" && ts > Date.now();

export default {
  name: "guildMemberUpdate",
  once: false,
  async execute(oldMember, newMember) {
    try {
      const guild = newMember.guild || oldMember.guild;
      if (!guild?.id) return;

      // Гейт ПРЕДИ audit-log fetch (rate limit) — виж messageDelete.
      if (!(await isEventCategoryEnabled(guild.id, "members"))) return;

      const client = newMember.client;
      const targetId = newMember.id;
      const targetTag = tagOf(newMember.user);
      const base = { category: "members", targetId, targetTag };

      // ─── 1. Роли добавени / премахнати ──────────────────────────────────────
      const oldRoles = oldMember.roles?.cache;
      const newRoles = newMember.roles?.cache;
      if (oldRoles && newRoles) {
        const added = [...newRoles.keys()].filter((id) => !oldRoles.has(id));
        const removed = [...oldRoles.keys()].filter((id) => !newRoles.has(id));

        if (added.length || removed.length) {
          // Един audit-log fetch покрива и добавени, и премахнати роли.
          const actor = await fetchAuditActor(guild, AuditLogEvent.MemberRoleUpdate, targetId);
          const actorFields = {
            actorId: actor?.executorId || null,
            actorTag: actor?.executorTag || null,
          };
          if (added.length) {
            await logServerEvent(client, guild, { ...base, action: "role_add", ...actorFields, metadata: { roleIds: added } });
          }
          if (removed.length) {
            await logServerEvent(client, guild, { ...base, action: "role_remove", ...actorFields, metadata: { roleIds: removed } });
          }
        }
      }

      // ─── 2. Никнейм промяна ─────────────────────────────────────────────────
      if (oldMember.nickname !== newMember.nickname) {
        const actor = await fetchAuditActor(guild, AuditLogEvent.MemberUpdate, targetId);
        await logServerEvent(client, guild, {
          ...base,
          action: "nickname_change",
          actorId: actor?.executorId || null,
          actorTag: actor?.executorTag || null,
          metadata: {
            before: oldMember.nickname || "(none)",
            after: newMember.nickname || "(none)",
          },
        });
      }

      // ─── 3. Timeout (communication disabled) ────────────────────────────────
      const oldTs = oldMember.communicationDisabledUntilTimestamp;
      const newTs = newMember.communicationDisabledUntilTimestamp;
      const wasOut = isTimedOut(oldTs);
      const isOut = isTimedOut(newTs);
      if (wasOut !== isOut) {
        const actor = await fetchAuditActor(guild, AuditLogEvent.MemberUpdate, targetId);
        await logServerEvent(client, guild, {
          ...base,
          action: isOut ? "timeout_add" : "timeout_remove",
          actorId: actor?.executorId || null,
          actorTag: actor?.executorTag || null,
          reason: actor?.reason || undefined,
          metadata: {
            reason: actor?.reason || undefined,
            after: isOut ? new Date(newTs).toISOString() : undefined,
          },
        });
      }
    } catch (err) {
      console.warn(`[guildMemberUpdate] error: ${err?.message}`);
    }
  },
};
