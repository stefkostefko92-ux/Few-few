// Кой влиза в дашборда и кой въвежда/трие семки. Собственикът и Administrator не могат да се заключат
// навън — иначе грешна роля в настройките би затворила дашборда за всички.

export interface MemberFacts {
  isOwner: boolean;
  isAdmin: boolean;
  roleIds: readonly string[];
}

function hasRoleOrAdmin(member: MemberFacts | null, roleId: string | null): boolean {
  if (!member) return false;
  if (member.isOwner || member.isAdmin) return true;
  return roleId !== null && member.roleIds.includes(roleId);
}

export function canUseDashboard(
  member: MemberFacts | null,
  dashboardRoleId: string | null,
): boolean {
  return hasRoleOrAdmin(member, dashboardRoleId);
}

export function canManageSeeds(member: MemberFacts | null, commandRoleId: string | null): boolean {
  return hasRoleOrAdmin(member, commandRoleId);
}
