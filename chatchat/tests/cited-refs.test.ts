import assert from 'node:assert/strict';
import { test } from 'node:test';
import { citedRefs } from '../src/ai/orchestrator.js';
import type { ModelDiagnosis } from '../src/domain/response.js';
import { findConflicts } from '../src/retrieval/retrieve.js';
import type { EvidenceItem } from '../src/retrieval/types.js';

/**
 * Конфликт на ревизии за документ, който моделът ЦИТИРА, се брои винаги — дори когато търсенето
 * го е хванало под прага за подкрепа (шумът иначе не е конфликт, `findConflicts`).
 */

const draft = (over: Partial<ModelDiagnosis>): ModelDiagnosis => ({
  status: 'probable',
  confidence: 'medium',
  confidenceReason: '',
  summary: '',
  causes: [],
  checks: [],
  decisionPoints: [],
  evidenceUsed: [],
  conflicts: [],
  safetyNotes: [],
  missingData: [],
  escalation: { recommended: false, reason: '' },
  ...over,
});

const item = (ref: string, revision: string): EvidenceItem => ({
  ref,
  kind: 'document',
  documentId: `doc-${revision}`,
  documentCode: 'BULL-X',
  documentTitle: 'Bollettino',
  documentType: 'BULLETIN',
  revision,
  language: 'it',
  page: 1,
  section: null,
  text: 'testo',
  safetyRelevant: false,
  applicable: true,
  matchedBy: ['fulltext'],
  score: 0.2,
  chunkId: `c-${ref}`,
  errorId: null,
  errorCode: null,
  checks: [],
});

test('citedRefs: причини, стъпки и дословни откъси; без чернова — нищо', () => {
  const d = draft({
    causes: [{ text: 'c', evidenceRefs: ['E1'] }],
    checks: [
      {
        step: 1,
        action: 'a',
        expected: 'e',
        actionClass: 'INFORMATIVE',
        evidenceRefs: ['E2'],
      },
    ],
    evidenceUsed: [{ ref: 'E3', quote: 'q' }],
  });
  assert.deepEqual([...citedRefs(d)].sort(), ['E1', 'E2', 'E3']);
  assert.equal(citedRefs(null).size, 0);
});

test('шумна ревизия: без цитат — без конфликт; цитирана от модела — конфликт', () => {
  const items = [item('E4', '1'), item('E5', '2')];
  assert.deepEqual(findConflicts(items, citedRefs(draft({}))), []);
  const cites = draft({ causes: [{ text: 'c', evidenceRefs: ['E5'] }] });
  assert.deepEqual(findConflicts(items, citedRefs(cites)), [
    { description: 'revision:BULL-X', refs: ['E4', 'E5'] },
  ]);
});
