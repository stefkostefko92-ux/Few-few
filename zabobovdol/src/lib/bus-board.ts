// Таблото на разписанието за /transport: кой курс е следващият (по часа на
// София), кои вече са минали днес и кои пътуват само в работни дни. Чиста
// логика без база — тестове в __tests__/bus-board.test.ts.
import { sofiaWallNow } from "@/lib/ingest-outages-core";
import { nextBus, workdayOnlyTimes, type BusDirectionLike } from "@/lib/today";

export type BusTime = {
  time: string;
  /** Курсът вече е минал днес. */
  past: boolean;
  /** Това е следващият курс днес. */
  next: boolean;
  /** Пътува само в работни дни (по бележките на разписанието). */
  workdayOnly: boolean;
};

export type BusBoard = {
  times: BusTime[];
  /** Следващият курс днес и след колко минути; null — днес няма повече (или `readable` е false). */
  next: { time: string; inMinutes: number } | null;
  hasWorkdayOnly: boolean;
  /**
   * false — бележките имат ограничение по дни, което не можем да разчетем
   * (напр. „само в събота“). Тогава „следващ“ не се смята и страницата НЕ
   * казва „днес няма повече курсове“ — само показва часовете и бележките.
   */
  readable: boolean;
};

const toMin = (hhmm: string): number | null => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function busBoard(dir: BusDirectionLike, now: Date = new Date()): BusBoard {
  const wall = sofiaWallNow(now);
  const nowMin = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  const parsed = workdayOnlyTimes(dir.notes);
  const workday = parsed ?? new Set<string>();
  const nextTime = parsed ? nextBus(dir, now) : null;
  const times = dir.times.map((t) => {
    const min = toMin(t);
    return {
      time: t,
      past: min !== null && min <= nowMin,
      next: nextTime !== null && t.trim() === nextTime,
      workdayOnly: workday.has(t.trim()),
    };
  });
  const nm = nextTime ? toMin(nextTime) : null;
  return {
    times,
    next: nextTime && nm !== null ? { time: nextTime, inMinutes: nm - nowMin } : null,
    hasWorkdayOnly: times.some((t) => t.workdayOnly),
    readable: parsed !== null,
  };
}

const NBSP = "\u00a0";

/** „след 25 мин.“ / „след 1 ч. и 5 мин.“ / „след 2 ч.“ — числото не се откъсва от мярката. */
export function inMinutesText(min: number): string {
  if (min < 60) return `след ${min}${NBSP}мин.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `след ${h}${NBSP}ч.` : `след ${h}${NBSP}ч. и ${m}${NBSP}мин.`;
}
