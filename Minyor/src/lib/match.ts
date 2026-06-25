// Помощни типове и функции за футболните мачове на „Миньор“.

export type MatchLike = {
  id: string;
  opponent: string;
  isHome: boolean;
  competition?: string | null;
  season?: string | null;
  round?: string | null;
  kickoff: Date;
  venue?: string | null;
  status: "SCHEDULED" | "FINISHED" | "POSTPONED" | "CANCELLED";
  homeGoals?: number | null;
  awayGoals?: number | null;
  ticketUrl?: string | null;
  notes?: string | null;
};

export type Outcome = "WIN" | "DRAW" | "LOSS";

// Резултат от гледна точка на „Миньор“ (нашите голове срещу тези на съперника).
export function matchResult(m: MatchLike): {
  ours: number | null;
  theirs: number | null;
  outcome: Outcome | null;
} {
  const home = m.homeGoals;
  const away = m.awayGoals;
  if (m.status !== "FINISHED" || home == null || away == null) {
    return { ours: null, theirs: null, outcome: null };
  }
  const ours = m.isHome ? home : away;
  const theirs = m.isHome ? away : home;
  const outcome: Outcome = ours > theirs ? "WIN" : ours < theirs ? "LOSS" : "DRAW";
  return { ours, theirs, outcome };
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  WIN: "Победа",
  DRAW: "Равенство",
  LOSS: "Загуба",
};

export const OUTCOME_SHORT: Record<Outcome, string> = {
  WIN: "П",
  DRAW: "Р",
  LOSS: "З",
};
