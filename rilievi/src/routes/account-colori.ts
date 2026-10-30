import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { principalOf, requireCsrf, requireUser, sendError } from '../auth/guards.js';
import { prisma } from '../db.js';
import {
  CAMPI_COLORE,
  COLORI_PREDEFINITI,
  cssColori,
  parseColori,
  versioneColori,
} from '../http/colori.js';
import { setFlash } from '../http/flash.js';

/**
 * Темата „Personalizzato“ на човека: формата в профила (шестте цвята, проверени за четимост), връщането
 * към цветовете на портала и стилът с цветовете — от сесията, с версия в адреса (кешира се за година).
 */
export const accountColoriRouter: Router = Router();

accountColoriRouter.post('/account/colori', requireUser, requireCsrf, async (req, res) => {
  const principal = principalOf(req);
  const body = req.body as Record<string, unknown>;
  const parsed = parseColori(body);
  if (!parsed.ok) {
    const values = Object.fromEntries(
      CAMPI_COLORE.map((k) => [k, typeof body[k] === 'string' ? body[k].slice(0, 20) : '']),
    );
    res.status(422).render('account/index', {
      error: null,
      name: principal.user.name,
      colori: { values, errors: parsed.errors },
    });
    return;
  }
  await prisma.user.update({
    where: { id: principal.user.id },
    data: { colori: parsed.data, theme: 'CUSTOM' },
  });
  setFlash(res, 'ok', 'flash.coloriSaved');
  res.redirect(303, '/account#h-colori');
});

accountColoriRouter.post(
  '/account/colori/ripristina',
  requireUser,
  requireCsrf,
  async (req, res) => {
    const user = principalOf(req).user;
    await prisma.user.update({
      where: { id: user.id },
      data: { colori: Prisma.DbNull, ...(user.theme === 'CUSTOM' ? { theme: 'AUTO' } : {}) },
    });
    setFlash(res, 'ok', 'flash.coloriReset');
    res.redirect(303, '/account#h-colori');
  },
);

accountColoriRouter.get('/account/colori.css', requireUser, (req, res) => {
  const colori = principalOf(req).user.colori;
  if (!colori) return sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
  // Кешира се за година само под своята версия (?v=); стар адрес (цветовете са сменени в друг раздел
  // между страницата и стила) получава текущите цветове, но не ги кешира под чуждата версия.
  const proprio = req.query.v === versioneColori(colori);
  res
    .status(200)
    .set({
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': proprio ? 'private, max-age=31536000, immutable' : 'no-store',
    })
    .send(cssColori(colori));
});

/** Цветовете във формата: записаните, иначе тези на портала. */
export const coloriForm = (user: { colori: Record<string, string> | null }) => ({
  values: { ...COLORI_PREDEFINITI, ...(user.colori ?? {}) },
  errors: {},
});
