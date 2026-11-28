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
import { readdirSync, realpathSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
import {
  query,
  type CanUseTool,
  type HookCallback,
  type Options,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

const objOf = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/**
 * Диспечерът вика само избрания агент и на преден план.
 * - Живата проба (28.11.2026): по подразбиране субагентът тръгва ФОНОВО и диспечерът отговаря „още работи“,
 *   преди да има резултат → run_in_background: false.
 * - Червеният екип на #515: защита в дълбочина отгоре на `Agent(<id>)` — друг subagent_type → отказ; модел,
 *   усилие и изолация (вкл. „remote“) не се сменят от модела.
 * Нашите файлови PreToolUse куки (agent-cap → месечният таван) тичат отделно — отказ от тях печели над „allow“.
 */
export function agentGuard(agentId: string): HookCallback {
  return async (input) => {
    const i = input as { hook_event_name?: string; tool_name?: string; tool_input?: unknown };
    if (i.hook_event_name !== 'PreToolUse' || i.tool_name !== 'Agent') return {};
    const { model: _m, effort: _e, isolation: _i, ...ti } = objOf(i.tool_input);
    if (ti.subagent_type !== agentId) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Студио пулт: диспечерът вика само „${agentId}“.`,
        },
      };
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { ...ti, run_in_background: false },
      },
    };
  };
}

export interface ReadScope {
  platform: NodeJS.Platform;
  /** Спрямо какво е относителен път (cwd на SDK = репото). */
  cwd: string;
  /** Тук четенето минава без клик: репото и папката на студиото. */
  roots: string[];
  /** Папката на пулта (ключът, spend.json) — никога. */
  data?: string;
}

/**
 * Присъда за един път (червеният екип на #515, F1): `deny` — в папката на пулта или /proc (на Linux носи
 * средата на процеса, т.е. ключа), или — при обхождане (Grep, Glob) — неин родител; `allow` — под корен;
 * `ask` — всичко друго (клик). Сравнението е лексикално; на Windows без значение на регистъра и разделителя,
 * а `\\?\C:\…` се чете като `C:\…`. 8.3 имена и junction се хващат от realpath в куката, когато пътят съществува.
 */
export function pathVerdict(p: unknown, sc: ReadScope, traverse = false): 'allow' | 'deny' | 'ask' {
  if (typeof p !== 'string' || !p || p.includes('\0')) return 'ask';
  const win = sc.platform === 'win32';
  const m = win ? win32 : posix;
  let raw = p;
  if (win && /^[\\/]{2}[?.][\\/]/.test(raw)) {
    const rest = raw.slice(4);
    if (!/^[a-z]:[\\/]/i.test(rest)) return 'ask'; // \\?\UNC\…, \\.\устройство
    raw = rest;
  }
  const norm = (x: string) => {
    const r = m.resolve(sc.cwd, x);
    return win ? r.toLowerCase() : r;
  };
  const inside = (root: string, x: string) =>
    x === root || x.startsWith(root.endsWith(m.sep) ? root : root + m.sep);
  const t = norm(raw);
  if (!win && inside('/proc', t)) return 'deny';
  if (sc.data) {
    const d = norm(sc.data);
    if (inside(d, t) || (traverse && inside(t, d))) return 'deny';
  }
  return sc.roots.some((r) => inside(norm(r), t)) ? 'allow' : 'ask';
}

const GLOB_CHARS = /[*?[\]{}]/;
const hasDotDot = (x: string) => x.split(/[\\/]/).includes('..');

function realOrNull(p: string): string | null {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}

/**
 * Куката за четенето (Read, Grep, Glob). allowedTools е празен: голо име там одобрява целия инструмент и
 * canUseTool не се вика (code.claude.com/docs/en/agent-sdk/permissions). Тук: под корен → allow; папката
 * на пулта и /proc → deny (и след realpath — symlink, junction, 8.3); иначе — без решение → canUseTool (клик).
 */
export function readScope(sc: ReadScope): HookCallback {
  const withReal = (xs: string[]) => [...new Set([...xs, ...xs.map((x) => realOrNull(x) ?? x)])];
  const roots = withReal(sc.roots);
  const data = sc.data ? (realOrNull(sc.data) ?? sc.data) : undefined;
  const scopes: ReadScope[] = [
    { ...sc, roots },
    ...(data && data !== sc.data ? [{ ...sc, roots, data }] : []),
  ];
  const deny = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse' as const,
      permissionDecision: 'deny' as const,
      permissionDecisionReason: 'Студио пулт: това място е забранено за четене (ключът на пулта).',
    },
  };
  return async (input) => {
    const i = input as { hook_event_name?: string; tool_name?: string; tool_input?: unknown };
    if (i.hook_event_name !== 'PreToolUse') return {};
    const ti = objOf(i.tool_input);
    const targets: [unknown, boolean][] = [];
    let ask = false;
    if (i.tool_name === 'Read') targets.push([ti.file_path, false]);
    else if (i.tool_name === 'Grep' || i.tool_name === 'Glob') {
      targets.push([ti.path ?? sc.cwd, true]);
      const pat = i.tool_name === 'Glob' ? ti.pattern : ti.glob;
      if (pat !== undefined) {
        if (typeof pat !== 'string' || hasDotDot(pat)) ask = true;
        else if ((sc.platform === 'win32' ? win32 : posix).isAbsolute(pat)) {
          const cut = pat.search(GLOB_CHARS);
          targets.push([cut < 0 ? pat : pat.slice(0, cut), true]);
        }
      }
    } else return {};
    for (const [p, traverse] of targets) {
      const real =
        typeof p === 'string'
          ? realOrNull((sc.platform === 'win32' ? win32 : posix).resolve(sc.cwd, p))
          : null;
      for (const s of scopes) {
        for (const x of real ? [p, real] : [p]) {
          const v = pathVerdict(x, s, traverse);
          if (v === 'deny') return deny;
          if (v === 'ask') ask = true;
        }
      }
    }
    if (ask) return {};
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  };
}

export const DISPATCH = 'pult-dispatch';
export const MAX_BUDGET_USD = 3;
export const MAX_TURNS = 80;

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
  /** Папката на пулта (ключът) — забранена за четене. */
  dataDir?: string;
  /** Папката на студиото — четене без клик, както репото. */
  studioDir?: string;
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
          'чрез инструмента Agent и изчакай го. Собственикът вижда отговора на агента сам, затова след ' +
          'това отговори само „Готово.“ (или „Спря.“ при грешка) — без преразказ. Не добавяй свои мисли, ' +
          'не изпълнявай задачата сам и не викай друг агент.',
        tools: [`Agent(${o.agentId})`],
        model: 'sonnet',
        effort: 'low',
      },
    },
    // Празен: голо име тук одобрява целия инструмент без canUseTool. Четенето се решава в readScope.
    allowedTools: [],
    canUseTool: o.canUseTool,
    maxBudgetUsd: MAX_BUDGET_USD,
    maxTurns: MAX_TURNS,
    includePartialMessages: true,
    forwardSubagentText: true,
    hooks: {
      PreToolUse: [
        { matcher: 'Agent', hooks: [agentGuard(o.agentId)] },
        {
          matcher: 'Read|Grep|Glob',
          hooks: [
            readScope({
              platform: process.platform,
              cwd: o.repoRoot,
              roots: [o.repoRoot, ...(o.studioDir ? [o.studioDir] : [])],
              ...(o.dataDir ? { data: o.dataDir } : {}),
            }),
          ],
        },
      ],
    },
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

/**
 * Съобщение на SDK → събития за страницата (само безопасните полета; текстът се рисува с textContent).
 * Текстът на диспечера идва от потока (stream_event); текстът на нашия агент — от цели assistant съобщения на
 * субагента (forwardSubagentText). Частичните на субагента се пропускат, за да не се показва нищо два пъти;
 * диспечерът отговаря само „Готово.“ — прегледът на #515: иначе изходните токени се плащаха двойно.
 */
export function toUiEvents(m: SDKMessage): UiEvent[] {
  const msg = m as unknown as Record<string, unknown>;
  const sub = msg.parent_tool_use_id !== null && msg.parent_tool_use_id !== undefined;
  if (msg.type === 'stream_event') {
    if (sub) return [];
    const ev = msg.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (
      ev?.type === 'content_block_delta' &&
      ev.delta?.type === 'text_delta' &&
      typeof ev.delta.text === 'string'
    ) {
      return [{ type: 'text', text: ev.delta.text, sub: false }];
    }
    return [];
  }
  if (msg.type === 'assistant') {
    const content =
      (msg.message as { content?: { type: string; name?: string; text?: string }[] } | undefined)
        ?.content ?? [];
    const out: UiEvent[] = [];
    for (const b of Array.isArray(content) ? content : []) {
      if (b.type === 'tool_use' && typeof b.name === 'string')
        out.push({ type: 'tool', name: b.name, sub });
      else if (sub && b.type === 'text' && typeof b.text === 'string' && b.text)
        out.push({ type: 'text', text: b.text, sub: true });
    }
    return out;
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
    return [e];
  }
  return [];
}

/** Първото събитие (за тестовете и простите случаи). */
export function toUiEvent(m: SDKMessage): UiEvent | null {
  return toUiEvents(m)[0] ?? null;
}
