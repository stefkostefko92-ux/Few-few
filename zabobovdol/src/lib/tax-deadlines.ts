// Сроковете за местните данъци и такси (общите по закон) и кой е следващият
// спрямо днешния ден по софийско време. Чиста логика — тества се с node:test.

export type Deadline = {
  /** Месец (1–12) и ден на срока. */
  month: number;
  day: number;
  what: string;
};

export const TAX_DEADLINES: readonly Deadline[] = [
  {
    month: 4,
    day: 30,
    what: "5% отстъпка при плащане на целия годишен данък наведнъж (за данък сгради, такса смет и данък МПС).",
  },
  {
    month: 6,
    day: 30,
    what: "Първа вноска на данък сгради, такса битови отпадъци и данък върху превозните средства.",
  },
  { month: 10, day: 31, what: "Втора (последна) вноска на същите данъци и такси." },
];

export type DeadlineStatus = Deadline & {
  /** „до 30 април“ (с неразделим интервал). */
  label: string;
  /** Следващата дата на срока (тази или следващата година), ГГГГ-ММ-ДД. */
  nextIso: string;
  /** Дни до следващата дата (0 = днес). */
  daysLeft: number;
  /** Най-близкият предстоящ срок. */
  next: boolean;
  /** Тазгодишният срок е минал (и това не е следващият). */
  passed: boolean;
};

const MONTHS_GEN = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];

const pad = (n: number) => String(n).padStart(2, "0");
const dayNo = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;

/**
 * Статус на всеки срок спрямо `todayIso` (ГГГГ-ММ-ДД, софийско време).
 * Срокът е валиден до края на деня си — на 31 октомври той още е „днес“.
 */
export function deadlineStatuses(
  todayIso: string,
  deadlines: readonly Deadline[] = TAX_DEADLINES,
): DeadlineStatus[] {
  const [y, m, d] = todayIso.split("-").map(Number);
  const today = dayNo(y, m, d);
  const rows = deadlines.map((dl) => {
    const thisYear = dayNo(y, dl.month, dl.day);
    const year = thisYear >= today ? y : y + 1;
    const nextDay = dayNo(year, dl.month, dl.day);
    return {
      ...dl,
      label: `до ${dl.day} ${MONTHS_GEN[dl.month - 1]}`,
      nextIso: `${year}-${pad(dl.month)}-${pad(dl.day)}`,
      daysLeft: nextDay - today,
      passedThisYear: thisYear < today,
    };
  });
  const soonest = Math.min(...rows.map((r) => r.daysLeft));
  return rows.map(({ passedThisYear, ...r }) => {
    const next = r.daysLeft === soonest;
    return { ...r, next, passed: passedThisYear && !next };
  });
}

/** „днес“, „утре“, „след 7 дни“. */
export function daysLeftLabel(n: number): string {
  if (n <= 0) return "днес";
  if (n === 1) return "утре";
  return `след ${n} дни`;
}
