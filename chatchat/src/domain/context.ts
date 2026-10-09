import { z } from 'zod';

/**
 * Диагностичният контекст (§10.1). Задължителен за всеки случай (FR-02) и винаги видим в UI;
 * използва се при търсенето (AC-07). Само технически данни — без имена, адреси или телефони.
 */
export const PHASES = [
  'startup',
  'travel',
  'leveling',
  'doors',
  'stop',
  'standby',
  'maintenance',
  'unknown',
] as const;

const short = (max: number) => z.string().trim().min(1).max(max);

export const DiagnosticContextSchema = z.object({
  productModel: short(80),
  hardwareRevision: short(20).nullable(),
  firmware: short(20).nullable(),
  serial: short(80).nullable(),
  errorCode: short(20).nullable(),
  phase: z.enum(PHASES).default('unknown'),
  symptoms: z.array(short(120)).max(20).default([]),
  observations: z.array(short(500)).max(30).default([]),
  /** Свободни опции на конфигурацията (напр. { inverter: "X100" }). */
  options: z.record(z.string().max(40), z.string().max(80)).default({}),
});

export type DiagnosticContext = z.infer<typeof DiagnosticContextSchema>;

/** Кои полета липсват за „точен продуктов контекст“ (§11.2 exact_product_context). */
export function missingContext(ctx: DiagnosticContext): Array<'hardwareRevision' | 'firmware'> {
  const missing: Array<'hardwareRevision' | 'firmware'> = [];
  if (ctx.hardwareRevision === null) missing.push('hardwareRevision');
  if (ctx.firmware === null) missing.push('firmware');
  return missing;
}

export function hasExactProductContext(ctx: DiagnosticContext): boolean {
  return missingContext(ctx).length === 0;
}
