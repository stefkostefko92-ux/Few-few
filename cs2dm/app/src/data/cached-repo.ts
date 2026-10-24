import type { Repo } from './repo.js';

/**
 * Кратък кеш в паметта пред базата: публичните страници се четат много повече, отколкото се
 * променят (плъгинът пише на партиди през 10 s). Пази базата от вълна заявки, без да показва
 * остарели данни повече от няколко секунди. Ограничен по брой записи — профилите са безброй.
 */
export class TtlCache {
  private readonly entries = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(
    private readonly maxEntries = 2000,
    private readonly now: () => number = Date.now,
  ) {}

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const at = this.now();
    const hit = this.entries.get(key);
    if (hit && hit.expires > at) return hit.value as Promise<T>;
    const value = load();
    this.entries.set(key, { expires: at + ttlMs, value });
    // Провалът не се кешира — следващата заявка опитва наново.
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    return value;
  }

  get size(): number {
    return this.entries.size;
  }
}

const SHORT = 10_000;
const LONG = 60_000;

export function withCache(repo: Repo, cache = new TtlCache()): Repo {
  return {
    currentSeason: () => cache.get('season:current', LONG, () => repo.currentSeason()),
    seasons: () => cache.get('season:all', LONG, () => repo.seasons()),
    leaderboard: (q) =>
      cache.get(`lb:${q.seasonId}:${q.sort}:${q.page}:${q.pageSize}`, SHORT, () =>
        repo.leaderboard(q),
      ),
    player: (id) => cache.get(`p:${id}`, SHORT, () => repo.player(id)),
    playerStats: (id, seasons) =>
      cache.get(`ps:${id}:${seasons.join(',')}`, SHORT, () => repo.playerStats(id, seasons)),
    weaponStats: (id) => cache.get(`pw:${id}`, SHORT, () => repo.weaponStats(id)),
    // Прозорецът на heatmap-а се мести всяка милисекунда — ключът е само играчът, а TTL-ът е
    // дълъг: данните и без това са със закъснение от час.
    heatmap: (id, window) => cache.get(`ph:${id}`, LONG, () => repo.heatmap(id, window)),
    activeBans: (q) => cache.get(`bans:${q.page}:${q.pageSize}`, SHORT, () => repo.activeBans(q)),
    vipTiers: () => cache.get('vip', LONG, () => repo.vipTiers()),
    sitemapPlayers: (limit) =>
      cache.get(`sm:${limit}`, 10 * LONG, () => repo.sitemapPlayers(limit)),
    lastStatsUpdate: () => cache.get('lastmod', LONG, () => repo.lastStatsUpdate()),
    // Началото и краят на събитие се смятат при показ спрямо „сега“ — 10 s закъснение е без значение.
    events: (now) => cache.get('events', SHORT, () => repo.events(now)),
  };
}
