import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cappedLevel, evidenceLevel } from '../src/retrieval/retrieve.js';
import type { EvidenceItem, RetrievalResult } from '../src/retrieval/types.js';

/** Ревю (Кодаджията): моделът не може да вдигне нивото с инструмент за несвързан код. */

function errorItem(code: string): EvidenceItem {
  return {
    ref: 'E1',
    kind: 'error',
    documentId: 'd1',
    documentCode: 'ERR',
    documentTitle: 'Errori',
    documentType: 'ERROR_LIST',
    revision: 'A',
    language: 'it',
    page: 1,
    section: null,
    text: `${code} — arresto`,
    safetyRelevant: false,
    applicable: true,
    matchedBy: ['exact_code'],
    score: 1,
    chunkId: null,
    errorId: `e-${code}`,
    errorCode: code,
    checks: [],
  };
}

const result = (items: EvidenceItem[]): RetrievalResult => ({
  items,
  unknownIdentifiers: [],
  conflicts: [],
});

test('„strong“ само за кода на случая', () => {
  assert.equal(evidenceLevel(result([errorItem('E37')]), new Set(['E37'])), 'strong');
  assert.equal(evidenceLevel(result([errorItem('E01')]), new Set(['E37'])), 'weak');
});

test('нивото след инструментите не надминава началното, освен „strong“ и конфликт', () => {
  assert.equal(cappedLevel('weak', 'high'), 'weak');
  assert.equal(cappedLevel('weak', 'strong'), 'strong');
  assert.equal(cappedLevel('high', 'conflict'), 'conflict');
  assert.equal(cappedLevel('high', 'weak'), 'weak');
});
