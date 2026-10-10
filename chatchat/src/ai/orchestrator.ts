import { randomBytes } from 'node:crypto';
import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages';
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
import type { EvidenceItem, KnowledgeStore, SearchScope } from '../retrieval/types.js';
import { noEvidenceAnswer } from '../safety/escalation.js';
import { applyGate } from '../safety/gate.js';
import { NO_ATTACHMENTS, sentInputs, type ModelAttachments } from './attachments.js';
import { EvidencePack } from './evidence.js';
import {
  caseContent,
  historyMessages,
  safeDraft,
  toolResult,
  type FailureCode,
} from './messages.js';
import type { DiagnosisModel } from './model.js';
import { PROMPT_VERSION, SYSTEM_PROMPT, renderCaseMessage, type Locale } from './prompt.js';
import { SUBMIT_TOOL, TOOLS, runReadTool, validateSubmission } from './tools.js';

/**
 * AI оркестраторът (§8.1, §10, §14.2–14.3):
 *  търсене → ниво → (none: отговор без модела) → Claude с пакета → инструменти за четене
 *  (до AI_MAX_TOOL_ROUNDS) → submit_diagnosis → zod → Safety Gate.
 * Записът в базата НЕ е тук — прави го рутерът.
 *
 * tool_choice остава `auto` навсякъде: принудителният (`any`/`tool`) връща 400 на Opus 5.5 /
 * Sonnet 5.5, а смяната му между заявките инвалидира кеша на съобщенията. Финалният отговор се
 * изисква от оркестратора (tool_result с грешка + подкана), а таванът на извикванията е твърд.
 * Съобщенията само се ДОБАВЯТ, отговорите на модела се връщат непроменени (thinking блоковете
 * трябва да останат цели — иначе губим разсъжденията и кеша).
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
}

/** Колко инструмента в един ход най-много се изпълняват; останалите получават грешка. */
const MAX_TOOLS_PER_ROUND = 4;

export type { FailureCode };

export async function diagnose(
  deps: DiagnoseDeps,
  input: DiagnoseInput,
  signal: AbortSignal,
): Promise<DiagnoseOutput> {
  const cfg = deps.config;
  // Един краен срок за целия цикъл (под таймаута на Nginx), не по AI_TIMEOUT_MS на всеки кръг.
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(cfg.AI_TIMEOUT_MS)]);
  const request = { scope: input.scope, context: input.context, query: input.question };

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
    };
  }

  const pack = new EvidencePack(initial, versionOf(request));
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

  const messages: MessageParam[] = [
    ...historyMessages(input.history),
    // Breakpoint на случая: кръговете с инструменти четат префикса (вкл. пакета и снимките) от кеша.
    { role: 'user', content: caseContent(files.photos, caseText) },
  ];
  // Ако историята завършва с потребител, двата user хода се сливат в един.
  if (messages.length >= 2) {
    const prev = messages[messages.length - 2];
    const last = messages[messages.length - 1];
    if (prev && last && prev.role === 'user' && Array.isArray(prev.content)) {
      prev.content.push(...(last.content as ContentBlockParam[]));
      messages.pop();
    }
  }

  const params = (): MessageCreateParamsNonStreaming => ({
    model: cfg.AI_MODEL,
    max_tokens: cfg.AI_MAX_OUTPUT_TOKENS,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: TOOLS,
    tool_choice: { type: 'auto' },
    thinking: { type: 'adaptive', display: 'omitted' },
    output_config: { effort: cfg.AI_EFFORT },
    // Копие: масивът продължава да расте след заявката.
    messages: [...messages],
  });

  const toolCtx = {
    store: deps.store,
    scope: input.scope,
    productModel: input.context.productModel,
    pack,
    token,
  };

  // Твърд таван на извикванията: кръговете + финален отговор + една подкана + една поправка.
  const maxCalls = cfg.AI_MAX_TOOL_ROUNDS + 3;
  let draft: ModelDiagnosis | null = null;
  let failure: FailureCode = 'ai.noSubmission';
  let repairUsed = false;
  let nudgeUsed = false;

  for (let call = 0; call < maxCalls && draft === null; call += 1) {
    const res: Message = await deps.model.create(params(), deadline);
    usage.inputTokens += res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0);
    usage.outputTokens += res.usage.output_tokens;
    usage.cacheReadTokens += res.usage.cache_read_input_tokens ?? 0;
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason === 'refusal') {
      failure = 'ai.refusal';
      break;
    }

    const uses = res.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    const submit = uses.find((u) => u.name === SUBMIT_TOOL);

    if (uses.length === 0) {
      // Текст вместо submit_diagnosis (или отрязан отговор) — една подкана.
      if (nudgeUsed) break;
      nudgeUsed = true;
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: `Call ${SUBMIT_TOOL} now with your complete answer.` }],
      });
      continue;
    }

    if (submit) {
      const checked = validateSubmission(submit.input);
      if (checked.ok) {
        draft = checked.data;
        break;
      }
      failure = 'ai.invalidOutput';
      if (repairUsed) break;
      repairUsed = true;
      // Всеки tool_use иска tool_result; само submit носи грешките за поправка.
      messages.push({
        role: 'user',
        content: uses.map((u) =>
          u.id === submit.id
            ? toolResult(
                u.id,
                `Invalid input: ${checked.error}. Call ${SUBMIT_TOOL} again, alone, with a corrected complete answer.`,
                true,
              )
            : toolResult(u.id, `Not executed: ${SUBMIT_TOOL} must be called alone.`, true),
        ),
      });
      continue;
    }

    // Само инструменти за четене.
    if (usage.toolRounds >= cfg.AI_MAX_TOOL_ROUNDS) {
      failure = 'ai.noSubmission';
      if (nudgeUsed) break;
      nudgeUsed = true;
      messages.push({
        role: 'user',
        content: uses.map((u) =>
          toolResult(
            u.id,
            `Tool budget exhausted. Do not call more tools. Call ${SUBMIT_TOOL} now with the evidence you have; list what is missing in missingData.`,
            true,
          ),
        ),
      });
      continue;
    }
    usage.toolRounds += 1;
    const results: ToolResultBlockParam[] = [];
    for (const [i, u] of uses.entries()) {
      if (i >= MAX_TOOLS_PER_ROUND) {
        results.push(toolResult(u.id, 'Not executed: too many tool calls in one round.', true));
        continue;
      }
      const outcome = await runReadTool(u.name, u.input, toolCtx);
      results.push(toolResult(u.id, outcome.content, outcome.isError));
    }
    messages.push({ role: 'user', content: results });
  }

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
  return { answer, evidence: retrieval.items, usage, modelCalled: true };
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
