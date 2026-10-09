import { hasExactProductContext, type DiagnosticContext } from '../domain/context.js';
import {
  lowerConfidence,
  stricterClass,
  type ActionClass,
  type DiagnosticAnswer,
  type EvidenceLevel,
  type ModelDiagnosis,
  type ModelInputs,
  type SafetyLevel,
  NO_MODEL_INPUTS,
} from '../domain/response.js';
import type { EvidenceItem, RetrievalResult } from '../retrieval/types.js';
import { applyThresholds, lowerOutcome } from './caps.js';
import { citationOf, verifyCitations } from './citations.js';
import { collectFor } from './escalation.js';
import { detectBypassIntent } from './lexicon.js';
import { applyPhotoRules, PHOTO_ONLY_BASIS } from './photos.js';
import {
  approvesSafetyStep,
  isDangerousText,
  screenText,
  sourceDocumentsStep,
  WITHHELD,
} from './screen.js';

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

/** .4: правилата за снимките (§9.2, AC-06 — `photos.ts`) и проследимостта на входа (AC-09). */
export const GATE_VERSION = 'gate-2026-10-09.4';

export interface GateInput {
  draft: ModelDiagnosis;
  retrieval: RetrievalResult;
  level: EvidenceLevel;
  context: DiagnosticContext;
  question: string;
  knowledgeSnapshotId: string;
  promptVersion: string;
  /** Кои прикачени файлове са стигнали до модела (P…/L…) и кои не — с код защо. */
  inputs?: ModelInputs;
}

type RemovalReason =
  | 'gate.removed.unsupported'
  | 'gate.removed.safetyUnapproved'
  | 'gate.removed.directCommand'
  | 'gate.removed.configNeedsContext'
  | 'gate.removed.bypassRequest';

export function applyGate(input: GateInput): DiagnosticAnswer {
  const { draft, retrieval, context } = input;
  const byRef = new Map(retrieval.items.map((i) => [i.ref, i]));
  const decisions = new Set<string>();
  const removed: DiagnosticAnswer['gate']['removedSteps'] = [];
  const missing = new Set<string>(draft.missingData);
  let safety: SafetyLevel = 'standard';
  let escalate = draft.escalation.recommended;
  /** Моделът е предложил мост/пряка команда в свободен текст — блок и ескалация. */
  const blockForText = (decision: string): void => {
    safety = 'blocked';
    escalate = true;
    decisions.add(decision);
  };
  /** Свободен текст към техника: опасният се заменя с код. */
  const screened = (text: string, block: boolean): string => {
    if (!isDangerousText(text)) return text;
    if (block) blockForText('gate.textWithheld');
    else decisions.add('gate.textWithheld');
    return WITHHELD;
  };

  // 1. Цитатите: само от пакета, само съвместими, откъсът — дословен.
  const { verifiedQuotes, dropped } = verifyCitations(draft.evidenceUsed, byRef);
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
    const stepText = `${check.action} ${check.expected}`;
    const lexical = screenText(stepText);
    let cls: ActionClass = stricterClass(check.actionClass, lexical.actionClass);
    // Класът от базата с кодове важи за проверката, която стъпката реално повтаря.
    for (const r of refs) {
      for (const c of byRef.get(r)?.checks ?? []) {
        if (sourceDocumentsStep(check.action, c.text)) cls = stricterClass(cls, c.actionClass);
      }
    }

    let reason: RemovalReason | null = null;
    let requiresConfirmation = false;
    if (lexical.bypass) {
      // Мост/байпас в самата стъпка — каквото и да цитира (червен екип: изходът е недоверен).
      reason = 'gate.removed.bypassRequest';
    } else if (cls === 'DIRECT_COMMAND') {
      reason = 'gate.removed.directCommand';
    } else if (cls === 'SAFETY_RELEVANT') {
      // Одобрена е само ако източникът документира ИМЕННО тази стъпка.
      const approved = refs.some((r) => {
        const item = byRef.get(r);
        return item !== undefined && approvesSafetyStep(item, stepText);
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

  // 4. Причините — само подкрепените и безопасните; несъвместимото не е основен източник.
  const causes: DiagnosticAnswer['causes'] = [];
  for (const cause of draft.causes) {
    const refs = supporting(cause.evidenceRefs);
    const verdict = screenText(cause.text);
    if (verdict.bypass || verdict.actionClass === 'DIRECT_COMMAND') {
      blockForText('gate.causes.withheld');
      continue;
    }
    const safetyOk =
      verdict.actionClass !== 'SAFETY_RELEVANT' ||
      refs.some((r) => {
        const item = byRef.get(r);
        return item !== undefined && approvesSafetyStep(item, cause.text);
      });
    if (refs.length === 0 || !safetyOk) {
      decisions.add('gate.causes.unsupportedDropped');
      continue;
    }
    causes.push({ text: cause.text, evidenceRefs: refs });
  }

  // 5. Решенията „ако X → A“: само ако има запазена стъпка, и без нищо, което Gate би махнал
  // като стъпка (нямат референции, затова и действие по безопасност не минава).
  const decisionPoints = (kept.length > 0 ? draft.decisionPoints : []).filter((dp) => {
    const verdict = screenText(`${dp.condition} ${dp.then}`);
    if (verdict.bypass || verdict.actionClass === 'DIRECT_COMMAND') {
      blockForText('gate.decisionPoint.withheld');
      return false;
    }
    if (verdict.actionClass === 'SAFETY_RELEVANT' || verdict.actionClass === 'CONFIGURATIVE') {
      decisions.add('gate.decisionPoint.withheld');
      return false;
    }
    return true;
  });

  // 6. Увереност и изход по прага (§8.3) — моделът не може да ги вдигне (`caps.ts`).
  const t = applyThresholds({
    level: input.level,
    status: draft.status,
    confidence: draft.confidence,
    keptSteps: kept.length,
    keptCauses: causes.length,
    context,
    unknownIdentifiers: retrieval.unknownIdentifiers,
  });
  let { status, confidence } = t;
  for (const d of t.decisions) decisions.add(d);
  for (const m of t.missing) missing.add(m);
  if (t.escalate) escalate = true;

  // 6a. Снимките (§9.2, AC-06): допълващи — само свалят изхода, никога не го вдигат (`photos.ts`).
  const modelInputs = input.inputs ?? NO_MODEL_INPUTS;
  const photo = applyPhotoRules({
    observations: draft.photoObservations ?? [],
    inputs: modelInputs,
    context,
  });
  for (const d of photo.decisions) decisions.add(d);
  for (const m of photo.missing) missing.add(m);
  if (photo.maxOutcome) status = lowerOutcome(status, photo.maxOutcome);
  if (photo.maxConfidence) confidence = lowerConfidence(confidence, photo.maxConfidence);
  if (photo.escalate) escalate = true;
  if (photo.block) blockForText('gate.textWithheld');
  // Без подкрепена причина/стъпка снимката е единствената основа → без диагноза, само искане.
  const photoOnly =
    modelInputs.attachments.some((a) => a.kind === 'PHOTO') &&
    kept.length === 0 &&
    causes.length === 0;
  if (photoOnly) decisions.add(PHOTO_ONLY_BASIS);
  if (status === 'undetermined' || input.level === 'conflict') escalate = true;

  // 7. Конфликтите — от търсенето (детерминистично) + от модела, ако са с валидни референции.
  const conflicts = [
    ...retrieval.conflicts,
    ...draft.conflicts
      .filter((c) => c.refs.every((r) => byRef.has(r)))
      .map((c) => ({ description: screened(c.description, true), refs: c.refs })),
  ];

  // 8. Свободният текст към техника — преди да се фиксират нивото на безопасност и ескалацията.
  const summary = photoOnly ? PHOTO_ONLY_BASIS : screened(draft.summary, true);
  const confidenceReason = photoOnly ? PHOTO_ONLY_BASIS : screened(draft.confidenceReason, true);
  const escalationReason = screened(draft.escalation.reason, true);
  const safetyNotes = draft.safetyNotes.map((n) => screened(n, false));

  // 9. Източниците, които стигат до техника: цитираните и реално подкрепящите.
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
    confidenceReason,
    summary,
    causes,
    checks: kept,
    decisionPoints,
    evidence,
    conflicts,
    // Предупреждение, което споменава мост („никога не мостете…“), се заменя с код, но не блокира.
    safety: { level: safety, notes: safetyNotes },
    missingData: [...missing],
    escalation: {
      recommended: escalate,
      reason: escalationReason,
      collect: escalate ? collectFor(context) : [],
    },
    gate: {
      evidenceLevel: input.level,
      removedSteps: removed,
      droppedCitations: dropped,
      decisions: [...decisions],
    },
    photos: photo.photos,
    modelInputs,
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    // AC-09: версията на промпта И на правилата на Gate, дали отговора.
    promptVersion: `${input.promptVersion}+${GATE_VERSION}`,
  };
}
