// bot/src/utils/backupRestore.js
// Възстановяване на структура от резервно копие (SupremeDiscordBot/docs/BACKUP_SPEC.md, Б12–Б16).
//
// Правила, които този файл пази:
//   • Нищо не се трие и нищо съществуващо не се променя. В същия сървър (SAME) се създава само
//     липсващото; в друг (NEW) — всичко, плюс правата на @everyone.
//   • Ролите от най-високата надолу: всяка нова роля влиза най-отдолу, така че редът излиза същият.
//   • Картата стар → нов ID се докладва след всяко създадено нещо — прекъснато възстановяване
//     продължава, без да създава вече създаденото.
//   • Отделна грешка се записва и се продължава; тавани и непознати типове канали имат изход.
// Двигателят не знае за HTTP и backend: получава `guild` (discord.js) и функция `report`.

const REASON = "Supreme Bot: restore from server backup";
const CATEGORY = 4;
const TEXT_LIKE = new Set([0, 5]);
const VOICE_LIKE = new Set([2, 13]);
const THREAD_ONLY = new Set([15, 16]);
const STAGE = 13;
const ROLE_OVERWRITE = 0;
// Тип, който сървърът не приема (напр. обявления без Community) → най-близкият обикновен.
const FALLBACK_TYPE = { 5: 0, 13: 2, 15: 0, 16: 0 };
// 50024 „Cannot execute action on this channel type“ — винаги за типа. 50035 „Invalid form body“ —
// само ако грешката сочи полето `type`; иначе отказът е за друго (таг, битрейт) и форум НЕ бива
// да става тихо текстов канал (ревю на Дискорджията, 28.11.2026).
const typeRejected = (err) => {
  const code = Number(err?.code ?? err?.rawError?.code);
  return code === 50024 || (code === 50035 && !!err?.rawError?.errors?.type);
};
const MAX_ROLES_CODE = "30005";
const MAX_CHANNELS_CODE = "30013";

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const codeOf = (err) => String(err?.code ?? err?.rawError?.code ?? "ERROR").slice(0, 40);
const reasonOf = (err) => String(err?.message || err || "error").slice(0, 300);
const idOrder = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
const byPos = (a, b) => a.position - b.position || idOrder(a, b);
const REQUIRE_TAG = 1 << 4;

/**
 * @param {{guild:object, snapshot:object, mode:"SAME"|"NEW", idMap?:{roles?:object, channels?:object},
 *          report:(delta:object)=>Promise<{stop?:boolean}>, reason?:string}} p
 * @returns {Promise<{status:"DONE"|"CANCELLED", counts:object}>}
 */
export async function runRestore({ guild, snapshot, mode, idMap = {}, report, reason = REASON }) {
  const same = mode === "SAME";
  const map = { roles: { ...(idMap.roles || {}) }, channels: { ...(idMap.channels || {}) } };
  const counts = { rolesCreated: 0, rolesExisting: 0, channelsCreated: 0, channelsExisting: 0, failed: 0, overwritesSkipped: 0 };
  let stopped = false;

  const send = async (delta) => {
    const r = await report({ ...delta, counts: { ...counts } });
    if (r?.stop) stopped = true;
  };
  const warn = (kind, name, err, extra = {}) => send({ warnings: [{ kind, name: String(name).slice(0, 120), code: codeOf(err), reason: reasonOf(err), ...extra }] });

  const roleNow = (oldId) => {
    const m = map.roles[oldId];
    if (m && guild.roles.cache.has(m)) return m;
    if (same && guild.roles.cache.has(oldId)) return oldId;
    return null;
  };
  const channelNow = (oldId) => {
    const m = map.channels[oldId];
    if (m && guild.channels.cache.has(m)) return m;
    if (same && guild.channels.cache.has(oldId)) return oldId;
    return null;
  };

  const mapOverwrites = (list) => {
    const out = [];
    for (const o of list || []) {
      const id = o.kind === "everyone" ? guild.id : o.kind === "role" ? roleNow(o.id) : null;
      if (!id) { counts.overwritesSkipped += 1; continue; }
      out.push({ id, type: ROLE_OVERWRITE, allow: BigInt(o.allow), deny: BigInt(o.deny) });
    }
    return out;
  };

  // ─── 1. Роли ────────────────────────────────────────────────────────────────
  let roleLimit = false;
  const createdRoles = []; // [{ newId, position }] — за реда в същия сървър
  for (const r of [...snapshot.roles].sort((a, b) => b.position - a.position || idOrder(a, b))) {
    if (stopped) break;
    const m = map.roles[r.id];
    if (m && guild.roles.cache.has(m)) { counts.rolesCreated += 1; continue; } // създадена при предишен опит
    if (same && guild.roles.cache.has(r.id)) { counts.rolesExisting += 1; continue; }
    if (roleLimit) { counts.failed += 1; continue; }
    try {
      const created = await guild.roles.create({
        name: r.name,
        colors: { primaryColor: r.color },
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: BigInt(r.permissions),
        reason,
      });
      map.roles[r.id] = created.id;
      counts.rolesCreated += 1;
      createdRoles.push({ newId: created.id, position: r.position });
      await send({ idMap: { roles: { [r.id]: created.id } } });
    } catch (err) {
      counts.failed += 1;
      if (codeOf(err) === MAX_ROLES_CODE) roleLimit = true;
      await warn("role", r.name, err);
    }
  }

  // ─── 1б. Ред на ролите в същия сървър ───────────────────────────────────────
  // Новата роля влиза най-отдолу. В нов сървър създаването от най-високата надолу вече дава
  // реда; в същия липсващите трябва да се върнат на старото си място сред съществуващите.
  // Ботът подрежда само под собствената си най-висока роля (permissions.md: Permission Hierarchy).
  if (!stopped && same && createdRoles.length && typeof guild.roles.setPositions === "function") {
    const top = guild.members?.me?.roles?.highest?.position ?? Infinity;
    const moves = createdRoles
      .map(({ newId, position }) => ({ role: newId, position: Math.max(1, Math.min(position, top - 1)) }))
      .filter((m) => Number.isFinite(m.position));
    try {
      if (moves.length) await guild.roles.setPositions(moves);
    } catch (err) {
      await warn("role", "order", err);
    }
  }

  // ─── 2. @everyone — само в друг сървър (в същия не пипаме съществуващото) ──
  if (!stopped && !same) {
    try {
      await guild.roles.everyone.setPermissions(BigInt(snapshot.everyone.permissions), reason);
    } catch (err) {
      await warn("role", "@everyone", err);
    }
  }

  // ─── 3. Категории, после канали ─────────────────────────────────────────────
  const optionsFor = (c, type, parent) => {
    const o = { name: c.name, type, reason, permissionOverwrites: mapOverwrites(c.overwrites) };
    if (type === CATEGORY) return o;
    if (parent) o.parent = parent;
    if (TEXT_LIKE.has(type) || THREAD_ONLY.has(type)) {
      Object.assign(o, clean({
        topic: c.topic || undefined,
        nsfw: c.nsfw,
        rateLimitPerUser: c.rateLimitPerUser,
        defaultAutoArchiveDuration: c.defaultAutoArchiveDuration,
        defaultThreadRateLimitPerUser: c.defaultThreadRateLimitPerUser,
      }));
    }
    if (VOICE_LIKE.has(type)) {
      const max = type === STAGE ? 64000 : (guild.maximumBitrate || 96000);
      Object.assign(o, clean({
        bitrate: c.bitrate ? Math.max(8000, Math.min(c.bitrate, max)) : undefined,
        // Discord: до 99 за гласов, до 10 000 за сцена (channel.md → user_limit).
        userLimit: c.userLimit == null ? undefined : Math.min(c.userLimit, type === STAGE ? 10000 : 99),
        rtcRegion: c.rtcRegion,
        videoQualityMode: c.videoQualityMode,
        nsfw: c.nsfw,
        rateLimitPerUser: c.rateLimitPerUser,
      }));
    }
    if (THREAD_ONLY.has(type)) {
      Object.assign(o, clean({
        availableTags: (c.availableTags || []).map((t) => clean({ name: t.name, moderated: t.moderated, emoji: t.emojiName ? { id: null, name: t.emojiName } : undefined })),
        defaultReactionEmoji: c.defaultReactionEmoji ? { id: null, name: c.defaultReactionEmoji.emojiName } : undefined,
        defaultSortOrder: c.defaultSortOrder,
        defaultForumLayout: type === 15 ? c.defaultForumLayout : undefined,
      }));
    }
    return o;
  };

  let channelLimit = false;
  const createOne = async (c, kind, parent) => {
    if (stopped) return;
    if (map.channels[c.id] && guild.channels.cache.has(map.channels[c.id])) { counts.channelsCreated += 1; return; }
    if (same && guild.channels.cache.has(c.id)) { counts.channelsExisting += 1; return; }
    if (channelLimit) { counts.failed += 1; return; }
    // Категориите в копието нямат поле „type“ — типът идва от това, че са категории. Без това
    // discord.js би създал ТЕКСТОВ канал на мястото на всяка категория (хванато от теста).
    const type = kind === "category" ? CATEGORY : c.type;
    let created;
    try {
      try {
        created = await guild.channels.create(optionsFor(c, type, parent));
      } catch (err) {
        const fb = FALLBACK_TYPE[type];
        if (fb === undefined || !typeRejected(err)) throw err;
        created = await guild.channels.create(optionsFor(c, fb, parent));
        await send({ warnings: [{ kind, name: c.name.slice(0, 120), code: "TYPE_FALLBACK", reason: `type ${type} → ${fb}` }] });
      }
    } catch (err) {
      counts.failed += 1;
      if (codeOf(err) === MAX_CHANNELS_CODE) channelLimit = true;
      await warn(kind, c.name, err);
      return;
    }
    map.channels[c.id] = created.id;
    counts.channelsCreated += 1;
    await send({ idMap: { channels: { [c.id]: created.id } } });
    // „Изисква етикет“ на форум/медиен канал: create няма поле flags, само edit
    // (discord.js GuildChannelManager.create срещу .edit). Бележка при отказ, без да спира.
    if (THREAD_ONLY.has(created.type ?? type) && (Number(c.flags || 0) & REQUIRE_TAG) && typeof created.edit === "function") {
      try { await created.edit({ flags: REQUIRE_TAG, reason }); } catch (err) { await warn(kind, c.name, err); }
    }
  };

  const cats = [...snapshot.categories].sort(byPos);
  for (const cat of cats) {
    if (stopped) break;
    await createOne(cat, "category", null);
  }
  for (const ch of [...snapshot.channels].sort(byPos)) {
    if (stopped) break;
    const parent = ch.parentId ? channelNow(ch.parentId) : null;
    if (ch.parentId && !parent && !channelNow(ch.id)) {
      await send({ warnings: [{ kind: "channel", name: ch.name.slice(0, 120), code: "PARENT_MISSING" }] });
    }
    await createOne(ch, "channel", parent);
  }

  // ─── 4. Позиции — само на създаденото от нас, само позиция (без родител) ──
  if (!stopped) {
    const positions = [...cats, ...[...snapshot.channels].sort(byPos)]
      .filter((c) => map.channels[c.id] && guild.channels.cache.has(map.channels[c.id]))
      .map((c) => ({ channel: map.channels[c.id], position: c.position }));
    if (positions.length) {
      try {
        await guild.channels.setPositions(positions);
      } catch (err) {
        await warn("channel", "positions", err);
      }
    }
  }

  return { status: stopped ? "CANCELLED" : "DONE", counts };
}
