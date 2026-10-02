import type { Request, Response } from 'express';
import { principalOf } from '../../auth/guards.js';
import { setFlash } from '../../http/flash.js';
import { requestMeta } from '../../http/meta.js';
import type { ActionResult, StaffActor } from '../../services/admin-common.js';

/** Актьорът за одита и за проверката на ранга — винаги човекът зад сесията. */
export function staffActor(req: Request): StaffActor {
  const principal = principalOf(req);
  return {
    type: 'HUMAN',
    id: principal.user.id,
    role: principal.user.role,
    label: `${principal.user.name} <${principal.user.email}>`,
    ip: requestMeta(req).ip,
  };
}

/** След действие: съобщение и обратно на страницата на акаунта (или подадения път). */
export function finish(res: Response, result: ActionResult, okKey: string, path: string): void {
  setFlash(res, result.ok ? 'ok' : 'error', result.ok ? okKey : result.key);
  res.redirect(path);
}

export function idParam(req: Request): string {
  const id = String(req.params.id ?? '');
  return /^[a-z0-9]{20,40}$/.test(id) ? id : '';
}

export function bool(body: unknown, key: string): boolean {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return value === 'yes' || value === 'on' || value === 'true';
}
