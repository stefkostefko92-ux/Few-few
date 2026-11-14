import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { COMMON_UNITS, VAT_CATEGORIES } from '../einvoice/codes.js';
import { formErrors, ItemForm, PartyForm } from '../catalog/schemas.js';
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
import { SeriesError } from '../catalog/series.js';
import { param } from './app-shared.js';
import { pagerLinks, readCursor } from '../http/pagination.js';

/**
 * Каталогът на фирмата (SPEC 42–44): контрагенти и артикули (сериите — app-series.ts). Правата —
 * `parties.manage`, `items.manage` (src/auth/roles.ts); чужд запис е 404.
 */
export function query(req: Request, name: string): string {
  const value = req.query[name];
  return typeof value === 'string' ? value.slice(0, 100) : '';
}

export async function orgOf(organizationId: string) {
  return prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, legalName: true },
  });
}

export function notFound(error: unknown): never {
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
    const page = await searchParties(
      access.organizationId,
      query(req, 'q'),
      archived,
      readCursor(req.query['sled']),
    );
    res.render('app/parties', {
      org: await orgOf(access.organizationId),
      parties: page.items,
      pager: pagerLinks(
        req,
        `/app/o/${access.organizationId}/kontragenti`,
        'sled',
        ['q', 'arhiv'],
        page.next,
      ),
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
    const page = await searchItems(
      access.organizationId,
      query(req, 'q'),
      archived,
      readCursor(req.query['sled']),
    );
    res.render('app/items', {
      org: await orgOf(access.organizationId),
      items: page.items,
      pager: pagerLinks(
        req,
        `/app/o/${access.organizationId}/artikuli`,
        'sled',
        ['q', 'arhiv'],
        page.next,
      ),
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

  return router;
}
