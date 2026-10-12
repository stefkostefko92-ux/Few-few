import {
  JOB_SCHEMAS,
  runAttempt,
  type EnqueueOptions,
  type JobData,
  type JobHandlers,
  type QueueHooks,
  type QueueName,
  type QueuePolicies,
} from './jobs.js';

/**
 * Опашката в процеса — без REDIS_URL (dev, тестове, една инстанция): СЪЩИТЕ обработчици, същата
 * политика (опити с експоненциално забавяне, срок на опит, dead-letter, идемпотентност по id на
 * задачата, едновременност по опашка), само че в паметта. Рестарт губи чакащите задачи — файлът
 * остава QUEUED/RUNNING и администраторът го пуска наново („Повтори“); затова продукцията е с Redis.
 */

export interface JobBus {
  readonly mode: 'inline' | 'redis';
  enqueue<Q extends QueueName>(queue: Q, data: JobData[Q], opts: EnqueueOptions): Promise<void>;
  close(): Promise<void>;
}

interface Pending {
  queue: QueueName;
  data: unknown;
  jobId: string;
}

export class InlineJobBus implements JobBus {
  readonly mode = 'inline' as const;
  private readonly known = new Set<string>();
  private readonly waiting = new Map<QueueName, Pending[]>();
  private readonly running = new Map<QueueName, number>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly stop = new AbortController();
  private handlers: JobHandlers | null = null;
  private hooks: QueueHooks = { onDead: async () => undefined };
  private closed = false;

  constructor(
    private readonly policies: QueuePolicies,
    private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void> = defaultSleep,
  ) {}

  /**
   * Обработчиците и куките се закачат след сглобяването: те ползват самата опашка (предаване към
   * OCR), а куките — потока (мъртво писмо → файлът е FAILED).
   */
  attach(handlers: JobHandlers, hooks: QueueHooks): void {
    this.handlers = handlers;
    this.hooks = hooks;
    for (const queue of this.waiting.keys()) this.pump(queue);
  }

  async enqueue<Q extends QueueName>(queue: Q, data: JobData[Q], opts: EnqueueOptions) {
    if (this.closed) throw new Error('опашката е спряна');
    if (this.known.has(opts.jobId)) return;
    this.known.add(opts.jobId);
    const list = this.waiting.get(queue) ?? [];
    list.push({ queue, data, jobId: opts.jobId });
    this.waiting.set(queue, list);
    this.pump(queue);
  }

  /** Тестове: изчаква, докато няма нито чакащи, нито текущи задачи. */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0 || [...this.waiting.values()].some((l) => l.length > 0)) {
      await Promise.allSettled([...this.inFlight]);
      await new Promise((r) => setImmediate(r));
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.stop.abort();
    await Promise.allSettled([...this.inFlight]);
  }

  private pump(queue: QueueName): void {
    if (!this.handlers) return;
    const policy = this.policies[queue];
    const list = this.waiting.get(queue) ?? [];
    while ((this.running.get(queue) ?? 0) < policy.concurrency && list.length > 0) {
      const job = list.shift() as Pending;
      this.running.set(queue, (this.running.get(queue) ?? 0) + 1);
      const run = this.process(job).finally(() => {
        this.inFlight.delete(run);
        this.running.set(queue, (this.running.get(queue) ?? 1) - 1);
        // Id-то се помни само докато задачата съществува (като в BullMQ с removeOnComplete).
        this.known.delete(job.jobId);
        this.pump(queue);
      });
      this.inFlight.add(run);
    }
  }

  private async process(job: Pending): Promise<void> {
    const policy = this.policies[job.queue];
    const parsed = JOB_SCHEMAS[job.queue].safeParse(job.data);
    if (!parsed.success) {
      await this.dead(job, 1, 'invalid_data');
      return;
    }
    const handler = this.handlers?.[job.queue] as (d: unknown, c: object) => Promise<void>;
    for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
      const started = performance.now();
      const final = attempt === policy.attempts;
      try {
        await runAttempt(policy.timeoutMs, this.stop.signal, (signal) =>
          handler(parsed.data, { signal, attempt, final }),
        );
        this.hooks.onResult?.(job.queue, 'completed', (performance.now() - started) / 1000);
        return;
      } catch (err) {
        const seconds = (performance.now() - started) / 1000;
        if (final || this.stop.signal.aborted) {
          this.hooks.onResult?.(job.queue, 'dead', seconds);
          await this.dead(job, attempt, err instanceof Error ? err.name : 'unknown');
          return;
        }
        this.hooks.onResult?.(job.queue, 'retried', seconds);
        await this.sleep(policy.backoffMs * 2 ** (attempt - 1), this.stop.signal).catch(
          () => undefined,
        );
      }
    }
  }

  private async dead(job: Pending, attempts: number, reason: string): Promise<void> {
    await this.hooks
      .onDead({
        queue: job.queue,
        jobId: job.jobId,
        data: job.data as JobData[QueueName],
        attempts,
        reason,
      })
      .catch(() => undefined);
  }
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    t.unref();
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}
