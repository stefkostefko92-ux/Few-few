import type { Role } from '@prisma/client';
import type { Audience } from '../retrieval/types.js';

/**
 * Матрицата на достъп (§12.4) като способности. Ролите не са стълба: инженерингът вижда
 * повече документи от поддръжката, но не управлява потребители; администраторът на клиента
 * управлява потребители, но не вижда вътрешна техническа документация (§12.4 „contenuti
 * tecnici solo se autorizzati dal ruolo“).
 */

export type Capability =
  | 'case:create'
  | 'case:readAll' // всички случаи на клиента (триаж); иначе — само свои/възложени
  | 'chat:ask'
  | 'ticket:create'
  | 'feedback:create'
  | 'device:readAll' // всички табла на клиента; иначе — само на своята фирма
  | 'kb:manage' // качване, преглед, публикуване, отписване (§4.1)
  | 'audit:read';

const TECH: readonly Capability[] = ['case:create', 'chat:ask', 'ticket:create', 'feedback:create'];

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  PORTAL_TECHNICIAN: TECH,
  INTERNAL_TECHNICIAN: [...TECH, 'device:readAll'],
  SUPPORT: [...TECH, 'case:readAll', 'device:readAll'],
  ENGINEERING: [...TECH, 'case:readAll', 'device:readAll'],
  KNOWLEDGE_OWNER: [...TECH, 'case:readAll', 'device:readAll', 'kb:manage'],
  TENANT_ADMIN: ['case:readAll', 'device:readAll', 'audit:read'],
  PLATFORM_ADMIN: ['audit:read'],
};

const AUDIENCES: Record<Role, readonly Audience[]> = {
  PORTAL_TECHNICIAN: ['PORTAL'],
  INTERNAL_TECHNICIAN: ['PORTAL', 'INTERNAL'],
  SUPPORT: ['PORTAL', 'INTERNAL'],
  ENGINEERING: ['PORTAL', 'INTERNAL', 'ENGINEERING'],
  KNOWLEDGE_OWNER: ['PORTAL', 'INTERNAL', 'ENGINEERING'],
  TENANT_ADMIN: ['PORTAL'],
  PLATFORM_ADMIN: [],
};

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

export function audiencesFor(role: Role): readonly Audience[] {
  return AUDIENCES[role];
}

/**
 * Аудиториите за търсене в конкретен случай: на питащия, но в портален случай — само PORTAL,
 * който и да пита (AC-18).
 */
export function caseAudiences(role: Role, portalCase: boolean): readonly Audience[] {
  const own = audiencesFor(role);
  return portalCase ? own.filter((a) => a === 'PORTAL') : own;
}
