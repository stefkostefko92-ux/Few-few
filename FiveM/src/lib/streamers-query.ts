/**
 * МРЕЖАТА към стрийминг платформите. Пуска се САМО от cron
 * (`scripts/discover-streamers.ts`), никога при заявка на посетител — иначе
 * всеки наш посетител харчи от чуждата квота и вдига нашия IP в rate limit-а.
 *
 * Три платформи от четири искат ключ. Проверено на живо на 01.08.2026:
 *   - Twitch  `helix/streams`            → 401 без токен
 *   - Kick    `api.kick.com/public/v1`   → 401 без токен; `id.kick.com/oauth/token`
 *                                          отговаря `invalid_client` на фалшив ключ
 *   - YouTube `youtube/v3/search`        → 403 „unregistered callers“
 * Публичният списък на Kick (`kick.com/stream/livestreams/…`) НЕ е път без
 * ключ — връща 403 „Request blocked by security policy“ (Cloudflare).
 * TikTok няма никакво публично откриване на живи излъчвания → само ръчно.
 *
 * Липсващ ключ НЕ е грешка: платформата просто се пропуска. Cron-ът не бива да
 * пада, защото собственикът още не е взел ключ за YouTube.
 */

import { displayName } from './fivem';
import {
  clampViewers,
  isBulgarianLanguage,
  normalizeChannel,
  profileUrl,
  type StreamPlatformId,
} from './streamers';

const USER_AGENT = 'FiveMBulgaria/1.0 (+https://fivembulgaria.carbonstealth.eu)';
const TIMEOUT = 15_000;

/** Едно намерено живо излъчване, вече изчистено и нормализирано. */
export type FoundStream = {
  platform: StreamPlatformId;
  channel: string;
  displayName: string;
  profileUrl: string;
  language: string | null;
  viewers: number;
  streamTitle: string | null;
  /** Дали ПЛАТФОРМАТА е обявила излъчването за българско. */
  declaredBulgarian: boolean;
};

/** Общо четене на JSON с таван и мек провал. */
async function getJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers },
      cache: 'no-store',
      redirect: 'error',
    });
    if (!res.ok) {
      console.error(`[streamers] ${new URL(url).host} върна ${res.status}`);
      await res.body?.cancel();
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error(`[streamers] заявката към ${url.split('?')[0]} се провали`, error);
    return null;
  }
}

/** Полето може да липсва или да е от чужд тип — оттук нататък се вярва само на това. */
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
function rows(payload: unknown, key: string): Record<string, unknown>[] {
  const root = record(payload);
  const list = root?.[key];
  if (!Array.isArray(list)) return [];
  return list.map(record).filter((row): row is Record<string, unknown> => row !== null);
}

// ── Twitch ──────────────────────────────────────────────────────────────────

/** GTA V в каталога на Twitch. Постоянен идентификатор, не се променя. */
const TWITCH_GTA_V = '32982';

async function twitchToken(id: string, secret: string): Promise<string | null> {
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: 'client_credentials',
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[streamers] Twitch отказа токен: ${res.status}`);
      await res.body?.cancel();
      return null;
    }
    const payload = record(await res.json());
    return text(payload?.access_token);
  } catch (error) {
    console.error('[streamers] Twitch токенът се провали', error);
    return null;
  }
}

/**
 * Twitch филтрира по език СЪРВЪРНО (`language=bg`) — тоест признакът е обявен
 * от самия стриймър, не гадаене от наша страна. Затова тези записи могат да
 * влязат публично без ръчен преглед.
 */
export async function discoverTwitch(): Promise<FoundStream[]> {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return [];

  const token = await twitchToken(id, secret);
  if (!token) return [];

  const url = `https://api.twitch.tv/helix/streams?game_id=${TWITCH_GTA_V}&language=bg&first=100`;
  const payload = await getJson(url, {
    'client-id': id,
    authorization: `Bearer ${token}`,
  });

  const found: FoundStream[] = [];
  for (const row of rows(payload, 'data')) {
    const login = text(row.user_login);
    if (!login) continue;
    const channel = normalizeChannel('TWITCH', login);
    if (!channel) continue;

    found.push({
      platform: 'TWITCH',
      channel,
      displayName: displayName(text(row.user_name) ?? login, login),
      profileUrl: profileUrl('TWITCH', channel),
      language: text(row.language),
      viewers: clampViewers(typeof row.viewer_count === 'number' ? row.viewer_count : 0),
      streamTitle: text(row.title) ? displayName(text(row.title), '') || null : null,
      declaredBulgarian: isBulgarianLanguage(text(row.language)),
    });
  }
  return found;
}

// ── Kick ────────────────────────────────────────────────────────────────────

const KICK_API = 'https://api.kick.com/public/v1';

async function kickToken(id: string, secret: string): Promise<string | null> {
  try {
    const res = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: 'client_credentials',
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[streamers] Kick отказа токен: ${res.status}`);
      await res.body?.cancel();
      return null;
    }
    const payload = record(await res.json());
    return text(payload?.access_token);
  } catch (error) {
    console.error('[streamers] Kick токенът се провали', error);
    return null;
  }
}

/**
 * Категорията на GTA V в Kick НЕ е константа като при Twitch и не е обявена в
 * документацията — търси се по име. `KICK_CATEGORY_ID` в `.env` спестява
 * заявката, ако собственикът я е сверил веднъж.
 */
async function kickCategoryId(auth: Record<string, string>): Promise<number | null> {
  const pinned = Number(process.env.KICK_CATEGORY_ID);
  if (Number.isInteger(pinned) && pinned > 0) return pinned;

  const payload = await getJson(`${KICK_API}/categories?q=${encodeURIComponent('grand theft auto')}`, auth);
  for (const row of rows(payload, 'data')) {
    const name = text(row.name)?.toLowerCase() ?? '';
    const id = typeof row.id === 'number' ? row.id : null;
    if (id && (name === 'grand theft auto v' || name === 'gta v')) return id;
  }
  console.error('[streamers] категорията GTA V не се намери в Kick');
  return null;
}

export async function discoverKick(): Promise<FoundStream[]> {
  const id = process.env.KICK_CLIENT_ID;
  const secret = process.env.KICK_CLIENT_SECRET;
  if (!id || !secret) return [];

  const token = await kickToken(id, secret);
  if (!token) return [];
  const auth = { authorization: `Bearer ${token}` };

  const category = await kickCategoryId(auth);
  if (category === null) return [];

  const payload = await getJson(
    `${KICK_API}/livestreams?category_id=${category}&language=bg&limit=100&sort=viewer_count`,
    auth,
  );

  const found: FoundStream[] = [];
  for (const row of rows(payload, 'data')) {
    const slug = text(row.slug);
    if (!slug) continue;
    const channel = normalizeChannel('KICK', slug);
    if (!channel) continue;

    const language = text(row.language);
    found.push({
      platform: 'KICK',
      channel,
      displayName: displayName(slug, slug),
      profileUrl: profileUrl('KICK', channel),
      language,
      viewers: clampViewers(typeof row.viewer_count === 'number' ? row.viewer_count : 0),
      streamTitle: text(row.stream_title) ? displayName(text(row.stream_title), '') || null : null,
      // Форматът на `language` в Kick не е документиран: приема се и „bg“, и
      // „Bulgarian“. Върне ли нещо трето, записът отива в опашка — по-добре
      // ръчен преглед, отколкото чужд стриймър в българската секция.
      declaredBulgarian: isBulgarianLanguage(language),
    });
  }
  return found;
}

// ── YouTube ─────────────────────────────────────────────────────────────────

/**
 * YouTube НЯМА сървърен филтър по език на излъчването — `relevanceLanguage`
 * и `regionCode` са подсказки за класирането, не гаранция. Затова оттук нищо
 * не влиза публично автоматично: всички записи отиват в опашка.
 *
 * Квотата е тясната част: `search.list` струва 100 единици при 10 000 на ден,
 * значи тази функция върви на 2 часа, не на 10 минути (виж `docker-compose.yml`).
 */
const YOUTUBE_QUERIES = ['FiveM Bulgaria', 'GTA RP България'];

export async function discoverYouTube(): Promise<FoundStream[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const found = new Map<string, FoundStream>();
  for (const query of YOUTUBE_QUERIES) {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&eventType=live` +
      `&regionCode=BG&relevanceLanguage=bg&maxResults=25&q=${encodeURIComponent(query)}&key=${key}`;
    const payload = await getJson(url, {});

    for (const row of rows(payload, 'items')) {
      const snippet = record(row.snippet);
      const channelId = text(snippet?.channelId);
      if (!channelId) continue;
      const channel = normalizeChannel('YOUTUBE', channelId);
      if (!channel || found.has(channel)) continue;

      const title = text(snippet?.channelTitle) ?? channel;
      found.set(channel, {
        platform: 'YOUTUBE',
        channel,
        displayName: displayName(title, channel),
        profileUrl: profileUrl('YOUTUBE', channel),
        // YouTube не връща език на излъчването в `search.list`.
        language: null,
        viewers: 0,
        streamTitle: text(snippet?.title) ? displayName(text(snippet?.title), '') || null : null,
        declaredBulgarian: false,
      });
    }
  }
  return [...found.values()];
}

// ── Оркестрация ─────────────────────────────────────────────────────────────

export const DISCOVERY: Record<string, () => Promise<FoundStream[]>> = {
  twitch: discoverTwitch,
  kick: discoverKick,
  youtube: discoverYouTube,
};
