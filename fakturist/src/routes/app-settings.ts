import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { MINUTE } from '../time.js';
import { requestRateKey } from '../http/ip.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { BRAND } from '../brand.js';
import { HttpError, requireOrg, type OrgAccess } from '../auth/guards.js';
import { setting } from '../admin/settings.js';
import { calculate } from '../einvoice/calculate.js';
import { normalizeLogo } from '../documents/logo.js';
import { renderPdf } from '../documents/pdf.js';
import { sampleInvoice } from '../documents/pdf-sample.js';
import {
  DEFAULT_PDF_STYLE,
  loadPdfStyle,
  LOGO_POSITIONS,
  parsePdfStyleForm,
  PDF_FONTS,
  PDF_TEMPLATES,
} from '../documents/pdf-style.js';
import { logoUpload, uploadStatus } from '../http/upload.js';

/**
 * Настройките на фирмата: изгледът на PDF копието (лого, шрифт, шаблон, цвят). Сменя ги собственикът или
 * администраторът на фирмата (`org.settings`); кантората по пълномощно — не. Пазачът requireUser е в
 * appRouter; multipart CSRF — в src/http/upload.ts.
 */
async function settingsAccess(req: Request): Promise<OrgAccess> {
  const access = await requireOrg(req, 'org.settings');
  if (access.viaFirmId) throw new HttpError(404);
  return access;
}

async function renderSettings(
  res: Response,
  organizationId: string,
  extra: {
    status?: number;
    errors?: Record<string, string>;
    values?: Record<string, unknown>;
  } = {},
  saved: string | null = null,
): Promise<void> {
  const [org, style] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.pdfStyle.findUnique({
      where: { organizationId },
      select: {
        font: true,
        template: true,
        accent: true,
        logoPosition: true,
        logoType: true,
        logoWidth: true,
        logoHeight: true,
        updatedAt: true,
      },
    }),
  ]);
  res.status(extra.status ?? 200).render('app/settings', {
    org,
    values: extra.values ?? style ?? DEFAULT_PDF_STYLE,
    hasLogo: Boolean(style?.logoType),
    logoVersion: style?.updatedAt.getTime() ?? 0,
    errors: extra.errors ?? {},
    fonts: Object.entries(PDF_FONTS).map(([key, font]) => ({ key, label: font.label })),
    templates: PDF_TEMPLATES,
    positions: LOGO_POSITIONS,
    saved,
  });
}

/**
 * Качванията на лого: 20 за 10 минути на човек (прекодирането е скъпо). Над тавана — страницата с
 * обяснение, не гол текст („Too many requests“ изглеждаше като срив).
 */
const uploadLimiter = rateLimit({
  windowMs: 10 * MINUTE,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? requestRateKey(req),
  handler: (req, res) => {
    const orgId = String(req.params['orgId'] ?? '');
    res.redirect(
      303,
      /^[a-z0-9]{20,40}$/.test(orgId) ? `/app/o/${orgId}/nastroyki?greshka=logoTooMany` : '/app',
    );
  },
});

export function appSettingsRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/nastroyki', async (req, res) => {
    const access = await settingsAccess(req);
    const ok = typeof req.query['ok'] === 'string' && /^(pdf|logo|mahnato)$/.test(req.query['ok']);
    const tooMany = req.query['greshka'] === 'logoTooMany';
    await renderSettings(
      res,
      access.organizationId,
      tooMany ? { status: 429, errors: { logo: 'logoTooMany' } } : {},
      ok ? String(req.query['ok']) : null,
    );
  });

  router.post('/app/o/:orgId/nastroyki/pdf', async (req, res) => {
    const access = await settingsAccess(req);
    const body = req.body as Record<string, unknown>;
    const parsed = parsePdfStyleForm(body);
    if (!parsed.ok) {
      return renderSettings(res, access.organizationId, {
        status: 400,
        errors: parsed.errors,
        values: body,
      });
    }
    const actorId = req.principal!.user.id;
    await prisma.$transaction(async (tx) => {
      await tx.pdfStyle.upsert({
        where: { organizationId: access.organizationId },
        create: { organizationId: access.organizationId, ...parsed.style, updatedById: actorId },
        update: { ...parsed.style, updatedById: actorId },
      });
      await audit(tx, {
        actorId,
        organizationId: access.organizationId,
        action: 'organization.pdfStyle.saved',
        targetType: 'PdfStyle',
        targetId: access.organizationId,
        details: { ...parsed.style },
      });
    });
    res.redirect(303, `/app/o/${access.organizationId}/nastroyki?ok=pdf`);
  });

  router.post('/app/o/:orgId/nastroyki/logo', uploadLimiter, logoUpload(), async (req, res) => {
    const access = await settingsAccess(req);
    const status = uploadStatus(req);
    let error: string | null =
      status === 'tooLarge' ? 'logoTooLarge' : status === 'bad' ? 'logoCorrupt' : null;
    let logo = null;
    if (!error) {
      if (!req.file || req.file.size === 0) error = 'logoMissing';
      else {
        const result = await normalizeLogo(req.file.buffer);
        if (result.ok) logo = result.logo;
        else error = result.error === 'type' ? 'logoType' : 'logoCorrupt';
      }
    }
    if (error || !logo) {
      return renderSettings(res, access.organizationId, {
        status: 400,
        errors: { logo: error ?? 'logoCorrupt' },
      });
    }
    const actorId = req.principal!.user.id;
    const data = {
      logo: new Uint8Array(logo.data),
      logoType: logo.type,
      logoWidth: logo.width,
      logoHeight: logo.height,
      updatedById: actorId,
    };
    await prisma.$transaction(async (tx) => {
      await tx.pdfStyle.upsert({
        where: { organizationId: access.organizationId },
        create: { organizationId: access.organizationId, ...data },
        update: data,
      });
      await audit(tx, {
        actorId,
        organizationId: access.organizationId,
        action: 'organization.pdfLogo.saved',
        targetType: 'PdfStyle',
        targetId: access.organizationId,
        details: { type: logo.type, width: logo.width, height: logo.height },
      });
    });
    res.redirect(303, `/app/o/${access.organizationId}/nastroyki?ok=logo`);
  });

  router.post('/app/o/:orgId/nastroyki/logo/mahni', async (req, res) => {
    const access = await settingsAccess(req);
    const actorId = req.principal!.user.id;
    await prisma.$transaction(async (tx) => {
      await tx.pdfStyle.updateMany({
        where: { organizationId: access.organizationId },
        data: {
          logo: null,
          logoType: null,
          logoWidth: null,
          logoHeight: null,
          updatedById: actorId,
        },
      });
      await audit(tx, {
        actorId,
        organizationId: access.organizationId,
        action: 'organization.pdfLogo.removed',
        targetType: 'PdfStyle',
        targetId: access.organizationId,
      });
    });
    res.redirect(303, `/app/o/${access.organizationId}/nastroyki?ok=mahnato`);
  });

  /** Текущото лого (за преглед в настройките) — само за хората с право да ги сменят. */
  router.get('/app/o/:orgId/nastroyki/logo.png', async (req, res) => {
    const access = await settingsAccess(req);
    const style = await prisma.pdfStyle.findUnique({
      where: { organizationId: access.organizationId },
      select: { logo: true, logoType: true },
    });
    if (!style?.logo || !style.logoType) throw new HttpError(404);
    res
      .type(style.logoType)
      .set('Cache-Control', 'private, max-age=300')
      .set('Content-Disposition', 'inline')
      .send(Buffer.from(style.logo));
  });

  /** Образецът: изгледът на фирмата върху примерна фактура (не е издаден документ). */
  router.get('/app/o/:orgId/nastroyki/obrazets.pdf', async (req, res) => {
    const access = await settingsAccess(req);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
    });
    const input = sampleInvoice(org);
    const [style, signature] = await Promise.all([
      loadPdfStyle(access.organizationId),
      setting('documents.signature'),
    ]);
    const pdf = await renderPdf(
      input,
      calculate(input),
      {
        number: 'ОБРАЗЕЦ',
        chainIndex: null,
        sha256: null,
        signature: signature || BRAND.signature,
        issuedVia: null,
      },
      style,
    );
    res
      .type('application/pdf')
      .set('Cache-Control', 'private, no-store')
      .set('Content-Disposition', 'inline; filename="obrazets.pdf"')
      .send(pdf);
  });

  return router;
}
