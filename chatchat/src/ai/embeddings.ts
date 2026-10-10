import { GoogleAuth } from 'google-auth-library';
import { EU_REGION, embeddingsEnabled, type Config } from '../config.js';

/**
 * Embeddings за семантичното търсене (§6.2, §8.1). Договорът е минимален: текстове → вектори с
 * фиксирана размерност (колоната е `vector(768)`). Истинският е Vertex AI в ЕС, в тестовете и
 * оценката — детерминистичен фалшив (`fake-embeddings.ts`).
 *
 * Проверено в живата документация на Google Cloud (2026-10-09):
 *  - gemini-embedding-001: многоезичен (вкл. италиански, английски, български), до 3072
 *    измерения с `outputDimensionality` (MRL), 2048 токена на вход; по REST `:predict` приема
 *    САМО ЕДИН текст на заявка (docs/model-reference/text-embeddings-api).
 *  - ML обработка в ЕС мулти-региона `eu` (aiplatform.eu.rep.googleapis.com) — learn/data-residency.
 *  - Квоти: 100 000 заявки/мин и 100 000 000 входни токена/мин за базовия модел (learn/quotas).
 * 768 измерения: HNSW на pgvector индексира `vector` до 2000 измерения.
 */

export const EMBEDDING_DIM = 768;

/** RETRIEVAL_QUERY за въпроса, RETRIEVAL_DOCUMENT за парчетата (асиметрично търсене). */
export type EmbeddingTask = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';

export interface EmbeddingInput {
  text: string;
  /** Само за RETRIEVAL_DOCUMENT — заглавието на документа подобрява вектора. */
  title?: string;
}

export interface EmbeddingModel {
  /**
   * Идентичността на векторите („gemini-embedding-001@768“) — пази се до всеки вектор; търсенето
   * сравнява само вектори от същия модел (различните модели не са съвместими).
   */
  readonly id: string;
  embed(inputs: EmbeddingInput[], task: EmbeddingTask, signal?: AbortSignal): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    /** HTTP статус от доставчика (0 = мрежа/таймаут/невалиден отговор). */
    readonly status: number,
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

/** Проверка на вектора: точна размерност и само крайни числа — иначе в базата не влиза. */
export function assertVector(values: unknown, dim = EMBEDDING_DIM): number[] {
  if (!Array.isArray(values) || values.length !== dim) {
    throw new EmbeddingError(`вектор с размерност ≠ ${dim}`, 0);
  }
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new EmbeddingError('вектор с невалидна стойност', 0);
    }
  }
  return values as number[];
}

/** Литерал за pgvector (`'[0.1,0.2,…]'::vector`) — подава се като параметър, не в SQL текста. */
export function toVectorLiteral(values: readonly number[]): string {
  return `[${values.join(',')}]`;
}

/** Базов адрес на Vertex за ЕС регион — както @anthropic-ai/vertex-sdk (`eu` → .eu.rep). */
export function vertexBaseUrl(region: string): string {
  if (!EU_REGION.test(region)) throw new Error(`VERTEX_REGION „${region}“ не е ЕС регион`);
  return region === 'eu'
    ? 'https://aiplatform.eu.rep.googleapis.com/v1'
    : `https://${region}-aiplatform.googleapis.com/v1`;
}

const RETRYABLE = (status: number) => status === 429 || status >= 500;
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export interface VertexEmbeddingOptions {
  projectId: string;
  region: string;
  model: 'gemini-embedding-001';
  timeoutMs: number;
  /** Повторни опити само при 429/5xx/мрежа (не при 400/401/403/404). */
  maxRetries?: number;
  /** Колко заявки паралелно (моделът приема един текст на заявка). */
  concurrency?: number;
  /** За тестовете: подменим fetch и токен (без мрежа и без GCP). */
  fetch?: typeof fetch;
  accessToken?: () => Promise<string>;
  backoffMs?: number;
}

/**
 * Vertex AI `:predict` по REST с ADC / service account (GOOGLE_APPLICATION_CREDENTIALS).
 * `google-auth-library` е същата, на която стъпва @anthropic-ai/vertex-sdk — без нов доставчик.
 */
export class VertexEmbeddingModel implements EmbeddingModel {
  readonly id: string;
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token: () => Promise<string>;
  private readonly maxRetries: number;
  private readonly concurrency: number;
  private readonly backoffMs: number;

  constructor(private readonly opts: VertexEmbeddingOptions) {
    if (opts.projectId.length === 0) throw new Error('Липсва VERTEX_PROJECT_ID');
    const base = vertexBaseUrl(opts.region);
    this.url =
      `${base}/projects/${encodeURIComponent(opts.projectId)}/locations/${opts.region}` +
      `/publishers/google/models/${opts.model}:predict`;
    this.id = `${opts.model}@${EMBEDDING_DIM}`;
    this.fetchImpl = opts.fetch ?? fetch;
    this.maxRetries = opts.maxRetries ?? 2;
    this.concurrency = Math.max(1, opts.concurrency ?? 4);
    this.backoffMs = opts.backoffMs ?? 500;
    if (opts.accessToken) {
      this.token = opts.accessToken;
    } else {
      const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
      this.token = async () => {
        const token = await auth.getAccessToken();
        if (!token) throw new EmbeddingError('няма токен за Google Cloud (ADC)', 401);
        return token;
      };
    }
  }

  async embed(
    inputs: EmbeddingInput[],
    task: EmbeddingTask,
    signal?: AbortSignal,
  ): Promise<number[][]> {
    const out: number[][] = new Array<number[]>(inputs.length);
    let next = 0;
    const worker = async () => {
      while (next < inputs.length) {
        const i = next++;
        out[i] = await this.embedOne(inputs[i] as EmbeddingInput, task, signal);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, inputs.length) }, () => worker()),
    );
    return out;
  }

  private async embedOne(
    input: EmbeddingInput,
    task: EmbeddingTask,
    signal?: AbortSignal,
  ): Promise<number[]> {
    const instance: Record<string, string> = { content: input.text, task_type: task };
    if (task === 'RETRIEVAL_DOCUMENT' && input.title) instance.title = input.title;
    const body = JSON.stringify({
      instances: [instance],
      parameters: { autoTruncate: true, outputDimensionality: EMBEDDING_DIM },
    });

    for (let attempt = 0; ; attempt += 1) {
      const deadline = AbortSignal.timeout(this.opts.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      let status = 0;
      try {
        const res = await this.fetchImpl(this.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await this.token()}`,
            'content-type': 'application/json; charset=utf-8',
          },
          body,
          signal: combined,
        });
        status = res.status;
        if (res.ok) {
          const json = (await res.json()) as {
            predictions?: Array<{ embeddings?: { values?: unknown } }>;
          };
          return assertVector(json.predictions?.[0]?.embeddings?.values);
        }
        // Тялото на грешката не се логва (може да съдържа ехо на входа).
        await res.body?.cancel();
        if (!RETRYABLE(status) || attempt >= this.maxRetries) {
          throw new EmbeddingError(`Vertex embeddings: HTTP ${status}`, status);
        }
      } catch (err) {
        if (err instanceof EmbeddingError) throw err;
        if (signal?.aborted || attempt >= this.maxRetries) {
          throw new EmbeddingError('Vertex embeddings: мрежа/таймаут', 0);
        }
      }
      await sleep(this.backoffMs * 2 ** attempt, signal);
    }
  }
}

/** Конфигурацията → модел, или null (AI изключен / EMBEDDING_MODEL=off) → само лексикално. */
export function embeddingModelFrom(
  cfg: Pick<
    Config,
    'VERTEX_PROJECT_ID' | 'VERTEX_REGION' | 'EMBEDDING_MODEL' | 'EMBEDDING_TIMEOUT_MS'
  >,
): EmbeddingModel | null {
  if (!embeddingsEnabled(cfg) || cfg.EMBEDDING_MODEL === 'off') return null;
  return new VertexEmbeddingModel({
    projectId: cfg.VERTEX_PROJECT_ID,
    region: cfg.VERTEX_REGION,
    model: cfg.EMBEDDING_MODEL,
    timeoutMs: cfg.EMBEDDING_TIMEOUT_MS,
  });
}
