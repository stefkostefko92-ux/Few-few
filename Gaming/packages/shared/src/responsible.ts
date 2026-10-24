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
  dailyLimitMinutes: number | null;
  /** ISO дата до която трае самоизключването; null = няма активно. */
  selfExcludedUntil: string | null;
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
