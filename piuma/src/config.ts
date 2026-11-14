import { z } from 'zod';

/** Всяка външна настройка минава през zod — процесът не тръгва с полуготов конфиг. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(4310),
  PUBLIC_BASE_URL: z.string().url(),
  /** Express `trust proxy` — зад Nginx на същата машина е `loopback`. */
  TRUST_PROXY: z.string().default('loopback'),
  /**
   * Къде води „Поискай достъп“ на витрината: страница за контакт или `mailto:`. По
   * подразбиране сайтът на Carbon Stealth VCC — единственият адрес, за който знаем, че е жив.
   */
  CONTACT_URL: z.string().url().default('https://carbonstealth.eu'),

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

  /**
   * „Отговор по ключова дума“ (docs/private-replies.md). Без verify token маршрутът за
   * известията от Meta НЕ съществува — функцията е изключена по подразбиране.
   */
  IG_WEBHOOK_VERIFY_TOKEN: z
    .string()
    .regex(/^[A-Za-z0-9_-]{24,128}$/, 'IG_WEBHOOK_VERIFY_TOKEN: 24–128 знака [A-Za-z0-9_-]')
    .optional(),
  /** Таван на изпратените лични съобщения на акаунт за плаващ час (PR11). */
  PRIVATE_REPLIES_PER_HOUR: z.coerce.number().int().min(1).max(500).default(60),
  /**
   * Колко дни живее `commentId` (PR22). 9 = 7 дни прозорец + 36 ч. повторни опити; до 30, ако
   * собственикът реши да пази за жалби. Под 9 не се пуска — повторна доставка би пратила второ.
   */
  PRIVATE_REPLIES_RETENTION_DAYS: z.coerce.number().int().min(9).max(30).default(9),
  /** Публикуваната политика с абзаца за личните съобщения — без нея одобрение няма (PR18). */
  REPLY_PRIVACY_URL: z.string().url().optional(),
  /** Адресът за отказ в бележката под всяко съобщение (PR16a). */
  REPLY_CONTACT_EMAIL: z.string().email().default('info@carbonstealth.eu'),

  TOKEN_ENC_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENC_KEY трябва да е 32 байта в hex'),

  /** Име на издателя в приложението за TOTP кодове. */
  TOTP_ISSUER: z.string().min(1).default('Piuma'),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Compose подава незадължителните като `${X:-}` — празен низ. Празното е „липсва“: иначе
  // zod отказва `''` за ключ „по избор“ и процесът не тръгва. Задължителният пак пада.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = schema.safeParse(present);
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
