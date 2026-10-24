import type { AddressInfo } from 'node:net';
import type { Repo, LeaderRow, PublicBan, PublicPlayer, StatLine } from '../src/data/repo.js';
import { pagesFor } from '../src/data/repo.js';
import type { PublicEvent } from '../src/events.js';
import type { LiveSource, LiveStatus } from '../src/live.js';
import { createServer, type ServerDeps } from '../src/server.js';

/** Тестов двойник на репото: данни, подадени от теста — никога в продукционния код. */
export interface FakeData {
  players: PublicPlayer[];
  board: LeaderRow[];
  stats: StatLine[];
  bans: PublicBan[];
  tiers: Awaited<ReturnType<Repo['vipTiers']>>;
  events?: PublicEvent[];
}

export const PLAYER_ID = '76561198000000001';

export function sampleData(): FakeData {
  const now = new Date('2026-10-20T12:00:00Z');
  return {
    players: [
      {
        steamId: PLAYER_ID,
        name: 'Sandstorm',
        avatarUrl: null,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ],
    board: [
      {
        rank: 1,
        steamId: PLAYER_ID,
        name: 'Sandstorm',
        kills: 420,
        deaths: 200,
        headshots: 180,
        xp: 6200n,
      },
    ],
    stats: [0, 1].map((seasonId) => ({
      seasonId,
      kills: 420,
      deaths: 200,
      headshots: 180,
      assists: 40,
      damage: 51000,
      shotsFired: 4000,
      shotsHit: 1300,
      bestStreak: 14,
      bountiesClaimed: 3,
      revenges: 7,
      xp: 6200n,
      playtimeSec: 18000,
    })),
    bans: [],
    tiers: [],
  };
}

export function fakeRepo(data: FakeData, calls: string[] = []): Repo {
  return {
    currentSeason: async () => ({
      id: 1,
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: null,
    }),
    seasons: async () => [
      { id: 1, startsAt: new Date('2026-10-01T00:00:00Z'), endsAt: null },
      { id: 0, startsAt: new Date('2026-10-01T00:00:00Z'), endsAt: null },
    ],
    leaderboard: async (q) => ({
      rows: data.board,
      total: data.board.length,
      page: q.page,
      pageSize: q.pageSize,
      pages: pagesFor(data.board.length, q.pageSize),
    }),
    player: async (id) => {
      calls.push(`player:${id}`);
      return data.players.find((p) => p.steamId === id) ?? null;
    },
    playerStats: async (id, seasons) =>
      data.stats.filter(() => id === PLAYER_ID).filter((s) => seasons.includes(s.seasonId)),
    weaponStats: async () => [
      { weapon: 'weapon_ak47', kills: 1600, headshots: 700 },
      { weapon: 'knife', kills: 30, headshots: 0 },
      { weapon: 'knife_t', kills: 12, headshots: 0 },
    ],
    heatmap: async () => ({
      kills: [
        { cx: 10, cy: 12, n: 9 },
        { cx: 11, cy: 12, n: 2 },
      ],
      deaths: [{ cx: 20, cy: 5, n: 4 }],
    }),
    activeBans: async (q) => ({
      rows: data.bans,
      total: data.bans.length,
      page: q.page,
      pageSize: q.pageSize,
      pages: pagesFor(data.bans.length, q.pageSize),
    }),
    vipTiers: async () => data.tiers,
    sitemapPlayers: async () => [
      { steamId: PLAYER_ID, updatedAt: new Date('2026-10-20T12:00:00Z') },
    ],
    lastStatsUpdate: async () => new Date('2026-10-20T12:00:00Z'),
    events: async () => data.events ?? [],
  };
}

export function fixedLive(status: LiveStatus): LiveSource {
  return { get: async () => status };
}

export const LIVE_KNOWN: Extract<LiveStatus, { online: true }> = {
  known: true,
  online: true,
  source: 'plugin',
  map: 'de_dust2',
  mode: 'All Weapons',
  humans: 7,
  bots: 3,
  maxPlayers: 20,
  updatedAt: new Date('2026-10-24T10:00:00Z'),
};

export const OK_HEALTH = { db: async () => {}, redis: async () => {} };

export interface Running {
  base: string;
  close: () => Promise<void>;
  get: (path: string, headers?: Record<string, string>) => Promise<Response>;
}

export async function start(
  deps: Partial<ServerDeps> & Pick<ServerDeps, 'repo'>,
): Promise<Running> {
  const app = createServer({
    live: fixedLive({ known: false }),
    health: OK_HEALTH,
    rateLimitPerMinute: 100_000,
    ...deps,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    get: (path, headers = {}) => fetch(`${base}${path}`, { headers, redirect: 'manual' }),
  };
}

/** Текстът на HTML атрибут/елемент без EJS екранирането. */
export function decode(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function metaContent(html: string, attr: 'name' | 'property', key: string): string | null {
  const re = new RegExp(
    `<meta ${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content="([^"]*)">`,
  );
  const found = re.exec(html);
  return found ? decode(found[1] ?? '') : null;
}
