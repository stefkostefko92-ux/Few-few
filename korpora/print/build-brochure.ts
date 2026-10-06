/**
 * Брошурата A4 за клиенти на трите езика: шест страници от речниците (`brochure.*` и текстовете на
 * витрината) и от истинските изходи на двигателя — един проект, кухня от четири модула. Всичко се вгражда
 * в самостоятелен HTML (шрифтове, 3D изгледът, QR кодът), после Playwright го печата като PDF.
 *
 *   npm run brochure          # print/korpora-brochure-<език>.pdf (+ HTML за преглед в print/build/)
 *
 * Пуска се ръчно след промяна на цените, текстовете или двигателя. Каталогът от магазините се ползва,
 * ако е в data/catalog.json — както на сървъра; без него брошурата е с основния каталог.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { COMPANY, CONTENT_UPDATED, PRODUCT_URL } from '../src/company.js';
import { LOCALE_TAG, LOCALES, translatorFor, type Locale } from '../src/i18n.js';
import { ROOT } from '../src/paths.js';
import { TRIAL_DAYS } from '../src/plans/plan.js';
import { formatMoney, priceTable, VAT_BG_PERCENT } from '../src/plans/pricing.js';
import { legalPath, PATHS } from '../src/seo/paths.js';
import { loadEngine } from '../src/services/engine.js';
import { landingAssets } from '../src/services/landing-assets.js';
import { furnitureLineup } from '../src/services/furniture-lineup.js';
import { cover, drilling, esc, how, type BrochureContext } from './pages.js';
import { kinds, machine, prices } from './pages-more.js';

const HERE = join(ROOT, 'print');
const OUT = join(HERE, 'build');
/** Всички мебели на страница 5 са в този мащаб — най-широкият ред (хол и кабинет) се побира на A4. */
const LINEUP_SCALE = 50;

const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

/** Шрифтовете на сайта (SIL OFL), вградени — PDF-ът изглежда еднакво навсякъде. */
function fontFaces(): string {
  const face = (family: string, file: string, weight: string, range: string) => {
    const data = readFileSync(join(ROOT, 'public', 'fonts', file)).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range};}`;
  };
  return [
    face('Geologica', 'geologica-cyrillic.woff2', '300 800', CYRILLIC),
    face('Geologica', 'geologica-latin-ext.woff2', '300 800', LATIN_EXT),
    face('Geologica', 'geologica-latin.woff2', '300 800', LATIN),
    face('JetBrains Mono', 'jetbrains-mono-cyrillic.woff2', '400 500', CYRILLIC),
    face('JetBrains Mono', 'jetbrains-mono-latin.woff2', '400 500', LATIN),
  ].join('\n');
}

/** 3D изгледът на същата кухня — снима се от работещ Korpora с `print/capture-3d.ts`. */
function renderImage(): string | null {
  const file = join(HERE, 'assets', 'kitchen-3d.jpg');
  return existsSync(file)
    ? `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`
    : null;
}

type SharedContext = Pick<BrochureContext, 'lineup' | 'render' | 'mark'>;

/** Частите, които не зависят от езика — смятат се веднъж за трите брошури. */
function sharedContext(): SharedContext {
  const groups = furnitureLineup();
  return {
    lineup: { groups, scale: LINEUP_SCALE, count: groups.reduce((n, g) => n + g.items.length, 0) },
    render: renderImage(),
    mark: readFileSync(join(ROOT, 'views', 'partials', 'mark.ejs'), 'utf8').trim(),
  };
}

async function contextFor(
  locale: Locale,
  site: string,
  shared: SharedContext,
): Promise<BrochureContext> {
  const t = translatorFor(locale);
  const tag = LOCALE_TAG[locale];
  const number = new Intl.NumberFormat(tag);
  const date = new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Sofia',
  });
  const landing = `${site}${PATHS[locale]}`;
  // етикетът и стойността (и телефонът) не се разделят на два реда
  const keep = (text: string) => text.replace(/ /g, '\u00a0');
  const company = [
    t('company.legalName'),
    t('company.legalForm'),
    keep(`${t('company.eikLabel')} ${COMPANY.eik}`),
    keep(`${t('company.vatLabel')} ${COMPANY.vat}`),
    t('company.street'),
    `${COMPANY.postalCode} ${t('company.city')}`,
    t('company.region'),
    t('company.country'),
    keep(`${t('company.phoneLabel')} ${COMPANY.phone}`),
  ].join(', ');
  return {
    ...shared,
    locale,
    t,
    num: (value) => number.format(value),
    money: (cents) => formatMoney(cents, locale),
    url: {
      site: landing,
      label: landing.replace(/^https:\/\//, '').replace(/\/$/, ''),
      terms: `${site}${legalPath(locale, 'terms')}`,
    },
    assets: landingAssets(),
    prices: priceTable(),
    trialDays: TRIAL_DAYS,
    vatPercent: VAT_BG_PERCENT,
    priceDate: date.format(new Date(`${CONTENT_UPDATED}T12:00:00Z`)),
    qr: await QRCode.toString(landing, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#34302f', light: '#0000' },
    }),
    email: COMPANY.email,
    company,
  };
}

function documentFor(c: BrochureContext, css: string): string {
  const pages = [cover(c), how(c), drilling(c), machine(c), kinds(c), prices(c)].join('\n');
  return `<!doctype html>
<html lang="${c.locale}">
<head>
<meta charset="utf-8">
<title>${esc(c.t('brochure.title'))}</title>
<meta name="author" content="Carbon Stealth VCC">
<meta name="keywords" content="${esc(c.t('brochure.keywords'))}">
<style>${css}</style>
</head>
<body>
${pages}
</body>
</html>
`;
}

async function main(): Promise<void> {
  const site = (process.env.BROCHURE_URL ?? PRODUCT_URL).replace(/\/+$/, '');
  await loadEngine(join(ROOT, 'data', 'catalog.json'));
  const css = ['brochure.css', 'brochure-sheet.css', 'brochure-pages.css', 'brochure-end.css']
    .map((file) => readFileSync(join(HERE, file), 'utf8'))
    .join('\n')
    .replace('/*FONTS*/', fontFaces());
  const shared = sharedContext();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const locale of LOCALES) {
      const html = documentFor(await contextFor(locale, site, shared), css);
      writeFileSync(join(OUT, `brochure-${locale}.html`), html);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      // the fonts are data URIs: wait until the page has laid them out before printing
      await page.evaluate('document.fonts.ready.then(() => true)');
      const pdf = join(HERE, `korpora-brochure-${locale}.pdf`);
      await page.pdf({
        path: pdf,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        tagged: true,
        outline: true,
      });
      await page.close();
      process.stdout.write(`${pdf}\n`);
    }
  } finally {
    await browser.close();
  }
}

await main();
