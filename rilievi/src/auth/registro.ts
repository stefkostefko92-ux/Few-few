import type { Prisma, Role } from '@prisma/client';
import type { SessionUser } from '../types.js';
import { ALL_ROLES, ROLE_LEVEL } from './roles.js';
import { aziendaWhere, roleIn, type Scope } from './scope.js';

/**
 * Кои записи от регистъра вижда човекът (собственикът, 30 октомври 2026: „vedere il registro con le
 * cose che fanno gli altri con ruolo inferiore al proprio“): MASTER — всички; иначе във всяка фирма от
 * обхвата си — своите действия и тези на хората, чиято роля в същата фирма е под неговата. Не вижда
 * равните и по-високите, MASTER и автор, който вече не е във фирмата (ролята му не се знае).
 */

/** Ролите под тази (никога MASTER). */
export const ruoliSotto = (role: Role): Role[] =>
  ALL_ROLES.filter((r) => r !== 'MASTER' && ROLE_LEVEL[r] > ROLE_LEVEL[role]);

export function registroWhere(
  viewer: Pick<SessionUser, 'id' | 'master' | 'memberships'>,
  scope: Scope,
  filter: string | null,
): Prisma.AuditLogWhereInput {
  if (viewer.master || scope.all) return aziendaWhere(scope, filter);
  const ids = aziendaWhere(scope, filter).aziendaId;
  const aziende = typeof ids === 'string' ? [ids] : (ids?.in ?? []);
  if (aziende.length === 0) return { aziendaId: { in: [] } };
  return {
    OR: aziende.map((aziendaId) => {
      const role = roleIn(viewer, aziendaId);
      const sotto = role ? ruoliSotto(role) : [];
      return {
        aziendaId,
        OR: [
          { actorId: viewer.id },
          { actor: { memberships: { some: { aziendaId, role: { in: sotto } } } } },
        ],
      };
    }),
  };
}
