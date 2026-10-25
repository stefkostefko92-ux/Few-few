import type { PublicEvent } from '../events.js';
import type { HeatCell } from '../heatmap.js';
import type { MomentKind } from '../highlights.js';

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

/**
 * Мач в списъка (CONTRACT §13). Първият (`top`) е null-ван, ако е скрит (чл. 21 GDPR) — никога
 * името на скрит играч.
 */
export interface MatchListRow {
  id: number;
  map: string;
  mode: string;
  startedAt: Date;
  endedAt: Date;
  kills: number;
  players: number;
  top: { steamId: string | null; name: string | null; kills: number } | null;
}

/** Ред в картата на мача; скрит играч → `steamId` и `name` са null (показва се „скрит играч“). */
export interface MatchRow {
  place: number;
  steamId: string | null;
  name: string | null;
  kills: number;
  deaths: number;
  headshots: number;
  bestStreak: number;
  bountiesClaimed: number;
  xp: number;
  topWeapon: string | null;
  topWeaponKills: number;
}

export interface MatchDetail extends Omit<MatchListRow, 'top'> {
  seasonId: number;
  /** Множителят в десети (10…30) в края на мача. */
  xpTenths: number;
  event: { bg: string; en: string; it: string } | null;
  rows: MatchRow[];
}

/** Име в анализите на мача: скрит играч (чл. 21 GDPR) → и двете null („скрит играч“, без линк). */
export interface MatchName {
  steamId: string | null;
  name: string | null;
}

/** Хайлайтите на мача (§13) — от убийствата между хора в прозореца му. */
export interface MatchHighlights {
  /** Има ли запазени убийства за мача (иначе — само картата, без хайлайти). */
  recorded: boolean;
  multiKills: Array<MatchName & { kills: number; offsetMs: number; weapons: string[] }>;
  collections: Array<{ kind: MomentKind; count: number; leader: MatchName; leaderCount: number }>;
  longest: (MatchName & { weapon: string; meters: number; offsetMs: number }) | null;
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
  /** Последните мачове (CONTRACT §13), най-новият първи. */
  recentMatches(limit: number): Promise<MatchListRow[]>;
  /** Един мач с всички редове по място; няма → null. */
  match(id: number): Promise<MatchDetail | null>;
  /** Хайлайтите на мача; няма мач → null. */
  matchHighlights(id: number): Promise<MatchHighlights | null>;
}

export function pagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
