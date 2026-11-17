import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { translator } from '../i18n.js';
import { MINUTE } from '../time.js';
import { HELP_FEATURES, helpFor, type HelpOrg } from '../help/content.js';
import { manualPdf } from '../help/manual-pdf.js';
import type { FeatureCode } from '../features.js';

/**
 * „Помощ“ в приложението и PDF наръчникът (SPEC 90–91): разделите според организациите на човека (прякото
 * членство — видът, ролята и плана), на езика на профила. Наръчникът — до 20 на 10 минути (PDF-ът се
 * рисува при всяка заявка).
 */
const pdfLimiter = rateLimit({
  windowMs: 10 * MINUTE,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

async function viewerOf(req: Request) {
  const user = req.principal!.user;
  const orgs = await prisma.organization.findMany({
    where: {
      id: { in: user.memberships.map((m) => m.organizationId) },
      deletedAt: null,
    },
    select: { id: true, legalName: true, kind: true },
    orderBy: { legalName: 'asc' },
  });
  const helpOrgs: Array<HelpOrg & { legalName: string }> = await Promise.all(
    orgs.map(async (org) => {
      const role = user.memberships.find((m) => m.organizationId === org.id)!.role;
      const features = new Set<FeatureCode>();
      for (const code of HELP_FEATURES) {
        if (await orgHasFeature(org.id, code)) features.add(code);
      }
      return { kind: org.kind, role, features, legalName: org.legalName };
    }),
  );
  return { orgs: helpOrgs, master: user.platformRole === 'MASTER', name: user.name };
}

export function appHelpRouter(): Router {
  const router = Router();

  router.get('/app/pomosht', async (req, res) => {
    const viewer = await viewerOf(req);
    res.render('app/help', { sections: helpFor(res.locals.lang, viewer) });
  });

  router.get('/app/narachnik.pdf', pdfLimiter, async (req, res) => {
    const viewer = await viewerOf(req);
    const locale = res.locals.lang;
    const t = translator(locale);
    const pdf = await manualPdf(
      locale,
      {
        name: viewer.name,
        orgs: viewer.orgs.map((org) => ({
          legalName: org.legalName,
          kind: org.kind,
          role: t(`app.roles.${org.role}`),
        })),
      },
      helpFor(locale, viewer),
      { fontRoot: config().PDF_FONT_ROOT },
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${locale === 'bg' ? 'fakturist-narachnik' : 'fakturist-manual'}.pdf"`,
      'Cache-Control': 'no-store',
    });
    res.send(pdf);
  });

  return router;
}
