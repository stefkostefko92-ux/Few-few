import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Request, type Response } from 'express';
import { COMPANY, PRIVACY_UPDATED } from '../company.js';
import { config } from '../config.js';
import { issuePreCsrf, PRE_CSRF_MAX_AGE_MS, requirePreAuthCsrf } from '../auth/guards.js';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../auth/lockout.js';
import { SESSION_LIMITS } from '../auth/sessions.js';
import { requestLimiter } from '../http/limits.js';
import { ROOT } from '../paths.js';
import {
  emptyRequestValues,
  HONEYPOT,
  parseAccessRequest,
  REQUEST_FIELDS,
  REQUEST_LIMITS,
  TEAM_SIZES,
  type RequestErrors,
  type RequestValues,
} from '../requests/form.js';
import { REQUEST_RETENTION_DAYS, submitAccessRequest } from '../requests/service.js';
import { llmsTxt, robotsTxt, sitemapXml } from '../seo/files.js';
import { HOME_PATH, PRIVACY_PATH, SENT_PATH } from '../seo/paths.js';
import { landingStructuredData, privacyStructuredData } from '../seo/structured-data.js';
import { INVITE_DAYS } from '../services/invites.js';
import {
  FAQ_IDS,
  FEATURES,
  MATRIX_CAPABILITIES,
  roleMatrix,
  sheetCounts,
  sheetLegend,
  STEPS,
} from '../site/landing.js';
import { DAY, HOUR } from '../time.js';

/**
 * Публичната страница: витрината (`/`, само на италиански), политиката за поверителност и заявката за
 * достъп. Регистрация няма — заявката само се записва, решава MASTER (routes/requests.ts).
 * Тук са и robots.txt, sitemap.xml, llms.txt и ключът за IndexNow.
 */
export const siteRouter: Router = Router();

/** IndexNow: ключът е публичен по замисъл — търсачката го чете от сайта (tools/seo/indexnow.mjs). */
const INDEXNOW_KEY = readFileSync(join(ROOT, 'public', 'indexnow-key.txt'), 'utf8').trim();
const TEXT_CACHE = 'public, max-age=3600';

siteRouter.get('/robots.txt', (_req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', TEXT_CACHE)
    .send(robotsTxt(config().PUBLIC_BASE_URL, INDEXNOW_KEY));
});

siteRouter.get('/sitemap.xml', (_req, res) => {
  res
    .type('application/xml')
    .set('Cache-Control', TEXT_CACHE)
    .send(sitemapXml(config().PUBLIC_BASE_URL));
});

siteRouter.get('/llms.txt', (_req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', TEXT_CACHE)
    .send(llmsTxt(config().PUBLIC_BASE_URL, config().CONTACT_EMAIL));
});

siteRouter.get(['/indexnow-key.txt', `/${INDEXNOW_KEY}.txt`], (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400').send(INDEXNOW_KEY);
});

/** Общото за публичните страници; `path` е каноничният адрес (null — страница извън индекса). */
function siteLocals(req: Request, path: string | null) {
  const base = config().PUBLIC_BASE_URL;
  return {
    publicBase: base,
    canonical: path ? `${base}${path}` : null,
    homePath: HOME_PATH,
    privacyPath: PRIVACY_PATH,
    loginUrl: '/accesso',
    signedIn: Boolean(req.principal),
    company: COMPANY,
    contactEmail: config().CONTACT_EMAIL,
  };
}

interface RequestForm {
  values: RequestValues;
  errors: RequestErrors;
  formError: 'busy' | null;
}

function renderLanding(req: Request, res: Response, status: number, form: RequestForm): void {
  const locals = siteLocals(req, HOME_PATH);
  const t = res.locals.t;
  res.status(status).render('site/landing', {
    ...locals,
    jsonLd: landingStructuredData(t, locals.canonical ?? ''),
    legend: sheetLegend(t),
    counts: sheetCounts(),
    roles: roleMatrix(),
    capabilities: MATRIX_CAPABILITIES,
    faqIds: FAQ_IDS,
    steps: STEPS,
    features: FEATURES,
    inviteDays: INVITE_DAYS,
    retentionDays: REQUEST_RETENTION_DAYS,
    preCsrf: issuePreCsrf(req, res),
    honeypot: HONEYPOT,
    requestFields: REQUEST_FIELDS,
    teamSizes: TEAM_SIZES,
    limits: REQUEST_LIMITS,
    ...form,
  });
}

siteRouter.get(HOME_PATH, (req, res) => {
  // Вписаният, който отваря адреса на портала, отива направо на картите (както досега).
  if (req.principal) {
    res.redirect('/schede');
    return;
  }
  renderLanding(req, res, 200, { values: emptyRequestValues(), errors: {}, formError: null });
});

siteRouter.get(PRIVACY_PATH, (req, res) => {
  const locals = siteLocals(req, PRIVACY_PATH);
  res.render('site/privacy', {
    ...locals,
    jsonLd: privacyStructuredData(res.locals.t, locals.canonical ?? '', PRIVACY_UPDATED),
    updated: PRIVACY_UPDATED,
    privacyEmail: config().PRIVACY_EMAIL,
    retentionDays: REQUEST_RETENTION_DAYS,
    auditDays: config().AUDIT_RETENTION_DAYS,
    sessionDays: SESSION_LIMITS.standard.absoluteMs / DAY,
    adminSessionDays: SESSION_LIMITS.privileged.absoluteMs / DAY,
    preCsrfHours: PRE_CSRF_MAX_AGE_MS / HOUR,
    attempts: MAX_FAILED_LOGINS,
    minutes: LOCK_MINUTES,
  });
});

siteRouter.get(SENT_PATH, (req, res) => {
  res.render('site/sent', siteLocals(req, null));
});

siteRouter.post('/richiesta-accesso', requestLimiter, requirePreAuthCsrf, async (req, res) => {
  const parsed = parseAccessRequest(req.body as Record<string, unknown>);
  // Ботът получава същия отговор като човека — нищо не се пази, нищо не му подсказва капана.
  if (parsed.kind === 'spam') {
    res.redirect(303, SENT_PATH);
    return;
  }
  if (parsed.kind === 'invalid') {
    renderLanding(req, res, 422, {
      values: parsed.values,
      errors: parsed.errors,
      formError: null,
    });
    return;
  }
  const result = await submitAccessRequest(parsed.data);
  if (!result.ok) {
    renderLanding(req, res, 429, {
      values: { ...emptyRequestValues(), ...requestValuesOf(parsed.data) },
      errors: {},
      formError: 'busy',
    });
    return;
  }
  res.redirect(303, SENT_PATH);
});

/** Проверените стойности обратно във вида на формата (при „заето“ въведеното остава на екрана). */
function requestValuesOf(data: {
  name: string;
  company: string;
  email: string;
  phone: string | null;
  city: string | null;
  teamSize: string | null;
  message: string | null;
}): Partial<RequestValues> {
  return {
    name: data.name,
    company: data.company,
    email: data.email,
    phone: data.phone ?? '',
    city: data.city ?? '',
    teamSize: data.teamSize ?? '',
    message: data.message ?? '',
    privacy: 'si',
  };
}
