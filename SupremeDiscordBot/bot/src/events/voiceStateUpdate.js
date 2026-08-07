// bot/src/events/voiceStateUpdate.js
// Server Event Logging — category "voice". Diff-ва oldState/newState и логва
// точните гласови действия. Изисква GatewayIntentBits.GuildVoiceStates.
//
// Закача се И на главния, И на всеки white-label клиент (loadEventModules чете
// само /events/). Клиентът се взима от newState.client.
//
// Rate-limit внимание: audit log се пипа САМО при server_mute/server_deaf
// (best-effort актьор), НЕ при self_* или join/leave — гласовете шумят силно.

import { logServerEvent, fetchAuditActor, fetchVoiceMoveActor, fetchVoiceDisconnectActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";

function tagOf(user) {
  if (!user) return null;
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

export default {
  name: "voiceStateUpdate",
  once: false,
  async execute(oldState, newState) {
    try {
      const guild = newState.guild || oldState.guild;
      if (!guild?.id) return;

      // Евтин гейт ПРЕДИ audit-log fetch-овете — иначе всяко voice събитие във
      // всеки guild бие fetchAuditLogs дори с изключена категория (rate limit,
      // същата находка като messageDelete). logServerEvent пак гейтва, но
      // едва СЛЕД скъпия fetch.
      if (!(await isEventCategoryEnabled(guild.id, "voice"))) return;

      const client = newState.client;
      const member = newState.member || oldState.member;
      const targetId = member?.id || newState.id || oldState.id;
      const targetTag = tagOf(member?.user);
      if (!targetId) return;

      // Базов payload за всяко действие (targetId + self-actor по подразбиране).
      const base = { category: "voice", targetId, targetTag };
      const emit = (extra) => logServerEvent(client, guild, { ...base, ...extra });

      // ─── 1. Канал: join / leave / move ──────────────────────────────────────
      const oldCh = oldState.channelId;
      const newCh = newState.channelId;
      if (oldCh !== newCh) {
        if (!oldCh && newCh) {
          await emit({ action: "voice_join", actorId: targetId, channelId: newCh });
        } else if (oldCh && !newCh) {
          // Изключен ли е от модератор, или си е излязъл сам?
          const kicker = await fetchVoiceDisconnectActor(guild);
          await emit({
            action: "voice_leave",
            actorId: kicker?.executorId || targetId,
            actorTag: kicker?.executorTag || targetTag,
            channelId: oldCh,
          });
        } else {
          // Преместен ОТ някого, или се е преместил сам? MemberMove записът се
          // сверява по целевия канал (той няма потребител като target).
          // Липсва запис → сам се е преместил, тогава актьорът е самият човек и
          // embed-ът не показва излишно поле „Actor“.
          const mover = await fetchVoiceMoveActor(guild, newCh);
          await emit({
            action: "voice_move",
            actorId: mover?.executorId || targetId,
            actorTag: mover?.executorTag || targetTag,
            metadata: { fromChannelId: oldCh, toChannelId: newCh },
          });
        }
      }

      // ─── 2. Server mute (best-effort актьор от audit log) ───────────────────
      if (oldState.serverMute !== newState.serverMute) {
        const action = newState.serverMute ? "voice_server_mute" : "voice_server_unmute";
        const actor = await fetchAuditActor(guild, AuditLogEvent.MemberUpdate, targetId);
        await emit({
          action,
          channelId: newCh || oldCh || null,
          actorId: actor?.executorId || null,
          actorTag: actor?.executorTag || null,
        });
      }

      // ─── 3. Server deaf (best-effort актьор от audit log) ────────────────────
      if (oldState.serverDeaf !== newState.serverDeaf) {
        const action = newState.serverDeaf ? "voice_server_deaf" : "voice_server_undeaf";
        const actor = await fetchAuditActor(guild, AuditLogEvent.MemberUpdate, targetId);
        await emit({
          action,
          channelId: newCh || oldCh || null,
          actorId: actor?.executorId || null,
          actorTag: actor?.executorTag || null,
        });
      }

      // ─── 4. Self mute (actor === target, без audit log) ─────────────────────
      if (oldState.selfMute !== newState.selfMute) {
        await emit({
          action: newState.selfMute ? "voice_self_mute" : "voice_self_unmute",
          actorId: targetId,
          channelId: newCh || oldCh || null,
        });
      }

      // ─── 5. Self deaf ───────────────────────────────────────────────────────
      if (oldState.selfDeaf !== newState.selfDeaf) {
        await emit({
          action: newState.selfDeaf ? "voice_self_deaf" : "voice_self_undeaf",
          actorId: targetId,
          channelId: newCh || oldCh || null,
        });
      }

      // ─── 6. Streaming (Go Live) ─────────────────────────────────────────────
      if (oldState.streaming !== newState.streaming) {
        await emit({
          action: newState.streaming ? "voice_stream_start" : "voice_stream_stop",
          actorId: targetId,
          channelId: newCh || oldCh || null,
        });
      }

      // ─── 7. Camera (self video) ─────────────────────────────────────────────
      if (oldState.selfVideo !== newState.selfVideo) {
        await emit({
          action: newState.selfVideo ? "voice_video_on" : "voice_video_off",
          actorId: targetId,
          channelId: newCh || oldCh || null,
        });
      }
    } catch (err) {
      // Fail-safe: гласовите събития не бива да чупят процеса.
      console.warn(`[voiceStateUpdate] error: ${err?.message}`);
    }
  },
};
