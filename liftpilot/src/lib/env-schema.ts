// The server's configuration as a schema, apart from src/lib/env.ts so that the scripts run on the server
// (scripts/legal-notice.ts) read it the same way without loading the server-only modules.
import { z } from 'zod';
import { MIN_TRIAL_DAYS } from './legal';
import { dayStart } from './billing';

/** Docker Compose passes an unset variable as an empty string: both mean "not configured". */
const optional = z.string().optional().transform((v) => (v?.trim() ? v.trim() : undefined));
/** The Vertex AI regions of the sketches' reading: the multi-region `eu` and the europe-* regions in the 27 countries of
 *  the European Union, one by one (London europe-west2 and Zurich europe-west6 are in Europe, not in the EU). */
export const VERTEX_REGIONS = ['eu', 'europe-west1', 'europe-west3', 'europe-west4', 'europe-west8', 'europe-west9', 'europe-west10',
  'europe-west12', 'europe-north1', 'europe-north2', 'europe-central2', 'europe-southwest1'] as const;
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters')
    .refine((s) => !/CHANGE_?ME|changeme|ПРОМЕНИ/i.test(s), 'AUTH_SECRET is still the example value'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  /** search engines may index the public pages only after the owner's approval */
  ALLOW_INDEXING: z.enum(['true', 'false']).default('false'),
  /** who may register a company: during the beta only the addresses the platform administrator invited (`invite`,
   *  src/lib/beta-invites.ts), or anyone (`open`); an empty value is the default */
  REGISTRATION_MODE: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.enum(['invite', 'open']).default('invite')),
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
  /** the reading of the survey sketches (round 50): Claude on Google Cloud Vertex AI, in the EU only — the multi-region
   *  `eu` or one of the EU-27 regions of VERTEX_REGIONS (never global, another continent, the UK or Switzerland). Off
   *  unless the project, the service account's key file (a regular file, mode 600: src/server/schizzi/config.ts) and the
   *  model are there */
  VERTEX_PROJECT_ID: optional.pipe(z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'a Google Cloud project id').optional()),
  VERTEX_REGION: optional.pipe(z.enum(VERTEX_REGIONS, { message: `an EU region: ${VERTEX_REGIONS.join(', ')}` }).optional()).transform((v): string => v ?? 'eu'),
  VERTEX_CREDENTIALS_FILE: optional.pipe(z.string().regex(/^\/[^\0]{1,500}$/, 'an absolute path').optional()),
  SKETCH_MODEL: optional.pipe(z.string().regex(/^claude-[a-z0-9-]{1,60}(?:@\d{8})?$/, 'a Claude model id').optional()).transform((v) => v ?? 'claude-opus-5-5'),
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
