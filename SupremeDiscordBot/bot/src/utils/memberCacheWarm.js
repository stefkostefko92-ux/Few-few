// bot/src/utils/memberCacheWarm.js
// В5: затопляне на кеша на членовете — САМО за сървъри с включено „запазване на роли“.
//
// ЗАЩО Е НУЖНО: discord.js 14 емитва `guildMemberRemove` само за кеширани членове (или
// частични, с `Partials.GuildMember`, но те нямат роли). Без пълен кеш на големи сървъри
// снимката на ролите при напускане е празна/липсва и „лепкавите роли“ мълчаливо не работят.
//
// ЗАЩО ТОВА Е ИЗКЛЮЧЕНИЕ ОТ ПРАВИЛОТО „без масово теглене на членове“ (GDPR, виж
// backend/src/__tests__/discordCompliance.test.js): теглим списъка САМО на сървър, чийто собственик
// е включил запазването на роли (тоест е възложил обработката на ролите на членовете), един път на
// процес и сървър, последователно и с пауза — не за всички сървъри и не за други цели.
// Това е ЕДИНСТВЕНОТО място в бота с `members.fetch()` без аргумент (гейтът го пази).
import api from "./api.js";

const DEFAULT_PAUSE_MS = 3000;
const RESCAN_MS = 10 * 60 * 1000; // „настройката се включи“ → затопляне до 10 мин по-късно
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listEnabledIdsFromBackend() {
  const { data } = await api.get("/bot/sticky-roles/servers");
  return Array.isArray(data?.serverIds) ? data.serverIds.map(String) : [];
}
async function isEnabledFromBackend(serverId) {
  const { data } = await api.get(`/bot/server/${serverId}`);
  return !!data?.stickyRolesEnabled;
}

export function createMemberCacheWarmer({
  listEnabledIds = listEnabledIdsFromBackend,
  isEnabled = isEnabledFromBackend,
  pauseMs = DEFAULT_PAUSE_MS,
} = {}) {
  const warmed = new Set();
  const inflight = new Set();

  async function fetchOne(guild) {
    if (warmed.has(guild.id) || inflight.has(guild.id)) return false;
    inflight.add(guild.id);
    try {
      await guild.members.fetch(); // ← единственото разрешено извикване без аргумент (виж горе)
      warmed.add(guild.id);
      return true;
    } catch (err) {
      console.warn(`[member-cache] ${guild.id}: ${err?.message} — ще опитам при следващия обход`);
      return false;
    } finally {
      inflight.delete(guild.id);
    }
  }

  return {
    warmed,
    /** Един сървър (guildCreate / „настройката се включи“): само ако запазването на роли е включено. */
    async warmGuild(guild) {
      try {
        if (!guild?.id || warmed.has(guild.id) || !(await isEnabled(guild.id))) return false;
      } catch { return false; }
      return fetchOne(guild);
    },
    /** Всички сървъри на клиента със запазване на роли — последователно, с пауза. */
    async warmAll(client) {
      let ids;
      try { ids = new Set(await listEnabledIds()); } catch (err) {
        console.warn(`[member-cache] списъкът със сървъри не се зареди: ${err?.message}`);
        return 0;
      }
      let n = 0;
      for (const guild of client.guilds.cache.values()) {
        if (!ids.has(guild.id) || warmed.has(guild.id)) continue;
        if (await fetchOne(guild)) n++;
        if (pauseMs) await sleep(pauseMs);
      }
      return n;
    },
    /** При ready + периодично (хваща включване на настройката). */
    start(client) {
      this.warmAll(client).catch(() => {});
      const timer = setInterval(() => this.warmAll(client).catch(() => {}), RESCAN_MS);
      timer.unref?.();
      return timer;
    },
    forget(guildId) { warmed.delete(guildId); },
  };
}

// Общ екземпляр за главния бот и white-label клиентите (кешът е на guild, не на клиент).
export const memberCacheWarmer = createMemberCacheWarmer();
