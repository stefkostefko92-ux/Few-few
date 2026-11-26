import { z } from 'zod/v3';

/** Всяка външна настройка минава през zod — процесът не тръгва с полуготов конфиг. */
const schema = z
  .object({
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

    TOKEN_ENC_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENC_KEY трябва да е 32 байта в hex'),

    /**
     * Папка на сървъра (извън базата) за котвата на одит-веригата — `audit-head.json`, права 600.
     * Панелът и работникът трябва да виждат ЕДНА И СЪЩА папка. Задължителна в продукция: без нея
     * изрязан край не се вижда, а цялата v2 опашка може да се свали до v1 без ключ.
     */
    AUDIT_ANCHOR_DIR: z.string().min(1).optional(),
    /**
     * Последният номер на v1 запис (отпреди ключа), фиксиран от човека извън базата. Има предимство
     * пред закования в котвата; v1 над него е подмяна. DEPLOY.md §8а.
     */
    AUDIT_V1_MAX_ID: z.coerce.number().int().min(0).optional(),

    /** Име на издателя в приложението за TOTP кодове. */
    TOTP_ISSUER: z.string().min(1).default('Piuma'),

    /**
     * Черновите от Claude минават САМО през Google Cloud Vertex AI на мулти-региона `eu`.
     * Първостепенният Claude API няма обработка в ЕС, а единичните региони (`europe-west1`…)
     * дават само Sonnet 4.6 и по-стари — затова се приема единствено `eu`. Друг регион =
     * процесът не тръгва (fail-closed); „europe-“ не значи ЕС (`europe-west2` е Лондон).
     * Без проект или без файла с удостоверения генерирането е изключено, панелът работи.
     */
    VERTEX_PROJECT_ID: z
      .string()
      .regex(
        /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
        'VERTEX_PROJECT_ID: ID на Google Cloud проект (6–30 знака: малки букви, цифри, тире)',
      )
      .optional(),
    VERTEX_REGION: z
      .literal('eu', {
        errorMap: () => ({
          message: 'VERTEX_REGION трябва да е „eu“ (мулти-регионът на ЕС) — global/us/регион не',
        }),
      })
      .default('eu'),
    /** Голо Vertex ID. Наличността в `eu` се сверява преди смяна (CLAUDE.md). */
    VERTEX_MODEL: z
      .string()
      .regex(/^claude-[a-z0-9-]+(@\d{8})?$/, 'VERTEX_MODEL: Vertex ID на модел на Claude')
      .default('claude-opus-5-5'),
    /** Път до JSON ключа на service account-а (mode 600) — абсолютен, в средата на процеса. */
    GOOGLE_APPLICATION_CREDENTIALS: z
      .string()
      .startsWith('/', 'GOOGLE_APPLICATION_CREDENTIALS: абсолютен път до файла')
      .optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production' && !cfg.AUDIT_ANCHOR_DIR) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUDIT_ANCHOR_DIR'],
        message: 'задължителна в продукция (котвата на одит-веригата извън базата)',
      });
    }
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
