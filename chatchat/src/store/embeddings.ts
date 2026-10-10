import type { PrismaClient } from '@prisma/client';
import { toVectorLiteral, type EmbeddingModel } from '../ai/embeddings.js';
import { SEMANTIC_MIN_SIMILARITY } from '../retrieval/retrieve.js';
import type { RawEvidence, SearchScope } from '../retrieval/types.js';
import { applicableSql, chunkEvidence, documentInclude } from './scope.js';

/**
 * pgvector: търсене и индексиране (§6.2, §8.1).
 *  - Търсенето има СЪЩИТЕ филтри в SQL като пълнотекстовото: tenant, PUBLISHED, аудитория,
 *    приложимост към модела (общите правила + само таблото на случая — `store/scope.ts`).
 *    Плюс: само вектори от текущия модел на embeddings.
 *  - Векторите се смятат САМО за парчета на PUBLISHED документи — никога DRAFT/REVIEW/DEPRECATED;
 *    записът повтаря условието (документ, отписан между четенето и записа, не получава вектор).
 */

const MAX_SEMANTIC_LIMIT = 20;
/** HNSW кандидати преди филтрите по tenant/аудитория (по подразбиране 40 в pgvector). */
const HNSW_EF_SEARCH = 100;

export async function semanticSearch(
  db: PrismaClient,
  embedder: EmbeddingModel,
  scope: SearchScope,
  productModel: string,
  text: string,
  limit: number,
  signal?: AbortSignal,
): Promise<RawEvidence[]> {
  if (scope.audiences.length === 0 || text.trim().length < 3) return [];
  const [vector] = await embedder.embed([{ text }], 'RETRIEVAL_QUERY', signal);
  if (!vector) return [];
  const literal = toVectorLiteral(vector);
  const audiences = [...scope.audiences];
  const take = Math.min(Math.max(limit, 1), MAX_SEMANTIC_LIMIT);
  // <=> е косинусовото РАЗСТОЯНИЕ (0..2); сходство = 1 − разстояние.
  const [, rows] = await db.$transaction([
    db.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`),
    db.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT c.id, (1 - (c.embedding <=> ${literal}::vector))::float8 AS similarity
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE c.embedding IS NOT NULL
        AND c."embeddingModel" = ${embedder.id}
        AND d."tenantId" = ${scope.tenantId}
        AND d.status = 'PUBLISHED'
        AND d.audience::text = ANY(${audiences})
        AND ${applicableSql(scope, productModel)}
      ORDER BY c.embedding <=> ${literal}::vector
      LIMIT ${take}`,
  ]);
  const kept = rows.filter((r) => r.similarity >= SEMANTIC_MIN_SIMILARITY);
  if (kept.length === 0) return [];
  const similarity = new Map(kept.map((r) => [r.id, r.similarity]));
  const chunks = await db.documentChunk.findMany({
    where: { id: { in: [...similarity.keys()] } },
    include: { document: { include: documentInclude(productModel, scope) } },
  });
  return chunks.map((c) => ({
    ...chunkEvidence(c, ['semantic'], 0),
    similarity: similarity.get(c.id) ?? 0,
  }));
}

export interface EmbedPendingOptions {
  /** Само този клиент (CLI/оценка); иначе всички. */
  tenantId?: string;
  /** Само този документ (веднага след публикуване). */
  documentId?: string;
  /** Колко парчета на една партида (заявките към модела вървят паралелно в нея). */
  batchSize?: number;
  /** Таван на партидите за един прогон — пази квотата и времето. */
  maxBatches?: number;
  signal?: AbortSignal;
}

export interface EmbedPendingResult {
  embedded: number;
  /** Останали без вектор (таванът на партидите е достигнат). */
  remaining: boolean;
}

/**
 * Векторите на липсващите (или смятани с друг модел) парчета на ПУБЛИКУВАНИ документи.
 * Грешка на доставчика спира прогона (следващият го продължава) — нищо не се маркира наполовина.
 */
export async function embedPending(
  db: PrismaClient,
  embedder: EmbeddingModel,
  opts: EmbedPendingOptions = {},
): Promise<EmbedPendingResult> {
  const batchSize = Math.min(Math.max(opts.batchSize ?? 32, 1), 250);
  const maxBatches = opts.maxBatches ?? 1000;
  let embedded = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const rows = await db.$queryRaw<
      Array<{ id: string; text: string; section: string | null; title: string }>
    >`
      SELECT c.id, c.text, c.section, d.title
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE d.status = 'PUBLISHED'
        AND (c.embedding IS NULL OR c."embeddingModel" IS DISTINCT FROM ${embedder.id})
        AND (${opts.tenantId ?? null}::text IS NULL OR d."tenantId" = ${opts.tenantId ?? null})
        AND (${opts.documentId ?? null}::text IS NULL OR d.id = ${opts.documentId ?? null})
      ORDER BY c."documentId", c.ordinal
      LIMIT ${batchSize}`;
    if (rows.length === 0) return { embedded, remaining: false };
    const vectors = await embedder.embed(
      rows.map((r) => ({ text: r.section ? `${r.section}\n${r.text}` : r.text, title: r.title })),
      'RETRIEVAL_DOCUMENT',
      opts.signal,
    );
    for (const [i, row] of rows.entries()) {
      const vector = vectors[i];
      if (!vector) continue;
      embedded += await db.$executeRaw`
        UPDATE "DocumentChunk" c
        SET embedding = ${toVectorLiteral(vector)}::vector, "embeddingModel" = ${embedder.id}
        WHERE c.id = ${row.id}
          AND EXISTS (SELECT 1 FROM "Document" d WHERE d.id = c."documentId" AND d.status = 'PUBLISHED')`;
    }
  }
  return { embedded, remaining: true };
}

export interface IndexerLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/**
 * Фоновото индексиране: веднага след публикуване (`kick`) + периодичен преглед за пропуснатото
 * (грешка на доставчика, рестарт). Един прогон в даден момент; нови сигнали по време на прогона
 * пускат още един след него. Никога не хвърля към извикващия — публикуването не зависи от него.
 */
export class EmbeddingIndexer {
  private running: Promise<void> | null = null;
  private again = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: PrismaClient,
    private readonly embedder: EmbeddingModel,
    private readonly logger: IndexerLogger,
    private readonly sweepSeconds: number,
  ) {}

  start(): void {
    this.kick();
    if (this.sweepSeconds > 0 && this.timer === null) {
      this.timer = setInterval(() => this.kick(), this.sweepSeconds * 1000);
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Сигнал „има ново публикувано знание“. Връща обещание за тестовете. */
  kick(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.kick();
      }
    });
    return this.running;
  }

  private async run(): Promise<void> {
    try {
      const result = await embedPending(this.db, this.embedder, { maxBatches: 50 });
      if (result.embedded > 0 || result.remaining) {
        this.logger.info(
          { embedded: result.embedded, remaining: result.remaining, model: this.embedder.id },
          'семантичен индекс',
        );
      }
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      // Без съдържание: само вида и статуса на грешката.
      this.logger.warn(
        { err: (err as Error).name, status: typeof status === 'number' ? status : null },
        'семантичният индекс не е обновен — търсенето остава лексикално за новите парчета',
      );
    }
  }
}
