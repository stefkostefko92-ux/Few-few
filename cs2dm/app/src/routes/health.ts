import { Router } from 'express';

/** Проверките са подадени отвън — тестът подава паднала база и вижда 503. */
export interface HealthChecks {
  db(): Promise<void>;
  redis(): Promise<void>;
}

const TIMEOUT_MS = 2000;

async function passes(check: () => Promise<void>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function healthRouter(checks: HealthChecks): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    const [db, redis] = await Promise.all([passes(checks.db), passes(checks.redis)]);
    const ok = db && redis;
    res
      .status(ok ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({
        status: ok ? 'ok' : 'degraded',
        db: db ? 'ok' : 'fail',
        redis: redis ? 'ok' : 'fail',
      });
  });
  return router;
}
