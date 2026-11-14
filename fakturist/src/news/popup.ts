import type { NextFunction, Request, Response } from 'express';
import { errorMessage, logger } from '../logger.js';
import { publishedNews } from './registry.js';
import { MAX_POPUP, unread, type NewsEntry } from './entries.js';

/** Какво носи прозорецът „Какво ново“ (views/partials/news-popup.ejs). */
export interface NewsPopup {
  entries: NewsEntry[];
  /** Още колко, които не се събират — връзка към страницата. */
  more: number;
  /** Страницата, към която води „Разбрах“ без JavaScript. */
  back: string;
}

/** Цяла страница на приложението, отворена от браузъра — не PDF, XML, ZIP или `fetch`. */
const wantsPage = (req: Request): boolean =>
  req.method === 'GET' && (req.get('accept') ?? '').includes('text/html');

/**
 * Прозорецът „Какво ново“ (собственикът, 14.11.2026 — „при ъпдейт … popup като в rilievi на първото влизане
 * на всеки user след дадения ъпдейт“): на вписан човек, на цяла страница от приложението, новините,
 * излезли след последното му „Разбрах“. Стои, докато не го натисне (или не затвори прозореца). Който
 * трябва да смени паролата, вижда само това. Грешка тук не спира страницата — тогава прозорец няма.
 */
export async function newsLocals(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.locals.newsPopup = null;
  const user = req.principal?.user;
  if (!user || !req.principal?.verified || user.mustChangePassword || !wantsPage(req)) {
    next();
    return;
  }
  try {
    const entries = unread(await publishedNews(), user.newsReadAt);
    if (entries.length > 0) {
      res.locals.newsPopup = {
        entries: entries.slice(0, MAX_POPUP),
        more: Math.max(0, entries.length - MAX_POPUP),
        back: req.originalUrl,
      } satisfies NewsPopup;
    }
  } catch (error) {
    logger.warn({ err: errorMessage(error) }, 'новините не се прочетоха');
  }
  next();
}
