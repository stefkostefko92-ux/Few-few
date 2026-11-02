import type { Request, Response } from 'express';
import { principalOf, sendError } from '../auth/guards.js';
import type { Capability } from '../auth/roles.js';
import { inScope, scopeFor, spansAziende, type Scope } from '../auth/scope.js';
import { activeAziende, allAziendeNames, isAziendaId } from '../aziende/service.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';
import { getScheda, type SchedaFull } from '../schede/service.js';

/** Общото на маршрутите за карти и кошчето: обхватът на човека, заявката, филтърът, 404. */

/** Обхватът за способността — ролята на човека е различна за всяка фирма. */
export function scope(req: Request, capability: Capability): Scope {
  return scopeFor(principalOf(req).user, capability);
}

export function queryOf(req: Request): string {
  const q = req.query.q;
  return typeof q === 'string' ? q.slice(0, MAX_QUERY_LENGTH) : '';
}

/** Филтърът по фирма — когато обхватът е повече от една фирма; фирма извън обхвата не се приема. */
export function aziendaFilterOf(req: Request, userScope: Scope): string | null {
  const value = req.query.azienda;
  return spansAziende(userScope) && isAziendaId(value) && inScope(userScope, value) ? value : null;
}

/** Фирмите за филтъра и колоната „Azienda“: всички за MASTER, иначе тези от обхвата (поне две). */
export async function aziendeOf(
  req: Request,
  userScope: Scope,
): Promise<Array<{ id: string; name: string }>> {
  if (userScope.all) return allAziendeNames();
  if (userScope.aziendaIds.length < 2) return [];
  return principalOf(req)
    .user.memberships.filter((m) => userScope.aziendaIds.includes(m.aziendaId))
    .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
}

/** Фирмите, в които човекът може да създаде карта: всички активни за MASTER, иначе тези с право на запис. */
export async function writableAziende(req: Request): Promise<Array<{ id: string; name: string }>> {
  const userScope = scope(req, 'schede:write');
  if (userScope.all) return activeAziende();
  return principalOf(req)
    .user.memberships.filter((m) => userScope.aziendaIds.includes(m.aziendaId))
    .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
}

/** Чужда или липсваща карта — „няма такава“, не „забранено“. */
export function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}

/** Картата от адреса, в обхвата; изтритата — само за тези, които виждат кошчето на нейната фирма. */
export async function loadScheda(req: Request): Promise<SchedaFull | null> {
  return getScheda(scope(req, 'schede:read'), String(req.params.id), scope(req, 'schede:trash'));
}
