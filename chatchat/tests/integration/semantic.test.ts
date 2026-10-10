import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { HashEmbeddingModel } from '../../evals/lib/fake-embeddings.js';
import { embedPending } from '../../src/store/embeddings.js';
import { PrismaKnowledgeStore } from '../../src/store/knowledge.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import { MODEL, seedWorld, TEXT, uploadDoc, type World } from './world.js';

/**
 * pgvector срещу жива PostgreSQL (§6.2, §8.1): векторите са само за PUBLISHED, търсенето носи
 * същите филтри (tenant, PUBLISHED, аудитория, модел), векторите на друг модел не се смесват,
 * повреда на embeddings е fail-open. Фалшивият embedding е детерминистичен (без мрежа).
 */

const embedder = new HashEmbeddingModel();
let h: Harness;
let w: World;

before(async () => {
  h = await startApp({ embedder });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  embedder.failWith = null;
  w = await seedWorld(h);
  await h.indexer?.kick();
});

async function embeddedByDocument(): Promise<Map<string, { total: number; embedded: number }>> {
  const rows = await db.$queryRaw<Array<{ documentId: string; total: number; embedded: number }>>`
    SELECT "documentId", count(*)::int AS total,
           count(*) FILTER (WHERE embedding IS NOT NULL AND "embeddingModel" = ${embedder.id})::int AS embedded
    FROM "DocumentChunk" GROUP BY "documentId"`;
  return new Map(rows.map((r) => [r.documentId, r]));
}

describe('Индексиране', () => {
  test('след публикуване всички парчета на PUBLISHED имат вектор; DRAFT — никога', async () => {
    const stats = await embeddedByDocument();
    for (const id of [w.docs.manFw4, w.docs.manFw5, w.docs.internal, w.docs.procedure]) {
      const s = stats.get(id);
      assert.ok(s && s.total > 0 && s.embedded === s.total, `документ ${id}`);
    }
    assert.equal(stats.get(w.docs.draft)?.embedded, 0, 'DRAFT не отива към модела');
  });

  test('REVIEW не се индексира; отписан документ не получава нови вектори', async () => {
    const review = await uploadDoc(w.ownerA1, {
      code: 'MAN-REVIEW',
      pages: [{ page: 1, text: 'Documento in revisione sul freno di emergenza.' }],
    });
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${review}/submit`)).status, 204);
    const deprecated = w.docs.manFw5;
    assert.equal(
      (await w.ownerA1.post(`/api/v1/admin/documents/${deprecated}/deprecate`)).status,
      204,
    );
    await db.$executeRaw`UPDATE "DocumentChunk" SET embedding = NULL, "embeddingModel" = NULL WHERE "documentId" = ${deprecated}`;
    const result = await embedPending(db, embedder);
    assert.equal(result.embedded, 0);
    const stats = await embeddedByDocument();
    assert.equal(stats.get(review)?.embedded, 0);
    assert.equal(stats.get(deprecated)?.embedded, 0);
  });

  test('смяна на модела → старите вектори не се ползват, embedPending ги преизчислява', async () => {
    class Other extends HashEmbeddingModel {
      override readonly id: string = 'fake-hash-v2@768';
    }
    const other = new Other();
    const store = new PrismaKnowledgeStore(db, { embedder: other });
    const scope = { tenantId: w.tenantA.id, audiences: ['PORTAL' as const] };
    assert.deepEqual(await store.searchSemantic(scope, MODEL, TEXT.manualFw4, 5), []);
    const result = await embedPending(db, other);
    assert.ok(result.embedded > 0);
    const hits = await store.searchSemantic(scope, MODEL, TEXT.manualFw4, 5);
    assert.equal(hits[0]?.documentId, w.docs.manFw4);
  });
});

describe('Търсене', () => {
  const store = () => new PrismaKnowledgeStore(db, { embedder });

  test('намира парчето по смисъл/близост, със сходство и matchedBy semantic', async () => {
    const scope = { tenantId: w.tenantA.id, audiences: ['PORTAL' as const] };
    const hits = await store().searchSemantic(scope, MODEL, TEXT.manualFw4, 5);
    assert.equal(hits[0]?.documentId, w.docs.manFw4);
    assert.deepEqual(hits[0]?.matchedBy, ['semantic']);
    assert.ok((hits[0]?.similarity ?? 0) > 0.99);
  });

  test('филтрите са в SQL: чужд клиент, вътрешна аудитория, друг модел, чернова — не', async () => {
    const portal = { tenantId: w.tenantA.id, audiences: ['PORTAL' as const] };
    const texts = [TEXT.tenantB, TEXT.internal, TEXT.otherProduct, TEXT.draft];
    for (const text of texts) {
      const hits = await store().searchSemantic(portal, MODEL, text, 20);
      assert.ok(!hits.some((h) => h.text === text), `не бива да се вижда: ${text}`);
    }
    const internal = { tenantId: w.tenantA.id, audiences: ['PORTAL', 'INTERNAL'] as const };
    const own = await store().searchSemantic(
      { ...internal, audiences: [...internal.audiences] },
      MODEL,
      TEXT.internal,
      5,
    );
    assert.equal(own[0]?.text, TEXT.internal, 'вътрешната роля го вижда');
  });

  test('fail-open: повреда на embeddings → [] и сигнал, без изключение', async () => {
    const errors: unknown[] = [];
    const s = new PrismaKnowledgeStore(db, { embedder, onError: (e) => errors.push(e) });
    embedder.failWith = new Error('503');
    const scope = { tenantId: w.tenantA.id, audiences: ['PORTAL' as const] };
    assert.deepEqual(await s.searchSemantic(scope, MODEL, TEXT.manualFw4, 5), []);
    assert.equal(errors.length, 1);
  });

  test('без embedder (AI без embeddings) семантичното е празно', async () => {
    const scope = { tenantId: w.tenantA.id, audiences: ['PORTAL' as const] };
    const s = new PrismaKnowledgeStore(db);
    assert.deepEqual(await s.searchSemantic(scope, MODEL, TEXT.manualFw4, 5), []);
  });
});
