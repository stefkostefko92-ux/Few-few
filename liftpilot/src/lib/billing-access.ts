import 'server-only';
// The company's access now (src/lib/billing.ts), with its trial started at the first read while billing is on: a company
// registered, or already working, before Stripe was configured gets its whole trial from then on.
import { prisma } from './db';
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
  return { access: companyAccess(billing, new Date(), cfg !== null), billing };
}
