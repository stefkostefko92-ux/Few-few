// bot/src/utils/backupCapture.js
// Снимка на структурата на сървър за резервно копие (backend/docs → SupremeDiscordBot/docs/BACKUP_SPEC.md).
//
// Какво влиза: роли (без @everyone и без ролите на интеграции — Discord не позволява да се
// създадат), правата на @everyone, категориите и каналите с настройките им, правата по канал за
// роли и за @everyone. Какво НЕ влиза: нишки, съобщения, членове и лични права по канал за
// конкретен човек (Discord ID = лична данна; в нов сървър човекът го няма). Формата се проверява
// повторно в backend-а (lib/backupSnapshot.js) — там е истината.

export const SNAPSHOT_VERSION = 1;
const CATEGORY = 4;
const TEXT_LIKE = new Set([0, 5]);       // текстов, обявления
const VOICE_LIKE = new Set([2, 13]);     // гласов, сцена
const THREAD_ONLY = new Set([15, 16]);   // форум, медиен
const CAPTURED = new Set([...TEXT_LIKE, ...VOICE_LIKE, ...THREAD_ONLY]);
const MEMBER_OVERWRITE = 1;              // OverwriteType.Member
const REQUIRE_TAG = 1 << 4;              // ChannelFlags.RequireTag

const bits = (b) => (b?.bitfield ?? 0n).toString();
const cut = (s, n) => String(s ?? "").slice(0, n);
const orNull = (v) => (v === undefined ? null : v);
const byPosition = (a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0) || (a.id < b.id ? -1 : 1);

function overwritesOf(channel, guildId) {
  const out = [];
  for (const o of channel.permissionOverwrites?.cache?.values?.() || []) {
    if (o.type === MEMBER_OVERWRITE) continue;
    out.push({ id: o.id, kind: o.id === guildId ? "everyone" : "role", allow: bits(o.allow), deny: bits(o.deny) });
  }
  return out;
}

function channelOf(c, guildId) {
  const out = {
    id: c.id,
    type: c.type,
    name: cut(c.name, 100),
    parentId: c.parentId ?? null,
    position: c.rawPosition ?? 0,
    overwrites: overwritesOf(c, guildId),
  };
  if (TEXT_LIKE.has(c.type) || THREAD_ONLY.has(c.type)) {
    Object.assign(out, {
      topic: c.topic ? cut(c.topic, 4096) : null,
      nsfw: !!c.nsfw,
      rateLimitPerUser: orNull(c.rateLimitPerUser),
      defaultAutoArchiveDuration: orNull(c.defaultAutoArchiveDuration),
      defaultThreadRateLimitPerUser: orNull(c.defaultThreadRateLimitPerUser),
    });
  }
  if (VOICE_LIKE.has(c.type)) {
    Object.assign(out, {
      bitrate: orNull(c.bitrate),
      userLimit: orNull(c.userLimit),
      rtcRegion: orNull(c.rtcRegion),
      videoQualityMode: orNull(c.videoQualityMode),
      nsfw: !!c.nsfw,
      rateLimitPerUser: orNull(c.rateLimitPerUser),
    });
  }
  if (THREAD_ONLY.has(c.type)) {
    Object.assign(out, {
      // Емоджи на друг сървър не съществува в новия — пазим само обикновените (unicode).
      availableTags: (c.availableTags || []).slice(0, 20).map((t) => ({
        name: cut(t.name, 20),
        moderated: !!t.moderated,
        emojiName: t.emoji && !t.emoji.id && t.emoji.name ? t.emoji.name : null,
      })),
      defaultReactionEmoji: c.defaultReactionEmoji && !c.defaultReactionEmoji.id && c.defaultReactionEmoji.name
        ? { emojiName: c.defaultReactionEmoji.name } : null,
      defaultSortOrder: orNull(c.defaultSortOrder),
      defaultForumLayout: orNull(c.defaultForumLayout),
      flags: Number(c.flags?.bitfield ?? 0) & REQUIRE_TAG,
    });
  }
  return out;
}

/** Чиста функция: от обектите на discord.js към копие. */
export function snapshotGuild(guild, { roles, channels, now = new Date() } = {}) {
  const roleColl = roles || guild.roles.cache;
  const chanColl = channels || guild.channels.cache;
  const everyone = roleColl.get(guild.id);

  const roleList = [...roleColl.values()]
    .filter((r) => r && r.id !== guild.id && !r.managed)
    .sort((a, b) => (b.rawPosition ?? 0) - (a.rawPosition ?? 0) || (a.id < b.id ? -1 : 1))
    .map((r) => ({
      id: r.id,
      name: cut(r.name, 100),
      color: Number(r.colors?.primaryColor ?? r.color ?? 0),
      hoist: !!r.hoist,
      mentionable: !!r.mentionable,
      permissions: bits(r.permissions),
      position: r.rawPosition ?? 0,
    }));

  const all = [...chanColl.values()].filter((c) => c && !c.isThread?.());
  return {
    v: SNAPSHOT_VERSION,
    guild: { id: guild.id, name: cut(guild.name, 100), ownerId: guild.ownerId ?? null },
    capturedAt: now.toISOString(),
    everyone: { permissions: bits(everyone?.permissions) },
    roles: roleList,
    categories: all.filter((c) => c.type === CATEGORY).sort(byPosition)
      .map((c) => ({ id: c.id, name: cut(c.name, 100), position: c.rawPosition ?? 0, overwrites: overwritesOf(c, guild.id) })),
    channels: all.filter((c) => CAPTURED.has(c.type)).sort(byPosition).map((c) => channelOf(c, guild.id)),
  };
}

/** Свежо от Discord (REST), не от кеша: копие от остарял кеш е лъжа точно когато трябва. */
export async function captureGuild(guild) {
  const roles = await guild.roles.fetch();
  const channels = await guild.channels.fetch();
  return snapshotGuild(guild, { roles, channels });
}
