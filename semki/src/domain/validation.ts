// Входът от формите на дашборда (низове) и от командите (числа) — през едни и същи граници.
import { z } from 'zod';
import { SEED_KEYS } from './seeds.js';

export const MAX_COUNT = 100_000;
export const MAX_HOURS_LEFT = 10_000;

const DECIMAL = /^\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;

// „87,4“ и „87.4“ са едно и също число; всичко друго (празно, „1e3“, „abc“) е грешка.
export function parseDecimal(raw: string): number {
  const s = raw.trim().replace(',', '.');
  return DECIMAL.test(s) ? Number(s) : Number.NaN;
}

function decimal(min: number, max: number, message: string) {
  return z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const n = typeof v === 'number' ? v : parseDecimal(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    })
    .pipe(z.number().min(min, message).max(max, message));
}

function integer(min: number, max: number, message: string) {
  return z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const n = typeof v === 'number' ? v : INTEGER.test(v.trim()) ? Number(v.trim()) : Number.NaN;
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().min(min, message).max(max, message));
}

const checkbox = z
  .union([z.literal('on'), z.literal('1'), z.literal('true'), z.boolean()])
  .optional()
  .transform((v) => v === true || v === 'on' || v === '1' || v === 'true');

export const snowflake = z.string().regex(/^\d{17,20}$/, 'Невалидно Discord ID');

const optionalSnowflake = z
  .union([z.literal(''), snowflake])
  .optional()
  .transform((v) => (v ? v : null));

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Часът е във формат ЧЧ:ММ');

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const seedKeySchema = z.enum(SEED_KEYS);
export const percentSchema = decimal(0, 100, 'Процентът е от 0 до 100');
export const countSchema = integer(1, MAX_COUNT, `Броят е цяло число от 1 до ${MAX_COUNT}`);

export const batchCreateSchema = z.object({
  seedTypeKey: seedKeySchema,
  count: countSchema,
  percent: percentSchema,
});

export const batchEditSchema = z.object({
  count: countSchema,
  percent: percentSchema,
});

export const seedTypeSchema = z.object({
  decayPercent: decimal(0.01, 100, 'Спадът е от 0,01 до 100%'),
  decayMinutes: integer(1, 10_080, 'Минутите са от 1 до 10080'),
});

export const ruleSchema = z
  .object({
    kind: z.enum(['PERCENT', 'HOURS_LEFT']),
    threshold: decimal(0, MAX_HOURS_LEFT, 'Невалиден праг'),
    seedTypeKey: z
      .union([z.literal(''), seedKeySchema])
      .optional()
      .transform((v) => (v ? v : null)),
    channelId: snowflake,
    roleId: snowflake,
    enabled: checkbox,
  })
  .superRefine((rule, ctx) => {
    if (rule.kind === 'PERCENT' && rule.threshold > 100) {
      ctx.addIssue({ code: 'custom', path: ['threshold'], message: 'Прагът в % е от 0 до 100' });
    }
  });

export const settingsSchema = z.object({
  dashboardRoleId: optionalSnowflake,
  commandRoleId: optionalSnowflake,
  quietEnabled: checkbox,
  windowStart: hhmm,
  windowEnd: hhmm,
  timezone: z.string().refine(isValidTimezone, 'Непозната часова зона'),
});

export const idParamSchema = integer(1, 2_147_483_647, 'Невалиден номер');

// Отметките от дашборда: едно поле идва като низ, няколко — като масив; повторенията отпадат.
const NONE_SELECTED = 'Не си избрал нито една партида.';
export const idListSchema = z
  .union([z.string(), z.array(z.string())], { error: NONE_SELECTED })
  .transform((v, ctx) => {
    const ids: number[] = [];
    for (const raw of Array.isArray(v) ? v : [v]) {
      const r = idParamSchema.safeParse(raw);
      if (!r.success) {
        ctx.addIssue({ code: 'custom', message: 'Невалиден номер на партида' });
        return z.NEVER;
      }
      ids.push(r.data);
    }
    return [...new Set(ids)];
  })
  .pipe(z.array(z.number()).min(1, NONE_SELECTED).max(500, 'Най-много 500 партиди наведнъж'));

export type BatchCreateInput = z.output<typeof batchCreateSchema>;
export type BatchEditInput = z.output<typeof batchEditSchema>;
export type SeedTypeInput = z.output<typeof seedTypeSchema>;
export type RuleInput = z.output<typeof ruleSchema>;
export type SettingsInput = z.output<typeof settingsSchema>;
