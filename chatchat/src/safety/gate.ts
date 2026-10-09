import { hasExactProductContext, type DiagnosticContext } from '../domain/context.js';
import { canonicalIdentifier } from '../domain/normalize.js';
import {
  lowerConfidence,
  stricterClass,
  type ActionClass,
  type Confidence,
  type DiagnosticAnswer,
  type EvidenceLevel,
  type ModelDiagnosis,
  type Outcome,
  type SafetyLevel,
} from '../domain/response.js';
import type { EvidenceItem, RetrievalResult } from '../retrieval/types.js';
import { citationOf, quoteIsVerbatim } from './citations.js';
import { collectFor } from './escalation.js';
import { classifyActionText, detectBypassIntent, foldText } from './lexicon.js';

/**
 * Safety Gate (§11) — детерминистичен, след модела, независимо какво е казал моделът.
 * Политиката (§11.2):
 *   safety_relevant без одобрена процедура        → махни стъпката, блокирай, ескалирай
 *   configurative без точен продуктов контекст     → махни стъпката, поискай контекста
 *   доказателства под прага                         → не го казвай като факт
 *   иначе                                           → позволи с цитат
 * Плюс: никакъв цитат извън пакета и никакъв „дословен“ откъс, който го няма в източника
 * (NFR-10 „фантомни цитати“), никакъв несъвместим източник като основен (AC-02).
 *
 * Текстовете, които Gate добавя, са КОДОВЕ (`gate.*`, `ctx.*`, `collect.*`) — превежда ги UI.
 */

export const GATE_VERSION = 'gate-2026-10-09.1';

/** Типове документи, които могат да носят одобрена процедура по безопасност. */
const SAFETY_PROCEDURE_TYPES = new Set(['PROCEDURE', 'MANUAL']);

export interface GateInput {
  draft: ModelDiagnosis;
  retrieval: RetrievalResult;
  level: EvidenceLevel;
  context: DiagnosticContext;
  question: string;
  knowledgeSnapshotId: string;
  promptVersion: string;
}

type RemovalReason =
  | 'gate.removed.unsupported'
  | 'gate.removed.safetyUnapproved'
  | 'gate.removed.directCommand'
  | 'gate.removed.configNeedsContext'
  | 'gate.removed.bypassRequest';

/** Одобрена процедура за действие по безопасност: публикуван, маркиран safety-relevant източник. */
function isApprovedSafetySource(item: EvidenceItem): boolean {
  if (!item.applicable || !item.safetyRelevant) return false;
  if (item.kind === 'error') {
    return item.checks.some((c) => c.actionClass === 'SAFETY_RELEVANT');
  }
  return SAFETY_PROCEDURE_TYPES.has(item.documentType);
}

/** Таванът на увереността и на изхода по нивото на доказателствата (§8.3). */
function capsFor(level: EvidenceLevel): { confidence: Confidence; outcome: Outcome } {
  switch (level) {
    case 'strong':
    case 'high':
      return { confidence: 'high', outcome: 'identified' };
    case 'weak':
      return { confidence: 'low', outcome: 'probable' };
    case 'conflict':
      return { confidence: 'low', outcome: 'probable' };
    case 'none':
      return { confidence: 'low', outcome: 'undetermined' };
  }
}

const OUTCOME_ORDER: readonly Outcome[] = ['undetermined', 'probable', 'identified'];
function lowerOutcome(a: Outcome, b: Outcome): Outcome {
  return OUTCOME_ORDER.indexOf(a) <= OUTCOME_ORDER.indexOf(b) ? a : b;
}

export function applyGate(input: GateInput): DiagnosticAnswer {
  const { draft, retrieval, context } = input;
  const byRef = new Map(retrieval.items.map((i) => [i.ref, i]));
  const decisions = new Set<string>();
  const dropped: DiagnosticAnswer['gate']['droppedCitations'] = [];
  const removed: DiagnosticAnswer['gate']['removedSteps'] = [];
  const missing = new Set<string>(draft.missingData);
  let safety: SafetyLevel = 'standard';
  let escalate = draft.escalation.recommended;

  // 1. Цитатите: само от пакета, само съвместими, откъсът — дословен.
  const verifiedQuotes = new Map<string, string>();
  for (const used of draft.evidenceUsed) {
    const item = byRef.get(used.ref);
    if (!item) {
      dropped.push({ ref: used.ref, reason: 'gate.citation.notInPack' });
      continue;
    }
    if (!item.applicable) {
      dropped.push({ ref: used.ref, reason: 'gate.citation.notApplicable' });
      continue;
    }
    if (!quoteIsVerbatim(used.quote, item.text)) {
      dropped.push({ ref: used.ref, reason: 'gate.citation.quoteNotFound' });
      continue;
    }
    if (!verifiedQuotes.has(used.ref)) verifiedQuotes.set(used.ref, used.quote.trim());
  }
  const supporting = (refs: string[]): string[] =>
    refs.filter((r) => {
      const item = byRef.get(r);
      return item !== undefined && item.applicable;
    });

  // 2. Молба за заобикаляне на защита — отказ без изключения (§16.3).
  const bypass = detectBypassIntent(input.question);
  if (bypass.bypass) {
    safety = 'blocked';
    escalate = true;
    decisions.add('gate.bypassRequest');
  }

  // 3. Стъпките — по-строгият клас от модела и речника, после политиката.
  const exactContext = hasExactProductContext(context);
  const kept: DiagnosticAnswer['checks'] = [];
  for (const check of draft.checks) {
    const refs = supporting(check.evidenceRefs);
    const lexical = classifyActionText(`${check.action} ${check.expected}`).actionClass;
    let cls: ActionClass = stricterClass(check.actionClass, lexical);
    for (const r of refs) {
      const item = byRef.get(r);
      for (const c of item?.checks ?? []) {
        if (foldText(check.action).includes(foldText(c.text).slice(0, 40))) {
          cls = stricterClass(cls, c.actionClass);
        }
      }
    }

    let reason: RemovalReason | null = null;
    let requiresConfirmation = false;
    if (cls === 'DIRECT_COMMAND') {
      reason = 'gate.removed.directCommand';
    } else if (cls === 'SAFETY_RELEVANT') {
      const approved = refs.some((r) => {
        const item = byRef.get(r);
        return item !== undefined && isApprovedSafetySource(item);
      });
      if (bypass.bypass) reason = 'gate.removed.bypassRequest';
      else if (!approved) reason = 'gate.removed.safetyUnapproved';
      else requiresConfirmation = true;
    } else if (refs.length === 0) {
      reason = 'gate.removed.unsupported';
    } else if (cls === 'CONFIGURATIVE' && !exactContext) {
      reason = 'gate.removed.configNeedsContext';
    }

    if (reason) {
      removed.push({ step: check.step, reason });
      decisions.add(reason);
      if (reason === 'gate.removed.safetyUnapproved' || reason === 'gate.removed.bypassRequest') {
        safety = 'blocked';
        escalate = true;
      }
      if (reason === 'gate.removed.configNeedsContext') {
        if (context.hardwareRevision === null) missing.add('ctx.hardwareRevision');
        if (context.firmware === null) missing.add('ctx.firmware');
      }
      continue;
    }
    if (cls === 'CONFIGURATIVE' && safety === 'standard') safety = 'caution';
    if (requiresConfirmation) {
      if (safety !== 'blocked') safety = 'caution';
      decisions.add('gate.humanConfirmationRequired');
    }
    kept.push({
      step: kept.length + 1,
      action: check.action,
      expected: check.expected,
      actionClass: cls,
      evidenceRefs: refs,
      requiresConfirmation,
    });
  }

  // 4. Причините — само подкрепените; несъвместимото не е основен източник.
  const causes = draft.causes
    .map((c) => ({ text: c.text, evidenceRefs: supporting(c.evidenceRefs) }))
    .filter((c) => c.evidenceRefs.length > 0);
  if (causes.length < draft.causes.length) decisions.add('gate.causes.unsupportedDropped');

  // 5. Решенията „ако X → A“ остават само ако има поне една запазена стъпка.
  const decisionPoints = kept.length > 0 ? draft.decisionPoints : [];

  // 6. Увереност и изход по прага (§8.3) — моделът не може да ги вдигне.
  const caps = capsFor(input.level);
  let confidence = lowerConfidence(draft.confidence, caps.confidence);
  let status = lowerOutcome(draft.status, caps.outcome);
  if (input.level === 'high' && status === 'identified' && confidence === 'high') {
    // Две съгласни фрази без точен код — „висока/средно-висока“, не сигурност.
    confidence = 'medium';
  }
  if (kept.length === 0 && causes.length === 0) {
    status = 'undetermined';
    confidence = 'low';
    decisions.add('gate.noSupportedContent');
  }
  if (causes.length > 1 && status === 'identified') {
    // Няколко подкрепени причини — не представяме една като сигурна (§10.3).
    status = 'probable';
    decisions.add('gate.multipleCauses');
  }
  if (input.level === 'weak') {
    decisions.add('gate.weakEvidence');
    for (const field of ['hardwareRevision', 'firmware'] as const) {
      if (context[field] === null) missing.add(`ctx.${field}`);
    }
  }
  if (input.level === 'conflict') decisions.add('gate.conflict');
  for (const id of retrieval.unknownIdentifiers) {
    decisions.add('gate.unknownIdentifier');
    missing.add(`ctx.unknownIdentifier:${id}`);
  }
  // Кодът на случая го няма за този модел/версия (§16.3 „код, който не съществува“): никаква
  // сигурност, дори ако пакетът има текст за подобен код.
  const caseCode = context.errorCode ? canonicalIdentifier(context.errorCode) : null;
  if (caseCode !== null && retrieval.unknownIdentifiers.includes(caseCode)) {
    status = lowerOutcome(status, 'probable');
    confidence = 'low';
    escalate = true;
    decisions.add('gate.unknownErrorCode');
  }
  if (status === 'undetermined' || input.level === 'conflict') escalate = true;

  // 7. Конфликтите — от търсенето (детерминистично) + от модела, ако са с валидни референции.
  const conflicts = [
    ...retrieval.conflicts,
    ...draft.conflicts.filter((c) => c.refs.every((r) => byRef.has(r))),
  ];

  // 8. Източниците, които стигат до техника: цитираните и реално подкрепящите.
  const used = new Set<string>([
    ...verifiedQuotes.keys(),
    ...kept.flatMap((k) => k.evidenceRefs),
    ...causes.flatMap((c) => c.evidenceRefs),
  ]);
  const evidence = [...used]
    .map((r) => byRef.get(r))
    .filter((i): i is EvidenceItem => i !== undefined && i.applicable)
    .sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)))
    .map((i) => citationOf(i, verifiedQuotes.get(i.ref) ?? null));

  return {
    generatedBy: 'ai',
    status,
    confidence,
    confidenceReason: draft.confidenceReason,
    summary: draft.summary,
    causes,
    checks: kept,
    decisionPoints,
    evidence,
    conflicts,
    safety: { level: safety, notes: draft.safetyNotes },
    missingData: [...missing],
    escalation: {
      recommended: escalate,
      reason: draft.escalation.reason,
      collect: escalate ? collectFor(context) : [],
    },
    gate: {
      evidenceLevel: input.level,
      removedSteps: removed,
      droppedCitations: dropped,
      decisions: [...decisions],
    },
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    promptVersion: input.promptVersion,
  };
}
