import { z } from 'zod';

/**
 * Фоновата работа и мащабирането (NFR-06, NFR-11): Redis (BullMQ опашките, pub/sub между
 * инстанциите на API-то, общите лимити и пазачът срещу повторен TOTP код) и приемането на
 * документи (извличане, OCR). Без REDIS_URL всичко върви в процеса — една инстанция, dev, тестове.
 */

/** redis:// или rediss:// с хост; паролата е в адреса — адресът НИКОГА не се логва. */
function isRedisUrl(v: string): boolean {
  if (v === '') return true;
  try {
    const u = new URL(v);
    return (u.protocol === 'redis:' || u.protocol === 'rediss:') && u.hostname !== '';
  } catch {
    return false;
  }
}

const seconds = (min: number, max: number, def: number) =>
  z.coerce.number().int().min(min).max(max).default(def);

export const QUEUE_ENV = {
  /**
   * Redis 7 (опашките + pub/sub + лимитите + TOTP). Празно → опашките вървят в процеса на API-то,
   * хъбът и лимитите са в паметта — САМО една инстанция. С него API-то само слага задачи, а
   * тежката работа е в отделния worker (`node dist/worker.js`).
   */
  REDIS_URL: z
    .string()
    .trim()
    .default('')
    .refine(isRedisUrl, 'REDIS_URL трябва да е redis://… или rediss://… с хост'),
  /** Колко документа извлича worker-ът едновременно (PDF текст, DOCX, XLSX, логове). */
  INGEST_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  /** Таван на паметта на нишката за разбора на един файл (MB) — OOM убива нишката, не worker-а. */
  INGEST_THREAD_HEAP_MB: z.coerce.number().int().min(128).max(4096).default(768),
  /** Колко документа минават през OCR едновременно (всеки е процес tesseract на страница). */
  OCR_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  /** Краен срок на един опит за извличане (без OCR); над него — повторен опит, после dead-letter. */
  INGEST_TIMEOUT_SECONDS: seconds(30, 3600, 600),
  /** Краен срок на OCR на целия документ (всички страници без текст). */
  OCR_TIMEOUT_SECONDS: seconds(60, 14400, 3600),
  /** Краен срок на OCR/растеризиране на ЕДНА страница (execFile с таймаут, без shell). */
  OCR_PAGE_TIMEOUT_SECONDS: seconds(5, 600, 120),
  /** `off` → без OCR: сканираните страници остават празни (предупреждение), снимките се отказват. */
  OCR_ENGINE: z.enum(['tesseract', 'off']).default('tesseract'),
  /** Езиците на tesseract (пакетите tesseract-ocr-ita/-eng/-bul в образа). */
  OCR_LANGS: z
    .string()
    .trim()
    .regex(/^[a-z_]{3,10}(\+[a-z_]{3,10}){0,5}$/, 'OCR_LANGS: напр. ita+eng+bul')
    .default('ita+eng+bul'),
  /** Таван на страниците с OCR в един документ; останалите — предупреждение, не тиха загуба. */
  OCR_MAX_PAGES: z.coerce.number().int().min(1).max(3000).default(300),
  /** Повторни опити на задача (временни грешки: база, хранилище, Vertex); после dead-letter. */
  QUEUE_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  /** Папката за временните файлове на OCR (tmpfs в контейнера). Празно → os.tmpdir(). */
  INGEST_TMP_DIR: z.string().trim().default(''),
  /** Файлът „жив съм“ на worker-а (HEALTHCHECK в compose). Празно → <tmp>/chatchat-worker.alive. */
  WORKER_HEARTBEAT_FILE: z.string().trim().default(''),
};

export type QueueEnv = z.infer<z.ZodObject<typeof QUEUE_ENV>>;

/** Опашките са в Redis (отделен worker) — иначе в процеса. */
export function redisEnabled(cfg: Pick<QueueEnv, 'REDIS_URL'>): boolean {
  return cfg.REDIS_URL.length > 0;
}
