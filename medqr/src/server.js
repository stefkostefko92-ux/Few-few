import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import db from './db.js';
import { attachUser } from './auth.js';
import { csrf } from './csrf.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import emergencyRoutes from './routes/emergency.js';
import webauthnRoutes from './routes/webauthn.js';
import {
  SITE_NAME,
  SITE_LOCALE,
  DEFAULT_DESCRIPTION,
  LEGAL,
  GEO,
  siteBaseUrl,
  robotsTxt,
  sitemapXml,
  llmsTxt,
  webManifest,
  securityTxt,
} from './seo.js';
import { LANGS, pickLang, makeT, clinicalLabel, displayName } from './i18n.js';
import { ALLERGIES, CONDITIONS, medLabels, sortedCountries } from './medical.js';

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
        workerSrc: ["'self'"],
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

app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 100 }));
app.use(express.json({ limit: '64kb' })); // за WebAuthn JSON заявките
app.use(cookieParser());

// Permissions-Policy: изключваме сензори/устройства, които приложението не ползва.
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), nfc=(self)'
  );
  next();
});

app.use(express.static(join(__dirname, '..', 'public'), { maxAge: prod ? '7d' : 0 }));

// Чувствителните (автентикирани и спешни) страници не се кешират никъде.
const NO_STORE =
  /^\/(dashboard|profile|sos|login|register|2fa|forgot|reset|verify-email|e\/|card|qr\.png|logout)/;
app.use((req, res, next) => {
  if (NO_STORE.test(req.path)) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(attachUser);

// Общи locals за изгледите: компания, потребител и SEO meta (noindex по подразбиране).
app.use((req, res, next) => {
  const base = siteBaseUrl(req);
  // Език (BG/EN): ?lang= го сменя и запазва в бисквитка; иначе по бисквитка/браузър.
  if (req.query.lang && LANGS.includes(req.query.lang)) {
    res.cookie('lang', req.query.lang, {
      maxAge: 1000 * 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: prod,
    });
  }
  const lang = pickLang(req);
  res.locals.lang = lang;
  res.locals.t = makeT(lang);
  res.locals.clin = (value) => clinicalLabel(value, lang);
  res.locals.name = (value) => displayName(value, lang);
  res.locals.ALLERGIES = ALLERGIES;
  res.locals.CONDITIONS = CONDITIONS;
  res.locals.COUNTRIES = sortedCountries(lang);
  // CSV от ключове → масив преведени етикети (структурирани алергии/състояния).
  res.locals.allergyLabels = (csv) => medLabels(ALLERGIES, csv, lang);
  res.locals.conditionLabels = (csv) => medLabels(CONDITIONS, csv, lang);
  res.locals.company = COMPANY;
  res.locals.user = req.user;
  res.locals.legal = LEGAL;
  res.locals.geo = GEO;
  res.locals.site = { name: SITE_NAME, locale: SITE_LOCALE, base };
  // Езикът се адресира през ?lang=: BG е по подразбиране (чист URL = x-default),
  // EN — с ?lang=en. canonical-ът сочи към собствения езиков вариант (self-ref),
  // за да не се „канонизира“ EN страницата обратно към BG и да отпадне от индекса.
  const urlClean = base + (req.path === '/' ? '/' : req.path);
  const urlEn = urlClean + '?lang=en';
  res.locals.meta = {
    description: DEFAULT_DESCRIPTION,
    robots: 'noindex, nofollow', // безопасно по подразбиране; публичните страници го отменят
    canonical: lang === 'en' ? urlEn : urlClean,
    urlClean,
    urlEn,
    ogType: 'website',
    ogImage: base + '/og-image.png',
  };
  next();
});

app.use(csrf);

// Здравна проверка за оркестратора (Render/Docker) — без кеширане, без данни.
app.get(['/health', '/healthz'], (req, res) =>
  res.type('text/plain').setHeader('Cache-Control', 'no-store').send('ok')
);

// ---- SEO / GEO / AEO ресурси ----
// Публичните, нечувствителни ресурси се кешират за по-добра производителност.
const PUBLIC_CACHE = prod ? 'public, max-age=3600' : 'no-cache';
app.get('/robots.txt', (req, res) =>
  res
    .type('text/plain')
    .setHeader('Cache-Control', PUBLIC_CACHE)
    .send(robotsTxt(siteBaseUrl(req)))
);
app.get('/sitemap.xml', (req, res) =>
  res
    .type('application/xml')
    .setHeader('Cache-Control', PUBLIC_CACHE)
    .send(sitemapXml(siteBaseUrl(req)))
);
app.get('/llms.txt', (req, res) =>
  res
    .type('text/plain; charset=utf-8')
    .setHeader('Cache-Control', PUBLIC_CACHE)
    .send(llmsTxt(siteBaseUrl(req)))
);
app.get('/.well-known/security.txt', (req, res) =>
  res
    .type('text/plain')
    .setHeader('Cache-Control', PUBLIC_CACHE)
    .send(securityTxt(siteBaseUrl(req)))
);
app.get('/manifest.webmanifest', (req, res) =>
  res
    .type('application/manifest+json')
    .setHeader('Cache-Control', PUBLIC_CACHE)
    .send(JSON.stringify(webManifest()))
);

// Лимити срещу брутфорс и злоупотреба.
app.use(
  ['/login', '/register', '/2fa', '/forgot', '/reset'],
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30 })
);
app.use('/e', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));
app.use('/webauthn', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));
app.use('/sos/alert', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// Помощник: маркира страница като публична/индексируема. Описанието е двуезично.
function publicPage(res, descBg, descEn) {
  res.locals.meta.robots = 'index, follow';
  const description = res.locals.lang === 'en' ? descEn || descBg : descBg;
  if (description) res.locals.meta.description = description;
}

app.get('/', (req, res) => {
  publicPage(
    res,
    'Защитен спешен медицински профил с QR код: кръвна група, алергии, заболявания и спешен контакт — достъпни при злополука, дори ако не можете да говорите.',
    'Secure emergency medical profile with a QR code: blood type, allergies, conditions and an emergency contact — available in an accident, even if you cannot speak.'
  );
  res.render('home', { user: req.user });
});
app.get('/privacy', (req, res) => {
  publicPage(
    res,
    'Политика за поверителност на MedQR: какви лични и здравни данни обработваме, на какво основание (GDPR, чл. 9), как ги защитаваме и вашите права.',
    'MedQR privacy policy: what personal and health data we process, on what basis (GDPR Art. 9), how we protect it and your rights.'
  );
  res.render('privacy', { user: req.user });
});
app.get('/cookies', (req, res) => {
  publicPage(
    res,
    'Политика за бисквитки на MedQR: използваме само строго необходими бисквитки за вход и сигурност. Без проследяване, реклами или трети страни.',
    'MedQR cookie policy: we use only strictly necessary cookies for sign-in and security. No tracking, ads or third parties.'
  );
  res.render('cookies', { user: req.user });
});
app.get('/terms', (req, res) => {
  publicPage(
    res,
    'Общи условия за ползване на MedQR — информационна услуга за спешен медицински профил. Не е медицинско изделие.',
    'MedQR terms of use — an informational emergency medical profile service. Not a medical device.'
  );
  res.render('terms', { user: req.user });
});

app.use(authRoutes);
app.use(profileRoutes);
app.use(webauthnRoutes);
app.use(emergencyRoutes);

app.use((req, res) =>
  res.status(404).render('emergency-error', {
    message: (res.locals.t || ((k) => k))('msg.not_found'),
    user: req.user,
  })
);

// Production error handler — без следи от стек към потребителя.
app.use((err, req, res, _next) => {
  console.error('Необработена грешка:', err);
  if (res.headersSent) return;
  res.status(500).render('emergency-error', {
    message: (res.locals.t || ((k) => k))('msg.unexpected'),
    user: req.user || null,
  });
});

// Периодично чистене: изтекли токени/чакащи входове и стари записи (задържане).
function retentionCleanup() {
  try {
    db.prepare("DELETE FROM tokens WHERE expires_at <= datetime('now')").run();
    db.prepare("DELETE FROM pending_logins WHERE expires_at <= datetime('now')").run();
    db.prepare("DELETE FROM webauthn_challenges WHERE expires_at <= datetime('now')").run();
    db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
    db.prepare("DELETE FROM access_log WHERE accessed_at < datetime('now','-365 days')").run();
    db.prepare("DELETE FROM audit_log WHERE at < datetime('now','-730 days')").run();
  } catch (e) {
    console.error('Грешка при почистване:', e.message);
  }
}

// Проверка на конфигурацията при старт в продукция: спираме рано при липсващи
// критични настройки, вместо да тръгнем в несигурно състояние.
function validateEnv() {
  const problems = [];
  if (!process.env.PUBLIC_BASE_URL) {
    problems.push(
      'PUBLIC_BASE_URL не е зададен — задължителен в продукция (предотвратява Host header атаки и грешни абсолютни URL).'
    );
  }
  if (!process.env.ENCRYPTION_KEY) {
    problems.push('Липсва ENCRYPTION_KEY — ключ за криптиране на данните в покой.');
  }
  if (problems.length) {
    console.error('Грешка в конфигурацията:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  if (prod) validateEnv();
  retentionCleanup();
  setInterval(retentionCleanup, 24 * 60 * 60 * 1000).unref();
  const server = app.listen(PORT, () => console.log(`MedQR слуша на http://localhost:${PORT}`));

  // Плавно спиране: спираме приема на нови заявки и затваряме базата.
  const shutdown = (signal) => {
    console.log(`Получен ${signal} — плавно спиране…`);
    server.close(() => {
      try {
        db.close();
      } catch {
        /* базата вече е затворена */
      }
      process.exit(0);
    });
    // Предпазна мрежа, ако връзките не се затворят навреме.
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
