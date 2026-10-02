import 'server-only';
// The company's access now (src/lib/billing.ts), with its trial started at the first read while billing is on: a company
// registered, or already working, before Stripe was configured gets its whole trial from then on. Read-only (no
// subscription after the trial) pays no slot: its colleagues are deactivated at the first read, and the owner brings
// them back once a subscription pays their slots.
import { prisma } from './db';
import { audit } from './audit';
import { MEMBER_ROLES } from './rbac';
import { companyAccess, trialEnd, type Access, type CompanyBilling } from './billing';
import { billingConfig } from './billing-config';

export const BILLING_SELECT = { billingExempt: true, subscriptionStatus: true, trialEndsAt: true, seatPack: true } as const;

export async function accessOf(companyId: string, c: CompanyBilling): Promise<{ access: Access; billing: CompanyBilling }> {
  const cfg = billingConfig();
  let billing = c;
  if (cfg && !c.billingExempt && !c.subscriptionStatus && !c.trialEndsAt) {
    // two requests at once: the first one sets it, both read it back
    await prisma.company.updateMany({ where: { id: companyId, trialEndsAt: null }, data: { trialEndsAt: trialEnd(new Date(), cfg.trialDays) } });
    billing = (await prisma.company.findUnique({ where: { id: companyId }, select: BILLING_SELECT })) ?? c;
  }
  const access = companyAccess(billing, new Date(), cfg !== null);
  if (access === 'readonly') {
    const n = await prisma.user.updateMany({ where: { companyId, active: true, role: { in: [...MEMBER_ROLES] } }, data: { active: false, tokenVersion: { increment: 1 } } });
    if (n.count) await audit({ companyId, userId: null, action: 'SEATS_ENFORCED', entity: 'Company', entityId: companyId, meta: { deactivated: n.count } });
  }
  return { access, billing };
}
