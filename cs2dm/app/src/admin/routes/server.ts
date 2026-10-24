import { z } from 'zod';
import { audit } from '../audit.js';
import { commandErrorKey } from '../commands.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { commandResultCode, first, type ResultCode } from '../forms.js';
import { done, renderAdmin } from '../render.js';
import {
  LOG_SOURCES,
  MAX_LOG_LINES,
  failureDetail,
  parseAgentStatus,
  parseLogLines,
} from '../server-data.js';

/**
 * Сървърът през cs2-agent на хоста (§9): статус и логове — ADMIN+, рестарт и ъпдейт — HEADADMIN+.
 * Сайтът е в Docker и не пипа systemd; агентът изпълнява само затворения си списък и вярва само на
 * подписа с CS2DM_AGENT_KEY. Правото се проверява тук, ПРЕДИ подписа.
 */
const logsQuery = z.object({
  source: z.preprocess(first, z.enum(LOG_SOURCES)).catch('css'),
  lines: z.preprocess(first, z.coerce.number().int().min(10).max(MAX_LOG_LINES)).catch(100),
});

/**
 * Рестартът: агентът чака systemd до 120 s, преди да отговори, а nginx реже заявката на 30 s —
 * затова чакаме 25 s и мълчанието не е грешка, а „още тече“ (статусът показва `busy`).
 */
export const RESTART_WAIT_MS = 25_000;

export function serverRoutes(ctx: AdminCtx): AdminRoute[] {
  async function control(action: 'restart' | 'update', actor: string): Promise<ResultCode> {
    const result = await ctx.agent.send(
      action,
      {},
      actor,
      action === 'restart' ? { timeoutMs: RESTART_WAIT_MS } : {},
    );
    await audit(ctx.db, {
      actor,
      action: `server.${action}`,
      details: { ok: result.ok, ...(result.ok ? {} : { error: commandErrorKey(result.error) }) },
    });
    if (result.ok) return 'sent';
    if (action === 'restart' && result.error === 'timeout') return 'cmdPending';
    return commandResultCode(commandErrorKey(result.error));
  }

  return [
    {
      method: 'get',
      path: '/server',
      cap: 'serverRead',
      handle: async (req, res) => {
        const principal = me(res);
        const [{ status }, agent] = await Promise.all([
          ctx.live.snapshot(),
          ctx.agent.send('status', {}, principal.steamId),
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
    {
      method: 'post',
      path: '/server/restart',
      cap: 'serverControl',
      handle: async (_req, res) => {
        done(res, '/admin/server', await control('restart', me(res).steamId));
      },
    },
    {
      method: 'post',
      path: '/server/update',
      cap: 'serverControl',
      handle: async (_req, res) => {
        done(res, '/admin/server', await control('update', me(res).steamId));
      },
    },
  ];
}
