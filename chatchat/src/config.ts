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
  /**
   * Ключ за AES-256-GCM на TOTP тайните (32 байта в base64: `openssl rand -base64 32`). Без него
   * процесът не тръгва — персоналът е задължен да има втори фактор. Смяната обезсилва всички TOTP.
   */
  MFA_ENC_KEY: z
    .string()
    .trim()
    .refine(
      (v) => /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === 32,
      'MFA_ENC_KEY трябва да е 32 байта в base64 (openssl rand -base64 32)',
    ),
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
  /** Частното хранилище на прикачените файлове (F2). Празно → прикачването е изключено. */
  ATTACHMENTS_DIR: z.string().default(''),
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
  if (c.ATTACHMENTS_DIR === '') return;
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

/**
 * Празен низ = „не е зададено“: docker-compose.yml подава `${X:-}` като празна стойност, а изборите
 * (EMBEDDING_MODEL) и числата (METRICS_PORT) иначе биха спрели процеса при старт. Всички текстови
 * настройки имат подразбиране '' — за тях смисълът не се мени.
 */
function withoutEmpty(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(withoutEmpty(env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна конфигурация: ${issues}`);
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
