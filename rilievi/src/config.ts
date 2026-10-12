import { z } from 'zod';

const hexKey = (name: string) =>
  z.string().regex(/^[0-9a-fA-F]{64}$/, `${name} трябва да е 32 байта в hex (64 знака)`);
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
/** Незадължителен текст: празната стойност (`SMTP_USER=` или `${SMTP_USER:-}` в compose) значи „няма“. */
const optionalText = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional());

/** Имейл с подразбираща се стойност; празното (`${CONTACT_EMAIL:-}` в compose) значи „подразбиращия се“. */
const optionalEmail = (fallback: string) =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().email().default(fallback));

/** Всяка външна настройка минава през zod — процесът не тръгва с полуготов конфиг. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(4330),
  /** Само локално: отпред стои nginx с TLS. В контейнер — 0.0.0.0. */
  HOST: z.string().min(1).default('127.0.0.1'),
  /** Публичният адрес без наклонена черта накрая — от него са връзките в поканите и писмата. */
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
   * Пощата е по избор: без SMTP поканите и връзките за нова парола се показват на екрана за копиране,
   * а „Забравена парола“ казва да се поиска връзка от администратор.
   */
  SMTP_HOST: optionalText(),
  /** Brevo приема 2525 — Hetzner блокира 25/465/587. */
  SMTP_PORT: z.coerce.number().int().positive().default(2525),
  SMTP_SECURE: flag.default('false'),
  SMTP_USER: optionalText(),
  SMTP_PASS: optionalText(),
  MAIL_FROM: z.string().min(3).default('Rilievi Impianti <no-reply@carbonstealth.eu>'),
  /** Шрифтовете за PDF (DejaVu Sans — кирилица и италиански ударения). В образа: fonts-dejavu-core. */
  PDF_FONT_DIR: z.string().min(1).default('/usr/share/fonts/truetype/dejavu'),
  /** Срок за пазене на одита в дни (по подразбиране 2 години). */
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(90).max(3650).default(730),
  /** Адресът за връзка на публичната страница и в JSON-LD (същият като в другите продукти). */
  CONTACT_EMAIL: optionalEmail('info@carbonstealth.eu'),
  /** Адресът за въпроси по личните данни — в политиката за поверителност. */
  PRIVACY_EMAIL: optionalEmail('privacy@carbonstealth.eu'),
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

/** Има ли поща — от това зависи дали поканата тръгва по имейл, или само се показва за копиране. */
export function mailEnabled(): boolean {
  return Boolean(config().SMTP_HOST);
}
