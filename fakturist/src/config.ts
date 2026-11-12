import { z } from 'zod';

const hexKey = (name: string) =>
  z.string().regex(/^[0-9a-fA-F]{64}$/, `${name} трябва да е 32 байта в hex (64 знака)`);
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
/** Незадължителен текст: празната стойност значи „няма“. */
const optionalText = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional());

/** Всяка външна настройка минава през zod — процесът не тръгва с полуготов конфиг. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(4340),
  /** Само локално: отпред стои nginx с TLS. В контейнер — 0.0.0.0. */
  HOST: z.string().min(1).default('127.0.0.1'),
  /** Публичният адрес без наклонена черта накрая — canonical, sitemap, писмата. */
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .transform((url) => url.replace(/\/+$/, '')),
  /** Express `trust proxy` — зад nginx на същата машина е `loopback`. Грешна стойност = подправимо IP. */
  TRUST_PROXY: z.string().default('loopback'),
  DATABASE_URL: z.string().min(1),
  /** HS256 ключът на бисквитката на сесията (JWT). Смяна = всички излизат. */
  JWT_SECRET: hexKey('JWT_SECRET'),
  /**
   * Ключът на печата на издадените документи (HMAC-SHA256 над веригата от отпечатъци — src/ledger/).
   * Отделен от JWT_SECRET: сесиите се сменят, печатът — никога. Загубен ключ = веригата не се проверява.
   */
  LEDGER_SEAL_KEY: hexKey('LEDGER_SEAL_KEY'),
  /**
   * Регистрацията е отворена само след като общите условия, политиката за поверителност и договорът за
   * обработване са публикувани (SPEC.md, „Блокери преди продукция“).
   */
  REGISTRATION_OPEN: flag.default(false),
  /** Webhook на Revolut Merchant API — тайната за подписа (`wsk_…`). Без нея webhook-ът отказва всичко. */
  REVOLUT_WEBHOOK_SECRET: optionalText(),
  /** IBAN на Revolut Business за плащане по банков път (показва се в поръчката на плана). */
  BILLING_IBAN: optionalText(),
  /** Адресът за връзка на публичната страница и в JSON-LD. */
  CONTACT_EMAIL: z.string().email().default('info@carbonstealth.eu'),
  PRIVACY_EMAIL: z.string().email().default('privacy@carbonstealth.eu'),
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
