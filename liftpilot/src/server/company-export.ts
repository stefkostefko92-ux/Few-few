import 'server-only';
// All the data a company entered, as one JSON document (terms of use, article «exit»; GDPR art. 20; Data Act art. 25):
// the company, its users (never their password hashes or tokens), the rights it set for its colleagues' roles (only where
// they differ from the default matrix, as stored: CompanyRolePermission, round 42), the projects with every calculation, shaft design,
// lift design and drawing set and the drafts of their forms, the logos, the price list, the survey sheets (Rilievi, the
// trashed ones too, with their measurements per stop and the suppliers' modules as filled in) and the activity log. The
// software's own data (catalogues, the standards register, the engines) are not the company's and stay out. Its format
// is described in public (src/lib/export-format.ts, the page /<locale>/data).
import { prisma } from '@/lib/db';
import { TERMS_VERSION } from '@/lib/legal';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportKey } from '@/lib/export-format';

const image = (l: { id: string; mime: string; sha256: string; width: number; height: number; createdAt: Date; data: Uint8Array }) => ({
  id: l.id, mime: l.mime, sha256: l.sha256, width: l.width, height: l.height, createdAt: l.createdAt, base64: Buffer.from(l.data).toString('base64'),
});

const RECORD = { id: true, label: true, engineVersion: true, sha256: true, verdict: true, failCount: true, warnCount: true, summary: true, inputs: true,
  createdAt: true, userId: true } as const;

export async function companyExport(companyId: string): Promise<Record<string, unknown> | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, vatNumber: true, city: true, active: true, logoId: true, createdAt: true, updatedAt: true,
      subscriptionStatus: true, seatPack: true, periodEnd: true, cancelAtPeriodEnd: true, trialEndsAt: true, ordineSezioni: true },
  });
  if (!company) return null;
  const [users, invites, rolePermissions, logos, projects, priceItems, customPrices, schede, auditLog] = await Promise.all([
    prisma.user.findMany({
      where: { companyId }, orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, lastLoginAt: true, emailVerifiedAt: true,
        termsAcceptedAt: true, termsVersion: true },
    }),
    prisma.invite.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, select: { email: true, name: true, role: true, expiresAt: true, createdAt: true } }),
    prisma.companyRolePermission.findMany({ where: { companyId }, orderBy: [{ role: 'asc' }, { capability: 'asc' }],
      select: { role: true, capability: true, granted: true, updatedById: true, updatedAt: true } }),
    prisma.companyLogo.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
    // the installation's module of before round 45 (Project.kind) is no data of the company's any more (format 9; the
    // client ignores the column since round 47)
    prisma.project.findMany({
      where: { companyId }, orderBy: { createdAt: 'asc' },
      include: {
        clientLogos: { orderBy: { createdAt: 'asc' } },
        // the test chosen with each calculation as stored (with the logbook's speed and travel and the controller's
        // regulation when entered, round 46: the format stays 9, the register names them)
        calculations: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, profileId: true, results: true, collaudo: true, intervento: true, shaftDesignId: true,
          reviews: { orderBy: { createdAt: 'asc' }, select: { id: true, userId: true, note: true, createdAt: true } } } },
        shaftDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, profileId: true, source: true, results: true } },
        liftDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, source: true, shaftDesignId: true, calculationId: true, baseCalculationId: true } },
        roomDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, results: true, calculationId: true } },
        formDrafts: { orderBy: { createdAt: 'asc' }, select: { scope: true, data: true, createdAt: true, updatedAt: true } },
        drawingSets: { orderBy: { createdAt: 'asc' }, select: { id: true, number: true, revision: true, authorInitials: true, revisions: true, plant: true,
          projectData: true, companyName: true, sha256: true, pages: true, calculationId: true, shaftDesignId: true, roomDesignId: true, logoId: true, clientLogoId: true,
          userId: true, createdAt: true, pdf: { select: { sha256: true, createdAt: true } } } },
      },
    }),
    prisma.priceItem.findMany({ where: { companyId }, orderBy: { key: 'asc' }, select: { key: true, cents: true, updatedById: true, updatedAt: true } }),
    prisma.customPriceItem.findMany({ where: { companyId }, orderBy: { position: 'asc' }, select: { text: true, cents: true, basis: true, scope: true, position: true, updatedById: true, updatedAt: true } }),
    // every column of the sheet (Decimal as text, the modules as stored, deletedAt for the trashed ones); the
    // search text is the software's index of the same values and stays out
    prisma.scheda.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, omit: { searchText: true },
      include: { misureBottoniere: { orderBy: { fermata: 'asc' }, omit: { schedaId: true } } } }),
    prisma.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, userId: true, action: true, entity: true, entityId: true, meta: true } }),
  ]);
  const doc: Record<ExportKey, unknown> = {
    format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION, exportedAt: new Date().toISOString(), termsVersion: TERMS_VERSION,
    note: 'Dati inseriti dall’azienda in LiftPilot (Carbon Stealth VCC). Importi in centesimi di euro senza IVA, lunghezze in millimetri salvo diversa indicazione, immagini in base64.',
    company, users, invites, rolePermissions, logos: logos.map(image),
    projects: projects.map(({ clientLogos, ...p }) => ({ ...p, clientLogos: clientLogos.map(image) })),
    priceItems, customPrices, schede, auditLog,
  };
  return doc;
}
