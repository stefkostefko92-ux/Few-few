// backend/src/lib/discordRest.js
// Тънък слой над axios за ПРЯКИТЕ извиквания към Discord REST от backend-а.
//
// Защо изобщо съществува: discord.js носи собствен rate-limit опашкар, но той
// живее в бота. Backend-ът вика Discord директно с axios (OAuth токена на
// потребителя за /users/@me/guilds, бот токена за /guilds/{id}/members) — тези
// пътища НЕ минават през опашкаря и досега нямаха никаква обработка на 429.
//
// Discord е недвусмислен: приложение, което трупа 429, се блокира временно
// (Cloudflare бан на IP-то за 1 час), а системното пренебрегване на лимитите е
// нарушение на Developer Terms и основание за сваляне. За приложение, което
// кандидатства за верификация и монетизация, това е блокер, не стил.
//
// Какво прави слоят:
//   • уважава `Retry-After` (и `X-RateLimit-Reset-After`) при 429 и повтаря;
//   • спира при глобален лимит вместо да го дълбае;
//   • има таван на опитите и на изчакването — заявката на потребителя не бива
//     да виси произволно дълго заради чужд лимит;
//   • НЕ повтаря при 401/403/404 — те не са преходни.

import axios from "axios";

const MAX_RETRIES = 3;
// Над този праг не чакаме — по-добре честна грешка към потребителя, отколкото
// заявка, която виси половин минута.
const MAX_WAIT_MS = 5_000;

function retryAfterMs(err) {
  const h = err?.response?.headers || {};
  // Discord дава секунди (може с дробна част) в Retry-After; JSON тялото носи
  // `retry_after` в секунди. X-RateLimit-Reset-After е също в секунди.
  const raw =
    h["retry-after"] ??
    h["x-ratelimit-reset-after"] ??
    err?.response?.data?.retry_after;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.ceil(seconds * 1000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Извикай Discord REST с уважение към rate limit-ите.
 * @param {import("axios").AxiosRequestConfig} config
 * @returns {Promise<import("axios").AxiosResponse>}
 */
export async function discordRequest(config) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await axios({ timeout: 8000, ...config });
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      if (status !== 429) throw err; // 401/403/404/5xx — не е преходно за нас

      const isGlobal = !!err?.response?.data?.global || err?.response?.headers?.["x-ratelimit-global"];
      const waitMs = retryAfterMs(err);

      // Глобалният лимит значи „целият бот е задавен“ — да го дълбаем е точно
      // това, за което Discord наказва. Отказваме веднага и нагоре.
      if (isGlobal) {
        console.warn(`[discord-rest] ГЛОБАЛЕН rate limit (${config.url}) — спирам, не повтарям`);
        throw err;
      }
      if (waitMs === null || waitMs > MAX_WAIT_MS || attempt === MAX_RETRIES) {
        console.warn(
          `[discord-rest] 429 на ${config.url}; изчакване ${waitMs ?? "неизвестно"}ms надхвърля тавана или опитите свършиха`,
        );
        throw err;
      }
      console.warn(`[discord-rest] 429 на ${config.url} — чакам ${waitMs}ms (опит ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

// ─── Кеш за списъка с guild-ове на потребителя ───────────────────────────────
// `/users/@me/guilds` се вика при ВСЯКА заявка към дашборда (requireGuildAccess)
// и при всяко зареждане на списъка със сървъри. Discord лимитира този маршрут
// стегнато на потребителски токен, а човек, който щрака из таблото, го бие
// десетки пъти в минута — това е основният ни източник на 429.
//
// Кешираме кратко (по токен, не по потребител — сменен токен значи нов запис) и
// ограничаваме размера, за да не расте безкрайно.
const guildCache = new Map(); // token → { guilds, expiresAt }
const GUILD_TTL_MS = 30_000;
const GUILD_CACHE_MAX = 5_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of guildCache) if (v.expiresAt <= now) guildCache.delete(k);
}, GUILD_TTL_MS).unref?.();

/**
 * Guild-овете на потребителя (кеширано за 30 секунди).
 * @param {string} accessToken  РАЗШИФРОВАН OAuth2 access token
 * @returns {Promise<Array>}
 */
export async function fetchUserGuilds(accessToken) {
  const now = Date.now();
  const hit = guildCache.get(accessToken);
  if (hit && hit.expiresAt > now) return hit.guilds;

  const res = await discordRequest({
    method: "get",
    url: "https://discord.com/api/v10/users/@me/guilds",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const guilds = res.data || [];

  // Груб таван: при препълване чистим изтеклите, а ако пак е пълно — не кешираме.
  if (guildCache.size >= GUILD_CACHE_MAX) {
    for (const [k, v] of guildCache) if (v.expiresAt <= now) guildCache.delete(k);
  }
  if (guildCache.size < GUILD_CACHE_MAX) {
    guildCache.set(accessToken, { guilds, expiresAt: now + GUILD_TTL_MS });
  }
  return guilds;
}

/** Изхвърли кеша за даден токен (при logout / смяна на токен). */
export function invalidateUserGuilds(accessToken) {
  guildCache.delete(accessToken);
}

export const __testing = { guildCache, GUILD_TTL_MS, retryAfterMs };
