// Eternal Touch — Server entry
// Carbon Stealth VCC product

import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================================
// PROCESS-LEVEL ERROR HANDLERS
// Catches everything that escapes Express so the process never silently
// swallows an exception. Always logs with timestamp.
// =====================================================================
const ts = () => new Date().toISOString();
process.on('unhandledRejection', (reason) => {
  console.error(`[${ts()}] [UNHANDLED REJECTION]`, reason);
});
process.on('uncaughtException', (err) => {
  console.error(`[${ts()}] [UNCAUGHT EXCEPTION]`, err);
  // After an uncaught exception the process is in an undefined state — keeping
  // it alive risks corrupted responses / hung requests. Exit and let the
  // supervisor (Docker `restart: unless-stopped`) bring up a clean process.
  process.exit(1);
});

const app = express();
const PORT = parseInt(process.env.PORT || '4300', 10);

// =====================================================================
// PRISMA — with explicit connection check at startup (fails fast)
// =====================================================================
const prisma = new PrismaClient({
  log: ['error', 'warn']
});

async function connectWithRetry(
  retries = parseInt(process.env.DB_CONNECT_RETRIES || '30', 10),
  delayMs = parseInt(process.env.DB_CONNECT_DELAY_MS || '2000', 10)
) {
  for (let i = 1; i <= retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(`[${ts()}] [prisma] connected (attempt ${i}/${retries})`);
      return true;
    } catch (err) {
      console.warn(`[${ts()}] [prisma] connection attempt ${i}/${retries} failed: ${err.message}`);
      if (i === retries) {
        console.error(`[${ts()}] [prisma] giving up — server will run but DB queries will error`);
        return false;
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// =====================================================================
// DATA RETENTION — enforce the 24-month limit promised in the Privacy Policy.
// Contact messages older than 24 months are deleted (GDPR Art. 5(1)(e) storage
// limitation + Art. 5(2) accountability — the policy must be technically true).
// Runs at startup and then once a day.
// =====================================================================
const RETENTION_MONTHS = 24;
async function purgeExpiredMessages() {
  try {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
    const { count } = await prisma.contactMessage.deleteMany({
      where: { createdAt: { lt: cutoff } }
    });
    if (count > 0) {
      console.log(`[${ts()}] [retention] purged ${count} contact message(s) older than ${RETENTION_MONTHS} months`);
    }
  } catch (err) {
    console.warn(`[${ts()}] [retention] purge failed: ${err.message}`);
  }
}

// =====================================================================
// EXPRESS SETUP
// =====================================================================
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
// NOTE: We DON'T set extractScripts/extractStyles because they strip inline
// scripts from pages (e.g. product gallery JS) without an injection point.

// =====================================================================
// SECURITY HEADERS
// =====================================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Fonts are self-hosted now — no fonts.googleapis.com / fonts.gstatic.com.
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  // Preserve referrer for navigations (good for analytics in future)
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // helmet is the single source of security headers (applies to every response,
  // static assets included, since those are served by express.static behind the
  // proxy). nginx must NOT re-add these or they duplicate. 2y + preload HSTS.
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true }
}));

// Permissions-Policy (helmet v8 no longer emits this) — lock down powerful APIs.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Fail-fast: a predictable cookie-signing secret defeats signed cookies.
const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET || COOKIE_SECRET.length < 32) {
  throw new Error('COOKIE_SECRET is missing or too short (need ≥32 chars). Refusing to start with an insecure key.');
}
app.use(cookieParser(COOKIE_SECRET));

// Custom morgan format — includes response time + content length
morgan.token('id', (req) => req.id || '-');
app.use(morgan(
  ':remote-addr ":method :url" :status :res[content-length] :response-time ms ":referrer" ":user-agent"'
));

// =====================================================================
// STATIC FILES (before any rate-limited or DB-dependent middleware)
// =====================================================================
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  etag: true,
  fallthrough: true
}));

// =====================================================================
// REQUEST CONTEXT (Prisma client + request ID)
// =====================================================================
app.use((req, res, next) => {
  req.prisma = prisma;
  // Always set safe defaults so error pages can render even if other
  // middleware never gets a chance to populate res.locals.
  res.locals.t = res.locals.t || ((key, fb) => fb || key);
  res.locals.lang = res.locals.lang || 'en';
  res.locals.langPrefix = res.locals.langPrefix || '';
  res.locals.path = req.path || '/';
  res.locals.canonicalUrl = `${process.env.SITE_URL || 'https://eternaltouch.it'}${req.path === '/' ? '' : req.path}`;
  res.locals.siteName = 'Eternal Touch';
  res.locals.currentYear = new Date().getFullYear();
  res.locals.activePage = '';
  res.locals.title = 'Eternal Touch';
  res.locals.description = '';
  res.locals.req = req;

  // Prevent intermediate caches (Cloudflare, browser back-forward) from
  // serving stale HTML after admins edit content. Static assets retain
  // their long cache via express.static() — only HTML is no-cached.
  if (req.method === 'GET' && !req.path.startsWith('/css') && !req.path.startsWith('/js') &&
      !req.path.startsWith('/images') && !req.path.startsWith('/uploads') &&
      !req.path.startsWith('/sitemap') && !req.path.startsWith('/robots') &&
      !req.path.startsWith('/healthz') && !req.path.endsWith('.txt')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }

  next();
});

// =====================================================================
// LANGUAGE DETECTION (overrides defaults set above with real values)
// =====================================================================
import { languageMiddleware } from './middleware/language.js';
app.use(languageMiddleware);

// =====================================================================
// RATE LIMITING — generous limits, only block obvious abuse
// =====================================================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST' || !req.path.includes('/login'),
  message: { error: 'Too many login attempts, please try again in 15 minutes.' }
});

// =====================================================================
// ROUTES
// =====================================================================
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';
import seoRoutes from './routes/seo.js';
import { verifyEmailConfig } from './lib/email.js';

app.use('/', seoRoutes);
app.use('/api', apiLimiter, apiRoutes);
app.use('/admin', loginLimiter, adminRoutes);
app.use('/', publicRoutes);

// =====================================================================
// 404 HANDLER
// =====================================================================
app.use((req, res) => {
  // safeT used inside the EJS template handles missing t()
  try {
    res.status(404).render('pages/404', {
      title: '404 — Eternal Touch',
      description: 'Page not found'
    });
  } catch (e) {
    res.status(404).send('<!DOCTYPE html><html><head><title>404</title></head><body><h1>404 — Page not found</h1><a href="/">Home</a></body></html>');
  }
});

// =====================================================================
// ERROR HANDLER — bulletproof: never throws even if rendering fails
// =====================================================================
app.use((err, req, res, next) => {
  console.error(`[${ts()}] [ERROR] ${req.method} ${req.url}:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // API requests get JSON. Only surface the real message for client errors
  // (4xx, which we set deliberately); for 5xx return a generic string so
  // internal/Prisma details never leak to the caller.
  if (req.path && (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/'))) {
    const status = err.status || 500;
    return res.status(status).json({
      error: status < 500 ? (err.message || 'Bad request') : 'Internal server error'
    });
  }

  // HTML response — try to render the styled 500 page; fall back to plain HTML
  try {
    res.status(err.status || 500).render('pages/500', {
      title: '500 — Eternal Touch',
      description: 'Server error'
    });
  } catch (renderErr) {
    console.error(`[${ts()}] [ERROR] failed to render 500 page:`, renderErr.message);
    res.status(500).type('html').send(
      '<!DOCTYPE html><html><head><title>500 — Server Error</title>' +
      '<style>body{font-family:Georgia,serif;background:#FDFAF4;color:#1a1a1a;text-align:center;padding:5rem 2rem}h1{font-size:4rem;margin:.5rem;font-weight:300}a{color:#a88947}</style>' +
      '</head><body><h1>500</h1><p>Si è verificato un errore. Riprova tra poco.</p><a href="/">Home</a></body></html>'
    );
  }
});

// =====================================================================
// GRACEFUL SHUTDOWN
// =====================================================================
const shutdown = async (signal) => {
  console.log(`[${ts()}] received ${signal}, shutting down gracefully...`);
  try {
    await prisma.$disconnect();
  } catch (e) { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// =====================================================================
// START SERVER (after DB is ready)
// =====================================================================
async function start() {
  console.log(`[${ts()}] starting Eternal Touch on port ${PORT}...`);
  await connectWithRetry(); // best-effort, doesn't block startup if DB down

  // Data-retention sweep: once now, then daily.
  purgeExpiredMessages();
  setInterval(purgeExpiredMessages, 24 * 60 * 60 * 1000).unref();

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║   Eternal Touch — Atelier of gypsum decorations              ║
║                                                              ║
║   Port:  ${String(PORT).padEnd(52)}║
║   Env:   ${(process.env.NODE_ENV || 'development').padEnd(52)}║
║   URL:   ${(process.env.SITE_URL || `http://localhost:${PORT}`).padEnd(52)}║
║                                                              ║
║   Health: GET /healthz                                       ║
║   Admin:  /admin/login                                       ║
╚══════════════════════════════════════════════════════════════╝
`);
    // Non-blocking SMTP verify — logs status, doesn't crash anything
    verifyEmailConfig().catch(() => {});
  });
}

start().catch((err) => {
  console.error(`[${ts()}] [FATAL] could not start server:`, err);
  process.exit(1);
});
