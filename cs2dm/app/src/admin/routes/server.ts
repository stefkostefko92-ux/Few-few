import { z } from 'zod';
import { audit } from '../audit.js';
import { commandErrorKey } from '../commands.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { commandResultCode, first, type ResultCode } from '../forms.js';
import { perfChart, summarize } from '../perf.js';
import { done, renderAdmin } from '../render.js';
import {
  LOG_SOURCES,
  MAX_LOG_LINES,
  failureDetail,
  parseAgentStatus,
  parseLogLines,
} from '../server-data.js';

/**
 * Сървърът през cs2-agent на хоста (§9): статус и логове — ADMIN+, старт/спиране/рестарт/ъпдейт — HEADADMIN+.
 * Сайтът е в Docker и не пипа systemd; агентът изпълнява само затворения си списък и вярва само на
 * подписа с CS2DM_AGENT_KEY. Правото се проверява тук, ПРЕДИ подписа.
 */
const logsQuery = z.object({
  source: z.preprocess(first, z.enum(LOG_SOURCES)).catch('css'),
  lines: z.preprocess(first, z.coerce.number().int().min(10).max(MAX_LOG_LINES)).catch(100),
});

/**
 * Старт/спиране/рестарт: агентът чака systemd до 120 s, преди да отговори, а nginx реже заявката на
 * 30 s — затова чакаме 25 s и мълчанието не е грешка, а „още тече“ (статусът показва `busy`).
 */
export const RESTART_WAIT_MS = 25_000;

type ControlAction = 'start' | 'stop' | 'restart' | 'update';
/** Чакат systemd (за разлика от update, който е `--no-block`). */
const WAITS_FOR_SYSTEMD: ReadonlySet<ControlAction> = new Set(['start', 'stop', 'restart']);

export function serverRoutes(ctx: AdminCtx): AdminRoute[] {
  async function control(action: ControlAction, actor: string): Promise<ResultCode> {
    const waits = WAITS_FOR_SYSTEMD.has(action);
    const result = await ctx.agent.send(
      action,
      {},
      actor,
      waits ? { timeoutMs: RESTART_WAIT_MS } : {},
    );
    await audit(ctx.db, {
      actor,
      action: `server.${action}`,
      details: { ok: result.ok, ...(result.ok ? {} : { error: commandErrorKey(result.error) }) },
    });
    if (result.ok) return 'sent';
    if (waits && result.error === 'timeout') return 'cmdPending';
    return commandResultCode(commandErrorKey(result.error));
  }

  return [
    {
      method: 'get',
      path: '/server',
      cap: 'serverRead',
      handle: async (req, res) => {
        const principal = me(res);
        const [{ status }, agent, perfRows] = await Promise.all([
          ctx.live.snapshot(),
          ctx.agent.send('status', {}, principal.steamId),
          ctx.perf.read(),
        ]);
        const parsed = agent.ok ? parseAgentStatus(agent.data) : null;
        renderAdmin(req, res, 'server', {
          current: 'server',
          status,
          agent: parsed,
          agentError: parsed ? null : agent.ok ? 'failed' : commandErrorKey(agent.error),
          agentDetail: agent.ok ? null : failureDetail(agent.data),
          logSources: LOG_SOURCES,
          maxLines: MAX_LOG_LINES,
          perf:
            perfRows === null
              ? null
              : { summary: summarize(perfRows), chart: perfChart(perfRows, ctx.now().getTime()) },
        });
      },
    },
    {
      method: 'get',
      path: '/server/logs',
      cap: 'serverRead',
      handle: async (req, res) => {
        const principal = me(res);
        const query = logsQuery.parse(req.query);
        const result = await ctx.agent.send(
          'logs',
          { source: query.source, lines: query.lines },
          principal.steamId,
        );
        const lines = result.ok ? parseLogLines(result.data) : null;
        renderAdmin(req, res, 'server-logs', {
          current: 'server',
          query,
          logSources: LOG_SOURCES,
          maxLines: MAX_LOG_LINES,
          lines,
          error: result.ok ? (lines ? null : 'failed') : commandErrorKey(result.error),
          detail: result.ok ? null : failureDetail(result.data),
        });
      },
    },
    ...(['start', 'stop', 'restart', 'update'] as const).map((action): AdminRoute => ({
      method: 'post',
      path: `/server/${action}`,
      cap: 'serverControl',
      handle: async (_req, res) => {
        done(res, '/admin/server', await control(action, me(res).steamId));
      },
    })),
  ];
}
