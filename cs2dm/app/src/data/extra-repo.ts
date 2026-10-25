import type { PrismaClient } from '@prisma/client';
import type { CupStanding, CupWeek, CupWinner } from '../cup.js';
import type { PublicEvent } from '../events.js';
import type { PlayerMissions } from '../missions.js';
import { loadMissions } from './arena-data.js';
import { loadCupStandings, loadCupWinners } from './cup-data.js';
import { loadHonors } from './honors.js';
import { loadMatchHighlights, loadMatchReport, loadPlayerMatches } from './match-analytics.js';
import { loadEvents, loadMatch, loadRecentMatches } from './public-extra.js';
import type {
  MatchDetail,
  MatchHighlights,
  MatchListRow,
  MatchReport,
  PlayerHonors,
  PlayerMatchRow,
  Repo,
} from './repo.js';

type ExtraReads =
  | 'events'
  | 'recentMatches'
  | 'match'
  | 'honors'
  | 'matchHighlights'
  | 'matchReport'
  | 'playerMatches'
  | 'missions'
  | 'cupStandings'
  | 'cupWinners';

/**
 * Публичното четене след етап 1 — събития (§12), мачове (§13), отличия (§15), мисии (§16), купа (§17). PrismaRepo го
 * наследява, за да остане всеки файл кратък; заявките са в `public-extra.ts`, `match-analytics.ts`, `honors.ts`,
 * `arena-data.ts`, `cup-data.ts`. Само препращане — никаква логика тук.
 */
export abstract class ExtraRepo implements Pick<Repo, ExtraReads> {
  constructor(protected readonly db: PrismaClient) {}

  events(now: Date): Promise<PublicEvent[]> {
    return loadEvents(this.db, now);
  }

  recentMatches(limit: number): Promise<MatchListRow[]> {
    return loadRecentMatches(this.db, limit);
  }

  match(id: number): Promise<MatchDetail | null> {
    return loadMatch(this.db, id);
  }

  honors(steamId: string): Promise<PlayerHonors> {
    return loadHonors(this.db, steamId);
  }

  matchHighlights(id: number): Promise<MatchHighlights | null> {
    return loadMatchHighlights(this.db, id);
  }

  matchReport(id: number, steamId: string): Promise<MatchReport | null> {
    return loadMatchReport(this.db, id, steamId);
  }

  playerMatches(steamId: string, limit: number): Promise<PlayerMatchRow[]> {
    return loadPlayerMatches(this.db, steamId, limit);
  }

  missions(steamId: string, day: string): Promise<PlayerMissions> {
    return loadMissions(this.db, steamId, day);
  }

  cupStandings(week: CupWeek, limit: number): Promise<CupStanding[]> {
    return loadCupStandings(this.db, week, limit);
  }

  cupWinners(limit: number): Promise<CupWinner[]> {
    return loadCupWinners(this.db, limit);
  }
}
