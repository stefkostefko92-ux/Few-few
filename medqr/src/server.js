import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { attachUser } from './auth.js';
import { csrf } from './csrf.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import emergencyRoutes from './routes/emergency.js';
import {
  SITE_NAME,
  SITE_LOCALE,
  DEFAULT_DESCRIPTION,
  siteBaseUrl,
  robotsTxt,
  sitemapXml,
  llmsTxt,
  webManifest,
} from './seo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prod = process.env.NODE_ENV === 'production';
const app = express();

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));
app.set('trust proxy', 1); // зад reverse proxy (Hetzner) за коректен protocol/IP
app.disable('x-powered-by');

const COMPANY = { name: 'CarbonStealth VCC', url: 'https://carbonstealth.eu' };

// CSP nonce за всяка заявка (позволява нашите inline JSON-LD без 'unsafe-inline').
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: prod ? [] : null,
      },
    },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// Принудителен HTTPS в продукция (зад прокси, по X-Forwarded-Proto).
if (prod) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(join(__dirname, '..', 'public'), { maxAge: prod ? '7d' : 0 }));
app.use(attachUser);

// Общи locals за изгледите: компания, потребител и SEO meta (noindex по подразбиране).
app.use((req, res, next) => {
  const base = siteBaseUrl(req);
  res.locals.company = COMPANY;
  res.locals.user = req.user;
  res.locals.site = { name: SITE_NAME, locale: SITE_LOCALE, base };
  res.locals.meta = {
    description: DEFAULT_DESCRIPTION,
    robots: 'noindex, nofollow', // безопасно по подразбиране; публичните страници го отменят
    canonical: base + (req.path === '/' ? '/' : req.path),
    ogType: 'website',
    ogImage: base + '/og-image.png',
  };
  next();
});

app.use(csrf);

// ---- SEO / GEO / AEO ресурси ----
app.get('/robots.txt', (req, res) => res.type('text/plain').send(robotsTxt(siteBaseUrl(req))));
app.get('/sitemap.xml', (req, res) =>
  res.type('application/xml').send(sitemapXml(siteBaseUrl(req)))
);
app.get('/llms.txt', (req, res) => res.type('text/plain; charset=utf-8').send(llmsTxt(siteBaseUrl(req))));
app.get('/manifest.webmanifest', (req, res) =>
  res.type('application/manifest+json').send(JSON.stringify(webManifest(siteBaseUrl(req))))
);

// Лимити срещу брутфорс.
app.use(
  ['/login', '/register', '/2fa', '/forgot', '/reset'],
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30 })
);
app.use('/e', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));

// Помощник: маркира страница като публична/индексируема.
function publicPage(res, description) {
  res.locals.meta.robots = 'index, follow';
  if (description) res.locals.meta.description = description;
}

app.get('/', (req, res) => {
  publicPage(
    res,
    'Защитен спешен медицински профил с QR код: кръвна група, алергии, заболявания и спешен контакт — достъпни при злополука, дори ако не можете да говорите.'
  );
  res.render('home', { user: req.user });
});
app.get('/privacy', (req, res) => {
  publicPage(res, 'Политика за поверителност на MedQR: какви лични и здравни данни обработваме, на какво основание (GDPR, чл. 9), как ги защитаваме и вашите права.');
  res.render('privacy', { user: req.user });
});
app.get('/cookies', (req, res) => {
  publicPage(res, 'Политика за бисквитки на MedQR: използваме само строго необходими бисквитки за вход и сигурност. Без проследяване, реклами или трети страни.');
  res.render('cookies', { user: req.user });
});
app.get('/terms', (req, res) => {
  publicPage(res, 'Общи условия за ползване на MedQR — информационна услуга за спешен медицински профил. Не е медицинско изделие.');
  res.render('terms', { user: req.user });
});

app.use(authRoutes);
app.use(profileRoutes);
app.use(emergencyRoutes);

app.use((req, res) =>
  res.status(404).render('emergency-error', { message: 'Страницата не е намерена.', user: req.user })
);

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`MedQR слуша на http://localhost:${PORT}`));
}

export default app;
