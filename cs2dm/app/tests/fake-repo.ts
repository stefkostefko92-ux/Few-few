import type {
  Repo,
  LeaderRow,
  MatchDetail,
  PlayerHonors,
  MatchHighlights,
  MatchReport,
  PlayerMatchRow,
  PublicBan,
  PublicPlayer,
  StatLine,
} from '../src/data/repo.js';
import { pagesFor } from '../src/data/repo.js';
import type { PublicEvent } from '../src/events.js';
import { assignMissions, type PlayerMissions } from '../src/missions.js';

/** Тестов двойник на репото: данни, подадени от теста — никога в продукционния код. */
export interface FakeData {
  players: PublicPlayer[];
  board: LeaderRow[];
  stats: StatLine[];
  bans: PublicBan[];
  tiers: Awaited<ReturnType<Repo['vipTiers']>>;
  events?: PublicEvent[];
  matches?: MatchDetail[];
  honors?: PlayerHonors;
  highlights?: Record<number, MatchHighlights>;
  reports?: MatchReport[];
  playerMatches?: PlayerMatchRow[];
  missions?: PlayerMissions;
}

export const PLAYER_ID = '76561198000000001';

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
    recentMatches: async (limit) =>
      (data.matches ?? []).slice(0, limit).map(({ rows, ...match }) => ({
        id: match.id,
        map: match.map,
        mode: match.mode,
        startedAt: match.startedAt,
        endedAt: match.endedAt,
        kills: match.kills,
        players: match.players,
        top: rows[0]
          ? { steamId: rows[0].steamId, name: rows[0].name, kills: rows[0].kills }
          : null,
      })),
    match: async (id) => (data.matches ?? []).find((match) => match.id === id) ?? null,
    honors: async () => data.honors ?? { badges: [], duels: { wins: 0, losses: 0, draws: 0 } },
    matchHighlights: async (id) => data.highlights?.[id] ?? null,
    matchReport: async (id, steamId) =>
      (data.reports ?? []).find((r) => r.match.id === id && r.steamId === steamId) ?? null,
    playerMatches: async (_steamId, limit) => (data.playerMatches ?? []).slice(0, limit),
    // Без данни — както истинското репо без редове: трите мисии за деня с 0.
    missions: async (steamId, day) =>
      data.missions ?? {
        day,
        today: assignMissions(steamId, day).map((def) => ({ ...def, progress: 0, done: false })),
        completed: 0,
      },
  };
}
