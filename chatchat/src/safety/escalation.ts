import type { DiagnosticContext } from '../domain/context.js';
import { NO_MODEL_INPUTS, type DiagnosticAnswer } from '../domain/response.js';
import type { GateInput } from './gate.js';
import { detectBypassIntent } from './lexicon.js';
import { GATE_VERSION } from './version.js';

/** Какво да събере техникът преди тикета, според липсващия контекст. */
export function collectFor(context: DiagnosticContext): string[] {
  const collect = ['collect.checksDone', 'collect.displayPhoto', 'collect.eventLog'];
  if (context.serial === null) collect.unshift('collect.serial');
  if (context.firmware === null) collect.unshift('collect.firmware');
  if (context.hardwareRevision === null) collect.unshift('collect.hardwareRevision');
  return collect;
}

/**
 * Отговор без модела, когато няма нито един съвместим източник (§8.3 „nessuna fonte
 * applicabile“, AC-04, NFR-05): изрично „не е определено“ + какво липсва + ескалация.
 * Безопасно и евтино — нищо не се генерира, нищо не може да бъде измислено.
 */
export function noEvidenceAnswer(input: Omit<GateInput, 'draft' | 'level'>): DiagnosticAnswer {
  const bypass = detectBypassIntent(input.question);
  const missing = new Set<string>(['gate.noApplicableSource']);
  if (input.context.hardwareRevision === null) missing.add('ctx.hardwareRevision');
  if (input.context.firmware === null) missing.add('ctx.firmware');
  for (const id of input.retrieval.unknownIdentifiers) missing.add(`ctx.unknownIdentifier:${id}`);
  const decisions = ['gate.noApplicableSource'];
  if (bypass.bypass) decisions.push('gate.bypassRequest');
  // Моделът не се вика → нищо не е изпратено; снимка/лог сами не са основа за диагноза (§9.2).
  const given = input.inputs ?? NO_MODEL_INPUTS;
  const notSent = [
    ...given.notSent,
    ...given.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      reason: 'gate.attachment.notAnalyzed',
    })),
  ];
  if (given.attachments.length > 0) decisions.push('gate.attachment.notAnalyzed');
  for (const n of notSent) if (n.reason.startsWith('collect.')) missing.add(n.reason);
  return {
    generatedBy: 'ai',
    status: 'undetermined',
    confidence: 'low',
    confidenceReason: 'gate.noApplicableSource',
    summary: 'gate.noApplicableSource',
    causes: [],
    checks: [],
    decisionPoints: [],
    evidence: [],
    conflicts: input.retrieval.conflicts,
    safety: { level: bypass.bypass ? 'blocked' : 'standard', notes: [] },
    missingData: [...missing],
    escalation: {
      recommended: true,
      reason: 'gate.noApplicableSource',
      collect: collectFor(input.context),
    },
    gate: { evidenceLevel: 'none', removedSteps: [], droppedCitations: [], decisions },
    photos: [],
    modelInputs: { attachments: [], notSent },
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    promptVersion: `${input.promptVersion}+${GATE_VERSION}`,
  };
}
