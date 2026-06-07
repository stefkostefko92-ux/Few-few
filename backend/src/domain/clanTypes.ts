/** Clan and clan-war domain types (GDD §7.2). */

export interface Clan {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  memberIds: string[];
  currentWarId: string | null;
  createdAt: number;
}

export interface ClanWar {
  id: string;
  clanAId: string;
  clanBId: string;
  scoreA: number;
  scoreB: number;
  startedAt: number;
  endsAt: number;
}

export interface ChatMessage {
  from: string;
  name: string;
  text: string;
  at: number;
}

export const CLAN_MAX_MEMBERS = 50; // §7.2: "Кланове (до 50 души)"
export const CLAN_WAR_DURATION_MS = 48 * 3_600_000;
