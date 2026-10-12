import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
  sendError,
} from '../auth/guards.js';
import { inScope, scopeOf } from '../auth/scope.js';
import { LOGO_MAX_BYTES, normalizeLogo, type Logo } from '../aziende/logo.js';
import {
  aziendaLogo,
  createAzienda,
  getAzienda,
  isAziendaId,
  listAziende,
  renameAzienda,
  setAziendaActive,
  setAziendaLogo,
} from '../aziende/service.js';
import { setFlash } from '../http/flash.js';

/**
 * Фирмите — само за MASTER (`aziende:manage`): създаване с име и лого, ново име, ново лого или без
 * лого, деактивиране. Логото се показва на хората на фирмата (листът за печат) и на MASTER.
 */
export const aziendeRouter: Router = Router();
const manage = requireCapability('aziende:manage');

type UploadStatus = 'ok' | 'tooLarge' | 'bad';
const uploads = new WeakMap<Request, UploadStatus>();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES, files: 1, fields: 10, fieldSize: 4096, parts: 12 },
}).single('logo');

/**
 * Формата с файл (multipart): полетата и файлът (в паметта, до 1 MB). Грешка при качването е грешка на
 * формата, не 500 — запомня се и маршрутът я показва. CSRF се проверява СЛЕД това (токенът е поле на
 * формата, първото), преди каквото и да е действие.
 */
function multipart(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (!error) uploads.set(req, 'ok');
    else if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE')
      uploads.set(req, 'tooLarge');
    else uploads.set(req, 'bad');
    next();
  });
}

const nameSchema = z
  .string()
  .transform((value) =>
    value
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().min(2).max(120));

/** Каченото лого, прекодирано; null без файл; ключ на грешка при лош файл. */
async function logoFromRequest(req: Request): Promise<{ logo: Logo | null } | { error: string }> {
  const status = uploads.get(req) ?? 'bad';
  if (status === 'tooLarge') return { error: 'aziende.error.logoTooLarge' };
  if (status === 'bad') return { error: 'aziende.error.logoCorrupt' };
  if (!req.file || req.file.size === 0) return { logo: null };
  const result = await normalizeLogo(req.file.buffer);
  if (!result.ok)
    return {
      error: result.error === 'type' ? 'aziende.error.logoType' : 'aziende.error.logoCorrupt',
    };
  return { logo: result.logo };
}

function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}

aziendeRouter.get('/aziende', manage, async (_req, res) => {
  res.render('aziende/index', { aziende: await listAziende() });
});

aziendeRouter.get('/aziende/nuova', manage, (_req, res) => {
  res.render('aziende/new', { form: { name: '' }, error: null, maxKb: LOGO_MAX_BYTES / 1024 });
});

aziendeRouter.post('/aziende', manage, multipart, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const rawName = typeof body.name === 'string' ? body.name.slice(0, 120) : '';
  const fail = (status: number, error: string): void => {
    res
      .status(status)
      .render('aziende/new', { form: { name: rawName }, error, maxKb: LOGO_MAX_BYTES / 1024 });
  };
  const name = nameSchema.safeParse(body.name);
  if (!name.success) return fail(400, 'aziende.error.name');
  const logo = await logoFromRequest(req);
  if ('error' in logo) return fail(400, logo.error);
  const result = await createAzienda(principalOf(req).user, { name: name.data, logo: logo.logo });
  if (!result.ok) return fail(409, 'aziende.error.nameTaken');
  setFlash(res, 'ok', 'flash.aziendaCreated');
  res.redirect(303, `/aziende/${result.id}`);
});

async function renderShow(
  req: Request,
  res: Response,
  status: number,
  error: string | null,
): Promise<void> {
  const azienda = await getAzienda(String(req.params.id));
  if (!azienda) return notFound(req, res);
  res.status(status).render('aziende/show', { azienda, error, maxKb: LOGO_MAX_BYTES / 1024 });
}

aziendeRouter.get('/aziende/:id', manage, async (req, res) => {
  await renderShow(req, res, 200, null);
});

aziendeRouter.post('/aziende/:id', manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const name = nameSchema.safeParse((req.body as Record<string, unknown>).name);
  if (!name.success) return renderShow(req, res, 400, 'aziende.error.name');
  const result = await renameAzienda(principalOf(req).user, id, name.data);
  if (!result) return notFound(req, res);
  if (!result.ok) return renderShow(req, res, 409, 'aziende.error.nameTaken');
  setFlash(res, 'ok', 'flash.aziendaSaved');
  res.redirect(303, `/aziende/${encodeURIComponent(id)}`);
});

aziendeRouter.post('/aziende/:id/logo', manage, multipart, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const logo = await logoFromRequest(req);
  if ('error' in logo) return renderShow(req, res, 400, logo.error);
  if (!logo.logo) return renderShow(req, res, 400, 'aziende.error.logoMissing');
  if (!(await setAziendaLogo(principalOf(req).user, id, logo.logo))) return notFound(req, res);
  setFlash(res, 'ok', 'flash.logoSaved');
  res.redirect(303, `/aziende/${encodeURIComponent(id)}`);
});

aziendeRouter.post('/aziende/:id/logo/rimuovi', manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  if (!(await setAziendaLogo(principalOf(req).user, id, null))) return notFound(req, res);
  setFlash(res, 'ok', 'flash.logoRemoved');
  res.redirect(303, `/aziende/${encodeURIComponent(id)}`);
});

aziendeRouter.post('/aziende/:id/stato', manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const active = (req.body as Record<string, unknown>).active === '1';
  if (!(await setAziendaActive(principalOf(req).user, id, active))) return notFound(req, res);
  setFlash(res, 'ok', active ? 'flash.aziendaReactivated' : 'flash.aziendaDeactivated');
  res.redirect(303, `/aziende/${encodeURIComponent(id)}`);
});

/**
 * Логото — за хората на фирмата (листът за печат) и за MASTER; за всеки друг „няма такова“. Само PNG
 * или JPEG, прекодирани при качването — браузърът не може да го изпълни като документ.
 */
aziendeRouter.get('/aziende/:id/logo', requireUser, async (req, res) => {
  const id = String(req.params.id);
  if (!isAziendaId(id) || !inScope(scopeOf(principalOf(req).user), id)) return notFound(req, res);
  const logo = await aziendaLogo(id);
  if (!logo) return notFound(req, res);
  res
    .status(200)
    .set({
      'Content-Type': logo.type,
      'Content-Length': String(logo.data.length),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      // Адресът носи ?v=<време на качването> — новото лого е нов адрес, затова кешът може да е дълъг.
      'Cache-Control': 'private, max-age=86400',
    })
    .end(logo.data);
});
