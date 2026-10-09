import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type {
  ContentBlock,
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { prepareAttachments } from '../src/ai/attachments.js';
import type { DiagnosisModel } from '../src/ai/model.js';
import { diagnose, type DiagnoseInput } from '../src/ai/orchestrator.js';
import { DiagnosticContextSchema } from '../src/domain/context.js';
import type { ModelDiagnosis } from '../src/domain/response.js';
import type { ApplicabilityRule } from '../src/domain/versions.js';
import type { KnowledgeStore, RawEvidence } from '../src/retrieval/types.js';
import { jpegSized, MAGIC, pngSized } from './file-fixtures.js';

/**
 * Оркестраторът със снимки и логове (§9.2, AC-06) — фалшив модел, без мрежа и база: снимките
 * отиват като base64 image блокове ПРЕДИ текста, логът — между маркерите, наблюденията минават
 * през Gate, а без съвместим източник моделът изобщо не се вика.
 */

const ANY: ApplicabilityRule = { hwRevision: null, fwMin: null, fwMax: null };
const FW9: ApplicabilityRule = { hwRevision: null, fwMin: '9.0', fwMax: null };
const TEXT = 'Il codice E37 indica che il cavo encoder non è collegato al morsetto X3.';

function errorRow(rules: ApplicabilityRule[]): RawEvidence {
  return {
    kind: 'error',
    documentId: 'err-doc',
    documentCode: 'ERR-DB',
    documentTitle: 'Codici errore',
    documentType: 'ERROR_DB',
    revision: '1',
    language: 'it',
    page: null,
    section: null,
    text: TEXT,
    safetyRelevant: false,
    matchedBy: ['exact_code'],
    chunkId: null,
    errorId: 'e-1',
    errorCode: 'E37',
    checks: [],
    rawScore: 1,
    rules,
  };
}

function store(rules: ApplicabilityRule[] = [ANY]): KnowledgeStore {
  return {
    findErrors: async (_s, _m, codes) => (codes.includes('E37') ? [errorRow(rules)] : []),
    findChunksByIdentifiers: async () => [],
    searchChunks: async () => [],
    searchSemantic: async () => [],
    getPage: async () => [],
  };
}

class FakeModel implements DiagnosisModel {
  readonly calls: MessageCreateParamsNonStreaming[] = [];
  constructor(private readonly answer: Partial<ModelDiagnosis>) {}
  async create(params: MessageCreateParamsNonStreaming): Promise<Message> {
    this.calls.push(params);
    const input: ModelDiagnosis = {
      status: 'identified',
      confidence: 'high',
      confidenceReason: 'Codice documentato.',
      summary: 'Cavo encoder scollegato.',
      causes: [{ text: 'Cavo encoder scollegato', evidenceRefs: ['E1'] }],
      checks: [],
      decisionPoints: [],
      evidenceUsed: [{ ref: 'E1', quote: TEXT }],
      conflicts: [],
      safetyNotes: [],
      missingData: [],
      escalation: { recommended: false, reason: '' },
      ...this.answer,
    };
    const content = [
      { type: 'tool_use', id: `toolu_${this.calls.length}`, name: 'submit_diagnosis', input },
    ] as unknown as ContentBlock[];
    return {
      id: 'msg',
      type: 'message',
      role: 'assistant',
      model: params.model,
      content,
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Message;
  }
}

const context = DiagnosticContextSchema.parse({
  productModel: 'QM-200',
  hardwareRevision: 'B',
  firmware: '4.2',
  serial: null,
  errorCode: 'E37',
});

function run(model: DiagnosisModel, over: Partial<DiagnoseInput>, rules?: ApplicabilityRule[]) {
  return diagnose(
    {
      store: store(rules),
      model,
      snapshotId: async () => 'snap',
      config: {
        AI_MODEL: 'claude-test',
        AI_EFFORT: 'medium',
        AI_MAX_OUTPUT_TOKENS: 4000,
        AI_MAX_TOOL_ROUNDS: 2,
        AI_TIMEOUT_MS: 20000,
      },
    },
    {
      scope: { tenantId: 't1', audiences: ['PORTAL'] },
      context,
      question: 'Errore E37',
      history: [],
      locale: 'it',
      ...over,
    },
    new AbortController().signal,
  );
}

const caseBlocks = (p: MessageCreateParamsNonStreaming): ContentBlockParam[] => {
  const first = p.messages[0];
  assert.ok(first && Array.isArray(first.content));
  return first.content;
};

describe('снимки и логове към модела', () => {
  test('снимката е base64 image блок ПРЕДИ текста, с етикет; кешът е на последния блок', async () => {
    const photo = jpegSized(1600, 1200);
    const attachments = prepareAttachments([
      { id: 'att-photo', kind: 'PHOTO', bytes: photo },
      { id: 'att-heic', kind: 'PHOTO', bytes: MAGIC.heic },
      { id: 'att-log', kind: 'LOG', bytes: Buffer.from('12:00 E37 ENC\n12:01 STOP\n') },
    ]);
    const model = new FakeModel({
      photoObservations: [
        {
          ref: 'P1',
          readability: 'clear',
          subject: 'display',
          visibleText: ['E37'],
          errorCodes: ['E37'],
          nameplate: null,
          terminalLabels: [],
          note: '',
          confidence: 'high',
        },
      ],
    });
    const out = await run(model, { attachments });
    const blocks = caseBlocks(model.calls[0]!);
    assert.deepEqual(blocks[0], { type: 'text', text: 'Photo P1:' });
    assert.deepEqual(blocks[1], {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: photo.toString('base64') },
    });
    const last = blocks[blocks.length - 1];
    assert.ok(last && last.type === 'text' && last.cache_control);
    assert.equal(blocks.filter((b) => b.type === 'image').length, 1, 'HEIC не е изпратен');
    assert.match(last.text, /Photos attached to this question: P1/);
    assert.match(last.text, /"kind":"log","ref":"L1"[^\n]*>>>\n12:00 E37 ENC/);
    assert.equal(last.text.includes('att-photo'), false, 'id на файла не стига до модела');

    assert.equal(out.answer.photos.length, 1);
    assert.deepEqual(out.answer.modelInputs, {
      attachments: [
        { id: 'att-photo', kind: 'PHOTO', ref: 'P1' },
        { id: 'att-log', kind: 'LOG', ref: 'L1' },
      ],
      notSent: [{ id: 'att-heic', kind: 'PHOTO', reason: 'collect.photoFormat' }],
    });
    assert.ok(out.answer.missingData.includes('collect.photoFormat'));
  });

  test('AC-06 през оркестратора: нечетлива снимка → искане за нова, не „identified“', async () => {
    const attachments = prepareAttachments([{ id: 'p', kind: 'PHOTO', bytes: pngSized(640, 480) }]);
    const model = new FakeModel({
      photoObservations: [
        {
          ref: 'P1',
          readability: 'illegible',
          subject: 'display',
          visibleText: [],
          errorCodes: [],
          nameplate: null,
          terminalLabels: [],
          note: 'Immagine sfocata.',
          confidence: 'low',
        },
      ],
    });
    const out = await run(model, { attachments });
    assert.ok(out.answer.missingData.includes('collect.betterPhoto'));
    assert.notEqual(out.answer.status, 'identified');
  });

  test('без съвместим източник: моделът НЕ се вика, снимката не е анализирана', async () => {
    const attachments = prepareAttachments([{ id: 'p', kind: 'PHOTO', bytes: pngSized(640, 480) }]);
    const model = new FakeModel({});
    const out = await run(model, { attachments }, [FW9]);
    assert.equal(model.calls.length, 0);
    assert.equal(out.modelCalled, false);
    assert.equal(out.answer.checks.length, 0);
    assert.equal(out.answer.status, 'undetermined');
    assert.deepEqual(out.answer.modelInputs, {
      attachments: [],
      notSent: [{ id: 'p', kind: 'PHOTO', reason: 'gate.attachment.notAnalyzed' }],
    });
    assert.ok(out.answer.gate.decisions.includes('gate.attachment.notAnalyzed'));
  });

  test('без прикачени файлове: съдържанието е само текстът (кешът не се променя)', async () => {
    const model = new FakeModel({});
    const out = await run(model, {});
    const blocks = caseBlocks(model.calls[0]!);
    assert.equal(blocks.length, 1);
    assert.deepEqual(out.answer.photos, []);
    assert.deepEqual(out.answer.modelInputs, { attachments: [], notSent: [] });
  });
});
