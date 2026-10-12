import { z } from 'zod';

/**
 * Средата — валидирана веднъж при старт; с полуготов конфиг процесът не тръгва (fail-closed).
 * Тайните (DATABASE_URL, SESSION_PEPPER, GCP данните) живеят само на сървъра (mode 600).
 */

/** Vertex AI само в ЕС: `eu` (мулти-регион) или `europe-*` — като agentgw. */
export const EU_REGION = /^(eu|europe-[a-z]+\d+)$/;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4330),
  /** Колко обратни проксита стоят отпред (Nginx = 1) — за коректен req.ip в лимитите. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  /** Публичният адрес (https://chatchat.carbonstealth.eu) — за проверката на Origin (CSRF). */
  PUBLIC_BASE_URL: z.url(),
  DATABASE_URL: z.string().min(1, 'Липсва DATABASE_URL'),
  /** HMAC „подправка“ за хешовете на сесийните токени и QR токените. */
  SESSION_PEPPER: z.string().min(32, 'SESSION_PEPPER трябва да е поне 32 знака'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  /** Информацията по чл. 13/14 GDPR на администратора (клиента) — връзка във входа и футъра. */
  PRIVACY_POLICY_URL: z.union([z.url(), z.literal('')]).default(''),

  VERTEX_PROJECT_ID: z.string().default(''),
  VERTEX_REGION: z
    .string()
    .default('eu')
    .refine((r) => EU_REGION.test(r), 'VERTEX_REGION трябва да е ЕС регион („eu“ или „europe-…“)'),
  /** Път до JSON на service account (mode 600). Празно → ADC на машината. */
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default(''),
  AI_MODEL: z.string().default('claude-opus-5'),
  AI_EFFORT: z.enum(['low', 'medium', 'high']).default('medium'),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).max(32000).default(8000),
  /** Колко кръга инструменти най-много, преди отговорът да се поиска задължително. */
  AI_MAX_TOOL_ROUNDS: z.coerce.number().int().min(0).max(8).default(4),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5000).max(115000).default(60000),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна конфигурация: ${issues}`);
  }
  return parsed.data;
}

/** AI е включен само с проект в GCP; без него /chat връща 503 (без резервен доставчик). */
export function aiEnabled(cfg: Pick<Config, 'VERTEX_PROJECT_ID'>): boolean {
  return cfg.VERTEX_PROJECT_ID.length > 0;
}
