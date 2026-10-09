import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { apiError, principalOf } from '../auth/guards.js';
import type { TotpReplayGuard } from '../auth/mfa.js';
import { announceRevocation } from '../auth/sessions.js';
import { eraseSubject, exportSubject } from '../services/subject.js';
import { directoryView, isErased, PROBLEM_STATUS, targetProblem } from '../services/users.js';
import { Reason, usersGuard } from './admin-users.js';

/** Права на субекта (GDPR чл. 15/17/20) — изпълнява ги администраторът на клиента по искане. */

const Id = z.string().min(1).max(40);
const Erase = z.object({ reason: Reason }).strict();

export function adminSubjectRouter(deps: AppDeps, replay: TotpReplayGuard): Router {
  const router = Router();
  const guard = usersGuard(deps);

  router.get('/admin/users/:id/export', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const target = await deps.db.user.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
        select: { id: true, role: true },
      });
      if (!target) return apiError(res, 404, 'not_found');
      // Чужд по-висок ранг (платформеният администратор) не се изнася от администратора на клиента.
      const problem = targetProblem(p.user, target, { allowSelf: true });
      if (problem) return apiError(res, PROBLEM_STATUS[problem] ?? 403, problem);
      const data = await exportSubject(deps.db, p.user.tenantId, target.id);
      if (!data) return apiError(res, 404, 'not_found');
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'user.export',
        objectType: 'user',
        objectId: target.id,
      });
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="chatchat-export-${target.id}.json"`,
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/users/:id/erase', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = Erase.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const target = await deps.db.user.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
      });
      if (!target) return apiError(res, 404, 'not_found');
      const problem = targetProblem(p.user, target) ?? (isErased(target) ? 'user_erased' : null);
      if (problem) return apiError(res, PROBLEM_STATUS[problem] ?? 403, problem);
      const revocation = await eraseSubject(deps.db, p.user, target, body.data.reason);
      replay.forget(target.id);
      await announceRevocation(revocation);
      const erased = await deps.db.user.findUniqueOrThrow({
        where: { id: target.id },
        include: { company: { select: { id: true, name: true } } },
      });
      res.json({ user: directoryView(erased) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
