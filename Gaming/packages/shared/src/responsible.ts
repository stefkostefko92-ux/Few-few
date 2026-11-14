import { z } from "zod";

/**
 * Отговорна игра (LAUNCH.md): напомняне за време в играта, дневен лимит на
 * сесията и самоизключване. АСО е социална игра с виртуални чипове — тези
 * инструменти пазят времето и вниманието на играча, не пари.
 */

/** Напомняне „Играете от X мин“ на всеки N минути; 0 = изключено. */
export const REALITY_CHECK_OPTIONS = [0, 30, 60, 120] as const;
export type RealityCheckMinutes = (typeof REALITY_CHECK_OPTIONS)[number];

/** Дневен лимит на сесията (минути); null = без лимит. */
export const DAILY_LIMIT_OPTIONS = [30, 60, 120, 180, 240, 360] as const;

/** Периоди на самоизключване → продължителност в часове (6 месеца ≈ 183 дни). */
export const SELF_EXCLUSION_PERIODS = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
  "6m": 183 * 24,
} as const;
export type SelfExclusionPeriod = keyof typeof SELF_EXCLUSION_PERIODS;

export const responsibleSettingsSchema = z
  .object({
    realityCheckMinutes: z
      .number()
      .int()
      .refine((n) => (REALITY_CHECK_OPTIONS as readonly number[]).includes(n), "invalid_interval"),
    dailyLimitMinutes: z
      .number()
      .int()
      .refine((n) => (DAILY_LIMIT_OPTIONS as readonly number[]).includes(n), "invalid_limit")
      .nullable(),
  })
  .partial()
  .strict();
export type ResponsibleSettingsInput = z.infer<typeof responsibleSettingsSchema>;

export const selfExcludeSchema = z
  .object({
    period: z.enum(Object.keys(SELF_EXCLUSION_PERIODS) as [SelfExclusionPeriod, ...SelfExclusionPeriod[]]),
    /** Изрично потвърждение — самоизключването не може да се отмени преди края. */
    confirm: z.literal(true),
  })
  .strict();
export type SelfExcludeInput = z.infer<typeof selfExcludeSchema>;

/** Изгледът на настройките, който API връща на собственика на акаунта. */
export interface ResponsibleSettingsView {
  realityCheckMinutes: number;
  /** Действащият дневен лимит (минути игра в мачове за игровия ден); null = без. */
  dailyLimitMinutes: number | null;
  /** Чакащо вдигане/махане на лимита: влиза в сила в `effectiveAt` (24 ч след заявката). */
  dailyLimitPending: { minutes: number | null; effectiveAt: string } | null;
  /** Изиграни минути в мачове за текущия игрови ден (сървърно преброени). */
  playedTodayMinutes: number;
  /** ISO дата до която трае самоизключването; null = няма активно. */
  selfExcludedUntil: string | null;
}

/**
 * Дневният лимит се налага от сървъра: щом изиграните минути в мачове за деня
 * стигнат лимита, нови маси и опашки се отказват до края на деня (текущият мач
 * се доиграва). Денят е календарен по софийско време — продуктът е български.
 */
export const PLAY_DAY_TIME_ZONE = "Europe/Sofia";

/** Свалянето на лимита важи веднага; вдигането или махането — след толкова часа. */
export const DAILY_LIMIT_COOLDOWN_HOURS = 24;

/** Отместване на часовата зона спрямо UTC в мс към момента `at`. */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return wall - Math.floor(at / 1000) * 1000;
}

/** Началото (UTC момент) на игровия ден, в който попада `now`. Пази и смяната на часа. */
export function playDayStart(now = Date.now(), timeZone = PLAY_DAY_TIME_ZONE): Date {
  const off = zoneOffsetMs(now, timeZone);
  const wall = new Date(now + off);
  const midnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  let t = midnight - off;
  const offAtMidnight = zoneOffsetMs(t, timeZone);
  if (offAtMidnight !== off) t = midnight - offAtMidnight;
  return new Date(t);
}

/** Началото на следващия игрови ден (денят е 23–25 ч около смяната на часа). */
export function nextPlayDayStart(now = Date.now(), timeZone = PLAY_DAY_TIME_ZONE): Date {
  return playDayStart(playDayStart(now, timeZone).getTime() + 36 * 3_600_000, timeZone);
}

/** Полетата на лимита в базата (действащ + чакащ). */
export interface DailyLimitFields {
  dailyLimitMinutes: number | null;
  dailyLimitPendingMinutes: number | null;
  dailyLimitPendingAt: Date | null;
}

/** Действащият лимит към `now`: чакащата промяна важи, щом времето ѝ е дошло. */
export function effectiveDailyLimit(u: DailyLimitFields, now = Date.now()): number | null {
  if (u.dailyLimitPendingAt && u.dailyLimitPendingAt.getTime() <= now) return u.dailyLimitPendingMinutes;
  return u.dailyLimitMinutes;
}

/**
 * Нова стойност на лимита, поискана от играча. По-строг (или същият) лимит важи
 * веднага и отменя чакащата промяна. По-свободен или махнат — чака
 * DAILY_LIMIT_COOLDOWN_HOURS: иначе лимитът се вдига точно когато е достигнат.
 * Повторна заявка за същата чакаща стойност не рестартира часовника.
 */
export function requestDailyLimit(
  u: DailyLimitFields,
  wanted: number | null,
  now = Date.now(),
): DailyLimitFields {
  const current = effectiveDailyLimit(u, now);
  const stricter = wanted !== null && (current === null || wanted <= current);
  if (stricter) return { dailyLimitMinutes: wanted, dailyLimitPendingMinutes: null, dailyLimitPendingAt: null };
  const base = { dailyLimitMinutes: current };
  const samePending =
    u.dailyLimitPendingAt !== null && u.dailyLimitPendingAt.getTime() > now && u.dailyLimitPendingMinutes === wanted;
  if (samePending) return { ...base, dailyLimitPendingMinutes: wanted, dailyLimitPendingAt: u.dailyLimitPendingAt };
  return {
    ...base,
    dailyLimitPendingMinutes: wanted,
    dailyLimitPendingAt: new Date(now + DAILY_LIMIT_COOLDOWN_HOURS * 3_600_000),
  };
}

/** Изиграни минути за деня от мачовете (начало/край), отрязани до началото на деня. */
export function playedMinutes(
  matches: ReadonlyArray<{ startedAt: Date; endedAt: Date | null }>,
  dayStart: Date,
  now = Date.now(),
): number {
  let ms = 0;
  for (const m of matches) {
    const from = Math.max(m.startedAt.getTime(), dayStart.getTime());
    const to = Math.min(m.endedAt ? m.endedAt.getTime() : now, now);
    if (to > from) ms += to - from;
  }
  return Math.floor(ms / 60_000);
}

/** Активно ли е самоизключване към `now` (изтеклите се игнорират лениво). */
export function selfExclusionActive(until: Date | string | null | undefined, now = Date.now()): boolean {
  if (!until) return false;
  const t = typeof until === "string" ? Date.parse(until) : until.getTime();
  return Number.isFinite(t) && t > now;
}

/** Краят на ново самоизключване; никога не съкращава вече активно. */
export function selfExclusionEnd(
  period: SelfExclusionPeriod,
  current: Date | null | undefined,
  now = Date.now(),
): Date {
  const end = new Date(now + SELF_EXCLUSION_PERIODS[period] * 3_600_000);
  return current && current.getTime() > end.getTime() ? current : end;
}

/** Стабилен код на грешката при отказ заради самоизключване (API + realtime). */
export const SELF_EXCLUDED_CODE = "self_excluded";

/** Стабилен код на грешката при отказ заради достигнат дневен лимит (realtime). */
export const DAILY_LIMIT_CODE = "daily_limit";
