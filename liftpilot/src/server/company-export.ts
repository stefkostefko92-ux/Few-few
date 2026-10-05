import 'server-only';
// All the data a company entered, as one JSON document (terms of use, article «exit»; GDPR art. 20; Data Act art. 25):
// the company, its users (never their password hashes or tokens), the projects with every calculation, shaft design,
// lift design and drawing set and the drafts of their forms, the logos, the price list and the activity log. The
// software's own data (catalogues, the standards register, the engines) are not the company's and stay out.
import { prisma } from '@/lib/db';
import { TERMS_VERSION } from '@/lib/legal';

const image = (l: { id: string; mime: string; sha256: string; width: number; height: number; createdAt: Date; data: Uint8Array }) => ({
  id: l.id, mime: l.mime, sha256: l.sha256, width: l.width, height: l.height, createdAt: l.createdAt, base64: Buffer.from(l.data).toString('base64'),
});

const RECORD = { id: true, label: true, engineVersion: true, sha256: true, verdict: true, failCount: true, warnCount: true, summary: true, inputs: true,
  createdAt: true, userId: true } as const;

export async function companyExport(companyId: string): Promise<Record<string, unknown> | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, vatNumber: true, city: true, active: true, logoId: true, createdAt: true, updatedAt: true,
      subscriptionStatus: true, seatPack: true, periodEnd: true, cancelAtPeriodEnd: true, trialEndsAt: true },
  });
  if (!company) return null;
  const [users, logos, projects, priceItems, customPrices, auditLog] = await Promise.all([
    prisma.user.findMany({
      where: { companyId }, orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, active: true, locale: true, createdAt: true, lastLoginAt: true, emailVerifiedAt: true,
        termsAcceptedAt: true, termsVersion: true },
    }),
    prisma.companyLogo.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
    prisma.project.findMany({
      where: { companyId }, orderBy: { createdAt: 'asc' },
      include: {
        clientLogos: { orderBy: { createdAt: 'asc' } },
        calculations: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, profileId: true, results: true, collaudo: true, shaftDesignId: true,
          reviews: { orderBy: { createdAt: 'asc' }, select: { id: true, userId: true, note: true, createdAt: true } } } },
        shaftDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, profileId: true, source: true, results: true } },
        liftDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, source: true, shaftDesignId: true, calculationId: true } },
        roomDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, results: true, calculationId: true } },
        formDrafts: { orderBy: { createdAt: 'asc' }, select: { scope: true, data: true, createdAt: true, updatedAt: true } },
        drawingSets: { orderBy: { createdAt: 'asc' }, select: { id: true, number: true, revision: true, authorInitials: true, revisions: true, plant: true,
          projectData: true, companyName: true, sha256: true, pages: true, calculationId: true, shaftDesignId: true, roomDesignId: true, logoId: true, clientLogoId: true,
          userId: true, createdAt: true, pdf: { select: { sha256: true, createdAt: true } } } },
      },
    }),
    prisma.priceItem.findMany({ where: { companyId }, orderBy: { key: 'asc' }, select: { key: true, cents: true, updatedById: true, updatedAt: true } }),
    prisma.customPriceItem.findMany({ where: { companyId }, orderBy: { position: 'asc' }, select: { text: true, cents: true, basis: true, scope: true, position: true, updatedById: true, updatedAt: true } }),
    prisma.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, userId: true, action: true, entity: true, entityId: true, meta: true } }),
  ]);
  return {
    format: 'liftpilot-company-export', formatVersion: 1, exportedAt: new Date().toISOString(), termsVersion: TERMS_VERSION,
    note: 'Data entered by the company in LiftPilot (Carbon Stealth VCC). Amounts in euro cents; lengths in millimetres unless stated; logos in base64.',
    company, users, logos: logos.map(image),
    projects: projects.map(({ clientLogos, ...p }) => ({ ...p, clientLogos: clientLogos.map(image) })),
    priceItems, customPrices, auditLog,
  };
}
