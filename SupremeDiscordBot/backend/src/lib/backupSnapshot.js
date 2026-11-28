// backend/src/lib/backupSnapshot.js
// Формата на резервното копие на сървър и чистите правила около нея (docs/BACKUP_SPEC.md).
//
// Копието идва от бота (bot/src/utils/backupCapture.js) — тоест от чужд процес по мрежата.
// Затова се проверява ЦЯЛО, преди да се запише (Б1): таваните на Discord (250 роли, 500 канала),
// формата на всеки ID и всяко поле. Повредено копие е по-лошо от липсващо — човек ще разчита на
// него точно когато сървърът му вече го няма.
import { z } from "zod/v3";

export const SNAPSHOT_VERSION = 1;
// Discord: 30005 „Maximum number of guild roles reached (250)“,
//          30013 „Maximum number of guild channels reached (500)“.
export const MAX_ROLES = 250;
export const MAX_CHANNELS = 500;

// Типовете канали, които се копират. Нишките (10, 11, 12) не са в списъка — те са съобщения.
export const CHANNEL_TYPES = { TEXT: 0, VOICE: 2, CATEGORY: 4, ANNOUNCEMENT: 5, STAGE: 13, FORUM: 15, MEDIA: 16 };
// Тези искат Community в сървъра; иначе ботът ги създава като текстов/гласов (Б16).
export const COMMUNITY_TYPES = new Set([CHANNEL_TYPES.ANNOUNCEMENT, CHANNEL_TYPES.STAGE]);

const snowflake = z.string().regex(/^\d{15,22}$/);
const permBits = z.string().regex(/^\d{1,30}$/);
const name = z.string().min(1).max(100);
const count = (max) => z.number().int().min(0).max(max);

const overwrite = z.object({
  id: snowflake,
  // member не се пази (Б3), но се приема и се маха — по-добре от отказ на цялото копие.
  kind: z.enum(["role", "everyone", "member"]),
  allow: permBits,
  deny: permBits,
});
const overwrites = z.array(overwrite).max(MAX_ROLES + 50);

const role = z.object({
  id: snowflake,
  name,
  color: count(0xffffff),
  hoist: z.boolean(),
  mentionable: z.boolean(),
  permissions: permBits,
  position: count(1000),
});

const category = z.object({
  id: snowflake,
  name,
  position: count(10000),
  overwrites,
});

const tag = z.object({
  name: z.string().min(1).max(20),
  moderated: z.boolean(),
  emojiName: z.string().max(64).nullable(),
});

const channel = z.object({
  id: snowflake,
  type: z.union([0, 2, 5, 13, 15, 16].map((t) => z.literal(t))),
  name,
  parentId: snowflake.nullable(),
  position: count(10000),
  topic: z.string().max(4096).nullable().optional(),
  nsfw: z.boolean().optional(),
  rateLimitPerUser: count(21600).nullable().optional(),
  bitrate: count(384000).nullable().optional(),
  // Discord: до 99 за гласов, до 10 000 за сцена (channel.md, Modify Channel → user_limit).
  userLimit: count(10000).nullable().optional(),
  rtcRegion: z.string().max(64).nullable().optional(),
  videoQualityMode: count(2).nullable().optional(),
  defaultAutoArchiveDuration: count(10080).nullable().optional(),
  defaultThreadRateLimitPerUser: count(21600).nullable().optional(),
  availableTags: z.array(tag).max(20).nullable().optional(),
  defaultReactionEmoji: z.object({ emojiName: z.string().max(64) }).nullable().optional(),
  defaultSortOrder: count(1).nullable().optional(),
  defaultForumLayout: count(2).nullable().optional(),
  flags: count(2 ** 31).nullable().optional(),
  overwrites,
});

const snapshotSchema = z.object({
  v: z.literal(SNAPSHOT_VERSION),
  guild: z.object({ id: snowflake, name, ownerId: snowflake.nullable() }),
  capturedAt: z.string().datetime(),
  everyone: z.object({ permissions: permBits }),
  roles: z.array(role).max(MAX_ROLES),
  categories: z.array(category).max(MAX_CHANNELS),
  channels: z.array(channel).max(MAX_CHANNELS),
}).refine((s) => s.categories.length + s.channels.length <= MAX_CHANNELS, { message: "too many channels" })
  .refine((s) => s.channels.every((c) => c.type !== 2 || (c.userLimit ?? 0) <= 99), { message: "voice userLimit > 99" });

/** @returns {{ok:true, snapshot:object} | {ok:false, error:string}} */
export function parseSnapshot(raw) {
  const r = snapshotSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, snapshot: r.data };
}

/**
 * Каквото реално се записва (Б3): без каналите от `excludeChannelIds` (тикетите) и без права за
 * конкретен член (Discord ID на човек — лична данна, а в нов сървър човекът го няма).
 */
export function stripForStorage(snapshot, { excludeChannelIds = [] } = {}) {
  const skip = new Set(excludeChannelIds.map(String));
  const keepOw = (list) => (list || []).filter((o) => o.kind === "role" || o.kind === "everyone");
  return {
    ...snapshot,
    // Discord ID на собственика живее САМО в колоната ownerId — там чл. 17 го маха. Вътре в
    // шифрованото копие не му е мястото (ревю на Кодаджията, 28.11.2026).
    guild: { ...snapshot.guild, ownerId: null },
    categories: snapshot.categories.map((c) => ({ ...c, overwrites: keepOw(c.overwrites) })),
    channels: snapshot.channels
      .filter((c) => !skip.has(c.id))
      .map((c) => ({ ...c, overwrites: keepOw(c.overwrites) })),
  };
}

/** Сводка за таблото: дърво от имена и роли. Без права и без ID-та на хора. */
export function summarizeSnapshot(snapshot) {
  const byPos = (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1);
  const short = (c) => ({ id: c.id, name: c.name, type: c.type });
  const cats = [...snapshot.categories].sort(byPos);
  const tree = cats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    channels: snapshot.channels.filter((c) => c.parentId === cat.id).sort(byPos).map(short),
  }));
  const catIds = new Set(cats.map((c) => c.id));
  return {
    tree,
    uncategorized: snapshot.channels.filter((c) => !c.parentId || !catIds.has(c.parentId)).sort(byPos).map(short),
    roles: [...snapshot.roles].sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: r.color })),
  };
}

export function snapshotCounts(snapshot) {
  return { roleCount: snapshot.roles.length, categoryCount: snapshot.categories.length, channelCount: snapshot.channels.length };
}

/** Само ID-тата — това праща backend-ът на бота за проверката преди старта (не цялото копие). */
export function snapshotIds(snapshot) {
  return {
    roleIds: snapshot.roles.map((r) => r.id),
    channelIds: [...snapshot.categories.map((c) => c.id), ...snapshot.channels.map((c) => c.id)],
  };
}

/**
 * План за възстановяването (Б11, Б12). Чиста функция: не пита никого.
 * @param {object} snapshot
 * @param {{sameServer:boolean, inGuild?:boolean, admin?:boolean, community?:boolean,
 *          roleCount?:number, channelCount?:number, existingRoleIds?:string[], existingChannelIds?:string[]}} state
 */
export function planRestore(snapshot, state) {
  const mode = state.sameServer ? "SAME" : "NEW";
  const blockers = [];
  const warnings = [];
  if (state.inGuild === false) blockers.push("BOT_NOT_IN_SERVER");
  else if (!state.admin) blockers.push("BOT_NOT_ADMIN");

  const exRoles = new Set(state.existingRoleIds || []);
  const exChans = new Set(state.existingChannelIds || []);
  const allChans = [...snapshot.categories, ...snapshot.channels];
  // В друг сървър ID-тата от копието нищо не значат — всичко се създава наново.
  const rolesExisting = mode === "SAME" ? snapshot.roles.filter((r) => exRoles.has(r.id)).length : 0;
  const chansExisting = mode === "SAME" ? allChans.filter((c) => exChans.has(c.id)).length : 0;
  const roles = { total: snapshot.roles.length, existing: rolesExisting, toCreate: snapshot.roles.length - rolesExisting };
  const channels = { total: allChans.length, existing: chansExisting, toCreate: allChans.length - chansExisting };

  if (state.inGuild !== false) {
    if (roles.toCreate + channels.toCreate === 0) blockers.push("NOTHING_MISSING");
    const roleRoom = MAX_ROLES - (state.roleCount ?? 0);
    if (roles.toCreate > roleRoom) warnings.push({ code: "ROLE_LIMIT", count: roles.toCreate - Math.max(0, roleRoom) });
    const chanRoom = MAX_CHANNELS - (state.channelCount ?? 0);
    if (channels.toCreate > chanRoom) warnings.push({ code: "CHANNEL_LIMIT", count: channels.toCreate - Math.max(0, chanRoom) });
    if (!state.community) {
      const n = snapshot.channels.filter((c) => COMMUNITY_TYPES.has(c.type) && !(mode === "SAME" && exChans.has(c.id))).length;
      if (n) warnings.push({ code: "COMMUNITY_REQUIRED", count: n });
    }
  }
  return { mode, blockers, warnings, roles, channels };
}
