import type { NextFunction, Request, Response } from 'express';
import { isPartial } from '../auth/guards.js';
import { daAccettare, inAttesa } from '../legale/stato.js';
import { errorMessage, logger } from '../logger.js';
import { comunicazioniPer } from './comunicazioni.js';

/**
 * Лентите със съобщенията на MASTER над страницата (views/partials/comunicazioni.ejs) — на вписан човек,
 * на цяла страница, докато не ги затвори. Който още трябва да смени паролата или да приеме условията,
 * не ги вижда (вижда само това). Грешка тук не спира страницата: тогава ленти няма.
 */
export async function comunicazioniLocals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  res.locals.comunicazioni = [];
  const user = req.principal?.user;
  const pagina =
    req.method === 'GET' && !isPartial(req) && (req.get('accept') ?? '').includes('text/html');
  if (!user || user.master || user.mustChangePassword || inAttesa(daAccettare(user)) || !pagina) {
    next();
    return;
  }
  try {
    res.locals.comunicazioni = await comunicazioniPer(user);
    // Без JavaScript „Chiudi“ връща на същата страница (`safeNext` пак проверява пътя).
    res.locals.comunicazioniTorna = req.originalUrl;
  } catch (error) {
    logger.warn({ err: errorMessage(error) }, 'съобщенията не се прочетоха');
  }
  next();
}
