import { resolve } from 'node:path';
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

/**
 * Снимките и клиповете на картите (src/allegati/): папката (в контейнера — томът `media`), таванът на
 * един качен файл в MB преди компресията и свободното място, под което качването спира — базата и
 * системата да не останат без диск. ffmpeg трябва само на фоновия процес (src/worker.ts). Отделно, защото
 * фоновият процес чете само тях: тайните на приложението (JWT_SECRET, пощата) не влизат в контейнера му.
 */
const mediaSchema = z.object({
  /** Абсолютен път (`./media` локално става пълен — файловете се сервират само от такъв). */
  MEDIA_DIR: z
    .string()
    .min(1)
    .default('/data/media')
    .transform((dir) => resolve(dir)),
  MEDIA_MAX_PHOTO_MB: z.coerce.number().int().min(1).max(200).default(40),
  MEDIA_MAX_VIDEO_MB: z.coerce.number().int().min(10).max(2000).default(1024),
  /** Най-дългият клип в минути — по-дълъг се отказва при обработката (ffprobe). */
  MEDIA_MAX_VIDEO_MIN: z.coerce.number().int().min(1).max(60).default(10),
  MEDIA_MIN_FREE_MB: z.coerce.number().int().min(100).default(2048),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
});

/** Всяка външна настройка минава през zod — процесът не тръгва с полуготов конфиг. */
const schema = z
  .object({
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
     * Ключът на печата на потвърдените листове за интервенция (HMAC-SHA256 над отпечатъка на съдържанието
     * и подписите — src/interventi/sigillo.ts). Отделен от JWT_SECRET: сесиите се сменят, печатът — никога.
     * Загубен или сменен ключ = никой потвърден лист не минава проверката (PDF и имейл спират).
     */
    INTERVENTI_SEAL_KEY: hexKey('INTERVENTI_SEAL_KEY'),
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
  })
  .extend(mediaSchema.shape);

export type AppConfig = z.infer<typeof schema>;
export type MediaConfig = z.infer<typeof mediaSchema>;

let cached: AppConfig | null = null;

function parse<T extends z.ZodTypeAny>(shape: T, env: NodeJS.ProcessEnv): z.infer<T> {
  const parsed = shape.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна конфигурация: ${details}`);
  }
  return parsed.data as z.infer<T>;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return parse(schema, env);
}

export function loadMediaConfig(env: NodeJS.ProcessEnv = process.env): MediaConfig {
  return parse(mediaSchema, env);
}

export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

let mediaCached: MediaConfig | null = null;

/** Само настройките на снимките — и в приложението, и във фоновия процес (без тайните). */
export function mediaConfig(): MediaConfig {
  mediaCached ??= loadMediaConfig();
  return mediaCached;
}

export function isProduction(): boolean {
  return config().NODE_ENV === 'production';
}

/** Има ли поща — от това зависи дали поканата тръгва по имейл, или само се показва за копиране. */
export function mailEnabled(): boolean {
  return Boolean(config().SMTP_HOST);
}
