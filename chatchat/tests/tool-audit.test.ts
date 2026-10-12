import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { diagnose } from '../src/ai/orchestrator.js';
import { auditToolCall } from '../src/ai/tool-audit.js';
import { DiagnosticContextSchema } from '../src/domain/context.js';
import type { KnowledgeStore, RawEvidence } from '../src/retrieval/types.js';

/**
 * FR-12: одитът на инструментите на модела — име, ключове на аргументите, брой резултати; текстът
 * на заявките никога (само дължина и съкратен хеш).
 */

describe('auditToolCall', () => {
  test('заявката се свежда до дължина + хеш; ключовете и броят остават', () => {
    const a = auditToolCall(
      'search_documents',
      { query: 'cavo encoder morsetto X3' },
      { results: 3, isError: false },
    );
    assert.equal(a.name, 'search_documents');
    assert.deepEqual(a.argKeys, ['query']);
    assert.equal(a.results, 3);
    assert.equal(a.executed, true);
    const q = a.args.query;
    assert.ok(q && 'length' in q && q.length === 24 && /^[0-9a-f]{16}$/.test(q.sha256));
    assert.equal(JSON.stringify(a).includes('encoder'), false, 'текстът не влиза');
  });

  test('непознат инструмент/ключ от модела — без име и без стойности', () => {
    const a = auditToolCall(
      'exfiltrate_everything',
      { secret: 'ARCOBALENO' },
      { results: 0, isError: true },
    );
    assert.equal(a.name, 'unknown');
    assert.deepEqual(a.argKeys, []);
    assert.equal(a.unknownArgKeys, 1);
    assert.equal(JSON.stringify(a).includes('ARCOBALENO'), false);
    const b = auditToolCall(
      'get_document_page',
      { document_id: 'doc-1', page: 4, tenant: 'x' },
      { results: 1, isError: false },
    );
    assert.deepEqual(b.argKeys, ['document_id', 'page']);
    assert.deepEqual(b.args.page, { type: 'number' });
    assert.equal(b.unknownArgKeys, 1);
  });

  test('неизпълнен (таван) се отбелязва', () => {
    const a = auditToolCall('lookup_error', { code: 'E37' }, { results: 0, isError: true }, false);
    assert.equal(a.executed, false);
  });
});

/** Модел, който веднъж търси (две заявки), после подава диагноза. */
class ToolModel {
  calls = 0;
  async create(params: MessageCreateParamsNonStreaming): Promise<Message> {
    this.calls += 1;
    const usage = {
      input_tokens: 1,
      output_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
    const content =
      this.calls === 1
        ? [
            {
              type: 'tool_use',
              id: 't1',
              name: 'search_documents',
              input: { query: 'testo libero riservato' },
            },
            { type: 'tool_use', id: 't2', name: 'lookup_error', input: { code: 'E99' } },
          ]
        : [
            {
              type: 'tool_use',
              id: 't3',
              name: 'submit_diagnosis',
              input: {
                status: 'undetermined',
                confidence: 'low',
                confidenceReason: 'Non documentato.',
                summary: 'Dati insufficienti.',
                causes: [],
                checks: [],
                decisionPoints: [],
                evidenceUsed: [],
                conflicts: [],
                safetyNotes: [],
                missingData: [],
                escalation: { recommended: true, reason: '' },
              },
            },
          ];
    return {
      id: `m${this.calls}`,
      type: 'message',
      role: 'assistant',
      model: params.model,
      content,
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage,
    } as unknown as Message;
  }
}

test('diagnose връща toolCalls без текста на заявката', async () => {
  const doc: RawEvidence = {
    kind: 'document',
    documentId: 'd1',
    documentCode: 'MAN-1',
    documentTitle: 'Manuale',
    documentType: 'MANUAL',
    revision: 'A',
    language: 'it',
    page: 1,
    section: null,
    text: 'Il quadro LTX-500 usa il morsetto X3 per il cavo encoder.',
    safetyRelevant: false,
    matchedBy: ['fulltext'],
    chunkId: 'c1',
    errorId: null,
    errorCode: null,
    checks: [],
    rawScore: 1,
    rules: [{ hwRevision: null, fwMin: null, fwMax: null }],
  };
  const store: KnowledgeStore = {
    findErrors: async () => [],
    findChunksByIdentifiers: async () => [doc],
    searchChunks: async () => [doc],
    searchSemantic: async () => [],
    getPage: async () => [],
  };
  const out = await diagnose(
    {
      store,
      model: new ToolModel(),
      snapshotId: async () => 'snap',
      config: {
        AI_MODEL: 'claude-test',
        AI_EFFORT: 'medium',
        AI_MAX_OUTPUT_TOKENS: 1000,
        AI_MAX_TOOL_ROUNDS: 2,
        AI_TIMEOUT_MS: 5000,
      },
    },
    {
      scope: { tenantId: 't', audiences: ['PORTAL'] },
      context: DiagnosticContextSchema.parse({
        productModel: 'LTX-500',
        hardwareRevision: 'B',
        firmware: '4.2',
        serial: null,
        errorCode: null,
      }),
      question: 'Morsetto X3 encoder',
      history: [],
      locale: 'it',
    },
    AbortSignal.timeout(5000),
  );
  assert.equal(out.modelCalled, true);
  assert.deepEqual(
    out.toolCalls.map((c) => [c.name, c.argKeys, c.results]),
    [
      ['search_documents', ['query'], 1],
      ['lookup_error', ['code'], 0],
    ],
  );
  assert.equal(JSON.stringify(out.toolCalls).includes('riservato'), false);
});
