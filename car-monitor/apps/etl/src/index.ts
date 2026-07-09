// car-monitor-etl — cron-only worker (по модела на `sigma-etl`).
// На всеки 6 часа освежава малък скорошен прозорец. Голям catchup е CLI-based
// (`pnpm import --catchup`).

import { config } from "@car-monitor/config";
import { runRefresh, type Env, type RefreshWindow } from "./refresh.ts";

function recentWindow(days: number): RefreshWindow {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);
  return { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}

export default {
  // Планиран (cron) refresh.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runRefresh(env, recentWindow(config.refreshWindowDays)).then(() => undefined));
  },

  // Ръчно задействане за дебъг: GET /?days=3
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") ?? config.refreshWindowDays);
    const result = await runRefresh(env, recentWindow(Number.isFinite(days) ? days : 3));
    return Response.json(result);
  },
} satisfies ExportedHandler<Env>;
