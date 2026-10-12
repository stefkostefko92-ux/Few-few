import type { Request, Response } from 'express';
import { principalOf, sendError } from '../auth/guards.js';
import { scopeOf, type Scope } from '../auth/scope.js';
import { isAziendaId } from '../aziende/service.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';

/** Общото на маршрутите за карти и кошчето: обхватът на човека, заявката, филтърът, 404. */

export function scope(req: Request): Scope {
  return scopeOf(principalOf(req).user);
}

export function queryOf(req: Request): string {
  const q = req.query.q;
  return typeof q === 'string' ? q.slice(0, MAX_QUERY_LENGTH) : '';
}

/** Филтърът по фирма — само за MASTER; за останалите обхватът вече е тяхната фирма. */
export function aziendaFilterOf(req: Request): string | null {
  const value = req.query.azienda;
  return scope(req).all && isAziendaId(value) ? value : null;
}

/** Чужда или липсваща карта — „няма такава“, не „забранено“. */
export function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}
