import { Router, type Request, type Response } from 'express';
import { COMPANY, LEGAL_UPDATED } from '../company.js';
import { config } from '../config.js';
import { applyLocale } from '../http/locale.js';
import { DEFAULT_LOCALE, LOCALES, ogLocale, translatorFor, type Locale } from '../i18n.js';
import { TRIAL_DAYS } from '../plans/plan.js';
import { formatLifetimeTimes, priceTable, VAT_BG_PERCENT } from '../plans/pricing.js';
import { retentionText } from '../retention.js';
import { LEGAL, legalPath, PATHS } from '../seo/paths.js';
import {
  FAQ_IDS,
  HOW_STEPS,
  landingStructuredData,
  landingTextParams,
  legalStructuredData,
} from '../seo/structured-data.js';
import { furnitureLineup } from '../services/furniture-lineup.js';
import { EXAMPLE, landingAssets } from '../services/landing-assets.js';
import { legalNumbers, privacyNumbers } from '../services/legal-numbers.js';

/**
 * Витрината: всеки език има свой адрес (`/`, `/en/`, `/it/`), за да може търсачката да ги индексира
 * поотделно (hreflang). Страницата е еднаква за всички — без сесия, затова се кешира. Работи и без
 * JavaScript; модулът landing/main.js само добавя движението (снимките по стъпки и живата 3D сцена).
 */
export const landingRouter: Router = Router();

function alternates(pathFor: (locale: Locale) => string) {
  const base = config().PUBLIC_BASE_URL;
  return LOCALES.map((locale) => ({
    locale,
    path: pathFor(locale),
    href: `${base}${pathFor(locale)}`,
  }));
}

function publicPage(
  res: Response,
  locale: Locale,
  view: string,
  data: Record<string, unknown>,
): void {
  applyLocale(res, locale);
  // the page carries this response's CSP nonce: only the visitor's own cache may keep it, never a shared one
  res.set('Cache-Control', 'private, max-age=600');
  // `paths` и `legalPath` са в res.locals за всички страници (server.ts)
  res.render(view, {
    publicBase: config().PUBLIC_BASE_URL,
    contact: config().CONTACT_EMAIL,
    company: COMPANY,
    ogLocale,
    lifetimeTimes: formatLifetimeTimes(locale),
    ...data,
  });
}

/** Пренасочване към каноничния адрес със същия query низ — UTM/gclid от кампанията не се губят. */
function toCanonical(req: Request, res: Response, path: string): void {
  const query = req.originalUrl.indexOf('?');
  res.redirect(301, query === -1 ? path : path + req.originalUrl.slice(query));
}

function landing(locale: Locale) {
  return (req: Request, res: Response) => {
    // Express не различава `/en` от `/en/` и `/EN/` — пренасочваме, за да има един адрес на език.
    if (req.path !== PATHS[locale]) {
      toCanonical(req, res, PATHS[locale]);
      return;
    }
    const canonical = `${config().PUBLIC_BASE_URL}${PATHS[locale]}`;
    const prices = priceTable();
    publicPage(res, locale, 'landing/index', {
      canonical,
      alternates: alternates((l) => PATHS[l]),
      prices,
      vatPercent: VAT_BG_PERCENT,
      trialDays: TRIAL_DAYS,
      assets: landingAssets(locale),
      media: (name: string) => `/media/${mediaName(name, locale)}`,
      storyExample: EXAMPLE,
      lineup: furnitureLineup(),
      faqIds: FAQ_IDS,
      howSteps: HOW_STEPS,
      texts: landingTextParams(locale, prices),
      jsonLd: landingStructuredData(locale, translatorFor(locale), canonical, prices),
    });
  };
}

landingRouter.get('/', landing('bg'));
landingRouter.get('/en/', landing('en'));
landingRouter.get('/it/', landing('it'));

for (const page of LEGAL) {
  for (const locale of LOCALES) {
    landingRouter.get(legalPath(locale, page), (req, res) => {
      // `/privacy/` и `/Privacy` са същата страница за Express — един адрес за търсачката
      if (req.path !== legalPath(locale, page)) {
        toCanonical(req, res, legalPath(locale, page));
        return;
      }
      const canonical = `${config().PUBLIC_BASE_URL}${legalPath(locale, page)}`;
      const t = translatorFor(locale);
      const title = t(`legal.${page}Title`);
      publicPage(res, locale, 'legal/page', {
        page,
        canonical,
        alternates: alternates((l) => legalPath(l, page)),
        privacyEmail: config().PRIVACY_EMAIL,
        ...legalNumbers(locale),
        ...privacyNumbers(locale),
        // срокът на одита идва от настройката, по която го трие поддръжката — не е писан на ръка
        auditKept: retentionText(config().AUDIT_RETENTION_DAYS, t),
        updated: LEGAL_UPDATED[page],
        jsonLd: legalStructuredData(locale, t, canonical, title, LEGAL_UPDATED[page]),
      });
    });
  }
}

/**
 * Чертежът на вратата за витрината — самостоятелни SVG файлове, заредени като <img> (вътрешният им стил не
 * опира в CSP на страницата): целият лист и два изрязани изгледа от него. Надписите са на езика на
 * витрината: `door-drawing.svg` на български, `door-drawing.en.svg` и `door-drawing.it.svg` (`mediaName`).
 */
/** Името на файла с чертежа на езика: българският е без наставка (адресите отпреди езиците остават). */
export const mediaName = (name: string, locale: Locale): string =>
  locale === DEFAULT_LOCALE ? `${name}.svg` : `${name}.${locale}.svg`;
const DRAWINGS = ['door-drawing', 'door-elevation', 'door-cup'] as const;
for (const name of DRAWINGS)
  for (const locale of LOCALES) {
    landingRouter.get(`/media/${mediaName(name, locale)}`, (_req, res) => {
      const door = landingAssets(locale).door;
      if (!door) {
        res.status(404).end();
        return;
      }
      const svg =
        name === 'door-elevation'
          ? door.elevation.svg
          : name === 'door-cup'
            ? door.cup.svg
            : door.svg;
      res
        .type('image/svg+xml')
        .set('Cache-Control', 'public, max-age=86400')
        .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
        .send(svg);
    });
  }
