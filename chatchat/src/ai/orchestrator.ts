import { randomBytes } from 'node:crypto';
import type { Config } from '../config.js';
import type { DiagnosticContext } from '../domain/context.js';
import type { DiagnosticAnswer, ModelDiagnosis } from '../domain/response.js';
import {
  cappedLevel,
  caseIdentifiers,
  evidenceLevel,
  retrieve,
  versionOf,
} from '../retrieval/retrieve.js';
import type {
  EvidenceItem,
  KnowledgeStore,
  RetrievalResult,
  SearchScope,
} from '../retrieval/types.js';
import { noEvidenceAnswer } from '../safety/escalation.js';
import { applyGate } from '../safety/gate.js';
import { NO_ATTACHMENTS, sentInputs, type ModelAttachments } from './attachments.js';
import { EvidencePack } from './evidence.js';
import { caseMessages, safeDraft, type FailureCode } from './messages.js';
import type { DiagnosisModel } from './model.js';
import { PROMPT_VERSION, renderCaseMessage, type Locale } from './prompt.js';
import type { ToolCallAudit } from './tool-audit.js';
import { runToolLoop } from './tool-loop.js';

/**
 * AI оркестраторът (§8.1, §10, §14.2–14.3):
 *  търсене → ниво → (none: отговор без модела) → Claude с пакета → инструменти за четене
 *  (до AI_MAX_TOOL_ROUNDS) → submit_diagnosis → zod → Safety Gate.
 * Записът в базата НЕ е тук — прави го рутерът. Цикълът с инструментите (tool_choice, таваните,
 * подканата и поправката) е в `tool-loop.ts`, сглобяването на съобщенията — в `messages.ts`.
 */

export interface DiagnoseInput {
  scope: SearchScope;
  context: DiagnosticContext;
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  locale: Locale;
  /** Снимки/логове, привързани от техника към ТОЗИ въпрос (`ai/attachments.ts`). */
  attachments?: ModelAttachments;
}

export interface DiagnoseDeps {
  store: KnowledgeStore;
  model: DiagnosisModel;
  snapshotId: () => Promise<string>;
  config: Pick<
    Config,
    'AI_MODEL' | 'AI_EFFORT' | 'AI_MAX_OUTPUT_TOKENS' | 'AI_MAX_TOOL_ROUNDS' | 'AI_TIMEOUT_MS'
  >;
}

export interface DiagnoseOutput {
  answer: DiagnosticAnswer;
  evidence: EvidenceItem[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; toolRounds: number };
  modelCalled: boolean;
  /** FR-12: всяко извикване на инструмент — име, ключове, брой резултати; без текста на заявките. */
  toolCalls: ToolCallAudit[];
  /**
   * Конфликтите, отчетени от СИСТЕМАТА (търсенето/финалният пакет — `findConflicts`), не от модела:
   * от тях става предложение към отговорника за знанието (§11.3, services/proposals/conflicts.ts).
   */
  conflicts: RetrievalResult['conflicts'];
}

export type { FailureCode };

export async function diagnose(
  deps: DiagnoseDeps,
  input: DiagnoseInput,
  signal: AbortSignal,
): Promise<DiagnoseOutput> {
  const cfg = deps.config;
  // Един краен срок за целия цикъл (под таймаута на Nginx), не по AI_TIMEOUT_MS на всеки кръг.
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(cfg.AI_TIMEOUT_MS)]);
  // Един момент за целия отговор: спрямо него се смята валидността на документите (§7.2).
  const now = new Date();
  const request = { scope: input.scope, context: input.context, query: input.question, now };

  const [initial, knowledgeSnapshotId] = await Promise.all([
    retrieve(deps.store, request),
    deps.snapshotId(),
  ]);
  const caseIds = caseIdentifiers(input.context, input.question);
  const files = input.attachments ?? NO_ATTACHMENTS;
  // AC-09: в отговора — само id, вид и референция на изпратеното (и защо не е изпратено).
  const inputs = { attachments: sentInputs(files), notSent: files.notSent };
  const initialLevel = evidenceLevel(initial, caseIds);
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, toolRounds: 0 };
  const toolCalls: ToolCallAudit[] = [];

  // 1. Нищо съвместимо → без модела: нищо не може да бъде измислено (AC-04, NFR-05).
  if (initialLevel === 'none') {
    return {
      answer: noEvidenceAnswer({
        retrieval: initial,
        context: input.context,
        question: input.question,
        knowledgeSnapshotId,
        promptVersion: PROMPT_VERSION,
        inputs,
      }),
      evidence: initial.items,
      usage,
      modelCalled: false,
      toolCalls,
      conflicts: initial.conflicts,
    };
  }

  const pack = new EvidencePack(initial, versionOf(request), now);
  // Жетон на маркерите на данните — непредвидим, така че документ не може да „затвори“ блок.
  const token = randomBytes(8).toString('hex');
  const caseText = renderCaseMessage({
    locale: input.locale,
    context: input.context,
    question: input.question,
    level: initialLevel,
    retrieval: initial,
    token,
    photoRefs: files.photos.map((p) => p.ref),
    logs: files.logs,
  });

  const messages = caseMessages(input.history, files.photos, caseText);

  const toolCtx = {
    store: deps.store,
    scope: input.scope,
    productModel: input.context.productModel,
    pack,
    token,
  };

  // 2–3. Claude с пакета → инструменти за четене → submit_diagnosis → zod (`tool-loop.ts`).
  const { draft, failure } = await runToolLoop({
    model: deps.model,
    config: cfg,
    messages,
    toolCtx,
    deadline,
    usage,
    toolCalls,
  });

  // 4–5. Финалният пакет (нивото и конфликтите — наново; цитираното от модела винаги се брои) → Safety Gate.
  const retrieval = pack.result(citedRefs(draft));
  const level = cappedLevel(initialLevel, evidenceLevel(retrieval, caseIds));
  const answer = applyGate({
    draft: draft ?? safeDraft(failure),
    retrieval,
    level,
    context: input.context,
    question: input.question,
    knowledgeSnapshotId,
    promptVersion: PROMPT_VERSION,
    inputs,
  });
  if (draft === null) {
    // Безопасен отказ: никакво съдържание от модела без валидация. Gate вече ескалира
    // („undetermined“); тук само записваме защо — за UI и одита.
    answer.escalation.recommended = true;
    answer.gate.decisions.push(failure);
  }
  return {
    answer,
    evidence: retrieval.items,
    usage,
    modelCalled: true,
    toolCalls,
    conflicts: retrieval.conflicts,
  };
}

/** Всички E… референции, на които моделът се позовава (преди Gate да е изпуснал невалидните). */
export function citedRefs(draft: ModelDiagnosis | null): Set<string> {
  if (draft === null) return new Set();
  return new Set([
    ...draft.causes.flatMap((c) => c.evidenceRefs),
    ...draft.checks.flatMap((c) => c.evidenceRefs),
    ...draft.evidenceUsed.map((e) => e.ref),
  ]);
}
