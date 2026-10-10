import type {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages';
import type { Config } from '../config.js';
import type { ModelDiagnosis } from '../domain/response.js';
import { toolResult, type FailureCode } from './messages.js';
import type { DiagnosisModel } from './model.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { auditToolCall, type ToolCallAudit } from './tool-audit.js';
import { SUBMIT_TOOL, TOOLS, runReadTool, validateSubmission, type ToolContext } from './tools.js';

/**
 * Цикълът с инструментите на оркестратора (§10, §14.2): Claude с пакета → инструменти за четене
 * (до AI_MAX_TOOL_ROUNDS) → submit_diagnosis → zod. Извиква се само от `diagnose`.
 *
 * tool_choice остава `auto` навсякъде: принудителният (`any`/`tool`) връща 400 на Opus 5.5 /
 * Sonnet 5.5, а смяната му между заявките инвалидира кеша на съобщенията. Финалният отговор се
 * изисква от оркестратора (tool_result с грешка + подкана), а таванът на извикванията е твърд.
 * Съобщенията само се ДОБАВЯТ, отговорите на модела се връщат непроменени (thinking блоковете
 * трябва да останат цели — иначе губим разсъжденията и кеша).
 */

/** Колко инструмента в един ход най-много се изпълняват; останалите получават грешка. */
const MAX_TOOLS_PER_ROUND = 4;

export interface ToolLoopUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  toolRounds: number;
}

export interface ToolLoopInput {
  model: DiagnosisModel;
  config: Pick<Config, 'AI_MODEL' | 'AI_EFFORT' | 'AI_MAX_OUTPUT_TOKENS' | 'AI_MAX_TOOL_ROUNDS'>;
  /** Съобщенията на случая — цикълът само ДОБАВЯ към тях. */
  messages: MessageParam[];
  toolCtx: ToolContext;
  deadline: AbortSignal;
  /** Броячите на оркестратора — цикълът ги увеличава. */
  usage: ToolLoopUsage;
  /** FR-12: одитът на инструментите — цикълът добавя към него. */
  toolCalls: ToolCallAudit[];
}

export interface ToolLoopResult {
  /** null → безопасен отказ (`failure` казва защо). */
  draft: ModelDiagnosis | null;
  failure: FailureCode;
}

export async function runToolLoop({
  model,
  config: cfg,
  messages,
  toolCtx,
  deadline,
  usage,
  toolCalls,
}: ToolLoopInput): Promise<ToolLoopResult> {
  /** Отказан инструмент (таван) — в одита като неизпълнен. */
  const notExecuted = (u: ToolUseBlock) =>
    toolCalls.push(auditToolCall(u.name, u.input, { results: 0, isError: true }, false));

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

  // Твърд таван на извикванията: кръговете + финален отговор + една подкана + една поправка.
  const maxCalls = cfg.AI_MAX_TOOL_ROUNDS + 3;
  let draft: ModelDiagnosis | null = null;
  let failure: FailureCode = 'ai.noSubmission';
  let repairUsed = false;
  let nudgeUsed = false;

  for (let call = 0; call < maxCalls && draft === null; call += 1) {
    const res: Message = await model.create(params(), deadline);
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
      for (const u of uses) notExecuted(u);
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
        notExecuted(u);
        results.push(toolResult(u.id, 'Not executed: too many tool calls in one round.', true));
        continue;
      }
      const outcome = await runReadTool(u.name, u.input, toolCtx);
      toolCalls.push(auditToolCall(u.name, u.input, outcome));
      results.push(toolResult(u.id, outcome.content, outcome.isError));
    }
    messages.push({ role: 'user', content: results });
  }

  return { draft, failure };
}
