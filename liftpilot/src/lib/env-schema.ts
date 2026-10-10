// The server's configuration as a schema, apart from src/lib/env.ts so that the scripts run on the server
// (scripts/legal-notice.ts) read it the same way without loading the server-only modules.
import { z } from 'zod';
import { MIN_TRIAL_DAYS } from './legal';
import { dayStart } from './billing';

/** Docker Compose passes an unset variable as an empty string: both mean "not configured". */
const optional = z.string().optional().transform((v) => (v?.trim() ? v.trim() : undefined));
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters')
    .refine((s) => !/CHANGE_?ME|changeme|ПРОМЕНИ/i.test(s), 'AUTH_SECRET is still the example value'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  /** search engines may index the public pages only after the owner's approval */
  ALLOW_INDEXING: z.enum(['true', 'false']).default('false'),
  PYTHON_BIN: z.string().min(1).default('python3'),
  REPORT_FONT_DIR: z.string().min(1).default('/usr/share/fonts/truetype/dejavu'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** outgoing mail (registration, forgotten password): without a host and a sender both stay closed */
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(2525),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  MAIL_FROM: optional,
  /** the subscription (Stripe): without the secret key, the webhook's secret, the monthly price and the product of the
   *  slots the subscription stays off and every company works as before (src/lib/billing.ts) */
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_MONTHLY: optional,
  STRIPE_PRODUCT_SEATS: optional,
  /** Stripe Tax on the subscription (it needs the account's tax settings) */
  STRIPE_AUTOMATIC_TAX: z.enum(['true', 'false']).default('false'),
  /** days of trial of a new company before its projects become read-only without a subscription: never fewer than the
   *  terms promise */
  BILLING_TRIAL_DAYS: z.coerce.number().int().min(MIN_TRIAL_DAYS).max(365).default(MIN_TRIAL_DAYS),
  /** the first day of paid use (YYYY-MM-DD, from 00:00 UTC), the day stated in the owners' e-mail at least 30 days
   *  before (docs/terms-changes.md, 1a): without it, or before it, the subscription stays off whatever Stripe's values */
  BILLING_START: optional.pipe(z.string().refine((s) => dayStart(s) !== null, 'a day written YYYY-MM-DD').optional()),
});

export type Env = z.infer<typeof envSchema>;

/** The configuration read from `source` (process.env), or an error naming every wrong value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server configuration: ${issues}`);
  }
  return parsed.data;
}
