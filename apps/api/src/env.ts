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
} as const;
