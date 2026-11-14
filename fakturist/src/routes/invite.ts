import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../auth/guards.js';
import { startSession } from '../auth/sessions.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import {
  acceptTransferInvite,
  findOpenInvite,
  TransferError,
  type OpenInvite,
} from '../accounts/transfer.js';
import { requestRateKey } from '../http/ip.js';
import { MINUTE } from '../time.js';

/** Като входа: 10 неуспешни заявки за 15 минути от адрес (IPv6 — по /64). */
const limiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: requestRateKey,
});

const NewOwnerForm = z.object({
  name: z.string().max(100),
  password: z.string().max(PASSWORD_MAX_LENGTH),
  acceptTerms: z.literal('on'),
});

type InviteState = 'create' | 'login' | 'accept' | 'wrongAccount';

/** Какво вижда човекът с връзката: вписан с имейла от поканата, с друг, или без вход. */
function stateFor(req: Request, invite: OpenInvite): InviteState {
  const principal = req.principal;
  if (principal?.verified) return principal.user.email === invite.email ? 'accept' : 'wrongAccount';
  return invite.existingUser ? 'login' : 'create';
}

function render(
  res: Response,
  status: number,
  view: {
    invite: OpenInvite;
    token: string;
    state: InviteState;
    errors?: Record<string, string>;
    name?: string;
  },
): void {
  res.status(status).render('auth/invite', { errors: {}, name: '', ...view });
}

/**
 * Поканата за прехвърляне на фирма (src/accounts/transfer.ts). Токенът е в адреса — страницата не се
 * кешира. Невалидна, използвана или изтекла връзка е 404 (не издаваме коя е причината).
 */
export function inviteRouter(): Router {
  const router = Router();

  router.get('/pokana/:token', limiter, async (req, res) => {
    const token = String(req.params['token']);
    const invite = await findOpenInvite(token);
    if (!invite) throw new HttpError(404);
    res.set('Cache-Control', 'no-store');
    render(res, 200, { invite, token, state: stateFor(req, invite) });
  });

  router.post('/pokana/:token', limiter, async (req, res) => {
    const token = String(req.params['token']);
    const invite = await findOpenInvite(token);
    if (!invite) throw new HttpError(404);
    res.set('Cache-Control', 'no-store');
    const state = stateFor(req, invite);
    if (state === 'wrongAccount') return render(res, 403, { invite, token, state });
    if (state === 'login') return render(res, 409, { invite, token, state });
    const body = req.body as Record<string, unknown>;
    const name = typeof body['name'] === 'string' ? body['name'].slice(0, 100) : '';
    try {
      if (state === 'accept') {
        const result = await acceptTransferInvite({
          token,
          user: { userId: req.principal!.user.id },
          confirmMandate: body['confirmMandate'] === 'on',
        });
        return res.redirect(303, `/app/o/${result.organizationId}`);
      }
      const parsed = NewOwnerForm.safeParse(body);
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? 'form');
          errors[field] ??= field === 'acceptTerms' ? 'acceptTerms' : 'invalid';
        }
        return render(res, 400, { invite, token, state, errors, name });
      }
      const result = await acceptTransferInvite({
        token,
        user: { name: parsed.data.name, password: parsed.data.password },
        confirmMandate: body['confirmMandate'] === 'on',
      });
      await startSession(res, { id: result.userId, platformRole: 'NONE' }, true);
      res.redirect(303, `/app/o/${result.organizationId}`);
    } catch (error) {
      if (!(error instanceof TransferError)) throw error;
      if (error.code === 'invalid' || error.code === 'notFound') throw new HttpError(404);
      if (error.code === 'loginRequired')
        return render(res, 409, { invite, token, state: 'login' });
      // Служител на поканилата кантора не става собственик на клиента ѝ.
      if (error.code === 'firmMember') {
        return render(res, 403, { invite, token, state, errors: { form: 'firmMember' }, name });
      }
      if (error.code === 'wrongEmail') {
        return render(res, 403, { invite, token, state: 'wrongAccount' });
      }
      const field = error.code === 'invalidName' ? 'name' : 'password';
      render(res, 400, { invite, token, state, errors: { [field]: error.code }, name });
    }
  });

  return router;
}
