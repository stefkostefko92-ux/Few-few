import { z } from 'zod';

/** Всяка външна настройка минава през zod — процесът не тръгва с полуготов конфиг. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(4310),
  PUBLIC_BASE_URL: z.string().url(),
  /** Express `trust proxy` — зад Nginx на същата машина е `loopback`. */
  TRUST_PROXY: z.string().default('loopback'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  IG_APP_ID: z.string().min(1),
  IG_APP_SECRET: z.string().min(1),
  IG_REDIRECT_URI: z.string().url(),
  IG_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v24.0'),
  IG_SCOPES: z
    .string()
    .min(1)
    .default(
      'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights',
    ),

  TOKEN_ENC_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENC_KEY трябва да е 32 байта в hex'),

  /** Име на издателя в приложението за TOTP кодове. */
  TOTP_ISSUER: z.string().min(1).default('Публикатор'),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна конфигурация: ${details}`);
  }
  return parsed.data;
}

export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

export function isProduction(): boolean {
  return config().NODE_ENV === 'production';
}
