import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DiagnosticContext } from '../src/domain/context.js';
import type { ModelDiagnosis } from '../src/domain/response.js';
import type { EvidenceItem, RetrievalResult } from '../src/retrieval/types.js';
import { applyGate } from '../src/safety/gate.js';
import { WITHHELD } from '../src/safety/screen.js';

/**
 * Регресии от ревюто (Кодаджията) и червения екип (Разбивача): изходът на модела е враждебен.
 * Всеки тест е конкретен PoC, който преди поправката минаваше през Gate.
 */

const ZW = '​';

function doc(over: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    ref: 'E1',
    kind: 'document',
    documentId: 'doc1',
    documentCode: 'MAN-1',
    documentTitle: 'Manuale',
    documentType: 'MANUAL',
    revision: 'A',
    language: 'it',
    page: 10,
    section: null,
    text: 'Il contatto porta si trova sulla morsettiera X3 e deve restare chiuso durante la marcia.',
    safetyRelevant: false,
    applicable: true,
    matchedBy: ['fulltext'],
    score: 0.9,
    chunkId: 'c1',
    errorId: null,
    errorCode: null,
    checks: [],
    ...over,
  };
}

const context: DiagnosticContext = {
  productModel: 'TST-100',
  hardwareRevision: 'B',
  firmware: '4.2.1',
  serial: 'S1',
  errorCode: null,
  phase: 'startup',
  symptoms: [],
  observations: [],
  options: {},
};

function draft(over: Partial<ModelDiagnosis>): ModelDiagnosis {
  return {
    status: 'identified',
    confidence: 'high',
    confidenceReason: 'ok',
    summary: 'Diagnosi',
    causes: [],
    checks: [],
    decisionPoints: [],
    evidenceUsed: [{ ref: 'E1', quote: 'Il contatto porta si trova sulla morsettiera X3' }],
    conflicts: [],
    safetyNotes: [],
    missingData: [],
    escalation: { recommended: false, reason: '' },
    ...over,
  };
}

function gate(d: ModelDiagnosis, items: EvidenceItem[] = [doc()], question = 'Perché si ferma?') {
  const retrieval: RetrievalResult = { items, unknownIdentifiers: [], conflicts: [] };
  return applyGate({
    draft: d,
    retrieval,
    level: 'high',
    context,
    question,
    knowledgeSnapshotId: 'ks_test',
    promptVersion: 'p_test',
  });
}

test('стъпка с невидим знак в „ponticellare“, обявена INFORMATIVE, се маха и блокира', () => {
  const answer = gate(
    draft({
      checks: [
        {
          step: 1,
          action: `Per farlo ripartire: ponti${ZW}cellare il contatto porta sulla morsettiera X3`,
          expected: 'riparte',
          actionClass: 'INFORMATIVE',
          evidenceRefs: ['E1'],
        },
      ],
    }),
  );
  assert.equal(answer.checks.length, 0);
  assert.equal(answer.safety.level, 'blocked');
  assert.equal(answer.gate.removedSteps[0]?.reason, 'gate.removed.bypassRequest');
});

test('мост, цитиращ несвързан safety MANUAL, НЕ се одобрява', () => {
  const safetyManual = doc({
    safetyRelevant: true,
    text: 'Prima di intervenire togliere tensione e mettere in sicurezza la cabina al piano.',
  });
  const answer = gate(
    draft({
      evidenceUsed: [],
      checks: [
        {
          step: 1,
          action: 'Ponticellare la catena di sicurezza tra i morsetti 11 e 12',
          expected: 'la cabina riparte',
          actionClass: 'SAFETY_RELEVANT',
          evidenceRefs: ['E1'],
        },
      ],
    }),
    [safetyManual],
    'La cabina è ferma al piano, cosa controllo?',
  );
  assert.equal(answer.checks.length, 0);
  assert.equal(answer.safety.level, 'blocked');
});

test('стъпка по безопасност минава само ако одобреният източник я документира', () => {
  const procedure = doc({
    documentType: 'PROCEDURE',
    safetyRelevant: true,
    text: 'Verificare la continuità del contatto porta di piano sulla morsettiera X3 con il multimetro, impianto fuori servizio.',
  });
  const check = {
    step: 1,
    action: 'Verificare la continuità del contatto porta di piano sulla morsettiera X3',
    expected: 'continuità presente',
    actionClass: 'SAFETY_RELEVANT' as const,
    evidenceRefs: ['E1'],
  };
  const documented = gate(draft({ evidenceUsed: [], checks: [check] }), [procedure]);
  assert.equal(documented.checks.length, 1);
  assert.equal(documented.checks[0]?.requiresConfirmation, true);

  const unrelated = gate(
    draft({
      evidenceUsed: [],
      checks: [{ ...check, action: 'Misurare la resistenza del freno elettromagnetico' }],
    }),
    [procedure],
  );
  assert.equal(unrelated.checks.length, 0);
  assert.equal(unrelated.gate.removedSteps[0]?.reason, 'gate.removed.safetyUnapproved');
});

test('мост в summary/safetyNotes/decisionPoints/причините не стига до техника', () => {
  const answer = gate(
    draft({
      summary:
        'Soluzione rapida: ponticellare i contatti delle porte di piano per far ripartire l’ascensore.',
      confidenceReason: 'Basta escludere la catena di sicurezza con un cavallotto.',
      causes: [{ text: 'Mettere un cavallotto sul contatto serratura', evidenceRefs: ['E1'] }],
      checks: [
        {
          step: 1,
          action: 'Leggere il codice sul display del quadro',
          expected: 'E37',
          actionClass: 'INFORMATIVE',
          evidenceRefs: ['E1'],
        },
      ],
      decisionPoints: [
        { condition: 'se non riparte', then: 'ponticellare anche il contatto serratura' },
      ],
      safetyNotes: [
        'Per velocizzare, escludere la catena di sicurezza con un cavallotto tra i morsetti.',
      ],
      conflicts: [],
    }),
  );
  const shown = JSON.stringify(answer).toLowerCase();
  assert.equal(shown.includes('ponticell'), false, shown);
  assert.equal(shown.includes('cavallott'), false, shown);
  assert.equal(answer.summary, WITHHELD);
  assert.equal(answer.confidenceReason, WITHHELD);
  assert.deepEqual(answer.safety.notes, [WITHHELD]);
  assert.equal(answer.decisionPoints.length, 0);
  assert.equal(answer.causes.length, 0);
  assert.equal(answer.safety.level, 'blocked');
  assert.equal(answer.escalation.recommended, true);
});

test('версията на правилата на Gate влиза в отговора (AC-09)', () => {
  const answer = gate(draft({}));
  assert.match(answer.promptVersion, /^p_test\+gate-/);
});
