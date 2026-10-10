import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobBus } from './inline.js';
import {
  DEAD_QUEUE,
  JOB_SCHEMAS,
  QUEUE_NAMES,
  runAttempt,
  type EnqueueOptions,
  type JobData,
  type JobHandlers,
  type QueueHooks,
  type QueueName,
  type QueuePolicies,
} from './jobs.js';
import { KEY_PREFIX } from './redis.js';

/**
 * Опашките върху Redis + BullMQ 6 (NFR-06, NFR-07): API-то само слага задачи (`BullJobBus`), а
 * отделният worker ги изпълнява (`WorkerHost`). Политиката е общата (jobs.ts): опити с
 * експоненциално забавяне, срок на опит, идемпотентност по id на задачата (същият id не се слага
 * втори път), dead-letter — изчерпаната задача отива в опашката `dead` (само id-та и причина) и
 * обектът ѝ се отбелязва (файлът става FAILED). Завършените се пазят 24 ч., провалените — 7 дни.
 */

const KEEP_COMPLETED = { age: 24 * 3600, count: 1000 };
const KEEP_FAILED = { age: 7 * 24 * 3600, count: 1000 };
/** Мъртвите писма се пазят 30 дни (чистят се при всяко ново). */
const DEAD_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export type QueueCounts = Record<
  QueueName | typeof DEAD_QUEUE,
  { waiting: number; active: number; delayed: number; failed: number }
>;

export class BullJobBus implements JobBus {
  readonly mode = 'redis' as const;
  private readonly queues = new Map<QueueName | typeof DEAD_QUEUE, Queue>();

  constructor(
    connection: Redis,
    private readonly policies: QueuePolicies,
    /** Префиксът на ключовете (тестовете — отделен, за да не се смесват с друг прогон). */
    readonly prefix = KEY_PREFIX,
  ) {
    for (const name of [...QUEUE_NAMES, DEAD_QUEUE] as const) {
      this.queues.set(name, new Queue(name, { connection, prefix }));
    }
  }

  private queue(name: QueueName | typeof DEAD_QUEUE): Queue {
    const q = this.queues.get(name);
    if (!q) throw new Error(`непозната опашка ${name}`);
    return q;
  }

  async enqueue<Q extends QueueName>(queue: Q, data: JobData[Q], opts: EnqueueOptions) {
    const parsed = JOB_SCHEMAS[queue].parse(data);
    const policy = this.policies[queue];
    await this.queue(queue).add(queue, parsed, {
      ...(opts.dedupe ? { deduplication: { id: opts.jobId } } : { jobId: opts.jobId }),
      attempts: policy.attempts,
      backoff: { type: 'exponential', delay: policy.backoffMs },
      removeOnComplete: KEEP_COMPLETED,
      removeOnFail: KEEP_FAILED,
    });
  }

  /** Периодичният преглед за непокрити вектори (Job Scheduler на BullMQ 6, идемпотентно). */
  async scheduleEmbedSweep(everySeconds: number): Promise<void> {
    const embed = this.queue('embed');
    if (everySeconds <= 0) {
      await embed.removeJobScheduler('embed-sweep');
      return;
    }
    await embed.upsertJobScheduler(
      'embed-sweep',
      { every: everySeconds * 1000 },
      {
        name: 'embed',
        data: {},
        opts: {
          attempts: 1,
          removeOnComplete: KEEP_COMPLETED,
          removeOnFail: KEEP_FAILED,
        },
      },
    );
  }

  /** Броевете по опашка (метриките на дълбочината). */
  async counts(): Promise<QueueCounts> {
    const out = {} as QueueCounts;
    for (const [name, q] of this.queues) {
      const c = await q.getJobCounts('waiting', 'active', 'delayed', 'failed');
      out[name] = {
        waiting: c.waiting ?? 0,
        active: c.active ?? 0,
        delayed: c.delayed ?? 0,
        failed: c.failed ?? 0,
      };
    }
    return out;
  }

  /** Мъртво писмо: само id-та, брой опити и причината (име на грешката). */
  async bury(letter: {
    queue: QueueName;
    jobId: string;
    data: unknown;
    attempts: number;
    reason: string;
  }): Promise<void> {
    const dead = this.queue(DEAD_QUEUE);
    await dead.add('dead', { ...letter, at: new Date().toISOString() }, { removeOnComplete: true });
    await dead.clean(DEAD_MAX_AGE_MS, 1000, 'wait');
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
  }
}

export interface WorkerLogger {
  warn(obj: object, msg: string): void;
}

const seconds = (job: Job) =>
  job.processedOn && job.finishedOn ? Math.max(0, (job.finishedOn - job.processedOn) / 1000) : 0;

/** Worker-ите на BullMQ за всяка опашка — само в процеса `node dist/worker.js`. */
export class WorkerHost {
  private readonly workers: Worker[] = [];

  constructor(
    private readonly connection: Redis,
    private readonly bus: BullJobBus,
    private readonly policies: QueuePolicies,
    private readonly handlers: JobHandlers,
    private readonly hooks: QueueHooks,
    private readonly logger: WorkerLogger,
  ) {}

  start(): void {
    for (const name of QUEUE_NAMES) this.workers.push(this.worker(name));
  }

  private worker(name: QueueName): Worker {
    const policy = this.policies[name];
    const handler = this.handlers[name] as (d: unknown, c: object) => Promise<void>;
    const worker = new Worker(
      name,
      async (job: Job, _token?: string, signal?: AbortSignal) => {
        const parsed = JOB_SCHEMAS[name].safeParse(job.data);
        if (!parsed.success) throw new UnrecoverableError('invalid_data');
        const attempt = job.attemptsMade + 1;
        const final = attempt >= (job.opts.attempts ?? 1);
        await runAttempt(policy.timeoutMs, signal, (s) =>
          handler(parsed.data, { signal: s, attempt, final }),
        );
      },
      {
        connection: this.connection,
        prefix: this.bus.prefix,
        concurrency: policy.concurrency,
        // Тежката работа е в нишки/дъщерни процеси — event loop-ът подновява ключа навреме.
        lockDuration: 60_000,
        // Задача, „заседнала“ два пъти (срив на worker-а по средата), е провал, не безкраен цикъл.
        maxStalledCount: 1,
        autorun: true,
      },
    );
    worker.on('completed', (job) => this.hooks.onResult?.(name, 'completed', seconds(job)));
    worker.on('failed', (job, err) => {
      if (!job) return;
      const exhausted =
        err instanceof UnrecoverableError ||
        err.name === 'UnrecoverableError' ||
        job.attemptsMade >= (job.opts.attempts ?? 1);
      this.hooks.onResult?.(name, exhausted ? 'dead' : 'retried', seconds(job));
      if (!exhausted) return;
      const letter = {
        queue: name,
        jobId: job.id ?? 'unknown',
        data: job.data as JobData[QueueName],
        attempts: job.attemptsMade,
        reason: err.message === 'invalid_data' ? 'invalid_data' : err.name,
      };
      void this.bus
        .bury(letter)
        .then(() => this.hooks.onDead(letter))
        .catch((e: unknown) =>
          this.logger.warn({ queue: name, errName: (e as Error).name }, 'dead-letter'),
        );
    });
    worker.on('error', (err) => this.logger.warn({ queue: name, errName: err.name }, 'worker'));
    return worker;
  }

  /** Плавно спиране: текущите задачи довършват до `graceMs`, после — принудително (stalled → пак). */
  async close(graceMs: number): Promise<void> {
    const graceful = Promise.allSettled(this.workers.map((w) => w.close()));
    const timer = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), graceMs).unref());
    if ((await Promise.race([graceful, timer])) === 'timeout') {
      await Promise.allSettled(this.workers.map((w) => w.close(true)));
    }
  }
}
