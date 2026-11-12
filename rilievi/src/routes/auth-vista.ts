import type { Request, Response } from 'express';
import { issuePreCsrf } from '../auth/guards.js';

/** Страниците с токен и входът не се кешират никъде (споделен компютър, прокси). */
export function noStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

/** Страницата за вход — от входа (auth.ts) и от втората стъпка (auth-codice.ts), когато тя спре. */
export function renderLogin(
  req: Request,
  res: Response,
  status: number,
  view: {
    email: string;
    next: string;
    error: string | null;
    errorParams?: Record<string, string | number>;
  },
): void {
  noStore(res);
  res
    .status(status)
    .render('auth/login', { preCsrf: issuePreCsrf(req, res), errorParams: {}, ...view });
}
