/**
 * Седемте нива: две в платформата (MASTER, SUPPORT) и пет във фирмата или кантората (OWNER, ADMIN,
 * ACCOUNTANT, ISSUER, VIEWER). Правата са способности, не сравнение на нива — така ново право не
 * разширява тихо достъпа на стара роля.
 */
export const MEMBER_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'ISSUER', 'VIEWER'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PLATFORM_ROLES = ['NONE', 'SUPPORT', 'MASTER'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const CAPABILITIES = [
  'documents.read',
  'documents.issue',
  'documents.cancel',
  'parties.manage',
  'items.manage',
  'series.manage',
  'members.manage',
  'org.settings',
  'billing.manage',
  'mandates.manage',
  'audit.read',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const MATRIX: Record<MemberRole, readonly Capability[]> = {
  OWNER: CAPABILITIES,
  ADMIN: CAPABILITIES.filter((c) => c !== 'billing.manage'),
  ACCOUNTANT: [
    'documents.read',
    'documents.issue',
    'documents.cancel',
    'parties.manage',
    'items.manage',
    'audit.read',
  ],
  ISSUER: ['documents.read', 'documents.issue', 'parties.manage', 'items.manage'],
  VIEWER: ['documents.read'],
};

export function roleCan(role: MemberRole, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}

/** Ред на силата — за избор на по-слабата от две роли. */
const RANK: Record<MemberRole, number> = {
  OWNER: 5,
  ADMIN: 4,
  ACCOUNTANT: 3,
  ISSUER: 2,
  VIEWER: 1,
};

export function weaker(a: MemberRole, b: MemberRole): MemberRole {
  return RANK[a] <= RANK[b] ? a : b;
}

export interface MembershipView {
  organizationId: string;
  role: MemberRole;
}

export interface MandateView {
  firmId: string;
  clientId: string;
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  validFrom: Date;
  validTo: Date | null;
}

/**
 * Ролята на човек във фирма: пряко членство, или — за служител на кантора — ролята му в кантората,
 * ограничена до ACCOUNTANT, ако кантората има действащо пълномощно от фирмата (чл. 113, ал. 7 ЗДДС).
 * Пълномощно, което не е ACTIVE или е извън срока си, не дава нищо.
 */
export function effectiveRole(
  organizationId: string,
  memberships: readonly MembershipView[],
  mandates: readonly MandateView[],
  now: Date = new Date(),
): { role: MemberRole; viaFirmId: string | null } | null {
  const direct = memberships.find((m) => m.organizationId === organizationId);
  if (direct) return { role: direct.role, viaFirmId: null };
  let best: { role: MemberRole; viaFirmId: string } | null = null;
  for (const mandate of mandates) {
    if (mandate.clientId !== organizationId || mandate.status !== 'ACTIVE') continue;
    if (mandate.validFrom > now || (mandate.validTo !== null && mandate.validTo < now)) continue;
    const inFirm = memberships.find((m) => m.organizationId === mandate.firmId);
    if (!inFirm) continue;
    const role = weaker(inFirm.role, 'ACCOUNTANT');
    if (!best || RANK[role] > RANK[best.role]) best = { role, viaFirmId: mandate.firmId };
  }
  return best;
}
