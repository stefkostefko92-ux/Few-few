import type { Request } from 'express';

/**
 * Стойността на бисквитка като низ. cookie-parser разчита стойност с `j:` като JSON и дава обект или
 * масив — нашите бисквитки са само низове, затова всичко друго е подправено и се приема за липсващо.
 */
export function readCookie(req: Request, name: string): string | undefined {
  const cookies: Record<string, unknown> | undefined = req.cookies;
  if (!cookies || !Object.hasOwn(cookies, name)) return undefined;
  const value = cookies[name];
  return typeof value === 'string' ? value : undefined;
}
