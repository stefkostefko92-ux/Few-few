import 'dotenv/config';
import { z } from 'zod';

/**
 * Валидирана конфигурация от средата. Нищо не се кодира твърдо — портове,
 * адреси и тайни идват само оттук.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4400),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL е задължителен.'),
  /** Папка за качените медийни файлове (на VPS), не в базата. */
  MEDIA_DIR: z.string().min(1).default('./media'),
  /** Разрешени origin-и за CORS, разделени със запетая. Празно = без CORS. */
  CORS_ORIGINS: z.string().default(''),
  /** Лимит на размера на едно медийно качване в мегабайти. */
  MEDIA_MAX_MB: z.coerce.number().int().positive().default(60),

  // --- Админ авторизация (Етап 3) ---
  /** Таен ключ за подписване на сесийните JWT. Без default — само от средата. */
  JWT_SECRET: z.string().min(16, 'JWT_SECRET трябва да е поне 16 символа.'),
  /** Живот на сесията в часове. */
  JWT_TTL_HOURS: z.coerce.number().int().positive().default(12),
  /** Домейн на сесийната бисквитка (празно = host-only). */
  COOKIE_DOMAIN: z.string().optional(),
  /** Secure флаг на бисквитката (по подразбиране включен на production). */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  /** Първоначален админ за seed — по желание. */
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  // --- Опашка и имейл (Етап 4) ---
  /** Redis за BullMQ опашката (виж docker-compose.yml — порт 6383). */
  REDIS_URL: z.string().min(1).default('redis://localhost:6383'),
  /** Brevo SMTP — задължителни за worker процеса, не за API. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Подател на имейлите към общината. */
  EMAIL_FROM: z.string().optional(),
  /** Получател в общината — по подразбиране деловодството на Бобов дол. */
  EMAIL_TO_MUNICIPALITY: z.string().email().default('delovodstvo@bobovdol.egov.bg'),
  /** Таван на общия размер на прикачените файлове към имейла (MB). */
  EMAIL_ATTACH_MAX_MB: z.coerce.number().int().positive().default(8),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  throw new Error(`Невалидна конфигурация на средата: ${issues}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  mediaMaxBytes: raw.MEDIA_MAX_MB * 1024 * 1024,
  emailAttachMaxBytes: raw.EMAIL_ATTACH_MAX_MB * 1024 * 1024,
  /** Secure бисквитки по подразбиране на production, освен изрично зададено. */
  cookieSecure: raw.COOKIE_SECURE ?? raw.NODE_ENV === 'production',
} as const;
