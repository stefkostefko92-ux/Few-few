import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../auth/guards.js';
import { startSession } from '../auth/sessions.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import {
  acceptMemberInvite,
  findMemberInvite,
  MemberError,
  type OpenMemberInvite,
} from '../accounts/members.js';
import { requestRateKey } from '../http/ip.js';
import { MINUTE } from '../time.js';

/** Връзката е ключ: 20 опита за 15 минути от адрес. */
const limiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: requestRateKey,
});

const NewMemberForm = z.object({
  name: z.string().max(100),
  password: z.string().max(PASSWORD_MAX_LENGTH),
  acceptTerms: z.literal('on'),
});

type State = 'create' | 'login' | 'accept' | 'wrongAccount';

function stateFor(req: Request, invite: OpenMemberInvite): State {
  const principal = req.principal;
  if (principal?.verified) return principal.user.email === invite.email ? 'accept' : 'wrongAccount';
  return invite.existingUser ? 'login' : 'create';
}

function render(
  res: Response,
  status: number,
  view: {
    invite: OpenMemberInvite;
    token: string;
    state: State;
    errors?: Record<string, string>;
    name?: string;
  },
): void {
  res
    .status(status)
    .set('Cache-Control', 'no-store')
    .set('Referrer-Policy', 'no-referrer')
    .render('auth/member-invite', { errors: {}, name: '', ...view });
}

/** Поканата за член на фирмата (SPEC 45): `/chlen/<токен>`. Невалидна връзка е 404. */
export function memberInviteRouter(): Router {
  const router = Router();

  router.get('/chlen/:token', limiter, async (req, res) => {
    const token = String(req.params['token']);
    const invite = await findMemberInvite(token);
    if (!invite) throw new HttpError(404);
    render(res, 200, { invite, token, state: stateFor(req, invite) });
  });

  router.post('/chlen/:token', limiter, async (req, res) => {
    const token = String(req.params['token']);
    const invite = await findMemberInvite(token);
    if (!invite) throw new HttpError(404);
    const state = stateFor(req, invite);
    if (state === 'wrongAccount') return render(res, 403, { invite, token, state });
    if (state === 'login') return render(res, 409, { invite, token, state });
    const body = req.body as Record<string, unknown>;
    const name = typeof body['name'] === 'string' ? body['name'].slice(0, 100) : '';
    try {
      if (state === 'accept') {
        const result = await acceptMemberInvite({
          token,
          user: { userId: req.principal!.user.id },
        });
        return res.redirect(303, `/app/o/${result.organizationId}`);
      }
      const parsed = NewMemberForm.safeParse(body);
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? 'form');
          errors[field] ??= field === 'acceptTerms' ? 'acceptTerms' : 'invalid';
        }
        return render(res, 400, { invite, token, state, errors, name });
      }
      const result = await acceptMemberInvite({
        token,
        user: { name: parsed.data.name, password: parsed.data.password },
      });
      await startSession(res, { id: result.userId, platformRole: 'NONE' }, true);
      res.redirect(303, `/app/o/${result.organizationId}`);
    } catch (error) {
      if (!(error instanceof MemberError)) throw error;
      if (error.code === 'invalid' || error.code === 'notFound') throw new HttpError(404);
      if (error.code === 'loginRequired')
        return render(res, 409, { invite, token, state: 'login' });
      if (error.code === 'wrongEmail')
        return render(res, 403, { invite, token, state: 'wrongAccount' });
      if (error.code === 'alreadyMember') {
        return render(res, 409, { invite, token, state, errors: { form: 'alreadyMember' }, name });
      }
      const field = error.code === 'invalidName' ? 'name' : 'password';
      render(res, 400, { invite, token, state, errors: { [field]: error.code }, name });
    }
  });

  return router;
}
