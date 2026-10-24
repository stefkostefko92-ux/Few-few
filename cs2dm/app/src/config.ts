import { z } from 'zod';

/** Празен низ от `.env` значи „не е зададено“, а не стойност — иначе `COMPANY_EIK=` минава за ЕИК. */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );

/** Ключ без таван на дължината тук: грешната форма не бива да спре сайта, а само частта на ключа. */
const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

const validTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** Всяка външна настройка минава през zod — процесът не тръгва с полуготов конфиг. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4330),
  /** В контейнера `0.0.0.0` (Compose го задава); локално по подразбиране само loopback. */
  HOST: z.string().min(1).default('127.0.0.1'),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .default('https://cs2.carbonstealth.eu')
    .transform((url) => url.replace(/\/+$/, '')),
  /** Express `trust proxy` — зад nginx на същата машина. В Compose е `uniquelocal`. */
  TRUST_PROXY: z.string().min(1).default('loopback'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  /** Адресът за `connect` и `steam://connect/` — хост:порт, нищо друго (влиза в href). */
  SERVER_ADDRESS: z
    .string()
    .regex(/^[a-z0-9.-]+:\d{1,5}$/i, 'SERVER_ADDRESS трябва да е хост:порт')
    .default('dm.carbonstealth.eu:27015'),
  /** Часовата зона за показ на дати (базата пази UTC). */
  DISPLAY_TZ: z.string().refine(validTimeZone, 'непозната часова зона').default('Europe/Sofia'),

  /** Контактът на страниците „Контакт“, „Импресум“ и в правните текстове. Празно → ясно маркирано. */
  CONTACT_EMAIL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().email().optional(),
  ),
  DISCORD_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .url()
      .refine((url) => url.startsWith('https://'), 'само https://')
      .optional(),
  ),

  /**
   * Данните за импресума. Не се измислят в кода: липсващото се показва като „не е въведено“,
   * за да се види и попълни в `.env` на сървъра, вместо да стои грешна стойност.
   */
  COMPANY_LEGAL_NAME: optionalText(160),
  COMPANY_ADDRESS: optionalText(255),
  COMPANY_EIK: optionalText(32),
  COMPANY_VAT: optionalText(32),
  COMPANY_REPRESENTATIVE: optionalText(160),
  COMPANY_PHONE: optionalText(40),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /**
   * Ключовете на панела (етап 2). Тук само се четат като низ: невалиден или липсващ ключ изключва
   * СВОЯТА част на панела (503), не целия сайт. Проверката на формата е в `admin/keys.ts`.
   * APP_ENC_KEY — 32 байта hex (AES-256-GCM за TOTP тайните); без него панелът е затворен.
   * CS2DM_BRIDGE_KEY — HMAC към C# плъгина (§5); CS2DM_AGENT_KEY — HMAC към cs2-agent (§9); ≥ 32 знака.
   */
  APP_ENC_KEY: optionalSecret,
  CS2DM_BRIDGE_KEY: optionalSecret,
  CS2DM_AGENT_KEY: optionalSecret,
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
