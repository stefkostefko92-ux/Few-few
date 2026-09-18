// bot/src/events/channelUpdate.js
// Server Event Logging — category "server", action "channel_update".
// Логва САМО реални промени (име, тема, NSFW, бавен режим, родителска
// категория, права) — Discord емитва channelUpdate и при странични промени,
// а лог с празен diff е шум.
import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";

/** Кратко резюме на промените в правата (overwrites) по цел (роля/член). */
function permissionDiff(oldCh, newCh) {
  const oldOw = oldCh.permissionOverwrites?.cache;
  const newOw = newCh.permissionOverwrites?.cache;
  if (!oldOw || !newOw) return null;

  const changed = [];
  for (const [id, ow] of newOw) {
    const prev = oldOw.get(id);
    if (!prev) { changed.push(`+ <@&${id}>`); continue; }
    if (prev.allow?.bitfield !== ow.allow?.bitfield || prev.deny?.bitfield !== ow.deny?.bitfield) {
      changed.push(`~ <@&${id}>`);
    }
  }
  for (const [id] of oldOw) if (!newOw.has(id)) changed.push(`− <@&${id}>`);
  return changed.length ? changed.slice(0, 10).join(", ") : null;
}

export default {
  name: "channelUpdate",
  once: false,
  async execute(oldChannel, newChannel) {
    try {
      const guild = newChannel.guild || oldChannel.guild;
      if (!guild?.id) return;

      if (!(await isEventCategoryEnabled(guild.id, "server"))) return;

      // Събери реалния diff — без него не логваме.
      const changes = {};
      if (oldChannel.name !== newChannel.name) {
        changes.before = oldChannel.name; changes.after = newChannel.name;
      }
      if ((oldChannel.topic ?? null) !== (newChannel.topic ?? null)) {
        changes.topicBefore = oldChannel.topic || "(none)";
        changes.topicAfter = newChannel.topic || "(none)";
      }
      if (oldChannel.nsfw !== newChannel.nsfw) changes.nsfw = String(newChannel.nsfw);
      if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.slowmode = `${oldChannel.rateLimitPerUser ?? 0}s → ${newChannel.rateLimitPerUser ?? 0}s`;
      }
      if (oldChannel.parentId !== newChannel.parentId) {
        changes.category = `${oldChannel.parentId ? `<#${oldChannel.parentId}>` : "(none)"} → ${newChannel.parentId ? `<#${newChannel.parentId}>` : "(none)"}`;
      }
      const perms = permissionDiff(oldChannel, newChannel);
      if (perms) changes.permissions = perms;

      if (!Object.keys(changes).length) return; // нищо съществено — не шуми

      const actor = await fetchAuditActor(guild, AuditLogEvent.ChannelUpdate, newChannel.id);

      await logServerEvent(newChannel.client, guild, {
        category: "server",
        action: "channel_update",
        actorId: actor?.executorId || null,
        actorTag: actor?.executorTag || null,
        channelId: newChannel.id,
        metadata: { name: newChannel.name, ...changes },
      });
    } catch (err) {
      console.warn(`[channelUpdate] error: ${err?.message}`);
    }
  },
};
