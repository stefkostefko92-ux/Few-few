import { Router, type Request, type Response } from 'express';
import { COMPANY, CONTENT_UPDATED, LEGAL_UPDATED } from '../company.js';
import { config } from '../config.js';
import { applyLocale } from '../http/locale.js';
import { LOCALES, translatorFor, type Locale } from '../i18n.js';
import { TRIAL_DAYS } from '../plans/plan.js';
import { priceTable, VAT_BG_PERCENT } from '../plans/pricing.js';
import { REFUND_DAYS, WITHDRAWAL_DAYS } from '../plans/withdrawal.js';
import { LEGAL, legalPath, PATHS } from '../seo/paths.js';
import {
  FAQ_IDS,
  landingStructuredData,
  landingTextParams,
  legalStructuredData,
} from '../seo/structured-data.js';
import { furnitureByGroup } from '../services/furniture.js';
import { landingAssets } from '../services/landing-assets.js';

/**
 * Витрината: всеки език има свой адрес (`/`, `/en/`, `/it/`), за да може търсачката да ги индексира
 * поотделно (hreflang). Страницата е еднаква за всички — без сесия и без JavaScript, затова се кешира.
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
  res.set('Cache-Control', 'public, max-age=600');
  res.render(view, {
    publicBase: config().PUBLIC_BASE_URL,
    contact: config().CONTACT_EMAIL,
    paths: PATHS,
    legalPath,
    company: COMPANY,
    updated: CONTENT_UPDATED,
    ...data,
  });
}

function landing(locale: Locale) {
  return (req: Request, res: Response) => {
    // Express не различава `/en` от `/en/` и `/EN/` — пренасочваме, за да има един адрес на език.
    if (req.path !== PATHS[locale]) {
      res.redirect(301, PATHS[locale]);
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
      assets: landingAssets(),
      kinds: furnitureByGroup(),
      faqIds: FAQ_IDS,
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
        res.redirect(301, legalPath(locale, page));
        return;
      }
      const canonical = `${config().PUBLIC_BASE_URL}${legalPath(locale, page)}`;
      const title = translatorFor(locale)(`legal.${page}Title`);
      publicPage(res, locale, `legal/${page}`, {
        canonical,
        alternates: alternates((l) => legalPath(l, page)),
        privacyEmail: config().PRIVACY_EMAIL,
        trialDays: TRIAL_DAYS,
        prices: priceTable(),
        vatPercent: VAT_BG_PERCENT,
        withdrawalDays: WITHDRAWAL_DAYS,
        refundDays: REFUND_DAYS,
        updated: LEGAL_UPDATED[page],
        jsonLd: legalStructuredData(
          locale,
          translatorFor(locale),
          canonical,
          title,
          LEGAL_UPDATED[page],
        ),
      });
    });
  }
}

/**
 * Чертежът на вратата за витрината — самостоятелни SVG файлове, заредени като <img> (вътрешният им стил не
 * опира в CSP на страницата): целият лист и два изрязани изгледа от него.
 */
const DRAWINGS = ['door-drawing', 'door-elevation', 'door-cup'] as const;
for (const name of DRAWINGS) {
  landingRouter.get(`/media/${name}.svg`, (_req, res) => {
    const door = landingAssets().door;
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
