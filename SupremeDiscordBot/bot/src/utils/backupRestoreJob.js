// bot/src/utils/backupRestoreJob.js
// Задачата около двигателя за възстановяване (SupremeDiscordBot/docs/BACKUP_SPEC.md).
// Backend-ът я буди през /internal/backup-restore; тя взима копието и картата, проверява правата
// в момента, пуска двигателя и докладва. Без HTTP и без discord.js вътре — подават се отвън,
// за да се тества.

// Задачите, които текат В ТОЗИ процес. Пазачът в backend-а буди повторно при тишина; ако задачата
// още тече (дълго чакане по лимитите на Discord), второто събуждане не пуска втори двигател.
const RUNNING = new Set();
export function _resetRunning() { RUNNING.clear(); }

const ADMINISTRATOR = 1n << 3n;
const HEARTBEAT_MS = 30 * 1000;
const REPORT_ATTEMPTS = 4;

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Проверка преди старта — само кои от подадените ID-та ги има; нищо друго не напуска сървъра. */
export function preflightGuild(guild, { roleIds = [], channelIds = [] } = {}) {
  const channels = [...guild.channels.cache.values()].filter((c) => !c?.isThread?.());
  const has = (perm) => !!guild.members?.me?.permissions?.has?.(perm);
  return {
    ok: true,
    inGuild: true,
    admin: has(ADMINISTRATOR),
    community: (guild.features || []).includes("COMMUNITY"),
    roleCount: guild.roles.cache.size,
    channelCount: channels.length,
    existingRoleIds: roleIds.filter((id) => guild.roles.cache.has(id)),
    existingChannelIds: channelIds.filter((id) => { const c = guild.channels.cache.get(id); return !!c && !c.isThread?.(); }),
  };
}

/**
 * @param {string} restoreId
 * @param {{api:{get:Function, post:Function}, resolveGuild:(id:string)=>Promise<object|null>, retryDelayMs?:number}} deps
 */
export async function runRestoreJob(restoreId, { api, resolveGuild, retryDelayMs = 2000, heartbeatMs = HEARTBEAT_MS }) {
  if (RUNNING.has(restoreId)) return { ok: true, running: true };
  RUNNING.add(restoreId);
  const path = `/bot/backup-restores/${restoreId}/progress`;
  let heartbeat = null;

  // Докладът носи картата стар → нов ID. Изгубен доклад = дубликат при следващия опит, затова
  // се повтаря няколко пъти, преди задачата да се откаже (пазачът я буди наново по-късно).
  const postNow = async (body) => {
    let lastErr;
    for (let i = 0; i < REPORT_ATTEMPTS; i += 1) {
      try {
        const { data } = await api.post(path, body);
        return data || {};
      } catch (err) {
        lastErr = err;
        await sleep(retryDelayMs * (i + 1));
      }
    }
    throw lastErr;
  };
  // Докладите (пулсът и стъпките) минават един след друг: backend-ът и без това ги слива под
  // ключ, но така и редът на добавките в картата е редът на създаването.
  let chain = Promise.resolve();
  const post = (body) => {
    const p = chain.then(() => postNow(body));
    chain = p.catch(() => {});
    return p;
  };
  const fail = (code) => post({ status: "FAILED", warnings: [{ kind: "server", code }] });

  try {
    let data;
    try {
      ({ data } = await api.get(`/bot/backup-restores/${restoreId}`));
    } catch (err) {
      // 409/404/410 — спряна, приключила или без копие: нищо за правене.
      return { ok: false, status: err?.response?.status || 0 };
    }
    const { restore, snapshot } = data || {};
    if (!restore || !snapshot) return { ok: false };

    const guild = await resolveGuild(restore.targetServerId);
    if (!guild) { await fail("BOT_NOT_IN_SERVER"); return { ok: false }; }
    // Свеж кеш преди проверката и преди „има ли го вече“: сървър, дошъл през REST вместо от
    // gateway кеша, може да е без `members.me` и с празни роли/канали — тогава ботът би
    // казал „нямам Administrator“ или би създал наново съществуващото (ревю, 28.11.2026).
    await guild.members?.fetchMe?.().catch?.(() => null);
    await guild.roles?.fetch?.().catch?.(() => null);
    await guild.channels?.fetch?.().catch?.(() => null);
    // Правата се проверяват пак в МОМЕНТА на старта — между плана и старта човек може да ги е махнал.
    if (!guild.members?.me?.permissions?.has?.(ADMINISTRATOR)) { await fail("BOT_NOT_ADMIN"); return { ok: false }; }

    const { runRestore } = await import("./backupRestore.js");
    let stop = false;
    const report = async (delta) => {
      const r = await post(delta);
      if (r?.stop) stop = true;
      return { stop };
    };
    heartbeat = setInterval(() => { report({}).catch(() => {}); }, heartbeatMs);
    heartbeat.unref?.();

    const out = await runRestore({ guild, snapshot, mode: restore.mode, idMap: restore.idMap || {}, report });
    if (out.status === "DONE" && !stop) await post({ status: "DONE", counts: out.counts });
    return { ok: true, status: out.status };
  } catch (err) {
    console.error(`[backup-restore] ${restoreId}: ${err?.message}`);
    return { ok: false, error: err?.message };
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    RUNNING.delete(restoreId);
  }
}
