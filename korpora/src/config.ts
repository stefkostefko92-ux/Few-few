import { z } from 'zod';
import { COMPANY } from './company.js';

const hexKey = (name: string) =>
  z.string().regex(/^[0-9a-fA-F]{64}$/, `${name} трябва да е 32 байта в hex (64 знака)`);
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
/** Незадължителен текст: празната стойност (`SMTP_USER=` или `${SMTP_USER:-}` в compose) значи „няма“. */
const optionalText = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional());

/** Всяка външна настройка минава през zod — процесът не тръгва с полуготов конфиг. */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    PORT: z.coerce.number().int().positive().default(4320),
    /** Само локално: отпред стои nginx с TLS. В контейнер — 0.0.0.0. */
    HOST: z.string().min(1).default('127.0.0.1'),
    /** Публичният адрес без наклонена черта накрая — от него се строят връзките в писмата, canonical и sitemap. */
    PUBLIC_BASE_URL: z
      .string()
      .url()
      .transform((url) => url.replace(/\/+$/, '')),
    /** Express `trust proxy` — зад nginx на същата машина е `loopback`. Грешна стойност = подправимо IP. */
    TRUST_PROXY: z.string().default('loopback'),
    DATABASE_URL: z.string().min(1),
    /** AES-256-GCM за TOTP тайните в покой. */
    ENC_KEY: hexKey('ENC_KEY'),
    /** HMAC за бисквитката на устройството и резервните кодове. Различен от ENC_KEY. */
    HMAC_KEY: hexKey('HMAC_KEY'),
    TOTP_ISSUER: z.string().min(1).max(40).default('Korpora'),
    SMTP_HOST: optionalText(),
    /** Brevo приема 2525 — Hetzner блокира 25/465/587. */
    SMTP_PORT: z.coerce.number().int().positive().default(2525),
    SMTP_SECURE: flag.default('false'),
    SMTP_USER: optionalText(),
    SMTP_PASS: optionalText(),
    MAIL_FROM: z.string().min(3).default('Korpora <no-reply@carbonstealth.eu>'),
    CONTACT_EMAIL: z.string().email().default(COMPANY.email),
    PRIVACY_EMAIL: z.string().email().default('privacy@carbonstealth.eu'),
    /**
     * Ключът на шифрования каталог в репото (`sealed/catalog.json.enc`) — само в .env на сървъра. Без него
     * — каталогът като файл (`CATALOG_PATH`), ако го има, иначе основните материали.
     */
    CATALOG_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      hexKey('CATALOG_KEY').optional(),
    ),
    /** Каталогът от магазините като файл на сървъра — когато CATALOG_KEY не е зададен. */
    CATALOG_PATH: z.string().min(1).default('data/catalog.json'),
    /** DB-IP Lite (CC BY 4.0), сваля се с `npm run geoip:update`. Без него държавата е „—“. */
    GEOIP_PATH: z.string().min(1).default('data/dbip-country-lite.mmdb'),
    /** Проверка на новата парола срещу изтекли бази (Have I Been Pwned, k-анонимност). */
    BREACH_CHECK: flag.default('true'),
    /**
     * Котвата на одитната верига — файл извън базата с последния запис. По подразбиране в продукция
     * `data/audit-head.json`; извън продукция само ако е зададена.
     */
    AUDIT_ANCHOR_PATH: optionalText(),
    /** Срок за пазене на одита, в дни (решение на собственика; по подразбиране 5 години). */
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(365).max(3650).default(1825),
    /** Само за разработка: `/__dev/outbox` показва изпратените писма. В продукция се пренебрегва. */
    KORPORA_DEV_OUTBOX: z.enum(['0', '1']).default('0'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production' && !cfg.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'в продукция писмата трябва да тръгват — задай SMTP_HOST',
      });
    }
    if (cfg.ENC_KEY.toLowerCase() === cfg.HMAC_KEY.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['HMAC_KEY'],
        message: 'HMAC_KEY трябва да е различен от ENC_KEY',
      });
    }
    const catalogKey = cfg.CATALOG_KEY?.toLowerCase();
    if (catalogKey && [cfg.ENC_KEY, cfg.HMAC_KEY].some((k) => k.toLowerCase() === catalogKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CATALOG_KEY'],
        message: 'CATALOG_KEY трябва да е различен от ENC_KEY и HMAC_KEY',
      });
    }
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
