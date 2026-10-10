import { z } from 'zod';
import { describeIssues, isKey32, withoutEmpty } from './config-env.js';
import { DB_ENV } from './config-db.js';
import { checkFilesCrypto, FILES_ENV } from './config-files.js';
import { QUEUE_ENV } from './config-queue.js';

export { withoutEmpty } from './config-env.js';
export { filesKeks, loadFilesConfig, type FilesConfig } from './config-files.js';
export { redisEnabled } from './config-queue.js';

/**
 * Средата — валидирана веднъж при старт; с полуготов конфиг процесът не тръгва (fail-closed).
 * Тайните (DATABASE_URL, SESSION_PEPPER, GCP данните) живеят само на сървъра (mode 600).
 */

/** Vertex AI само в ЕС: `eu` (мулти-регион) или `europe-*` — като agentgw. */
export const EU_REGION = /^(eu|europe-[a-z]+\d+)$/;

const EnvSchema = z.object({
  ...FILES_ENV,
  ...QUEUE_ENV,
  ...DB_ENV,
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
  /**
   * Ключ за AES-256-GCM на TOTP тайните (32 байта в base64: `openssl rand -base64 32`). Без него
   * процесът не тръгва — персоналът е задължен да има втори фактор. Смяната обезсилва всички TOTP.
   */
  MFA_ENC_KEY: z
    .string()
    .trim()
    .refine(isKey32, 'MFA_ENC_KEY трябва да е 32 байта в base64 (openssl rand -base64 32)'),
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
  /** Circuit breaker към Vertex (NFR-07): последователни провала до отваряне и колко стои отворен. */
  AI_BREAKER_FAILURES: z.coerce.number().int().min(1).max(50).default(5),
  AI_BREAKER_COOLDOWN_SECONDS: z.coerce.number().int().min(5).max(600).default(30),

  /**
   * Семантично търсене (§8.1): embeddings в същия ЕС регион (VERTEX_REGION). `off` → само точно +
   * пълнотекстово. Друг модел = нови вектори за всичко (`npm run embed`).
   */
  EMBEDDING_MODEL: z.enum(['gemini-embedding-001', 'off']).default('gemini-embedding-001'),
  /** Таван на една заявка към embeddings — въпросът чака него, затова е кратък (fail-open). */
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(4000),
  /** През колко секунди фоновото индексиране търси непокрити публикувани парчета (0 = никога). */
  EMBEDDING_SWEEP_SECONDS: z.coerce.number().int().min(0).max(86400).default(600),
  /** HMAC ключ за краткотрайните подписани адреси за сваляне — различен от SESSION_PEPPER. */
  ATTACHMENT_URL_KEY: z.string().default(''),
  /** clamd (INSTREAM през TCP). Празно → без антивирус качването е изключено (fail-closed). */
  CLAMAV_HOST: z.string().default(''),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  /** Папката с отчетите на оценъчния набор (`npm run eval --out`). Празно → KPI „изисква оценка“. */
  EVAL_REPORTS_DIR: z.string().default(''),
  /**
   * Метрики за Prometheus (NFR-09) на ОТДЕЛЕН слушател — никога публичният PORT, nginx не го
   * проксира. 0 → изключено. Хостът е loopback; в Docker е 0.0.0.0 вътре в контейнера, а портът се
   * публикува на хоста само като 127.0.0.1:… (docker-compose.yml).
   */
  METRICS_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  METRICS_HOST: z.string().default('127.0.0.1'),

  /**
   * Имейл известия през Brevo (HTTPS API, порт 443 — Hetzner блокира 25/465/587). Ключът е тайна —
   * само в .env на сървъра (mode 600), никога в лог. Празно → имейлите са изключени (fail-open:
   * известията в приложението работят), без натрупване в outbox.
   */
  BREVO_API_KEY: z.string().default(''),
  BREVO_API_URL: z.url().default('https://api.brevo.com/v3/smtp/email'),
  /** Подателят (проверен домейн в Brevo), напр. no-reply@carbonstealth.eu. */
  MAIL_FROM_EMAIL: z.string().default(''),
  MAIL_FROM_NAME: z.string().trim().min(1).max(70).default('ChatChat'),
  /** През колко секунди изпращачът минава през outbox-а (0 = никога). */
  EMAIL_SWEEP_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  /** Колко чака писмото за ново съобщение/споменаване — прочетено междувременно → не тръгва. */
  EMAIL_DELAY_SECONDS: z.coerce.number().int().min(0).max(86400).default(300),
  /** В колко часа (местно време на човека) тръгва дневният дайджест на непрочетеното. */
  EMAIL_DIGEST_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  EMAIL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),
});

/** Прикачването иска и ключ за подписите: хранилище без ключ е полуготов конфиг. */
const ConfigSchema = EnvSchema.superRefine((c, ctx) => {
  if (c.METRICS_PORT !== 0 && c.METRICS_PORT === c.PORT) {
    ctx.addIssue({
      code: 'custom',
      path: ['METRICS_PORT'],
      message: 'METRICS_PORT трябва да е различен от PORT (метриките не са на публичния порт)',
    });
  }
  // Ключ без подател е полуготов конфиг: писмата биха се отхвърляли едно по едно.
  if (c.BREVO_API_KEY !== '' && !z.email().safeParse(c.MAIL_FROM_EMAIL).success) {
    ctx.addIssue({
      code: 'custom',
      path: ['MAIL_FROM_EMAIL'],
      message: 'MAIL_FROM_EMAIL трябва да е валиден имейл, щом BREVO_API_KEY е зададен',
    });
  }
  if (c.ATTACHMENTS_DIR === '') return;
  checkFilesCrypto(c, ctx);
  if (
    c.FILES_ENCRYPTION === 'on' &&
    isKey32(c.FILES_KEK) &&
    Buffer.from(c.FILES_KEK, 'base64').equals(Buffer.from(c.MFA_ENC_KEY, 'base64'))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['FILES_KEK'],
      message: 'FILES_KEK трябва да е различен от MFA_ENC_KEY (отделен ключ за всяка цел)',
    });
  }
  if (c.ATTACHMENT_URL_KEY.length < 32) {
    ctx.addIssue({
      code: 'custom',
      path: ['ATTACHMENT_URL_KEY'],
      message: 'ATTACHMENT_URL_KEY трябва да е поне 32 знака, щом ATTACHMENTS_DIR е зададен',
    });
  } else if (c.ATTACHMENT_URL_KEY === c.SESSION_PEPPER) {
    ctx.addIssue({
      code: 'custom',
      path: ['ATTACHMENT_URL_KEY'],
      message: 'ATTACHMENT_URL_KEY трябва да е различен от SESSION_PEPPER',
    });
  }
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(withoutEmpty(env));
  if (!parsed.success) {
    throw new Error(`Невалидна конфигурация: ${describeIssues(parsed.error.issues)}`);
  }
  return parsed.data;
}

/** Семантичното търсене иска AI (проект в GCP) и незабранен модел за embeddings. */
export function embeddingsEnabled(
  cfg: Pick<Config, 'VERTEX_PROJECT_ID' | 'EMBEDDING_MODEL'>,
): boolean {
  return aiEnabled(cfg) && cfg.EMBEDDING_MODEL !== 'off';
}

/** Ключът за TOTP тайните като байтове (валидиран от схемата). */
export function mfaKey(cfg: Pick<Config, 'MFA_ENC_KEY'>): Buffer {
  return Buffer.from(cfg.MFA_ENC_KEY, 'base64');
}

/** AI е включен само с проект в GCP; без него /chat връща 503 (без резервен доставчик). */
export function aiEnabled(cfg: Pick<Config, 'VERTEX_PROJECT_ID'>): boolean {
  return cfg.VERTEX_PROJECT_ID.length > 0;
}

/** Прикачването е включено само с хранилище (ключът е проверен в схемата). */
export function attachmentsEnabled(cfg: Pick<Config, 'ATTACHMENTS_DIR'>): boolean {
  return cfg.ATTACHMENTS_DIR.length > 0;
}

/** Имейл известията — само с ключ за Brevo (подателят е проверен в схемата). */
export function emailEnabled(cfg: Pick<Config, 'BREVO_API_KEY'>): boolean {
  return cfg.BREVO_API_KEY.length > 0;
}

/**
 * Средата на worker-а (`node dist/worker.js`) — най-малкото нужно (NFR-03, least privilege): базата,
 * Redis, хранилището на файловете (чете оригиналите), Vertex за векторите и метриките. БЕЗ
 * SESSION_PEPPER, MFA_ENC_KEY, ATTACHMENT_URL_KEY, Brevo — worker-ът не обслужва потребители.
 */
const WorkerSchema = EnvSchema.pick({
  NODE_ENV: true,
  LOG_LEVEL: true,
  DATABASE_URL: true,
  VERTEX_PROJECT_ID: true,
  VERTEX_REGION: true,
  GOOGLE_APPLICATION_CREDENTIALS: true,
  EMBEDDING_MODEL: true,
  EMBEDDING_TIMEOUT_MS: true,
  EMBEDDING_SWEEP_SECONDS: true,
  AI_BREAKER_FAILURES: true,
  AI_BREAKER_COOLDOWN_SECONDS: true,
  METRICS_PORT: true,
  METRICS_HOST: true,
})
  .extend({ ...FILES_ENV, ...QUEUE_ENV, ...DB_ENV })
  .superRefine((c, ctx) => {
    if (c.REDIS_URL === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'worker-ът иска REDIS_URL (без Redis опашките вървят в процеса на API-то)',
      });
    }
    if (c.ATTACHMENTS_DIR === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['ATTACHMENTS_DIR'],
        message: 'worker-ът иска ATTACHMENTS_DIR (чете оригиналите на документите)',
      });
    }
    checkFilesCrypto(c, ctx);
  });

export type WorkerConfig = z.infer<typeof WorkerSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = WorkerSchema.safeParse(withoutEmpty(env));
  if (!parsed.success) {
    throw new Error(`Невалидна конфигурация: ${describeIssues(parsed.error.issues)}`);
  }
  return parsed.data;
}
