import { prisma } from '../db.js';
import { setting } from '../admin/settings.js';

/** Ред от „Източници“ (SPEC 94): една кампания (източник + канал + кампания). */
export interface SignupRow {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  companies: number;
  firms: number;
  /** Фирми с поне едно платено плащане за план (по всяко време). */
  paid: number;
}

/**
 * Регистрациите от `since` насам по източник — само самостоятелните (фирма или кантора от „Регистрация“):
 * клиентите, добавени от кантора, и организацията, която издава фактурите за плановете, не са реклама.
 * Най-много регистрации — първи; „без източник“ е ред с `source: null`.
 */
export async function signupReport(input: { since: Date | null }): Promise<SignupRow[]> {
  const supplierOrgId = await setting('billing.supplierOrgId');
  const orgs = await prisma.organization.findMany({
    where: {
      createdByFirmId: null,
      ...(input.since ? { createdAt: { gte: input.since } } : {}),
      ...(supplierOrgId ? { id: { not: supplierOrgId } } : {}),
    },
    select: {
      kind: true,
      signupSource: true,
      signupMedium: true,
      signupCampaign: true,
      payments: { where: { status: 'COMPLETED' }, select: { id: true }, take: 1 },
    },
  });
  const rows = new Map<string, SignupRow>();
  for (const org of orgs) {
    const key = JSON.stringify([org.signupSource, org.signupMedium, org.signupCampaign]);
    const row = rows.get(key) ?? {
      source: org.signupSource,
      medium: org.signupMedium,
      campaign: org.signupCampaign,
      companies: 0,
      firms: 0,
      paid: 0,
    };
    if (org.kind === 'ACCOUNTING_FIRM') row.firms += 1;
    else row.companies += 1;
    if (org.payments.length > 0) row.paid += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.companies + b.firms - (a.companies + a.firms) ||
      b.paid - a.paid ||
      (a.source ?? '').localeCompare(b.source ?? ''),
  );
}
