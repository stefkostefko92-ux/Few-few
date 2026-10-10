import { Worker } from 'node:worker_threads';
import type { ParseOutcome, ParseRequest } from './parse.js';

/**
 * Разборът тече в отделна нишка (worker_threads) — по препоръката на mammoth за недоверени
 * документи и за pdf.js/XLSX: таван на паметта на нишката (`resourceLimits` — OOM убива само нея,
 * не worker-а), общ срок (terminate) и прекъсване от опашката (AbortSignal). Байтовете се копират в
 * нов ArrayBuffer и се ПРЕХВЪРЛЯТ (без второ копие).
 */

export interface Parser {
  parse(req: ParseRequest, signal?: AbortSignal): Promise<ParseOutcome>;
}

export interface ThreadParserOptions {
  /** Таван на старото поколение на купчината на нишката (MB). */
  heapMb: number;
  timeoutMs: number;
}

// Билдът — parse-thread.js; от изходния код (tsx) — входът, който регистрира tsx в нишката.
const THREAD_URL = new URL(
  import.meta.url.endsWith('.ts') ? './parse-thread.dev.mjs' : './parse-thread.js',
  import.meta.url,
);

export class ThreadParser implements Parser {
  constructor(private readonly opts: ThreadParserOptions) {}

  parse(req: ParseRequest, signal?: AbortSignal): Promise<ParseOutcome> {
    if (signal?.aborted) {
      return Promise.resolve({ ok: false, code: 'ingest.err.timeout', retryable: false });
    }
    const copy = new Uint8Array(req.bytes.byteLength);
    copy.set(req.bytes);
    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker(THREAD_URL, {
        workerData: { ...req, bytes: copy },
        transferList: [copy.buffer],
        resourceLimits: {
          maxOldGenerationSizeMb: this.opts.heapMb,
          maxYoungGenerationSizeMb: 64,
          stackSizeMb: 8,
        },
        // Нишката не наследява stdin/stdout на процеса и не вижда средата му (тайните).
        env: {},
        stdout: true,
        stderr: true,
      });
      const finish = (outcome: ParseOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        void worker.terminate();
        resolve(outcome);
      };
      const fail = (
        code: 'ingest.err.timeout' | 'ingest.err.resourceLimit' | 'ingest.err.internal',
      ) => finish({ ok: false, code, retryable: false });
      const onAbort = () => fail('ingest.err.timeout');
      const timer = setTimeout(onAbort, this.opts.timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      worker.once('message', (outcome: ParseOutcome) => finish(outcome));
      worker.once('error', (err: NodeJS.ErrnoException) =>
        fail(
          err.code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? 'ingest.err.resourceLimit'
            : 'ingest.err.internal',
        ),
      );
      worker.once('exit', () => fail('ingest.err.internal'));
    });
  }
}
