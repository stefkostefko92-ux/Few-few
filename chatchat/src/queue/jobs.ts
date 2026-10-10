import { z } from 'zod';
import type { QueueEnv } from '../config-queue.js';

/**
 * Опашките (NFR-06) и договорът на задачите. Задачата носи САМО идентификатори — никога
 * съдържание, имена на файлове или лични данни (Redis не е място за тях). Данните се проверяват
 * със zod и в worker-а: задача с повреден payload не стига до обработчика (dead-letter).
 */

export const QUEUE_NAMES = ['ingest', 'ocr', 'embed'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** Опашката за мъртвите писма — задачите, изчерпали опитите си (само id-та и причина). */
export const DEAD_QUEUE = 'dead';

const Id = z.string().min(1).max(40);

export const JOB_SCHEMAS = {
  ingest: z.object({ itemId: Id }).strict(),
  ocr: z.object({ itemId: Id }).strict(),
  /** Без documentId — преглед на всички непокрити публикувани парчета (периодичният). */
  embed: z.object({ documentId: Id.optional() }).strict(),
} as const;

export type JobData = { [Q in QueueName]: z.infer<(typeof JOB_SCHEMAS)[Q]> };

export interface EnqueueOptions {
  /**
   * Идемпотентност: задача със същия id не се слага втори път (докато първата съществува).
   * `ingest-<itemId>`, `ocr-<itemId>`; повторен опит от администратора — `…-r<брой>`.
   */
  jobId: string;
  /** Дедупликация само докато чака/тече (векторите на един документ) — после може пак. */
  dedupe?: boolean;
}

/** Id на задача: само [A-Za-z0-9_-] (BullMQ не приема „:“ и цели числа). */
export function jobId(queue: QueueName, id: string, retry = 0): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '_');
  return retry > 0 ? `${queue}-${safe}-r${retry}` : `${queue}-${safe}`;
}

export interface JobContext {
  /** Прекъсване: изтекъл срок на опита или спиране на worker-а. */
  signal: AbortSignal;
  /** Поредният опит (1…attempts). */
  attempt: number;
  /** Последен опит — след провал задачата отива в dead-letter. */
  final: boolean;
}

export type JobHandlers = {
  [Q in QueueName]: (data: JobData[Q], ctx: JobContext) => Promise<void>;
};

export interface QueuePolicy {
  attempts: number;
  /** Начално забавяне на повторния опит (експоненциално: 1×, 2×, 4×…). */
  backoffMs: number;
  /** Срок на един опит. */
  timeoutMs: number;
  concurrency: number;
}

export type QueuePolicies = Record<QueueName, QueuePolicy>;

export function queuePolicies(
  cfg: Pick<
    QueueEnv,
    | 'QUEUE_ATTEMPTS'
    | 'INGEST_CONCURRENCY'
    | 'OCR_CONCURRENCY'
    | 'INGEST_TIMEOUT_SECONDS'
    | 'OCR_TIMEOUT_SECONDS'
  >,
): QueuePolicies {
  return {
    ingest: {
      attempts: cfg.QUEUE_ATTEMPTS,
      backoffMs: 5_000,
      timeoutMs: cfg.INGEST_TIMEOUT_SECONDS * 1000,
      concurrency: cfg.INGEST_CONCURRENCY,
    },
    ocr: {
      attempts: cfg.QUEUE_ATTEMPTS,
      backoffMs: 15_000,
      // Срокът на целия OCR + време за извличането преди него.
      timeoutMs: (cfg.OCR_TIMEOUT_SECONDS + cfg.INGEST_TIMEOUT_SECONDS) * 1000,
      concurrency: cfg.OCR_CONCURRENCY,
    },
    embed: { attempts: cfg.QUEUE_ATTEMPTS, backoffMs: 30_000, timeoutMs: 600_000, concurrency: 1 },
  };
}

/** Мъртво писмо: коя задача, колко опита, причината като код/име — без съдържание. */
export interface DeadLetter {
  queue: QueueName;
  jobId: string;
  data: JobData[QueueName];
  attempts: number;
  reason: string;
}

export type JobResult = 'completed' | 'retried' | 'dead';

export interface QueueHooks {
  /** Изчерпани опити (или невалидни данни): отбелязва обекта (напр. файла като FAILED). */
  onDead(letter: DeadLetter): Promise<void>;
  /** Наблюдаемост: изходът на опита и секундите му. */
  onResult?(queue: QueueName, result: JobResult, seconds: number): void;
}

/** Изтекъл срок на опит — отделен тип, за да личи в причината на мъртвото писмо. */
export class JobTimeout extends Error {
  constructor() {
    super('job timeout');
    this.name = 'JobTimeout';
  }
}

/**
 * Един опит с краен срок: сигналът се прекъсва при срока (или отвън), а обещанието отказва с
 * JobTimeout — обработчиците спират нишките/процесите си по сигнала.
 */
export async function runAttempt<T>(
  timeoutMs: number,
  outer: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timer = new AbortController();
  const signal = outer ? AbortSignal.any([outer, timer.signal]) : timer.signal;
  let handle: NodeJS.Timeout | undefined;
  let timedOut = false;
  const expired = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      timedOut = true;
      reject(new JobTimeout());
      timer.abort();
    }, timeoutMs);
  });
  expired.catch(() => undefined);
  try {
    const result = await Promise.race([work(signal), expired]);
    // Работа, която „успя“ само защото е прекъсната от срока, не е успех.
    if (timedOut) throw new JobTimeout();
    return result;
  } finally {
    clearTimeout(handle);
  }
}
