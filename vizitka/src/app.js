// Vizitka — Express приложение (експортва app; server.js слуша).
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import db from './db.js';
import { attachUser, seedAdmins } from './auth.js';
import { baseUrl } from './config.js';
import { COMPANY, FAQ, robotsTxt, sitemapXml, llmsTxt, siteJsonLd } from './seo.js';
import { activeBanners, clickBanner } from './banners.js';
import { indexNowKey } from './indexnow.js';
import { icon } from './icons.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import walletRoutes from './routes/wallet.js';

seedAdmins(); // маркира конфигурираните ADMIN_EMAILS акаунти като админ

const __dirname = dirname(fileURLToPath(import.meta.url));
const prod = process.env.NODE_ENV === 'production';
const app = express();

// Версия на статичните файлове (хеш от съдържанието) за cache-busting: статиката се
// кешира 7 дни, затова добавяме ?v=<hash> към styles.css/app.js — при всяка промяна
// хешът се сменя и браузърите теглят новия файл (иначе стар CSS + нов HTML = счупен вид).
const assetVer = (() => {
  try {
    const pub = join(__dirname, '..', 'public');
    const buf = Buffer.concat([
      readFileSync(join(pub, 'styles.css')),
      readFileSync(join(pub, 'app.js')),
    ]);
    return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  } catch {
    return String(Date.now());
  }
})();

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
//
// `/healthz` е ИЗКЛЮЧЕН и това не е удобство, а поправка на реален инцидент:
// деплоят дърпа сондата на http://127.0.0.1:<PORT>/healthz (по loopback, преди
// nginx, значи БЕЗ X-Forwarded-Proto → `req.secure` е false), затова тук получаваше
// 308 към https. `curl` без `-L` брои 3xx за успех, тялото е „Moved Permanently…“,
// маркерът за идентичност („"app":"vizitka"“) го няма → гейтът обявяваше ЖИВОТО
// приложение за чуждо и откатваше успешен деплой. Сондата няма как да мине по
// https: на 127.0.0.1 приложението говори само чист HTTP (TLS свършва в nginx).
// Изключението е безопасно — отговорът е име на приложението и жива ли е базата,
// нула лични данни, нула бисквитки, нула вход.
if (prod) {
  app.use((req, res, next) => {
    if (req.secure || req.path === '/healthz') return next();
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 100 }));
app.use(cookieParser());
app.use(express.static(join(__dirname, '..', 'public'), { maxAge: prod ? '7d' : 0 }));

// Автентикираните страници не се кешират никъде.
app.use((req, res, next) => {
  if (/^\/(dashboard|login|register|logout|profile|admin|forgot|reset)/.test(req.path))
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
  res.locals.icon = icon; // premium SVG иконки: <%- icon('phone') %>
  res.locals.assetVer = assetVer; // cache-busting за styles.css/app.js
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
// Здравна проверка с ИДЕНТИЧНОСТ. Деплоят дърпаше просто „/" на един порт и
// приемаше всеки 200 за успех — а на споделена машина този порт може да е зает от
// съвсем друго приложение, тоест зеленият сигнал не доказваше нищо. Тук отговорът
// казва кой сме и че базата е жива.
app.get('/healthz', (req, res) => {
  let database = 'down';
  try {
    db.prepare('SELECT 1').get();
    database = 'up';
  } catch {
    database = 'down';
  }
  res.type('application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(database === 'up' ? 200 : 503).json({
    app: 'vizitka',
    ok: database === 'up',
    db: database,
    version: assetVer,
  });
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
app.use(walletRoutes);
app.use(publicRoutes);

app.use((req, res) => res.status(404).render('404', { title: 'Страницата не е намерена' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // НИКОГА не логваме целия обект на грешката: при грешка от body-parser той носи
  // полето `body` със суровото тяло на заявката — тоест пароли и лични данни
  // отиваха в journald при най-обикновено „твърде голямо тяло".
  const status = Number(err?.status || err?.statusCode) || 500;
  const label = err?.type || err?.code || err?.name || 'Error';
  console.error(`[Vizitka] ${req.method} ${req.path} → ${status} ${label}: ${err?.message || ''}`);
  if (status >= 500 && err?.stack) console.error(err.stack);
  if (res.headersSent) return;

  // Предвидими потребителски грешки: 413/400, не 500.
  if (err?.type === 'entity.too.large' || err?.type === 'parameters.too.many')
    return res.status(413).send('Изпратените данни са твърде големи. Върни се и опитай пак.');
  if (err?.code === 'LIMIT_FILE_SIZE')
    return res.status(413).send('Файлът е твърде голям. Върни се и качи по-малък.');
  if (err?.type === 'entity.parse.failed')
    return res.status(400).send('Неразбираема заявка. Върни се и опитай пак.');
  res.status(500).send('Възникна грешка. Опитай отново.');
});

export default app;
