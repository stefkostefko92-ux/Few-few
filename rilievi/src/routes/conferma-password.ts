import type { Request, Response } from 'express';
import { principalOf } from '../auth/guards.js';
import { clearSessionCookie } from '../auth/sessions.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { reauthPassword } from '../services/reauth.js';

/**
 * Паролата на вписания човек преди действие, което откраднатата сесия не бива да може само (износ на всичко,
 * нов SMTP сървър, смяна на доставчика): полето `password` на формата, проверено през `reauthPassword` — опитът
 * се брои в заключването. `bloccato`: акаунтът се заключи и сесиите паднаха — отговорът (към входа) вече е пратен.
 */
export async function confermaPassword(
  req: Request,
  res: Response,
  /** Името на полето: `password` е заето във формата на пощата (ключът на SMTP). */
  campo = 'password',
): Promise<'ok' | 'errata' | 'bloccato'> {
  const raw = (req.body as Record<string, unknown> | undefined)?.[campo];
  const password = typeof raw === 'string' ? raw : '';
  if (!password) return 'errata';
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: principalOf(req).user.id },
    select: { id: true, passwordHash: true },
  });
  const esito = await reauthPassword(user, password);
  if (esito === 'locked') {
    clearSessionCookie(res);
    setFlash(res, 'error', 'flash.bloccatoSessione');
    res.redirect(303, '/accesso');
    return 'bloccato';
  }
  return esito === 'wrong' ? 'errata' : 'ok';
}
