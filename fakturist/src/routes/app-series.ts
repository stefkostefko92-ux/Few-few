import { Router, type Response } from 'express';
import { prisma } from '../db.js';
import { requireOrg } from '../auth/guards.js';
import { formErrors, SeriesForm } from '../catalog/schemas.js';
import {
  createSeries,
  deleteSeries,
  SeriesError,
  setDefaultSeries,
  updateSeries,
} from '../catalog/series.js';
import { param } from './app-shared.js';
import { notFound, orgOf, query } from './app-catalog.js';

/** Сериите на фирмата (SPEC 44): номерата на документите. Правото — `series.manage`; чужда серия е 404. */
export function appSeriesRouter(): Router {
  const router = Router();

  // --- Серии ---------------------------------------------------------------------------------------
  const renderSeries = async (
    res: Response,
    organizationId: string,
    extra: {
      errors?: Record<string, string>;
      editing?: string | null;
      values?: unknown;
      saved?: string;
    },
    status = 200,
  ) =>
    res.status(status).render('app/series', {
      org: await orgOf(organizationId),
      series: await prisma.documentSeries.findMany({
        where: { organizationId },
        orderBy: { rangeStart: 'asc' },
        include: { _count: { select: { documents: true } } },
      }),
      errors: extra.errors ?? {},
      editing: extra.editing ?? null,
      values: typeof extra.values === 'object' && extra.values !== null ? extra.values : {},
      saved: extra.saved ?? '',
    });

  router.get('/app/o/:orgId/serii', async (req, res) => {
    const access = await requireOrg(req, 'series.manage');
    await renderSeries(res, access.organizationId, { saved: query(req, 'ok') });
  });

  const seriesFailure = async (
    res: Response,
    organizationId: string,
    error: unknown,
    editing: string | null,
    values: unknown,
  ) => {
    if (error instanceof SeriesError && error.code !== 'notFound') {
      return renderSeries(
        res,
        organizationId,
        { errors: { [editing ?? 'new']: error.code }, editing, values },
        400,
      );
    }
    notFound(error);
  };

  router.post('/app/o/:orgId/serii/nova', async (req, res) => {
    const access = await requireOrg(req, 'series.manage');
    const parsed = SeriesForm.safeParse(req.body);
    if (!parsed.success) {
      const code = Object.values(formErrors(parsed.error.issues))[0] ?? 'invalid';
      return renderSeries(
        res,
        access.organizationId,
        { errors: { new: code }, values: req.body },
        400,
      );
    }
    try {
      await createSeries({
        organizationId: access.organizationId,
        actorId: req.principal!.user.id,
        data: parsed.data,
      });
    } catch (error) {
      return seriesFailure(res, access.organizationId, error, null, req.body);
    }
    res.redirect(303, `/app/o/${access.organizationId}/serii?ok=created`);
  });

  router.post('/app/o/:orgId/serii/:seriesId', async (req, res) => {
    const access = await requireOrg(req, 'series.manage');
    const seriesId = param(req, 'seriesId');
    const parsed = SeriesForm.safeParse(req.body);
    if (!parsed.success) {
      const code = Object.values(formErrors(parsed.error.issues))[0] ?? 'invalid';
      return renderSeries(
        res,
        access.organizationId,
        { errors: { [seriesId]: code }, editing: seriesId, values: req.body },
        400,
      );
    }
    try {
      await updateSeries({
        organizationId: access.organizationId,
        seriesId,
        actorId: req.principal!.user.id,
        data: parsed.data,
      });
    } catch (error) {
      return seriesFailure(res, access.organizationId, error, seriesId, req.body);
    }
    res.redirect(303, `/app/o/${access.organizationId}/serii?ok=updated`);
  });

  router.post('/app/o/:orgId/serii/:seriesId/osnovna', async (req, res) => {
    const access = await requireOrg(req, 'series.manage');
    await setDefaultSeries({
      organizationId: access.organizationId,
      seriesId: param(req, 'seriesId'),
      actorId: req.principal!.user.id,
    }).catch(notFound);
    res.redirect(303, `/app/o/${access.organizationId}/serii?ok=default`);
  });

  router.post('/app/o/:orgId/serii/:seriesId/iztrii', async (req, res) => {
    const access = await requireOrg(req, 'series.manage');
    const seriesId = param(req, 'seriesId');
    try {
      await deleteSeries({
        organizationId: access.organizationId,
        seriesId,
        actorId: req.principal!.user.id,
      });
    } catch (error) {
      return seriesFailure(res, access.organizationId, error, seriesId, {});
    }
    res.redirect(303, `/app/o/${access.organizationId}/serii?ok=deleted`);
  });

  return router;
}
