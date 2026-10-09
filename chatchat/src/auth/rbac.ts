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
  | 'case:assign' // поемане на случай като оператор (FR-19)
  | 'chat:ask'
  | 'ticket:create'
  | 'feedback:create'
  | 'device:readAll' // всички табла на клиента; иначе — само на своята фирма
  | 'kb:manage' // качване, преглед, публикуване, отписване (§4.1)
  | 'users:manage' // директория, роли, срокове, нулиране, права на субекта (FR-22/23/25)
  | 'audit:read';

/** Всички роли (за zod на входа: API, CLI, филтри). */
export const ROLES = [
  'PORTAL_TECHNICIAN',
  'INTERNAL_TECHNICIAN',
  'SUPPORT',
  'ENGINEERING',
  'KNOWLEDGE_OWNER',
  'TENANT_ADMIN',
  'PLATFORM_ADMIN',
] as const satisfies readonly Role[];

/** Видът на акаунта следва ролята: порталният техник е външен (фирма), всички други — вътрешни. */
export function kindForRole(role: Role): 'PORTAL' | 'INTERNAL' {
  return role === 'PORTAL_TECHNICIAN' ? 'PORTAL' : 'INTERNAL';
}

const TECH: readonly Capability[] = ['case:create', 'chat:ask', 'ticket:create', 'feedback:create'];

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  PORTAL_TECHNICIAN: TECH,
  INTERNAL_TECHNICIAN: [...TECH, 'device:readAll'],
  SUPPORT: [...TECH, 'case:readAll', 'case:assign', 'device:readAll'],
  ENGINEERING: [...TECH, 'case:readAll', 'case:assign', 'device:readAll'],
  KNOWLEDGE_OWNER: [...TECH, 'case:readAll', 'case:assign', 'device:readAll', 'kb:manage'],
  TENANT_ADMIN: ['case:readAll', 'device:readAll', 'users:manage', 'audit:read'],
  // Платформеният администратор управлява потребители САМО в своя клиент (по tenantId като всички):
  // клиентите на платформата се създават и спасяват от сървъра (cli/tenant.ts), не през уеб.
  PLATFORM_ADMIN: ['users:manage', 'audit:read'],
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

/**
 * Персоналът ТРЯБВА да има втори фактор (TOTP): без него до способностите си не стига. Техниците
 * (портални и вътрешни) — по желание; включен ли е, се иска при всеки вход.
 */
const MFA_REQUIRED: ReadonlySet<Role> = new Set<Role>([
  'SUPPORT',
  'ENGINEERING',
  'KNOWLEDGE_OWNER',
  'TENANT_ADMIN',
  'PLATFORM_ADMIN',
]);

export function mfaRequired(role: Role): boolean {
  return MFA_REQUIRED.has(role);
}

/**
 * Ранг за управлението на потребители: администраторът не дава роля над своята и не пипа акаунт
 * с по-висок ранг. Останалите роли са равни (0) — техническите права не са йерархия.
 */
export function roleRank(role: Role): number {
  return role === 'PLATFORM_ADMIN' ? 2 : role === 'TENANT_ADMIN' ? 1 : 0;
}

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

/** Читателят вижда AI отговор само ако има ВСИЧКИ аудитории, с които е търсено за него. */
export function coversAudiences(
  reader: readonly Audience[],
  message: readonly Audience[],
): boolean {
  return message.every((a) => reader.includes(a));
}

/** Код вместо съдържанието на AI отговор, търсен с по-широки аудитории от тези на читателя. */
export const AUDIENCE_WITHHELD = 'gate.audienceWithheld';
