import express, { Router } from 'express';
import { principalOf, renderError, requireCsrf, requireUser } from '../auth/guards.js';
import { setFlash } from '../http/flash.js';
import { jsonForScript } from '../http/json-script.js';
import { apiLimiter, exportLimiter } from '../http/limits.js';
import { requestMeta, stringField } from '../http/meta.js';
import { translatorFor, type Translator } from '../i18n.js';
import { planView } from '../plans/plan.js';
import { catalogInfo, isFurnitureType } from '../services/engine.js';
import { furnitureKinds } from '../services/furniture.js';
import {
  buildExport,
  CncBlockedError,
  contentDisposition,
  isExportKind,
} from '../services/exports.js';
import {
  createProject,
  deleteProject,
  duplicateProject,
  listOwnProjects,
  ownProject,
  projectSummary,
  saveProject,
} from '../services/projects.js';

export const appRouter: Router = Router();
appRouter.use('/app', requireUser, requireCsrf, (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ------------------------------------- проекти ------------------------------------- */

appRouter.get('/app', async (req, res) => {
  const principal = principalOf(req);
  const projects = await listOwnProjects(principal.user.id);
  const t = res.locals.t as Translator;
  res.render('app/projects', {
    plan: planView(principal.user),
    projects: projects.map((p) => ({ ...p, summary: projectSummary(p) })),
    types: furnitureKinds().map((kind) => ({
      id: kind.id,
      label: t(`furniture.${kind.id}`),
      group: t(`furniture.group.${kind.group}`),
    })),
  });
});

appRouter.post('/app/projects', async (req, res) => {
  const principal = principalOf(req);
  const type = stringField(req.body, 'type', 20);
  // Без име проектът се казва като вида мебел — на езика на човека, не на двигателя.
  const name =
    stringField(req.body, 'name', 80) ||
    (isFurnitureType(type) ? (res.locals.t as Translator)(`furniture.${type}`) : '');
  const result = await createProject(principal.user, name, type, requestMeta(req));
  if (!result.ok) {
    setFlash(res, 'error', result.key);
    res.redirect('/app');
    return;
  }
  res.redirect(`/app/p/${result.project.id}`);
});

appRouter.post('/app/p/:id/duplicate', async (req, res) => {
  const result = await duplicateProject(
    principalOf(req).user,
    String(req.params.id),
    requestMeta(req),
  );
  setFlash(res, result.ok ? 'ok' : 'error', result.ok ? 'flash.projectDuplicated' : result.key);
  res.redirect('/app');
});

appRouter.post('/app/p/:id/delete', async (req, res) => {
  const ok = await deleteProject(principalOf(req).user, String(req.params.id), requestMeta(req));
  setFlash(res, ok ? 'ok' : 'error', ok ? 'flash.projectDeleted' : 'error.notFoundText');
  res.redirect('/app');
});

/* ------------------------------------- редактор ------------------------------------- */

appRouter.get('/app/p/:id', async (req, res) => {
  const principal = principalOf(req);
  const project = await ownProject(principal.user.id, String(req.params.id));
  if (!project) {
    renderError(res, 404, 'error.notFoundTitle', 'error.notFoundText');
    return;
  }
  const plan = planView(principal.user);
  res.render('app/editor', {
    project,
    plan,
    readOnly: !plan.canCreate,
    // Работното поле на редактора засега е само на български (етикетите идват и от двигателя);
    // заглавната лента остава на езика на човека, а под нея има бележка.
    te: translatorFor('bg'),
    boot: jsonForScript({
      id: project.id,
      name: project.name,
      spec: project.spec,
      hash: project.specHash,
      updatedAt: project.updatedAt.toISOString(),
      readOnly: !plan.canCreate,
      owner: principal.user.name,
    }),
  });
});

/** Записва спецификацията. Изтекъл план → 402 с ключ, редакторът показва защо. */
appRouter.put(
  '/app/api/projects/:id',
  apiLimiter,
  express.json({ limit: '64kb' }),
  async (req, res) => {
    const principal = principalOf(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await saveProject(
      principal.user,
      String(req.params.id),
      body.spec,
      body.name,
      body.base,
    );
    if (!result.ok) {
      res
        .status(result.status)
        .json({ error: res.locals.t(result.key) as string, code: result.key });
      return;
    }
    res.json({
      hash: result.project.specHash,
      updatedAt: result.project.updatedAt.toISOString(),
      name: result.project.name,
    });
  },
);

/** Каталогът за редактора — само за вписани (данните от магазините не са публични). */
appRouter.get('/app/catalog.json', (req, res) => {
  const { json, etag } = catalogInfo();
  res.set('Cache-Control', 'private, max-age=3600').set('ETag', etag);
  if (req.get('if-none-match') === etag) {
    res.status(304).end();
    return;
  }
  res.type('application/json').send(json);
});

/**
 * Изтегляне: от ЗАПАЗЕНАТА спецификация, за собственика на проекта, при всяко състояние на плана.
 * Така изтекъл акаунт пази достъп до направеното, без да може да произведе ново.
 */
appRouter.get('/app/p/:id/export/:kind', exportLimiter, async (req, res) => {
  const principal = principalOf(req);
  const kind = String(req.params.kind);
  const project = await ownProject(principal.user.id, String(req.params.id));
  if (!project || !isExportKind(kind)) {
    renderError(res, 404, 'error.notFoundTitle', 'error.notFoundText');
    return;
  }
  let file;
  try {
    file = buildExport(project, principal.user.name, kind);
  } catch (err) {
    if (!(err instanceof CncBlockedError)) throw err;
    res.status(422).render('errors/error', {
      titleKey: 'error.cncBlockedTitle',
      messageKey: 'error.cncBlockedText',
      status: 422,
      details: err.reasons,
      back: { href: `/app/p/${project.id}#cnc`, key: 'error.toProject' },
    });
    return;
  }
  res
    .set('Content-Type', file.mime)
    .set('Content-Disposition', contentDisposition(file.name))
    .send(file.body);
});
