/**
 * „Разреши/Откажи“ (критерий 8): всеки инструмент, който SDK не пуска сам (Bash, PowerShell, Write, Edit…),
 * чака клик от собственика. Заявката е вързана с requestId И сесията на страницата; чуждо id → not_found;
 * таймаут или затворена страница → отказ. „Винаги разрешено“ (suggestions от SDK) НЕ се прилага — иначе един
 * клик би отворил всички следващи команди, включително подхвърлени от инжекция във файл.
 */
import { randomUUID } from 'node:crypto';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';

export interface ApprovalInfo {
  tool: string;
  detail: string;
}

interface Pending {
  session: string;
  resolve: (allow: boolean) => void;
  timer: NodeJS.Timeout;
}

export class Approvals {
  private readonly pending = new Map<string, Pending>();
  private readonly timeoutMs: number;

  constructor(opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  }

  request(session: string, _info: ApprovalInfo): { requestId: string; decision: Promise<boolean> } {
    const requestId = randomUUID();
    const decision = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => this.finish(requestId, false), this.timeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { session, resolve, timer });
    });
    return { requestId, decision };
  }

  decide(session: string, requestId: string, allow: boolean): 'ok' | 'not_found' {
    const p = this.pending.get(requestId);
    if (!p || p.session !== session) return 'not_found';
    this.finish(requestId, allow === true);
    return 'ok';
  }

  /** Отказ за всичко чакащо на сесията (затворена страница, спрян разговор). */
  cancelAll(session: string): void {
    for (const [id, p] of this.pending) if (p.session === session) this.finish(id, false);
  }

  private finish(requestId: string, allow: boolean): void {
    const p = this.pending.get(requestId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(requestId);
    p.resolve(allow);
  }
}

/** Какво точно ще се изпълни — дословно, за да решава собственикът по истинската команда. */
export function describe(tool: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
  if (tool === 'Bash' || tool === 'PowerShell') return s(input.command);
  if (tool === 'Write')
    return `${s(input.file_path)}\n— нов файл, ${String(s(input.content)).length} знака`;
  if (tool === 'Edit' || tool === 'MultiEdit') return `${s(input.file_path)}\n— редакция`;
  return JSON.stringify(input).slice(0, 4000);
}

export type ApprovalEvent = {
  type: 'approval';
  requestId: string;
  tool: string;
  detail: string;
  agent?: string;
};

export function makeCanUseTool(opts: {
  approvals: Approvals;
  session: string;
  /** Избраният наш агент — картата показва името му, не вътрешното id на субагента (живата проба). */
  agentName?: string;
  emit: (e: ApprovalEvent) => void;
}): CanUseTool {
  return async (toolName, input, ctx): Promise<PermissionResult> => {
    const detail = describe(toolName, input);
    const { requestId, decision } = opts.approvals.request(opts.session, {
      tool: toolName,
      detail,
    });
    const onAbort = () => opts.approvals.decide(opts.session, requestId, false);
    if (ctx.signal.aborted) onAbort();
    else ctx.signal.addEventListener('abort', onAbort, { once: true });
    const ev: ApprovalEvent = { type: 'approval', requestId, tool: toolName, detail };
    if (opts.agentName) ev.agent = ctx.agentID ? opts.agentName : 'диспечер';
    opts.emit(ev);
    const allow = await decision;
    ctx.signal.removeEventListener('abort', onAbort);
    return allow
      ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: 'Собственикът отказа тази стъпка в Студио пулта.' };
  };
}
