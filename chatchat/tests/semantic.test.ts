import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  assertVector,
  EMBEDDING_DIM,
  EmbeddingError,
  toVectorLiteral,
  VertexEmbeddingModel,
  vertexBaseUrl,
} from '../src/ai/embeddings.js';
import { DiagnosticContextSchema } from '../src/domain/context.js';
import {
  evidenceLevel,
  MAX_PACK,
  retrieve,
  SEMANTIC_HIGH_SIMILARITY,
  SEMANTIC_MIN_SIMILARITY,
} from '../src/retrieval/retrieve.js';
import type { KnowledgeStore, RawEvidence, SearchScope } from '../src/retrieval/types.js';
import { hashEmbedding } from '../evals/lib/fake-embeddings.js';

/**
 * Семантичното търсене (§8.1) без база: сливане с RRF, привилегията на точните съвпадения,
 * границата за „high“, fail-open — и клиентът за Vertex embeddings с подменен fetch (без мрежа).
 * Самостоятелен файл: собствено хранилище в паметта.
 */

const SCOPE: SearchScope = { tenantId: 't1', audiences: ['PORTAL'] };
const MODEL = 'LTX-500';
let seq = 0;

function chunk(text: string, over: Partial<RawEvidence> = {}): RawEvidence {
  seq += 1;
  return {
    kind: 'document',
    documentId: `doc-${seq}`,
    documentCode: `MAN-${seq}`,
    documentTitle: 'Manuale',
    documentType: 'MANUAL',
    revision: 'A',
    language: 'it',
    page: 1,
    section: null,
    text,
    safetyRelevant: false,
    matchedBy: ['fulltext'],
    chunkId: `c-${seq}`,
    errorId: null,
    errorCode: null,
    checks: [],
    rawScore: 1,
    rules: [{ hwRevision: null, fwMin: null, fwMax: null }],
    ...over,
  };
}

/** Лексикални редове (пълнотекстово по брой общи думи) + семантични със зададено сходство. */
class Store implements KnowledgeStore {
  semanticCalls = 0;
  semanticFails = false;
  constructor(
    private readonly lexical: RawEvidence[],
    private readonly semantic: Array<{ raw: RawEvidence; similarity: number }> = [],
    private readonly errors: RawEvidence[] = [],
  ) {}
  async findErrors(_s: SearchScope, _m: string, codes: string[]) {
    return this.errors.filter((e) => codes.includes(e.errorCode ?? ''));
  }
  async findChunksByIdentifiers() {
    return [];
  }
  async searchChunks(_s: SearchScope, _m: string, text: string, limit: number) {
    const q = new Set(text.toLowerCase().split(/\W+/));
    return this.lexical
      .map((r) => ({
        r,
        hits: r.text
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => q.has(w)).length,
      }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit)
      .map((x) => ({ ...x.r, rawScore: x.hits }));
  }
  async searchSemantic(_s: SearchScope, _m: string, _t: string, limit: number) {
    this.semanticCalls += 1;
    if (this.semanticFails) throw new Error('pgvector липсва');
    return this.semantic
      .slice(0, limit)
      .map(({ raw, similarity }) => ({ ...raw, matchedBy: ['semantic' as const], similarity }));
  }
  async getPage() {
    return [];
  }
}

const context = (over = {}) =>
  DiagnosticContextSchema.parse({
    productModel: MODEL,
    hardwareRevision: 'B',
    firmware: '4.2',
    serial: null,
    errorCode: null,
    ...over,
  });
const ask = (store: KnowledgeStore, query: string, over = {}) =>
  retrieve(store, { scope: SCOPE, context: context(over), query });

describe('retrieve — семантичен път и RRF', () => {
  test('намереното и по двата пътя се изкачва над само пълнотекстовото (RRF)', async () => {
    const a = chunk('porta cabina non chiude porta');
    const b = chunk('porta di piano');
    const store = new Store([a, b], [{ raw: b, similarity: 0.9 }]);
    const r = await ask(store, 'porta cabina porta piano');
    assert.equal(r.items[0]?.chunkId, b.chunkId, 'b е и в двата списъка');
    assert.deepEqual([...(r.items[0]?.matchedBy ?? [])].sort(), ['fulltext', 'semantic']);
    assert.equal(r.items[0]?.similarity, 0.9);
  });

  test('само семантично съвпадение влиза с matchedBy semantic и лексикален score 0', async () => {
    const s = chunk('La cabina si ferma tra i piani', { matchedBy: ['semantic'] });
    const store = new Store([], [{ raw: s, similarity: 0.83 }]);
    const r = await ask(store, 'ascensore bloccato a metà corsa');
    assert.equal(r.items.length, 1);
    assert.deepEqual(r.items[0]?.matchedBy, ['semantic']);
    assert.equal(r.items[0]?.score, 0);
  });

  test(`под прага ${SEMANTIC_MIN_SIMILARITY} семантичното е шум и не влиза (AC-04 остава възможно)`, async () => {
    const s = chunk('Testo qualsiasi');
    const store = new Store([], [{ raw: s, similarity: SEMANTIC_MIN_SIMILARITY - 0.01 }]);
    const r = await ask(store, 'domanda fuori tema');
    assert.equal(r.items.length, 0);
    assert.equal(evidenceLevel(r), 'none');
  });

  test('точните съвпадения остават първи и не се режат, каквото и да намери семантичното', async () => {
    const errors = Array.from({ length: MAX_PACK + 2 }, (_, i) =>
      chunk(`E37 variante ${i}`, {
        kind: 'error',
        matchedBy: ['exact_code'],
        chunkId: null,
        errorId: `e-${i}`,
        errorCode: 'E37',
      }),
    );
    const sem = Array.from({ length: 6 }, (_, i) => ({
      raw: chunk(`passaggio ${i}`),
      similarity: 0.95,
    }));
    const r = await ask(new Store([], sem, errors), 'E37');
    assert.equal(r.items.length, MAX_PACK + 2, 'точните не се режат; семантичните — да');
    assert.ok(r.items.every((i) => i.matchedBy.includes('exact_code')));
  });

  test('семантичното не надскача точния код: точните са преди него', async () => {
    const err = chunk('E37 — encoder', {
      kind: 'error',
      matchedBy: ['exact_code'],
      chunkId: null,
      errorId: 'e-1',
      errorCode: 'E37',
    });
    const s = chunk('encoder scollegato');
    const r = await ask(new Store([], [{ raw: s, similarity: 0.99 }], [err]), 'E37 encoder');
    assert.equal(r.items[0]?.errorCode, 'E37');
    assert.deepEqual(r.items[1]?.matchedBy, ['semantic']);
  });

  test('несъвместимото семантично пада под съвместимото', async () => {
    const off = chunk('porta firmware cinque', {
      rules: [{ hwRevision: null, fwMin: '5.0', fwMax: null }],
    });
    const on = chunk('porta firmware quattro');
    const store = new Store(
      [],
      [
        { raw: off, similarity: 0.95 },
        { raw: on, similarity: 0.7 },
      ],
    );
    const r = await ask(store, 'porta');
    assert.equal(r.items[0]?.chunkId, on.chunkId);
    assert.equal(r.items[1]?.applicable, false);
  });

  test('fail-open: грешка в семантичното → точно + пълнотекстово, без изключение', async () => {
    const a = chunk('contatto porta');
    const store = new Store([a], [{ raw: chunk('x'), similarity: 0.9 }]);
    store.semanticFails = true;
    const r = await ask(store, 'contatto porta');
    assert.equal(store.semanticCalls, 1);
    assert.deepEqual(
      r.items.map((i) => i.chunkId),
      [a.chunkId],
    );
  });
});

describe('evidenceLevel — границата за семантичното', () => {
  test('само семантично (колкото и да е близо) е „weak“, никога „high“/„strong“', async () => {
    const sem = [1, 2, 3].map((i) => ({ raw: chunk(`passo ${i}`), similarity: 0.97 }));
    const r = await ask(new Store([], sem), 'ascensore fermo');
    assert.equal(r.items.length, 3);
    assert.equal(evidenceLevel(r), 'weak');
  });

  test(`лексикален + семантичен от друг документ с сходство ≥ ${SEMANTIC_HIGH_SIMILARITY} → „high“`, async () => {
    const lex = chunk('contatto porta di piano aperto');
    const sem = chunk('serratura del piano non chiusa');
    const r = await ask(
      new Store([lex], [{ raw: sem, similarity: SEMANTIC_HIGH_SIMILARITY }]),
      'contatto porta piano',
    );
    assert.equal(evidenceLevel(r), 'high');
  });

  test(`лексикален + семантичен под ${SEMANTIC_HIGH_SIMILARITY} → „weak“`, async () => {
    const lex = chunk('contatto porta di piano aperto');
    const sem = chunk('serratura del piano non chiusa');
    const r = await ask(
      new Store([lex], [{ raw: sem, similarity: SEMANTIC_HIGH_SIMILARITY - 0.01 }]),
      'contatto porta piano',
    );
    assert.equal(evidenceLevel(r), 'weak');
  });

  test('семантичен от СЪЩИЯ документ като лексикалния не е втори източник', async () => {
    const lex = chunk('contatto porta di piano aperto');
    const same = chunk('altro paragrafo', { documentId: lex.documentId });
    const r = await ask(new Store([lex], [{ raw: same, similarity: 0.95 }]), 'contatto porta');
    assert.equal(evidenceLevel(r), 'weak');
  });
});

describe('Vertex embeddings — клиентът (подменен fetch)', () => {
  const vector = (x = 0.01) => new Array<number>(EMBEDDING_DIM).fill(x);
  const ok = (values: unknown = vector()) =>
    new Response(JSON.stringify({ predictions: [{ embeddings: { values } }] }), { status: 200 });
  const make = (responses: Array<Response | Error>, over = {}) => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const model = new VertexEmbeddingModel({
      projectId: 'proj-test',
      region: 'eu',
      model: 'gemini-embedding-001',
      timeoutMs: 1000,
      backoffMs: 1,
      accessToken: async () => 'token-di-prova',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        const next = responses.shift() ?? ok();
        if (next instanceof Error) throw next;
        return next;
      }) as unknown as typeof fetch,
      ...over,
    });
    return { model, calls };
  };

  test('ЕС адрес, :predict, един текст на заявка, 768 измерения, тип на задачата и заглавие', async () => {
    const { model, calls } = make([]);
    const out = await model.embed(
      [{ text: 'uno', title: 'Manuale' }, { text: 'due' }, { text: 'tre' }],
      'RETRIEVAL_DOCUMENT',
    );
    assert.equal(out.length, 3);
    assert.equal(calls.length, 3, 'gemini-embedding-001 приема един текст на заявка');
    assert.equal(
      calls[0]?.url,
      'https://aiplatform.eu.rep.googleapis.com/v1/projects/proj-test/locations/eu/publishers/google/models/gemini-embedding-001:predict',
    );
    const body = calls.find((c) => JSON.stringify(c.body).includes('uno'))?.body;
    assert.deepEqual(body, {
      instances: [{ content: 'uno', task_type: 'RETRIEVAL_DOCUMENT', title: 'Manuale' }],
      parameters: { autoTruncate: true, outputDimensionality: EMBEDDING_DIM },
    });
    assert.equal(model.id, 'gemini-embedding-001@768');
  });

  test('повторен опит само при 429/5xx/мрежа', async () => {
    const { model, calls } = make([
      new Response('', { status: 429 }),
      new Response('', { status: 503 }),
      ok(),
    ]);
    await model.embed([{ text: 'x' }], 'RETRIEVAL_QUERY');
    assert.equal(calls.length, 3);
    const net = make([new TypeError('fetch failed'), ok()]);
    await net.model.embed([{ text: 'x' }], 'RETRIEVAL_QUERY');
    assert.equal(net.calls.length, 2);
  });

  for (const status of [400, 401, 403, 404]) {
    test(`HTTP ${status} не се повтаря`, async () => {
      const { model, calls } = make([new Response('', { status })]);
      await assert.rejects(
        model.embed([{ text: 'x' }], 'RETRIEVAL_QUERY'),
        (e: unknown) => e instanceof EmbeddingError && e.status === status,
      );
      assert.equal(calls.length, 1);
    });
  }

  test('таванът на повторните опити е краен', async () => {
    const { model, calls } = make(
      Array.from({ length: 10 }, () => new Response('', { status: 500 })),
    );
    await assert.rejects(model.embed([{ text: 'x' }], 'RETRIEVAL_QUERY'), EmbeddingError);
    assert.equal(calls.length, 3, '1 + maxRetries(2)');
  });

  test('грешна размерност или нечисло → отказ (нищо не влиза в базата)', async () => {
    const { model } = make([ok([1, 2, 3])]);
    await assert.rejects(model.embed([{ text: 'x' }], 'RETRIEVAL_QUERY'), EmbeddingError);
    assert.throws(() => assertVector([...vector().slice(1), Number.NaN]), EmbeddingError);
  });

  test('само ЕС регион; глобалният и американските адреси са забранени', () => {
    assert.equal(
      vertexBaseUrl('europe-west8'),
      'https://europe-west8-aiplatform.googleapis.com/v1',
    );
    for (const region of ['global', 'us', 'us-central1']) {
      assert.throws(() => vertexBaseUrl(region));
    }
  });

  test('литералът за pgvector', () => {
    assert.equal(toVectorLiteral([0.5, -1, 0]), '[0.5,-1,0]');
  });

  test('фалшивият embedding е детерминистичен, нормализиран и с 768 измерения', () => {
    const a = hashEmbedding('Contatto porta di piano');
    assert.equal(a.length, EMBEDDING_DIM);
    assert.deepEqual(a, hashEmbedding('contatto PORTA di piano'));
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9);
  });
});
