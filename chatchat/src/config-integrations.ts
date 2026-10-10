import { z } from 'zod';
import { withoutEmpty } from './config.js';

/**
 * Интеграцията с helpdesk (FR-09, §14.4) — отделна среда, за да не расте config.ts. Тайните на
 * конекторите (токени, HMAC ключове) се пазят в базата шифровани с INTEGRATION_KEK — отделен ключ,
 * различен от MFA_ENC_KEY и FILES_KEK (един ключ — една цел). Без ключ интеграцията е изключена:
 * админ API връща 503 `integrations_unavailable`, изпращачът не тръгва (fail-closed за тайните).
 */

/** 32 байта в base64 (`openssl rand -base64 32`). */
function isKey32(v: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === 32;
}

function splitKeys(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const IntegrationsEnvSchema = z.object({
  /** Главният ключ за тайните на конекторите (32 байта в base64). Празно → интеграцията е изключена. */
  INTEGRATION_KEK: z.string().trim().default(''),
  /** Стари ключове след ротация (запетаи) — само за четене; записът на конектора шифрова с новия. */
  INTEGRATION_KEK_PREVIOUS: z.string().trim().default(''),
  /** През колко секунди изпращачът минава през outbox-а към helpdesk-а (0 = никога). */
  INTEGRATION_SWEEP_SECONDS: z.coerce.number().int().min(0).max(3600).default(15),
  /** Опитите до dead-letter (повторите са с експоненциален отстъп: 1, 2, 4… мин., най-много 1 ч). */
  INTEGRATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(30).default(10),
  /** Таван на една заявка към helpdesk-а (DNS + връзка + отговор). */
  INTEGRATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  /** Прозорецът за времевия печат на входящите известия (± секунди) — по-старото е отказано. */
  INTEGRATION_INBOUND_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  /** Колко дни се пазят доставените/пропуснатите редове в дневника на доставките. */
  INTEGRATION_LOG_DAYS: z.coerce.number().int().min(7).max(3650).default(90),
});

export type IntegrationsConfig = z.infer<typeof IntegrationsEnvSchema>;

export function loadIntegrationsConfig(env: NodeJS.ProcessEnv = process.env): IntegrationsConfig {
  const clean = withoutEmpty(env);
  const parsed = IntegrationsEnvSchema.superRefine((c, ctx) => {
    if (c.INTEGRATION_KEK === '') return;
    if (!isKey32(c.INTEGRATION_KEK)) {
      ctx.addIssue({
        code: 'custom',
        path: ['INTEGRATION_KEK'],
        message: 'INTEGRATION_KEK трябва да е 32 байта в base64 (openssl rand -base64 32)',
      });
      return;
    }
    if (!splitKeys(c.INTEGRATION_KEK_PREVIOUS).every(isKey32)) {
      ctx.addIssue({
        code: 'custom',
        path: ['INTEGRATION_KEK_PREVIOUS'],
        message: 'INTEGRATION_KEK_PREVIOUS: ключове по 32 байта в base64, разделени със запетая',
      });
    }
    const mine = Buffer.from(c.INTEGRATION_KEK, 'base64');
    for (const other of ['MFA_ENC_KEY', 'FILES_KEK'] as const) {
      const value = clean[other]?.trim() ?? '';
      if (isKey32(value) && Buffer.from(value, 'base64').equals(mine)) {
        ctx.addIssue({
          code: 'custom',
          path: ['INTEGRATION_KEK'],
          message: `INTEGRATION_KEK трябва да е различен от ${other} (отделен ключ за всяка цел)`,
        });
      }
    }
  }).safeParse(clean);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна конфигурация на интеграциите: ${issues}`);
  }
  return parsed.data;
}

/** Ключовете като байтове (валидирани от схемата); null → интеграцията е изключена. */
export function integrationKeys(
  cfg: Pick<IntegrationsConfig, 'INTEGRATION_KEK' | 'INTEGRATION_KEK_PREVIOUS'>,
): { current: Buffer; previous: Buffer[] } | null {
  if (cfg.INTEGRATION_KEK === '') return null;
  return {
    current: Buffer.from(cfg.INTEGRATION_KEK, 'base64'),
    previous: splitKeys(cfg.INTEGRATION_KEK_PREVIOUS).map((k) => Buffer.from(k, 'base64')),
  };
}
