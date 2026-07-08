// Vizitka — Express приложение (експортва app; server.js слуша).
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import './db.js';
import { attachUser, seedAdmins } from './auth.js';
import { baseUrl } from './config.js';
import { COMPANY, FAQ, robotsTxt, sitemapXml, llmsTxt, siteJsonLd } from './seo.js';
import { activeBanners, clickBanner } from './banners.js';
import { indexNowKey } from './indexnow.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

seedAdmins(); // маркира конфигурираните ADMIN_EMAILS акаунти като админ

const __dirname = dirname(fileURLToPath(import.meta.url));
const prod = process.env.NODE_ENV === 'production';
const app = express();

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));
app.set('trust proxy', 1); // зад reverse proxy (Hetzner) за коректен protocol/IP
app.disable('x-powered-by');

// CSP nonce за всяка заявка (позволява нашия inline JSON-LD без 'unsafe-inline').
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
        styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
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

app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 100 }));
app.use(cookieParser());
app.use(express.static(join(__dirname, '..', 'public'), { maxAge: prod ? '7d' : 0 }));

// Автентикираните страници не се кешират никъде.
app.use((req, res, next) => {
  if (/^\/(dashboard|login|register|logout|profile|admin)/.test(req.path))
    res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(attachUser);

// Общи locals за изгледите.
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.csrfToken = req.session?.csrf_token || '';
  res.locals.currentPath = req.path;
  res.locals.company = COMPANY;
  res.locals.siteBase = baseUrl(req);
  next();
});

app.get('/', (req, res) =>
  res.render('home', {
    title: null,
    faq: FAQ,
    jsonLd: siteJsonLd(baseUrl(req)),
    banners: activeBanners('home'),
  })
);
// Клик по рекламен банер — брои и пренасочва към целта.
app.get('/b/:id/click', (req, res) => {
  const target = clickBanner(Number(req.params.id));
  if (!target) return res.status(404).render('404', { title: 'Няма такава реклама' });
  res.redirect(302, target);
});
app.get('/robots.txt', (req, res) => res.type('text/plain').send(robotsTxt(baseUrl(req))));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(sitemapXml(baseUrl(req))));
app.get('/llms.txt', (req, res) => res.type('text/plain').send(llmsTxt(baseUrl(req))));
// IndexNow ключов файл — доказва собствеността пред търсачките (Bing и др.).
if (indexNowKey()) {
  app.get(`/${indexNowKey()}.txt`, (req, res) => res.type('text/plain').send(indexNowKey()));
}
app.get('/privacy', (req, res) => res.render('privacy', { title: 'Политика за поверителност' }));
app.get('/terms', (req, res) => res.render('terms', { title: 'Общи условия' }));
app.use(authRoutes);
app.use(dashboardRoutes);
app.use(adminRoutes);
app.use(publicRoutes);

app.use((req, res) => res.status(404).render('404', { title: 'Страницата не е намерена' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).send('Възникна грешка. Опитай отново.');
});

export default app;
