// backend/src/lib/backupBot.js
// Разговорът с бота за резервните копия — отделен модул, за да могат маршрутите и задачите да
// се тестват без мрежа. Същата тайна и същият адрес като останалите вътрешни извиквания
// (services/botNotifier.js), но с по-дълъг таймаут: снимката на голям сървър е две REST заявки
// към Discord плюс сериализация.
import axios from "axios";

const BOT_URL = () => process.env.BOT_API_URL || "http://bot:3001";

async function call(path, data, timeout) {
  const secret = process.env.API_SECRET;
  if (!secret) return { ok: false, error: "API_SECRET not set" };
  try {
    const res = await axios.post(`${BOT_URL()}/internal/${path}`, data, { headers: { "x-bot-secret": secret }, timeout });
    return res.data && typeof res.data === "object" ? res.data : { ok: false, error: "empty response" };
  } catch (err) {
    return { ok: false, error: err?.response?.data?.error || err?.message || "bot unreachable", status: err?.response?.status || 0 };
  }
}

/** Снимка на сървъра в момента. @returns {Promise<{ok:true, snapshot:object}|{ok:false, error:string}>} */
export function captureFromBot(serverId) {
  return call("backup-capture", { guildId: serverId }, 30000);
}

/**
 * Проверка преди възстановяване: в сървъра ли е ботът, Administrator ли е, кои от ID-тата още ги
 * има. Пращат се само ID-тата (`roleIds`, `channelIds`), не копието.
 */
export function preflightFromBot(serverId, { roleIds, channelIds }) {
  return call("backup-preflight", { guildId: serverId, roleIds, channelIds }, 20000);
}

/** Буди бота за задачата. Без отговор не е беда — пазачът в задачите ще опита пак. */
export function kickRestore(restoreId) {
  return call("backup-restore", { restoreId }, 10000);
}
