import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { requireOrg, type OrgAccess } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { HOUR, sofiaToday } from '../time.js';
import { ZipWriter } from '../export/zip.js';
import { saftBundle } from '../export/saft/bundle.js';
import { NRA_CODES } from '../export/saft/codes.js';
import { loadSaftMonth } from '../export/saft/load.js';
import { saftReadme } from '../export/saft/readme.js';
import { SaftSettingsForm } from '../export/saft/settings.js';
import { journalPeriod } from './app-journal.js';

/**
 * „Данни за SAF-T“ (SPEC 62): продажбите за месец като фрагменти по XSD 1.0.3 на НАП за счетоводната
 * програма — тя съставя и подава месечния файл (главна книга, покупки, салда). Четене — `documents.read`;
 * сметките и свързаните лица — `accounting.manage` (собственик, админ, счетоводител по пълномощно).
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

const ORG_SELECT = {
  id: true,
  legalName: true,
  eik: true,
  saftReceivableAccount: true,
  saftRevenueAccount: true,
  saftRelatedParties: true,
} as const;

/** Страницата — без салдата (само бройките); файлът — със салдата (историята на клиентите). */
async function build(req: Request, access: OrgAccess, withBalances: boolean) {
  const period = journalPeriod(req.query['period']);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: access.organizationId },
    select: ORG_SELECT,
  });
  const accounts = { receivable: org.saftReceivableAccount, revenue: org.saftRevenueAccount };
  const feature = await orgHasFeature(org.id, 'saf-t', { viaFirmId: access.viaFirmId });
  if (!feature) return { org, period, accounts, feature, bundle: null };
  const { documents, balances } = await loadSaftMonth(org.id, period, NRA_CODES, {
    balances: withBalances,
  });
  const bundle = saftBundle({
    documents,
    balances,
    accounts,
    codes: NRA_CODES,
    relatedParties: org.saftRelatedParties,
  });
  return { org, period, accounts, feature, bundle };
}

export function appSaftRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/saf-t', limiter, async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const { org, period, feature, bundle } = await build(req, access, false);
    res.render('app/saft', {
      org,
      period,
      feature,
      bundle,
      maxPeriod: sofiaToday().slice(0, 7),
      canEdit: roleCan(access.role, 'accounting.manage'),
      saved: req.query['ok'] === 'saved',
      error: typeof req.query['err'] === 'string' ? req.query['err'] : null,
    });
  });

  router.post('/app/o/:orgId/saf-t', limiter, async (req, res) => {
    const access = await requireOrg(req, 'accounting.manage');
    const base = `/app/o/${access.organizationId}/saf-t`;
    if (!(await orgHasFeature(access.organizationId, 'saf-t', { viaFirmId: access.viaFirmId }))) {
      return res.redirect(303, `${base}?err=plan`);
    }
    const parsed = SaftSettingsForm.safeParse(req.body);
    if (!parsed.success) {
      const code = parsed.error.issues[0]?.message === 'related' ? 'related' : 'account';
      return res.redirect(303, `${base}?err=${code}`);
    }
    const { receivable, revenue, related } = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: access.organizationId },
        data: {
          saftReceivableAccount: receivable,
          saftRevenueAccount: revenue,
          saftRelatedParties: related,
        },
      });
      await audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: access.organizationId,
        action: 'saft.settings',
        targetType: 'Organization',
        targetId: access.organizationId,
        details: { receivable, revenue, related: related.length },
      });
    });
    res.redirect(303, `${base}?ok=saved`);
  });

  router.get('/app/o/:orgId/saf-t.zip', limiter, async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const { org, period, accounts, bundle } = await build(req, access, true);
    if (!bundle || bundle.files.length === 0) {
      return res.redirect(303, `/app/o/${org.id}/saf-t?period=${period}`);
    }
    const chunks: Buffer[] = [];
    const zip = new ZipWriter({ write: async (chunk) => void chunks.push(chunk) });
    for (const file of bundle.files) await zip.add(file.name, Buffer.from(file.xml, 'utf8'));
    await zip.add(
      'README.txt',
      Buffer.from(saftReadme({ orgName: org.legalName, period, accounts, bundle }), 'utf8'),
    );
    await zip.finish();
    await prisma.$transaction((tx) =>
      audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: org.id,
        action: 'saft.exported',
        targetType: 'Organization',
        targetId: org.id,
        details: { period, documents: bundle.included, manual: bundle.manual.length },
      }),
    );
    res
      .status(200)
      .set('Cache-Control', 'private, no-store')
      .type('application/zip')
      .set(
        'Content-Disposition',
        `attachment; filename="saft-prodazhbi-${org.eik ?? 'firma'}-${period}.zip"`,
      )
      .send(Buffer.concat(chunks));
  });

  return router;
}
