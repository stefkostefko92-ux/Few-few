import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import session from 'express-session';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import ConnectSqlite3 from 'connect-sqlite3';

import { config } from './config.js';
import './db.js';
import { siteLocals } from './middleware/locals.js';
import { loadUser, requireAuth } from './middleware/auth.js';

import publicRoutes from './routes/public.js';
import seoRoutes from './routes/seo.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';

const SQLiteStore = ConnectSqlite3(session);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // ─── Изгледи ───────────────────────────────────────────
  app.set('view engine', 'ejs');
  app.set('views', config.paths.views);
  app.use(expressLayouts);
  app.set('layout', 'layouts/public');
  app.set('layout extractScripts', true);
  app.set('layout extractStyles', false);

  // ─── Сигурност и производителност ──────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://www.facebook.com'],
        connectSrc: ["'self'"],
        objectSrc: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use(compression());
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // ─── Статични файлове ──────────────────────────────────
  app.use('/uploads', express.static(config.paths.uploads, {
    maxAge: config.isProd ? '30d' : 0,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));
  app.use(express.static(config.paths.public, {
    maxAge: config.isProd ? '7d' : 0,
    index: false,
  }));

  // ─── Сесии ─────────────────────────────────────────────
  app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: config.paths.data }),
    name: 'sgb.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd && config.trustProxy > 0,
      maxAge: 1000 * 60 * 60 * 8, // 8 часа
    },
  }));

  app.use(loadUser);
  app.use(siteLocals);

  // ─── Маршрути ──────────────────────────────────────────
  app.use('/', seoRoutes);          // robots, sitemap, rss, llms
  app.use('/admin', authRoutes);    // /admin/login, /admin/logout
  app.use('/admin', requireAuth, adminRoutes);
  app.use('/', publicRoutes);

  // ─── Грешки ────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404);
    res.locals.seo.title = 'Страницата не е намерена';
    res.locals.seo.robots = 'noindex, follow';
    res.render('errors/404');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[ГРЕШКА]', err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500);
    res.locals.seo = res.locals.seo || { title: 'Грешка', robots: 'noindex' };
    res.locals.seo.title = 'Възникна грешка';
    res.render('errors/500', { message: config.isProd ? null : err.message });
  });

  return app;
}
