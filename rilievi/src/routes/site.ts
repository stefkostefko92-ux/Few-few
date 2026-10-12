import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Request, type Response } from 'express';
import { COMPANY, PRIVACY_UPDATED } from '../company.js';
import { config } from '../config.js';
import { issuePreCsrf, PRE_CSRF_MAX_AGE_MS, requirePreAuthCsrf } from '../auth/guards.js';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../auth/lockout.js';
import { SESSION_LIMITS } from '../auth/sessions.js';
import { requestLimiter } from '../http/limits.js';
import { applyPrefs } from '../http/prefs.js';
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '../i18n.js';
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
import { alternatesOf, publicPath, sentPath, type PublicPage } from '../seo/paths.js';
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
 * Публичната страница: витрината на трите езика (`/`, `/bg/`, `/en/`), политиката за поверителност и
 * заявката за достъп. Регистрация няма — заявката само се записва, решава MASTER (routes/requests.ts).
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

/** Общото за публичните страници: езикът е този на адреса, не на бисквитката. */
function siteLocals(req: Request, res: Response, locale: Locale, page: PublicPage | null) {
  applyPrefs(res, locale, res.locals.theme);
  const base = config().PUBLIC_BASE_URL;
  return {
    publicBase: base,
    canonical: page ? `${base}${publicPath(locale, page)}` : null,
    alternates: alternatesOf(base, page ?? 'home'),
    homePath: publicPath(locale, 'home'),
    privacyPath: publicPath(locale, 'privacy'),
    loginUrl: `/accesso?lang=${locale}`,
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

function renderLanding(
  req: Request,
  res: Response,
  locale: Locale,
  status: number,
  form: RequestForm,
): void {
  const locals = siteLocals(req, res, locale, 'home');
  const t = res.locals.t;
  res.status(status).render('site/landing', {
    ...locals,
    jsonLd: landingStructuredData(locale, t, locals.canonical ?? ''),
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

for (const locale of LOCALES) {
  siteRouter.get(publicPath(locale, 'home'), (req, res) => {
    // Вписаният, който отваря адреса на портала, отива направо на картите (както досега).
    if (locale === DEFAULT_LOCALE && req.principal) {
      res.redirect('/schede');
      return;
    }
    if (req.path !== publicPath(locale, 'home')) {
      res.redirect(301, publicPath(locale, 'home'));
      return;
    }
    renderLanding(req, res, locale, 200, {
      values: emptyRequestValues(),
      errors: {},
      formError: null,
    });
  });

  siteRouter.get(publicPath(locale, 'privacy'), (req, res) => {
    const locals = siteLocals(req, res, locale, 'privacy');
    res.render('site/privacy', {
      ...locals,
      jsonLd: privacyStructuredData(locale, res.locals.t, locals.canonical ?? '', PRIVACY_UPDATED),
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

  siteRouter.get(sentPath(locale), (req, res) => {
    res.render('site/sent', siteLocals(req, res, locale, null));
  });
}

siteRouter.post('/richiesta-accesso', requestLimiter, requirePreAuthCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const locale = isLocale(body.lang) ? body.lang : DEFAULT_LOCALE;
  const parsed = parseAccessRequest(body);
  // Ботът получава същия отговор като човека — нищо не се пази, нищо не му подсказва капана.
  if (parsed.kind === 'spam') {
    res.redirect(303, sentPath(locale));
    return;
  }
  if (parsed.kind === 'invalid') {
    renderLanding(req, res, locale, 422, {
      values: parsed.values,
      errors: parsed.errors,
      formError: null,
    });
    return;
  }
  const result = await submitAccessRequest(parsed.data, locale);
  if (!result.ok) {
    renderLanding(req, res, locale, 429, {
      values: { ...emptyRequestValues(), ...requestValuesOf(parsed.data) },
      errors: {},
      formError: 'busy',
    });
    return;
  }
  res.redirect(303, sentPath(locale));
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
