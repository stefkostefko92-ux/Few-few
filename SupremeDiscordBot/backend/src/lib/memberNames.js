// backend/src/lib/memberNames.js
// Имена на членове на Discord сървър — живо от бота
// (`/internal/guild/:id/members`), само за подадените ID и нищо не се пази.
// Играчите рядко влизат в таблото, затова `users` не ги знае (преглед
// 10.10.2026: страницата „Игра“ и админ конзолата показваха сурови ID).
// Само снежинки, без дубли, до 100; връща само поисканите ID и само текст.
// Никога не хвърля — без бота името просто липсва.
import axios from "axios";

const SNOWFLAKE = /^\d{17,20}$/;

export function cleanMemberIds(ids) {
  return [...new Set((ids || []).map((x) => String(x).trim()).filter((x) => SNOWFLAKE.test(x)))].slice(0, 100);
}

/** @returns {Promise<{ members: Record<string,string>, unavailable: boolean }>} */
export async function fetchMemberNames(serverId, ids, { timeout = 10_000 } = {}) {
  const list = cleanMemberIds(ids);
  if (!list.length || !SNOWFLAKE.test(String(serverId))) return { members: {}, unavailable: false };
  const BOT_API_URL = process.env.BOT_API_URL || "http://bot:3001";
  try {
    const { data } = await axios.get(`${BOT_API_URL}/internal/guild/${serverId}/members`, {
      params: { ids: list.join(",") },
      headers: { "x-bot-secret": process.env.API_SECRET },
      timeout,
    });
    const members = {};
    for (const id of list) if (typeof data?.members?.[id] === "string") members[id] = data.members[id].slice(0, 100);
    return { members, unavailable: false };
  } catch {
    return { members: {}, unavailable: true };
  }
}
