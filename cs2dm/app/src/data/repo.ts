import type { PublicEvent } from '../events.js';
import type { HeatCell } from '../heatmap.js';

/**
 * Какво публичният сайт чете от базата. Интерфейсът е тук (без Prisma), за да могат маршрутите
 * да се тестват без база; истинската реализация е `prisma-repo.ts`.
 *
 * Типовете носят САМО публичните полета: банът няма `reason`, IP или админ — каквото го няма в
 * типа, не може да стигне до шаблона.
 */

export const SORT_KEYS = ['xp', 'kills', 'kd', 'hs'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Класирането по K/D и HS% брои само играчи с поне толкова убийства (иначе 1/0 печели). */
export const RATIO_MIN_KILLS = 50;

export const BAN_CATEGORIES = [
  'CHEATING',
  'TOXICITY',
  'EXPLOIT',
  'SPAM',
  'IMPERSONATION',
  'OTHER',
] as const;
export type BanCategory = (typeof BAN_CATEGORIES)[number];

export interface Season {
  id: number;
  startsAt: Date;
  endsAt: Date | null;
}

export interface LeaderRow {
  rank: number;
  steamId: string;
  name: string;
  kills: number;
  deaths: number;
  headshots: number;
  xp: bigint;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface PublicPlayer {
  steamId: string;
  name: string;
  avatarUrl: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface StatLine {
  seasonId: number;
  kills: number;
  deaths: number;
  headshots: number;
  assists: number;
  damage: number;
  shotsFired: number;
  shotsHit: number;
  bestStreak: number;
  bountiesClaimed: number;
  revenges: number;
  xp: bigint;
  playtimeSec: number;
}

export interface WeaponLine {
  weapon: string;
  kills: number;
  headshots: number;
}

/** Публичният ред на банлиста — ТОЧНО полетата от CONTRACT.md §2, нищо повече. */
export interface PublicBan {
  steamId: string;
  targetName: string;
  category: BanCategory;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface PublicVipTier {
  code: string;
  name: string;
  /** Цена с ДДС в евроцентове — цяло число; форматира се само при показ. */
  priceCents: number;
  periodDays: number;
}

export interface SitemapPlayer {
  steamId: string;
  updatedAt: Date;
}

export interface Repo {
  /** Активният сезон (`max(id) WHERE id > 0 AND ends_at IS NULL`), иначе сезон 0. */
  currentSeason(): Promise<Season>;
  seasons(): Promise<Season[]>;
  leaderboard(query: {
    seasonId: number;
    sort: SortKey;
    page: number;
    pageSize: number;
  }): Promise<Paged<LeaderRow>>;
  /** Играч за публичния профил; скрит (`hidden_from_leaderboards`) или непознат → null. */
  player(steamId: string): Promise<PublicPlayer | null>;
  playerStats(steamId: string, seasonIds: number[]): Promise<StatLine[]>;
  weaponStats(steamId: string): Promise<WeaponLine[]>;
  heatmap(
    steamId: string,
    window: { since: Date; until: Date },
  ): Promise<{ kills: HeatCell[]; deaths: HeatCell[] }>;
  activeBans(query: { page: number; pageSize: number; now: Date }): Promise<Paged<PublicBan>>;
  vipTiers(): Promise<PublicVipTier[]>;
  sitemapPlayers(limit: number): Promise<SitemapPlayer[]>;
  /** Последното обновяване на статистиките (lastmod на класацията) или null. */
  lastStatsUpdate(): Promise<Date | null>;
  /** Активните и предстоящите събития (CONTRACT §12), без отменените. */
  events(now: Date): Promise<PublicEvent[]>;
}

export function pagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
