import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import type { WiredDeps } from '../app.js';
import { principalOf, requireCapability, requireUser } from '../auth/guards.js';
import type { StreamSink } from './hub.js';

/**
 * GET /api/v1/events — поток в реално време (SSE, text/event-stream) със сесийната бисквитка
 * (§13.3, NFR-11). Само GET; без тяло; без CSRF (не променя нищо).
 *
 * - Събития: message.created · message.updated · conversation.updated · presence.changed ·
 *   notification.created · case.assigned · case.updated · step.updated · queue.updated (само за
 *   персонала); всяко с tenant_id, conversation_id?, actor_id, timestamp, schema_version; `id:` е
 *   монотонен в процеса.
 * - На `hub.heartbeatMs` (25 s): коментар `: hb` + повторна проверка на сесията (отнета, изтекла,
 *   деактивиран акаунт → потокът се затваря). Изход и всяко `revokeUserSessions` го затварят веднага.
 * - Fallback (§12.4): буфер за пропуснати събития НЯМА. При reconnect клиентът презарежда
 *   през REST — `GET /conversations` (непрочетени), `GET /conversations/:id/messages?after=<последно
 *   видяно>`, `GET /notifications`. Потокът е ускорител, източникът на истината е REST.
 * - Един процес: хъбът е в паметта; втори процес иска pub/sub (CLAUDE.md).
 */

async function sessionLive(db: PrismaClient, sessionId: string): Promise<boolean> {
  const s = await db.session.findUnique({
    where: { id: sessionId },
    select: {
      revokedAt: true,
      expiresAt: true,
      user: { select: { active: true, expiresAt: true } },
    },
  });
  const now = new Date();
  return (
    s !== null &&
    s.revokedAt === null &&
    s.expiresAt > now &&
    s.user.active &&
    (s.user.expiresAt === null || s.user.expiresAt > now)
  );
}

export function eventsRouter(deps: WiredDeps): Router {
  const router = Router();

  router.get('/events', requireUser, requireCapability('conversation:use'), (req, res) => {
    const p = principalOf(req);
    let open = true;
    let timer: NodeJS.Timeout | undefined;
    let detach = (): void => undefined;
    const finish = () => {
      if (!open) return;
      open = false;
      if (timer) clearInterval(timer);
      detach();
      res.end();
    };
    const sink: StreamSink = {
      userId: p.user.id,
      sessionId: p.session.id,
      tenantId: p.user.tenantId,
      write: (chunk) => {
        if (open) res.write(chunk);
      },
      end: finish,
    };

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Nginx не буферира потока (настройката на проксито е отделно, в deploy/).
    res.setHeader('X-Accel-Buffering', 'no');
    // Записваме потока ПРЕДИ заглавките: щом клиентът ги получи, вече е абониран.
    detach = deps.hub.attach(sink);
    res.flushHeaders();
    res.write(`retry: 5000\n: connected\n\n`);

    timer = setInterval(() => {
      sessionLive(deps.db, p.session.id)
        .then((live) => (live ? sink.write(': hb\n\n') : finish()))
        .catch(() => finish());
    }, deps.hub.heartbeatMs);
    timer.unref();
    // res, не req: в Node ≥16 „close“ на заявката идва веднага след прочитането ѝ.
    res.on('close', finish);
  });

  return router;
}
