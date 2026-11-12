import type { NextFunction, Request, Response } from 'express';
import { isPartial } from '../auth/guards.js';
import { daAccettare, inAttesa } from '../legale/stato.js';
import { errorMessage, logger } from '../logger.js';
import { pubblicazioni } from './registro.js';
import { MAX_POPUP, nonLette, type VoceNovita } from './voci.js';

/** Какво носи прозорецът на новините (views/partials/novita.ejs). */
export interface NovitaPopup {
  voci: VoceNovita[];
  /** Още колко, които не се събират — връзка към страницата. */
  altre: number;
  /** Страницата, към която води „Ho capito“ без JavaScript. */
  torna: string;
}

/** Цяла страница, отворена от браузъра — не картинка, PDF, `fetch` или парче. */
const vuolePagina = (req: Request): boolean =>
  req.method === 'GET' && !isPartial(req) && (req.get('accept') ?? '').includes('text/html');

/**
 * Прозорецът на новините (собственикът, 10 ноември 2026 — „al primo accesso … dopo ogni aggiornamento …
 * dal suo ultimo accesso“): на вписан човек, на цяла страница, новините, излезли след последното му
 * „Ho capito“. Стои, докато не го натисне (или не затвори прозореца) — чак тогава са прочетени. Грешка
 * тук не спира страницата: тогава прозорец няма.
 */
export async function novitaLocals(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.locals.novitaPopup = null;
  const user = req.principal?.user;
  const lette = user?.novitaLetteAt;
  // Който трябва да смени паролата или да приеме условията, вижда само това — новините го чакат след него.
  if (!lette || user.mustChangePassword || inAttesa(daAccettare(user)) || !vuolePagina(req)) {
    next();
    return;
  }
  try {
    const voci = nonLette(await pubblicazioni(), lette);
    if (voci.length > 0) {
      res.locals.novitaPopup = {
        voci: voci.slice(0, MAX_POPUP),
        altre: Math.max(0, voci.length - MAX_POPUP),
        torna: req.originalUrl,
      } satisfies NovitaPopup;
    }
  } catch (error) {
    logger.warn({ err: errorMessage(error) }, 'новините не се прочетоха');
  }
  next();
}
