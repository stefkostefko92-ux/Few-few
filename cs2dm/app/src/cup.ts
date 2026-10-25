import { zonedToUtc } from './events.js';
import { missionDay } from './missions.js';

/**
 * Седмичната купа (CONTRACT §17): сборът от XP в мачовете (`match_players.xp`), завършили от понеделник 00:00 до
 * неделя 23:59 местно време (DISPLAY_TZ = `CS2DM_DISPLAY_TZ` на плъгина); скритите играчи не участват. Равен XP →
 * по-малкият SteamID64. Първият взема `cup_winner`, вторият и третият — `cup_podium` (значки с период = понеделника).
 * Същото като `CupRules` в C# (тестът чете `.cs`).
 *
 * `top` — редовете на страницата · `winners` — последните победители · `graceMinutes` — колко след края на седмицата
 * работникът чака закъснели мачове · `lookbackWeeks` — колко минали седмици проверява за неврачени значки.
 */
export const CUP = { top: 20, winners: 8, podium: 3, graceMinutes: 10, lookbackWeeks: 4 } as const;
export const CUP_BADGES = { winner: 'cup_winner', podium: 'cup_podium' } as const;

export interface CupWeek {
  /** Понеделникът (`yyyy-MM-dd`, местна дата) — и периодът на значките. */
  key: string;
  start: Date;
  end: Date;
}

/** Ред в класирането на седмицата. */
export interface CupStanding {
  place: number;
  steamId: string;
  name: string;
  xp: number;
  matches: number;
}

/** Победител от минала седмица (само видим играч). */
export interface CupWinner {
  week: string;
  steamId: string;
  name: string;
  xp: number;
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Местната полунощ в UTC; зона без полунощ в този ден (смяна на часа в 00:00) → първият валиден половин час. */
function localMidnight(day: string, timeZone: string): Date {
  for (const time of ['00:00', '00:30', '01:00', '01:30']) {
    const at = zonedToUtc(`${day}T${time}`, timeZone);
    if (at) return at;
  }
  throw new Error(`няма местна полунощ за ${day} в ${timeZone}`);
}

export function cupWeek(now: Date, timeZone: string): CupWeek {
  const today = missionDay(now, timeZone);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const key = addDays(today, -weekday);
  return {
    key,
    start: localMidnight(key, timeZone),
    end: localMidnight(addDays(key, 7), timeZone),
  };
}

/** Последните `count` завършени седмици преди тази на `now`, най-новата първа. */
export function closedWeeks(now: Date, timeZone: string, count: number): CupWeek[] {
  const weeks: CupWeek[] = [];
  let week = cupWeek(now, timeZone);
  for (let i = 0; i < count; i++) {
    week = cupWeek(new Date(week.start.getTime() - 1), timeZone);
    weeks.push(week);
  }
  return weeks;
}
