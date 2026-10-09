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
  | 'kb:manage' // качване, преглед, публикуване, отписване (§4.1); също бързите отговори (FR-20)
  | 'audit:read'
  // Работното пространство (§12.3). Операторът на платформата не е част от екипа на клиента —
  // няма разговори, присъствие и известия в него.
  | 'conversation:use' // участие в разговорите, в които е член; присъствие; известия
  | 'conversation:create' // нов DIRECT/GROUP — само персоналът; порталът само бива поканван
  | 'channel:create'; // нов CHANNEL (PUBLIC/PRIVATE) — водещите екипи и администраторът

const TECH: readonly Capability[] = [
  'case:create',
  'chat:ask',
  'ticket:create',
  'feedback:create',
  'conversation:use',
];
const STAFF_CHAT: readonly Capability[] = ['conversation:create', 'channel:create'];

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  PORTAL_TECHNICIAN: TECH,
  INTERNAL_TECHNICIAN: [...TECH, 'device:readAll', 'conversation:create'],
  SUPPORT: [...TECH, 'case:readAll', 'case:assign', 'device:readAll', ...STAFF_CHAT],
  ENGINEERING: [...TECH, 'case:readAll', 'case:assign', 'device:readAll', ...STAFF_CHAT],
  KNOWLEDGE_OWNER: [
    ...TECH,
    'case:readAll',
    'case:assign',
    'device:readAll',
    'kb:manage',
    ...STAFF_CHAT,
  ],
  TENANT_ADMIN: ['case:readAll', 'device:readAll', 'audit:read', 'conversation:use', ...STAFF_CHAT],
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

/** Читателят вижда AI отговор само ако има ВСИЧКИ аудитории, с които е търсено за него. */
export function coversAudiences(
  reader: readonly Audience[],
  message: readonly Audience[],
): boolean {
  return message.every((a) => reader.includes(a));
}

/** Код вместо съдържанието на AI отговор, търсен с по-широки аудитории от тези на читателя. */
export const AUDIENCE_WITHHELD = 'gate.audienceWithheld';
