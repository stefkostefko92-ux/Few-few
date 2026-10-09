import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';
import type { EmbeddingInput, EmbeddingModel, EmbeddingTask } from './embeddings.js';
import type { DiagnosisModel } from './model.js';

/**
 * Circuit breaker към външните доставчици (NFR-07): Vertex AI за отговорите и за embeddings.
 * Декоратори върху `DiagnosisModel` / `EmbeddingModel` — истинските клиенти не се пипат; SDK-то
 * вече прави своите повторни опити (429/5xx/мрежа), breaker-ът брои ИЗХОДА на цялото извикване.
 *
 *  затворен ──(N последователни провала)──▶ отворен ──(cooldown)──▶ полуотворен
 *     ▲                                        ▲                       │
 *     └──────────(пробата успя)────────────────┴──(пробата се провали)─┘
 *
 * Отворен → бърз отказ `CircuitOpenError` (status 503) без мрежа: чатът го превежда като 503
 * `ai_unavailable` (fail-closed, човешкото съобщение остава и повторът с clientMessageId работи),
 * търсенето — като „без вектори“ (fail-open към лексикалното). Полуотворен пуска ЕДНА проба;
 * останалите се отказват, докато тя не приключи.
 *
 * Какво е провал: 429, 5xx, мрежа, изтекъл краен срок. Не е провал: 4xx (доставчикът отговаря —
 * грешката е в заявката) и отказ от викащия (затворен браузър) — той е неутрален.
 */

export type BreakerState = 'closed' | 'open' | 'half_open';
export type CallVerdict = 'success' | 'failure' | 'neutral';

export class CircuitOpenError extends Error {
  /** Като HTTP 503 — за кода, който чете `status` от грешките на доставчика. */
  readonly status = 503;
  constructor(readonly breaker: string) {
    super(`circuit breaker „${breaker}“ е отворен`);
    this.name = 'CircuitOpenError';
  }
}

export interface BreakerOptions {
  name: string;
  /** Колко последователни провала отварят breaker-а. */
  failureThreshold: number;
  /** Колко стои отворен, преди да пусне проба. */
  cooldownMs: number;
  /** Часовникът (ms) — фалшив в тестовете. */
  now?: () => number;
  onTransition?: (to: BreakerState, from: BreakerState) => void;
  onReject?: () => void;
}

export class CircuitBreaker {
  readonly name: string;
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private probing = false;
  /** Поколение: резултат от извикване, пуснато преди последния преход, не мести състоянието. */
  private generation = 0;
  private readonly now: () => number;

  constructor(private readonly opts: BreakerOptions) {
    if (!(opts.failureThreshold >= 1)) throw new Error('failureThreshold ≥ 1');
    if (!(opts.cooldownMs > 0)) throw new Error('cooldownMs > 0');
    this.name = opts.name;
    this.now = opts.now ?? Date.now;
  }

  get current(): BreakerState {
    return this.state;
  }

  async run<T>(fn: () => Promise<T>, classify: (err: unknown) => CallVerdict): Promise<T> {
    const ticket = this.admit();
    let out: T;
    try {
      out = await fn();
    } catch (err) {
      this.settle(ticket, classify(err));
      throw err;
    }
    this.settle(ticket, 'success');
    return out;
  }

  /** Пуска извикването или хвърля CircuitOpenError. Връща поколението и дали е пробата. */
  private admit(): { generation: number; probe: boolean } {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < this.opts.cooldownMs) this.reject();
      this.transition('half_open');
    }
    if (this.state === 'half_open') {
      if (this.probing) this.reject();
      this.probing = true;
      return { generation: this.generation, probe: true };
    }
    return { generation: this.generation, probe: false };
  }

  private reject(): never {
    this.opts.onReject?.();
    throw new CircuitOpenError(this.name);
  }

  private settle(ticket: { generation: number; probe: boolean }, verdict: CallVerdict): void {
    if (ticket.generation !== this.generation) return; // остаряло — състоянието вече е сменено
    if (ticket.probe) {
      this.probing = false;
      if (verdict === 'success') this.transition('closed');
      else if (verdict === 'failure') this.transition('open');
      // неутрално: пробата се освобождава, следващото извикване пробва наново
      return;
    }
    if (verdict === 'success') this.failures = 0;
    else if (verdict === 'failure') {
      this.failures += 1;
      if (this.failures >= this.opts.failureThreshold) this.transition('open');
    }
  }

  private transition(to: BreakerState): void {
    const from = this.state;
    this.state = to;
    this.generation += 1;
    this.probing = false;
    this.failures = 0;
    if (to === 'open') this.openedAt = this.now();
    this.opts.onTransition?.(to, from);
  }
}

/** Изтекъл краен срок (AbortSignal.timeout) за разлика от отказ на викащия (controller.abort). */
function isTimeoutReason(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && 'name' in reason
    ? reason.name === 'TimeoutError'
    : false;
}

function statusOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null || !('status' in err)) return null;
  return typeof err.status === 'number' ? err.status : null;
}

/** Грешка от Vertex (Anthropic SDK): 429/5xx/мрежа/краен срок — провал; 4xx — доставчикът е жив. */
export function classifyModelError(err: unknown, signal: AbortSignal): CallVerdict {
  if (signal.aborted) return isTimeoutReason(signal.reason) ? 'failure' : 'neutral';
  const status = statusOf(err);
  if (status === null) return 'failure'; // APIConnectionError / APIConnectionTimeoutError
  if (status === 429 || status >= 500) return 'failure';
  return 'success';
}

/** Грешка от embeddings (`EmbeddingError.status`: 0 = мрежа/таймаут/невалиден отговор). */
export function classifyEmbeddingError(err: unknown, signal?: AbortSignal): CallVerdict {
  if (signal?.aborted) return isTimeoutReason(signal.reason) ? 'failure' : 'neutral';
  const status = statusOf(err);
  if (status === null || status === 0 || status === 429 || status >= 500) return 'failure';
  return 'success';
}

export class BreakerDiagnosisModel implements DiagnosisModel {
  constructor(
    private readonly inner: DiagnosisModel,
    readonly breaker: CircuitBreaker,
  ) {}

  create(params: MessageCreateParamsNonStreaming, signal: AbortSignal): Promise<Message> {
    return this.breaker.run(
      () => this.inner.create(params, signal),
      (err) => classifyModelError(err, signal),
    );
  }
}

export class BreakerEmbeddingModel implements EmbeddingModel {
  constructor(
    private readonly inner: EmbeddingModel,
    readonly breaker: CircuitBreaker,
  ) {}

  /** Идентичността на векторите е на истинския модел — breaker-ът не я сменя. */
  get id(): string {
    return this.inner.id;
  }

  embed(inputs: EmbeddingInput[], task: EmbeddingTask, signal?: AbortSignal): Promise<number[][]> {
    return this.breaker.run(
      () => this.inner.embed(inputs, task, signal),
      (err) => classifyEmbeddingError(err, signal),
    );
  }
}
