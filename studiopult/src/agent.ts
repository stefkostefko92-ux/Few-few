/**
 * Агентът (критерий 7). Главната нишка е тънкият диспечер `pult-dispatch`, който пуска НАШИЯ агент като
 * субагент — само така тичат SubagentStart/Stop куките (паметта, ученето, dod-check, usage-capture) и
 * agent-cap → budget.mjs (месечният таван). Настройките са от `.claude/` на репото (settingSources:
 * ['project']) — същите куки и пазачи като в Claude Code. Режим default + canUseTool: Bash, PowerShell,
 * Write и Edit минават само с клик. Ключът е само в env на SDK; env ЗАМЕНЯ средата, затова се подава
 * `{...process.env}`; scrub маха тайните от средата на Bash и куките; автоматичната памет е изключена (нашата
 * памет е през куките — втори, неуправляван канал е риск).
 * Факти за SDK: план на AI-джията 28.11.2026 (code.claude.com/docs/en/agent-sdk/*), типовете на пакета 0.3.332.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  query,
  type CanUseTool,
  type HookCallback,
  type Options,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * Живата проба (28.11.2026): по подразбиране субагентът тръгва ФОНОВО и диспечерът отговаря „още работи“,
 * преди да има резултат. Тази кука кара всяко извикване на Agent да чака отговора (run_in_background: false);
 * другите инструменти не пипа. Нашите файлови PreToolUse куки (agent-cap → месечният таван) тичат отделно —
 * отказ от която и да е от тях печели над „allow“.
 */
export const foregroundAgent: HookCallback = async (input) => {
  const i = input as { hook_event_name?: string; tool_name?: string; tool_input?: unknown };
  if (i.hook_event_name !== 'PreToolUse' || i.tool_name !== 'Agent') return {};
  const ti =
    i.tool_input && typeof i.tool_input === 'object'
      ? (i.tool_input as Record<string, unknown>)
      : {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { ...ti, run_in_background: false },
    },
  };
};

export const DISPATCH = 'pult-dispatch';
export const MAX_BUDGET_USD = 3;
export const MAX_TURNS = 80;
/** Без питане: само четене. Всичко друго минава през canUseTool (клик). */
export const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'];

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** Нашите агенти: `.claude/agents/*.md` без файловете с „_“ (споделени части). */
export function listAgents(repoRoot: string): string[] {
  return readdirSync(join(repoRoot, '.claude', 'agents'))
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3))
    .filter((n) => ID.test(n))
    .sort();
}

export function buildOptions(o: {
  agentId: string;
  agents: string[];
  repoRoot: string;
  key: string;
  canUseTool: CanUseTool;
  resume?: string;
  abortController?: AbortController;
}): Options {
  if (!ID.test(o.agentId) || o.agentId === DISPATCH || !o.agents.includes(o.agentId)) {
    throw new Error('непознат агент');
  }
  const opts: Options = {
    cwd: o.repoRoot,
    settingSources: ['project'],
    permissionMode: 'default',
    agent: DISPATCH,
    agents: {
      [DISPATCH]: {
        description: 'Диспечерът на Студио пулта — предава съобщението на избрания наш агент.',
        prompt:
          `Ти си само диспечер. Предай съобщението на собственика ДОСЛОВНО на агента „${o.agentId}“ ` +
          'чрез инструмента Agent, изчакай го и върни отговора му дословно. Не добавяй свои мисли, не ' +
          'изпълнявай задачата сам и не викай друг агент.',
        tools: [`Agent(${o.agentId})`],
        model: 'sonnet',
        effort: 'low',
      },
    },
    allowedTools: [...READ_ONLY_TOOLS],
    canUseTool: o.canUseTool,
    maxBudgetUsd: MAX_BUDGET_USD,
    maxTurns: MAX_TURNS,
    includePartialMessages: true,
    forwardSubagentText: true,
    hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [foregroundAgent] }] },
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: o.key,
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      // Stop куките session-dod и artifact-sync мълчат: главната нишка тук е диспечерът, не работна сесия.
      STUDIOPULT: '1',
    },
  };
  if (o.resume) opts.resume = o.resume;
  if (o.abortController) opts.abortController = o.abortController;
  return opts;
}

export interface AgentRunner {
  run(prompt: string, options: Options): AsyncIterable<SDKMessage>;
}

export const sdkRunner: AgentRunner = {
  run: (prompt, options) => query({ prompt, options }),
};

export type UiEvent =
  | { type: 'text'; text: string; sub: boolean }
  | { type: 'tool'; name: string; sub: boolean }
  | { type: 'result'; cost: number; sessionId: string; ok: boolean; error?: string };

/** Съобщение на SDK → събитие за страницата (само безопасните полета; текстът се рисува с textContent). */
export function toUiEvent(m: SDKMessage): UiEvent | null {
  const msg = m as unknown as Record<string, unknown>;
  if (msg.type === 'stream_event') {
    const ev = msg.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (
      ev?.type === 'content_block_delta' &&
      ev.delta?.type === 'text_delta' &&
      typeof ev.delta.text === 'string'
    ) {
      return { type: 'text', text: ev.delta.text, sub: msg.parent_tool_use_id !== null };
    }
    return null;
  }
  if (msg.type === 'assistant') {
    const content =
      (msg.message as { content?: { type: string; name?: string }[] } | undefined)?.content ?? [];
    const tool = content.find((b) => b.type === 'tool_use');
    return tool?.name
      ? { type: 'tool', name: tool.name, sub: msg.parent_tool_use_id !== null }
      : null;
  }
  if (msg.type === 'result') {
    const ok = msg.subtype === 'success' && msg.is_error !== true;
    const e: UiEvent = {
      type: 'result',
      cost: typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : 0,
      sessionId: typeof msg.session_id === 'string' ? msg.session_id : '',
      ok,
    };
    if (!ok) e.error = String(msg.subtype ?? 'грешка');
    return e;
  }
  return null;
}
