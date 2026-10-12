import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DiagnosticContextSchema, type DiagnosticContext } from '../src/domain/context.js';
import type { ApplicabilityRule } from '../src/domain/versions.js';
import {
  evidenceLevel,
  findConflicts,
  MAX_PACK,
  NOT_APPLICABLE_FACTOR,
  retrieve,
} from '../src/retrieval/retrieve.js';
import type {
  EvidenceItem,
  KnowledgeStore,
  RawEvidence,
  RetrievalResult,
  SearchScope,
} from '../src/retrieval/types.js';

/**
 * Търсенето (§8) и праговете на доказателствата (§8.3) без база: KnowledgeStore в паметта,
 * който прилага същите филтри като истинския (tenant, аудитория, продуктов модел).
 * Тестът е самостоятелен — не споделя помощници с другите файлове.
 */

const SCOPE: SearchScope = { tenantId: 't1', audiences: ['PORTAL'] };
const MODEL = 'LTX-500';
const ANY: ApplicabilityRule = { hwRevision: null, fwMin: null, fwMax: null };
const FW4: ApplicabilityRule = { hwRevision: null, fwMin: '4.0', fwMax: '4.9' };
const FW5: ApplicabilityRule = { hwRevision: null, fwMin: '5.0', fwMax: null };
const REV_C: ApplicabilityRule = { hwRevision: 'C', fwMin: null, fwMax: null };

let seq = 0;

function chunk(text: string, over: Partial<RawEvidence> = {}): RawEvidence {
  seq += 1;
  return {
    kind: 'document',
    documentId: `doc-${seq}`,
    documentCode: `MAN-${seq}`,
    documentTitle: 'Manuale LTX-500',
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
    rules: [ANY],
    ...over,
  };
}

function errorRow(code: string, text: string, over: Partial<RawEvidence> = {}): RawEvidence {
  seq += 1;
  return {
    kind: 'error',
    documentId: 'doc-err',
    documentCode: 'ERR-LIST',
    documentTitle: 'Codici errore',
    documentType: 'ERROR_LIST',
    revision: '1',
    language: 'it',
    page: null,
    section: null,
    text,
    safetyRelevant: false,
    matchedBy: ['exact_code'],
    chunkId: null,
    errorId: `e-${seq}`,
    errorCode: code,
    checks: [],
    rawScore: 1,
    rules: [ANY],
    ...over,
  };
}

interface Row {
  raw: RawEvidence;
  tenantId?: string;
  audience?: 'PORTAL' | 'INTERNAL' | 'ENGINEERING';
  productModel?: string;
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];

class MemoryStore implements KnowledgeStore {
  readonly calls: Array<{ fn: string; scope: SearchScope; productModel: string }> = [];
  constructor(private readonly rows: Row[]) {}

  private visible(scope: SearchScope, productModel: string): RawEvidence[] {
    return this.rows
      .filter(
        (r) =>
          (r.tenantId ?? 't1') === scope.tenantId &&
          scope.audiences.includes(r.audience ?? 'PORTAL') &&
          (r.productModel ?? MODEL) === productModel,
      )
      .map((r) => ({ ...r.raw, matchedBy: [...r.raw.matchedBy] }));
  }

  async findErrors(scope: SearchScope, productModel: string, codes: string[]) {
    this.calls.push({ fn: 'findErrors', scope, productModel });
    return this.visible(scope, productModel).filter(
      (r) => r.kind === 'error' && codes.includes(r.errorCode ?? ''),
    );
  }

  async findChunksByIdentifiers(scope: SearchScope, productModel: string, ids: string[]) {
    this.calls.push({ fn: 'findChunksByIdentifiers', scope, productModel });
    return this.visible(scope, productModel)
      .filter((r) => r.kind === 'document' && ids.some((id) => r.text.toUpperCase().includes(id)))
      .map((r) => ({ ...r, matchedBy: ['exact_ref' as const] }));
  }

  async searchChunks(scope: SearchScope, productModel: string, text: string, limit: number) {
    this.calls.push({ fn: 'searchChunks', scope, productModel });
    const q = new Set(words(text));
    return this.visible(scope, productModel)
      .filter((r) => r.kind === 'document')
      .map((r) => ({ r, hits: words(r.text).filter((w) => q.has(w)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit)
      .map((x) => ({ ...x.r, rawScore: x.hits }));
  }

  async getPage(): Promise<RawEvidence[]> {
    return [];
  }
}

const ctx = (over: Partial<DiagnosticContext> = {}): DiagnosticContext =>
  DiagnosticContextSchema.parse({
    productModel: MODEL,
    hardwareRevision: 'B',
    firmware: '4.2',
    serial: null,
    errorCode: null,
    ...over,
  });

const ask = (store: KnowledgeStore, query: string, context = ctx()) =>
  retrieve(store, { scope: SCOPE, context, query });

/** Готов EvidenceItem за прагове (без хранилище). */
function item(over: Partial<EvidenceItem> = {}): EvidenceItem {
  seq += 1;
  return {
    ref: `E${seq}`,
    kind: 'document',
    documentId: `doc-${seq}`,
    documentCode: `MAN-${seq}`,
    documentTitle: 'Manuale',
    documentType: 'MANUAL',
    revision: 'A',
    language: 'it',
    page: 1,
    section: null,
    text: 'testo',
    safetyRelevant: false,
    applicable: true,
    matchedBy: ['fulltext'],
    score: 0.7,
    chunkId: `c-${seq}`,
    errorId: null,
    errorCode: null,
    checks: [],
    ...over,
  };
}

const result = (
  items: EvidenceItem[],
  conflicts: RetrievalResult['conflicts'] = [],
): RetrievalResult => ({ items, unknownIdentifiers: [], conflicts });

describe('evidenceLevel — прагове §8.3', () => {
  test('none: празен пакет', () => {
    assert.equal(evidenceLevel(result([])), 'none');
  });

  test('none: всичко е несъвместимо със своята версия', () => {
    const items = [item({ applicable: false }), item({ applicable: false, kind: 'error' })];
    assert.equal(evidenceLevel(result(items)), 'none');
  });

  test('strong: точен код за грешка, съвместим с версията', () => {
    const e = item({ kind: 'error', errorCode: 'E37', matchedBy: ['exact_code'], score: 1 });
    assert.equal(evidenceLevel(result([e])), 'strong');
  });

  test('точен код, но НЕсъвместим (друг фърмуер) не е strong', () => {
    const e = item({
      kind: 'error',
      errorCode: 'E37',
      matchedBy: ['exact_code'],
      applicable: false,
      score: 0.3,
    });
    assert.equal(evidenceLevel(result([e])), 'none');
  });

  test('точен код само в парче документ (exact_code на chunk) не е strong — само error записът', () => {
    const c = item({ kind: 'document', matchedBy: ['exact_code'], score: 1 });
    assert.equal(evidenceLevel(result([c])), 'weak');
  });

  test('high: два съвместими източника от РАЗЛИЧНИ документи', () => {
    assert.equal(evidenceLevel(result([item(), item()])), 'high');
  });

  test('weak: две парчета от ЕДИН документ са един източник', () => {
    const documentId = 'doc-same';
    const items = [item({ documentId }), item({ documentId })];
    assert.equal(evidenceLevel(result(items)), 'weak');
  });

  test('weak: един съвместим източник', () => {
    assert.equal(evidenceLevel(result([item()])), 'weak');
  });

  test('weak: вторият източник е под прага на релевантност (0.35) или несъвместим', () => {
    assert.equal(evidenceLevel(result([item(), item({ score: 0.34 })])), 'weak');
    assert.equal(evidenceLevel(result([item(), item({ applicable: false })])), 'weak');
    assert.equal(evidenceLevel(result([item(), item({ score: 0.35 })])), 'high');
  });

  test('conflict: има противоречие между съвместими източници — бие strong', () => {
    const e = item({ kind: 'error', errorCode: 'E37', matchedBy: ['exact_code'], score: 1 });
    const conflicts = [{ description: 'error:E37', refs: ['E1', 'E2'] }];
    assert.equal(evidenceLevel(result([e, item()], conflicts)), 'conflict');
  });

  test('conflict не маскира none: без съвместим източник няма конфликт, а none', () => {
    const conflicts = [{ description: 'x', refs: ['E1', 'E2'] }];
    assert.equal(evidenceLevel(result([item({ applicable: false })], conflicts)), 'none');
  });
});

describe('findConflicts', () => {
  test('един код за грешка с различно значение при две съвместими версии → конфликт', () => {
    const a = item({ ref: 'E1', kind: 'error', errorCode: 'E50', text: 'Guasto encoder' });
    const b = item({ ref: 'E2', kind: 'error', errorCode: 'E50', text: 'Sovratemperatura' });
    assert.deepEqual(findConflicts([a, b]), [{ description: 'error:E50', refs: ['E1', 'E2'] }]);
  });

  test('същото значение (до регистър и интервали) не е конфликт', () => {
    const a = item({ ref: 'E1', kind: 'error', errorCode: 'E50', text: 'Guasto encoder' });
    const b = item({ ref: 'E2', kind: 'error', errorCode: 'E50', text: '  guasto ENCODER ' });
    assert.deepEqual(findConflicts([a, b]), []);
  });

  test('различни кодове с различно значение не са конфликт (E37 ≠ E38)', () => {
    const a = item({ kind: 'error', errorCode: 'E37', text: 'Guasto encoder' });
    const b = item({ kind: 'error', errorCode: 'E38', text: 'Sovratemperatura' });
    assert.deepEqual(findConflicts([a, b]), []);
  });

  test('несъвместимата версия не е противоречие — тя просто не се прилага', () => {
    const a = item({ kind: 'error', errorCode: 'E37', text: 'Guasto encoder' });
    const b = item({
      kind: 'error',
      errorCode: 'E37',
      text: 'Sovratemperatura',
      applicable: false,
    });
    assert.deepEqual(findConflicts([a, b]), []);
  });

  test('един и същ документ в две съвместими ревизии → конфликт на ревизиите', () => {
    const a = item({ ref: 'E1', documentCode: 'MAN-X', revision: 'A' });
    const b = item({ ref: 'E2', documentCode: 'MAN-X', revision: 'B' });
    assert.deepEqual(findConflicts([a, b]), [
      { description: 'revision:MAN-X', refs: ['E1', 'E2'] },
    ]);
  });

  test('две парчета от една ревизия, или ревизия която не е приложима — без конфликт', () => {
    const a = item({ documentCode: 'MAN-X', revision: 'A' });
    const b = item({ documentCode: 'MAN-X', revision: 'A' });
    const c = item({ documentCode: 'MAN-X', revision: 'B', applicable: false });
    assert.deepEqual(findConflicts([a, b, c]), []);
  });
});

describe('retrieve — точно търсене и версии', () => {
  test('кодът от контекста се търси точно, дори да не е във въпроса (AC-01)', async () => {
    const store = new MemoryStore([{ raw: errorRow('E37', 'E37 — guasto encoder') }]);
    const r = await ask(store, 'Il quadro si ferma', ctx({ errorCode: 'E37' }));
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0]?.errorCode, 'E37');
    assert.deepEqual(r.unknownIdentifiers, []);
    assert.equal(evidenceLevel(r), 'strong');
  });

  test('„e 37“ във въпроса е същият код E37; регистър и разделител не променят търсенето', async () => {
    const store = new MemoryStore([{ raw: errorRow('E37', 'E37 — guasto encoder') }]);
    const r = await ask(store, 'Display mostra E 37 in corsa');
    assert.equal(r.items[0]?.errorCode, 'E37');
    const r2 = await ask(store, 'display mostra e37');
    assert.equal(r2.items[0]?.errorCode, 'E37');
  });

  test('E37 не се бърка с E38 / E73: чужд код не влиза и E37 е „непознат“ (§16.3)', async () => {
    const store = new MemoryStore([
      { raw: errorRow('E38', 'E38 — sovratemperatura') },
      { raw: errorRow('E73', 'E73 — comunicazione') },
    ]);
    const r = await ask(store, 'Errore E37 durante la corsa');
    assert.deepEqual(
      r.items.map((i) => i.errorCode),
      [],
    );
    assert.deepEqual(r.unknownIdentifiers, ['E37']);
    assert.equal(evidenceLevel(r), 'none');
  });

  test('моделът на таблото във въпроса не е непознат код (LTX-500 ≠ идентификатор)', async () => {
    const store = new MemoryStore([{ raw: errorRow('E37', 'E37 — guasto encoder') }]);
    const r = await ask(store, 'LTX-500 mostra E37');
    assert.deepEqual(r.unknownIdentifiers, []);
  });

  test('„грешна версия, същото име“: съвместимата версия е strong, другата е несъвместима и под нея', async () => {
    const v1 = errorRow('E37', 'E37 — guasto encoder', { rules: [FW4], errorId: 'v1' });
    const v2 = errorRow('E37', 'E37 — sovratemperatura inverter', { rules: [FW5], errorId: 'v2' });
    const store = new MemoryStore([{ raw: v1 }, { raw: v2 }]);

    const on42 = await ask(store, 'E37', ctx({ firmware: '4.2' }));
    const byId = new Map(on42.items.map((i) => [i.errorId, i]));
    assert.equal(byId.get('v1')?.applicable, true);
    assert.equal(byId.get('v2')?.applicable, false);
    assert.equal(byId.get('v2')?.score, NOT_APPLICABLE_FACTOR);
    assert.equal(on42.items[0]?.errorId, 'v1', 'съвместимото е първо');
    assert.deepEqual(on42.conflicts, [], 'несъвместимата версия не е конфликт');
    assert.equal(evidenceLevel(on42), 'strong');

    const on51 = await ask(store, 'E37', ctx({ firmware: '5.1' }));
    assert.equal(on51.items[0]?.errorId, 'v2');
    assert.equal(on51.items[0]?.applicable, true);
  });

  test('само несъвместим запис → ниво none (не се представя като основен източник)', async () => {
    const store = new MemoryStore([{ raw: errorRow('E37', 'E37 — nuovo', { rules: [FW5] }) }]);
    const r = await ask(store, 'E37', ctx({ firmware: '4.2' }));
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0]?.applicable, false);
    assert.equal(evidenceLevel(r), 'none');
  });

  test('непознат HW/FW при правило, което го иска → не е доказано приложим (fail-closed)', async () => {
    const store = new MemoryStore([
      { raw: errorRow('E37', 'E37 — x', { rules: [REV_C], errorId: 'c' }) },
      { raw: errorRow('E38', 'E38 — y', { rules: [FW4], errorId: 'fw' }) },
    ]);
    const noHw = await ask(store, 'E37', ctx({ hardwareRevision: null }));
    assert.equal(noHw.items[0]?.applicable, false);
    const noFw = await ask(store, 'E38', ctx({ firmware: null }));
    assert.equal(noFw.items[0]?.applicable, false);
  });

  test('AC-07: фърмуерът от текста на въпроса се ползва, когато контекстът го няма', async () => {
    const store = new MemoryStore([{ raw: errorRow('E37', 'E37 — nuovo', { rules: [FW5] }) }]);
    const without = await ask(store, 'E37', ctx({ firmware: null }));
    assert.equal(without.items[0]?.applicable, false);
    const fromQuery = await ask(store, 'E37 con firmware 5.2', ctx({ firmware: null }));
    assert.equal(fromQuery.items[0]?.applicable, true);
    // Контекстът има предимство пред текста.
    const ctxWins = await ask(store, 'E37 con firmware 5.2', ctx({ firmware: '4.2' }));
    assert.equal(ctxWins.items[0]?.applicable, false);
  });

  test('обхватът и моделът отиват към хранилището; чужд клиент / аудитория / модел не се виждат', async () => {
    const store = new MemoryStore([
      { raw: chunk('E37 documento proprio'), tenantId: 't1' },
      { raw: chunk('E37 documento altro cliente'), tenantId: 't2' },
      { raw: chunk('E37 documento interno'), audience: 'INTERNAL' },
      { raw: chunk('E37 documento altro prodotto'), productModel: 'LTX-900' },
    ]);
    const r = await ask(store, 'E37');
    assert.deepEqual(
      r.items.map((i) => i.text),
      ['E37 documento proprio'],
    );
    for (const c of store.calls) {
      assert.deepEqual(c.scope, SCOPE);
      assert.equal(c.productModel, MODEL);
    }
  });
});

describe('retrieve — подреждане и пакет', () => {
  test('точните съвпадения са преди пълнотекстовите и имат референции E1…En по ред', async () => {
    const store = new MemoryStore([
      { raw: chunk('Verificare encoder durante la corsa', { rawScore: 5 }) },
      { raw: errorRow('E37', 'E37 — guasto encoder') },
    ]);
    const r = await ask(store, 'E37 encoder corsa');
    assert.deepEqual(
      r.items.map((i) => i.ref),
      ['E1', 'E2'],
    );
    assert.equal(r.items[0]?.kind, 'error');
    assert.equal(r.items[0]?.score, 1);
    assert.ok((r.items[1]?.score ?? 1) <= 0.7);
  });

  test('един запис, намерен по няколко пътя, влиза веднъж с обединени matchedBy', async () => {
    const shared = chunk('Il codice E37 indica un guasto encoder', { chunkId: 'same' });
    const store = new MemoryStore([{ raw: shared }]);
    const r = await ask(store, 'E37 guasto encoder');
    assert.equal(r.items.length, 1);
    assert.deepEqual([...(r.items[0]?.matchedBy ?? [])].sort(), ['exact_ref', 'fulltext']);
  });

  test('точните съвпадения не се режат от тавана на пакета', async () => {
    const rows: Row[] = [];
    for (let i = 0; i < MAX_PACK + 5; i += 1) rows.push({ raw: chunk(`K1 relè numero ${i}`) });
    const r = await ask(new MemoryStore(rows), 'K1');
    assert.equal(r.items.length, MAX_PACK + 5);
  });

  test('пълнотекстовите се режат до MAX_PACK и подредбата е по релевантност', async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 30; i += 1) {
      rows.push({ raw: chunk(`pompa olio guasto pressione ${i}`, { rawScore: i + 1 }) });
    }
    const r = await retrieve(new MemoryStore(rows), {
      scope: SCOPE,
      context: ctx(),
      query: 'pompa olio guasto pressione',
      limit: 30,
    });
    assert.equal(r.items.length, MAX_PACK);
    const scores = r.items.map((i) => i.score);
    assert.deepEqual(
      scores,
      [...scores].sort((a, b) => b - a),
    );
  });

  test('празен въпрос без код не вика пълнотекстово и не дава доказателства', async () => {
    const store = new MemoryStore([{ raw: chunk('qualcosa') }]);
    const r = await ask(store, '   ');
    assert.equal(r.items.length, 0);
    assert.equal(
      store.calls.filter((c) => c.fn === 'searchChunks').length,
      0,
      'празният текст не търси',
    );
  });

  test('документ в две съвместими ревизии → конфликт и ниво conflict', async () => {
    const a = chunk('Parametro P12 ritardo porte', { documentCode: 'MAN-X', revision: 'A' });
    const b = chunk('Parametro P12 ritardo porte nuovo', { documentCode: 'MAN-X', revision: 'B' });
    const r = await ask(new MemoryStore([{ raw: a }, { raw: b }]), 'parametro P12 ritardo porte');
    assert.deepEqual(
      r.conflicts.map((c) => c.description),
      ['revision:MAN-X'],
    );
    assert.equal(evidenceLevel(r), 'conflict');
  });

  test('AC-02: ревизия само за друг фърмуер не е основен източник и не създава конфликт', async () => {
    const a = chunk('Parametro P12 ritardo porte', {
      documentCode: 'MAN-X',
      revision: 'A',
      rules: [FW4],
    });
    const b = chunk('Parametro P12 ritardo porte nuovo', {
      documentCode: 'MAN-X',
      revision: 'B',
      rules: [FW5],
    });
    const r = await ask(new MemoryStore([{ raw: a }, { raw: b }]), 'parametro P12 ritardo porte');
    const byRev = new Map(r.items.map((i) => [i.revision, i]));
    assert.equal(byRev.get('A')?.applicable, true);
    assert.equal(byRev.get('B')?.applicable, false);
    assert.equal(r.items[0]?.revision, 'A');
    assert.deepEqual(r.conflicts, []);
    assert.equal(evidenceLevel(r), 'weak');
  });

  test('два различни документа с точен код → high, дори без запис в базата с кодове', async () => {
    const store = new MemoryStore([
      { raw: chunk('Capitolo 3: il codice E37 indica interruzione encoder') },
      { raw: chunk('Bollettino: con E37 controllare il connettore X3') },
    ]);
    const r = await ask(store, 'E37');
    assert.equal(evidenceLevel(r), 'high');
    assert.deepEqual(r.unknownIdentifiers, []);
  });
});
