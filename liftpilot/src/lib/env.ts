import 'server-only';
import { z } from 'zod';

// Server configuration, validated once on first use (the build runs without it).
/** Docker Compose passes an unset variable as an empty string: both mean "not configured". */
const optional = z.string().optional().transform((v) => (v?.trim() ? v.trim() : undefined));
const schema = z.object({
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
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Public URL without trailing slash; safe to call at build time. */
export const publicBaseUrl = (): string => (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
export const indexingAllowed = (): boolean => process.env.ALLOW_INDEXING === 'true';
