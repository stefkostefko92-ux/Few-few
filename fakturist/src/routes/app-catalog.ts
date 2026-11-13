import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { COMMON_UNITS, VAT_CATEGORIES } from '../einvoice/codes.js';
import { formErrors, ItemForm, PartyForm, SeriesForm } from '../catalog/schemas.js';
import {
  CatalogError,
  createItem,
  createParty,
  searchItems,
  searchParties,
  setItemArchived,
  setPartyArchived,
  updateItem,
  updateParty,
} from '../catalog/catalog.js';
import {
  createSeries,
  deleteSeries,
  SeriesError,
  setDefaultSeries,
  updateSeries,
} from '../catalog/series.js';
import { param } from './app-shared.js';

/**
 * Каталогът на фирмата (SPEC 42–44): контрагенти, артикули, серии. Правата — `parties.manage`,
 * `items.manage`, `series.manage` (src/auth/roles.ts); чужд запис е 404.
 */
function query(req: Request, name: string): string {
  const value = req.query[name];
  return typeof value === 'string' ? value.slice(0, 100) : '';
}

async function orgOf(organizationId: string) {
  return prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, legalName: true },
  });
}

function notFound(error: unknown): never {
  if (error instanceof CatalogError || error instanceof SeriesError) {
    if (error.code === 'notFound') throw new HttpError(404);
  }
  throw error;
}

export function appCatalogRouter(): Router {
  const router = Router();

  // --- Контрагенти ---------------------------------------------------------------------------------
  router.get('/app/o/:orgId/kontragenti', async (req, res) => {
    const access = await requireOrg(req, 'parties.manage');
    const archived = req.query['arhiv'] === '1';
    res.render('app/parties', {
      org: await orgOf(access.organizationId),
      parties: await searchParties(access.organizationId, query(req, 'q'), archived),
      q: query(req, 'q'),
      archived,
      saved: query(req, 'ok'),
    });
  });

  const renderParty = async (
    res: Response,
    organizationId: string,
    party: { id: string } | null,
    values: unknown,
    errors: Record<string, string>,
    status = 200,
  ) =>
    res.status(status).render('app/party-form', {
      org: await orgOf(organizationId),
      party,
      values: typeof values === 'object' && values !== null ? values : {},
      errors,
    });

  router.get('/app/o/:orgId/kontragenti/nov', async (req, res) => {
    const access = await requireOrg(req, 'parties.manage');
    await renderParty(res, access.organizationId, null, { countryCode: 'BG' }, {});
  });

  router.post('/app/o/:orgId/kontragenti/nov', async (req, res) => {
    const access = await requireOrg(req, 'parties.manage');
    const parsed = PartyForm.safeParse(req.body);
    if (!parsed.success) {
      return renderParty(
        res,
        access.organizationId,
        null,
        req.body,
        formErrors(parsed.error.issues),
        400,
      );
    }
    await createParty({
      organizationId: access.organizationId,
      actorId: req.principal!.user.id,
      data: parsed.data,
    });
    res.redirect(303, `/app/o/${access.organizationId}/kontragenti?ok=created`);
  });

  router.get('/app/o/:orgId/kontragenti/:partyId', async (req, res) => {
    const access = await requireOrg(req, 'parties.manage');
    const party = await prisma.party.findFirst({
      where: { id: param(req, 'partyId'), organizationId: access.organizationId },
    });
    if (!party) throw new HttpError(404);
    await renderParty(res, access.organizationId, party, party, {});
  });

  router.post('/app/o/:orgId/kontragenti/:partyId', async (req, res) => {
    const access = await requireOrg(req, 'parties.manage');
    const partyId = param(req, 'partyId');
    const party = await prisma.party.findFirst({
      where: { id: partyId, organizationId: access.organizationId },
    });
    if (!party) throw new HttpError(404);
    const parsed = PartyForm.safeParse(req.body);
    if (!parsed.success) {
      return renderParty(
        res,
        access.organizationId,
        party,
        req.body,
        formErrors(parsed.error.issues),
        400,
      );
    }
    await updateParty({
      organizationId: access.organizationId,
      partyId,
      actorId: req.principal!.user.id,
      data: parsed.data,
    }).catch(notFound);
    res.redirect(303, `/app/o/${access.organizationId}/kontragenti?ok=updated`);
  });

  router.post('/app/o/:orgId/kontragenti/:partyId/arhiv', async (req, res) => {
    const access = await requireOrg(req, 'parties.manage');
    const archived = (req.body as { archived?: unknown }).archived === '1';
    await setPartyArchived({
      organizationId: access.organizationId,
      partyId: param(req, 'partyId'),
      actorId: req.principal!.user.id,
      archived,
    }).catch(notFound);
    res.redirect(
      303,
      `/app/o/${access.organizationId}/kontragenti?ok=${archived ? 'archived' : 'restored'}`,
    );
  });

  // --- Артикули ------------------------------------------------------------------------------------
  router.get('/app/o/:orgId/artikuli', async (req, res) => {
    const access = await requireOrg(req, 'items.manage');
    const archived = req.query['arhiv'] === '1';
    res.render('app/items', {
      org: await orgOf(access.organizationId),
      items: await searchItems(access.organizationId, query(req, 'q'), archived),
      q: query(req, 'q'),
      archived,
      saved: query(req, 'ok'),
    });
  });

  const renderItem = async (
    res: Response,
    organizationId: string,
    item: { id: string } | null,
    values: unknown,
    errors: Record<string, string>,
    status = 200,
  ) =>
    res.status(status).render('app/item-form', {
      org: await orgOf(organizationId),
      item,
      values: typeof values === 'object' && values !== null ? values : {},
      errors,
      units: COMMON_UNITS,
      categories: VAT_CATEGORIES,
    });

  router.get('/app/o/:orgId/artikuli/nov', async (req, res) => {
    const access = await requireOrg(req, 'items.manage');
    await renderItem(
      res,
      access.organizationId,
      null,
      { unitCode: 'C62', vatCategory: 'S', vatRate: '20' },
      {},
    );
  });

  router.post('/app/o/:orgId/artikuli/nov', async (req, res) => {
    const access = await requireOrg(req, 'items.manage');
    const parsed = ItemForm.safeParse(req.body);
    if (!parsed.success) {
      return renderItem(
        res,
        access.organizationId,
        null,
        req.body,
        formErrors(parsed.error.issues),
        400,
      );
    }
    await createItem({
      organizationId: access.organizationId,
      actorId: req.principal!.user.id,
      data: parsed.data,
    });
    res.redirect(303, `/app/o/${access.organizationId}/artikuli?ok=created`);
  });

  router.get('/app/o/:orgId/artikuli/:itemId', async (req, res) => {
    const access = await requireOrg(req, 'items.manage');
    const item = await prisma.item.findFirst({
      where: { id: param(req, 'itemId'), organizationId: access.organizationId },
    });
    if (!item) throw new HttpError(404);
    await renderItem(res, access.organizationId, item, item, {});
  });

  router.post('/app/o/:orgId/artikuli/:itemId', async (req, res) => {
    const access = await requireOrg(req, 'items.manage');
    const itemId = param(req, 'itemId');
    const item = await prisma.item.findFirst({
      where: { id: itemId, organizationId: access.organizationId },
    });
    if (!item) throw new HttpError(404);
    const parsed = ItemForm.safeParse(req.body);
    if (!parsed.success) {
      return renderItem(
        res,
        access.organizationId,
        item,
        req.body,
        formErrors(parsed.error.issues),
        400,
      );
    }
    await updateItem({
      organizationId: access.organizationId,
      itemId,
      actorId: req.principal!.user.id,
      data: parsed.data,
    }).catch(notFound);
    res.redirect(303, `/app/o/${access.organizationId}/artikuli?ok=updated`);
  });

  router.post('/app/o/:orgId/artikuli/:itemId/arhiv', async (req, res) => {
    const access = await requireOrg(req, 'items.manage');
    const archived = (req.body as { archived?: unknown }).archived === '1';
    await setItemArchived({
      organizationId: access.organizationId,
      itemId: param(req, 'itemId'),
      actorId: req.principal!.user.id,
      archived,
    }).catch(notFound);
    res.redirect(
      303,
      `/app/o/${access.organizationId}/artikuli?ok=${archived ? 'archived' : 'restored'}`,
    );
  });

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
