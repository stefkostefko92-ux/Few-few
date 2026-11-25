import type { NextFunction, Request, Response } from 'express';

/**
 * Знаците, които PostgreSQL отказва в TEXT/JSONB (0x00) и които нямат място в документ (управляващите
 * без табулация и нови редове). Браузърна форма не ги праща — заявка с тях е 400, не 500 от базата.
 */
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export function hasForbiddenChars(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (typeof value === 'string') return FORBIDDEN.test(value);
  if (Array.isArray(value)) return value.some((item) => hasForbiddenChars(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, item]) => FORBIDDEN.test(key) || hasForbiddenChars(item, depth + 1),
    );
  }
  return false;
}

/** След разчитането на тялото (форма или JSON): управляващ знак → `onBad` (400 по пътя). */
export function rejectControlChars(
  onBad: (req: Request, res: Response, next: NextFunction) => void,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (hasForbiddenChars(req.body)) return onBad(req, res, next);
    next();
  };
}
