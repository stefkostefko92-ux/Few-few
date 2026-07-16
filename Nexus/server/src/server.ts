import 'dotenv/config';
import './bootEnv'; // must run before any guard reads NODE_ENV
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import characterRoutes from './routes/character';
import inventoryRoutes from './routes/inventory';
import shopRoutes from './routes/shop';
import questRoutes from './routes/quest';
import arenaRoutes from './routes/arena';
import mailRoutes from './routes/mail';
import combatRoutes from './routes/combat';
import accountRoutes from './routes/account';
import huntingRoutes from './routes/hunting';
import dungeonRoutes from './routes/dungeon';
import dailyRoutes from './routes/daily';
import wheelRoutes from './routes/wheel';
import achievementRoutes from './routes/achievements';
import bestiaryRoutes from './routes/bestiary';
import statsRoutes from './routes/stats';
import adminRoutes from './routes/admin';
import setsRoutes from './routes/sets';
import profileRoutes from './routes/profile';
import guildRoutes from './routes/guild';
import socialRoutes from './routes/social';
import notificationsRoutes from './routes/notifications';
import paymentsRoutes, { webhookRouter as paymentsWebhookRouter } from './routes/payments';
import marketRoutes from './routes/market';
import campRoutes from './routes/camp';
import forgeRoutes from './routes/forge';
import towerRoutes from './routes/tower';
import bountyRoutes from './routes/bounties';
import trialCacheRoutes from './routes/trialCache';
import battlePassRoutes from './routes/battlepass';
import recipeRoutes from './routes/recipes';
import auctionRoutes from './routes/auction';
import mountRoutes from './routes/mount';
import weeklyRoutes from './routes/weekly';
import realmBossRoutes from './routes/realmBoss';
import factionRoutes from './routes/faction';
import eventsRoutes from './routes/events';
import mythicPlusRoutes from './routes/mythicPlus';
import dsaRoutes from './routes/dsa';
import { getDb } from './db';
import { geoBlock, getGeoInfo } from './middleware/geo';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.set('trust proxy', 1);
// Audit #10: enable a default CSP so any future reflected/stored XSS
// sink can't load arbitrary JS. unsafe-inline is allowed for styles
// because our component library uses inline style attributes — scripts
// are locked to 'self'.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src':  ["'self'"],
      'script-src':   ["'self'"],
      'style-src':    ["'self'", "'unsafe-inline'"],
      'img-src':      ["'self'", 'data:', 'https:'],
      'connect-src':  ["'self'", 'https://*.stripe.com'],
      'font-src':     ["'self'", 'data:'],
      'frame-src':    ["'self'", 'https://*.stripe.com'],
      'object-src':   ["'none'"],
      'base-uri':     ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(geoBlock);
app.get('/api/geo', getGeoInfo);
// Audit #9: refuse wildcard CORS in production; require an explicit
// origin list via env.
if (process.env.NODE_ENV === 'production' && (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*')) {
  throw new Error('CORS_ORIGIN must be set to an explicit origin list in production (no wildcards).');
}
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()),
    credentials: false,
  }),
);
// Capture the raw request body so Stripe webhook signature verification
// has the bytes it needs while still letting every other handler use the
// parsed JSON body. (Audit #2 fix.)
app.use(express.json({
  limit: '256kb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('tiny'));
}

// Stripe webhook must sit ahead of BOTH the global /api rate limiter
// (Stripe retry-storms would self-throttle) and the auth gate on the
// payments router (Stripe sends no Authorization header — we
// authenticate via the signature instead). express.json above has
// already captured the raw bytes into req.rawBody, which the handler
// passes to stripe.webhooks.constructEvent.
app.use('/api/payments/webhook', paymentsWebhookRouter);

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.use('/api/auth', authLimiter);

// Tighter per-IP throttling on the abuse-prone auth endpoints. /register
// + /forgot + /reset are rare; capping them an order of magnitude lower
// than the general auth pool blocks credential-stuffing and password-
// reset spamming without affecting normal login traffic.
const sensitiveAuthLimiter = rateLimit({ windowMs: 60 * 60_000, max: 8, standardHeaders: true });
app.use('/api/auth/register', sensitiveAuthLimiter);
app.use('/api/auth/forgot',   sensitiveAuthLimiter);
app.use('/api/auth/reset',    sensitiveAuthLimiter);

// Audit #12: admin routes get their own tighter limiter. A leaked
// admin token shouldn't translate to unlimited gold-minting.
const adminLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true });
app.use('/api/admin', adminLimiter);

// Audit #11: the public /profile lookup is the username-enumeration
// oracle when combined with /auth/forgot (which always returns 200).
// Cap profile probes so an attacker can't drag a wordlist through it.
const profileLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true });
app.use('/api/profile', profileLimiter);

app.get('/api/health', (_req, res) => {
  // Healthcheck must actually probe the DB — otherwise a wedged SQLite
  // (disk full, FS read-only, WAL lock) won't flip the orchestrator's
  // liveness signal and traffic keeps routing to a broken instance.
  try {
    getDb().prepare('SELECT 1').get();
    res.json({ ok: true, name: 'Nexus Dominion', version: '0.1.1' });
  } catch (e: any) {
    res.status(503).json({ ok: false, error: 'db_unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/character', characterRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/quest', questRoutes);
app.use('/api/arena', arenaRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/combat', combatRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/hunting', huntingRoutes);
app.use('/api/dungeon', dungeonRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/wheel', wheelRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/bestiary', bestiaryRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sets', setsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/guild', guildRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/camp', campRoutes);
app.use('/api/forge', forgeRoutes);
app.use('/api/tower', towerRoutes);
app.use('/api/bounties', bountyRoutes);
app.use('/api/trial-cache', trialCacheRoutes);
app.use('/api/battlepass', battlePassRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/mount', mountRoutes);
app.use('/api/weekly', weeklyRoutes);
app.use('/api/realm-boss', realmBossRoutes);
app.use('/api/faction', factionRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/mythic-plus', mythicPlusRoutes);
app.use('/api/dsa', dsaRoutes);

// Serve client build if present (production)
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// SEO routes — explicit so the content-type is set correctly and the SPA
// fallback below never swallows them.
app.get('/robots.txt', (_req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.join(clientDist, 'robots.txt'));
});
app.get('/sitemap.xml', (_req, res) => {
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.sendFile(path.join(clientDist, 'sitemap.xml'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// Global JSON error handler — anything uncaught in a route lands here.
// Without this Express returns an HTML stack trace, which is both ugly to
// debug and a small information-leak vector.
import { logEvent } from './lib/logger';
import { captureError } from './lib/observability';
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err?.message || 'Server error';
  // eslint-disable-next-line no-console
  console.error('[unhandled]', req.method, req.path, msg, err?.stack || '');
  // Audit RISK #9: route errors should reach Sentry (when configured).
  // The global error handler is the single funnel point; reporting here
  // covers every route without per-router instrumentation.
  captureError(err, { method: req.method, path: req.path, uid: (req as any).auth?.uid });
  try {
    logEvent({
      category: 'system',
      action: 'unhandled_error',
      level: 'error',
      route: `${req.method} ${req.path}`,
      message: msg,
      meta: { stack: err?.stack || '' },
    });
  } catch { /* swallow logger errors */ }
  if (!res.headersSent) {
    // Audit #17: never echo raw error messages to clients in production
    // — SQLite errors leak schema, "x.y is undefined" hints at internals.
    // Only domain-clean messages thrown intentionally (with `clientSafe`
    // marker) flow through; everything else gets a generic 500.
    const isClientSafe = err && typeof err === 'object' && (err as any).clientSafe === true;
    const out = process.env.NODE_ENV === 'production' && !isClientSafe ? 'Server error' : msg;
    res.status(500).json({ error: out });
  }
});

// Ensure DB is initialized before listening
getDb();

// GDPR retention: prune event_log to the declared window on boot, then daily.
import { pruneEventLog } from './lib/logger';
// 30 дни — изравнено с декларираното в Privacy Policy („request logs
// retained 30 days"). event_log държи IP → по-къс срок = по-добра
// минимизация (GDPR чл. 5(1)(e)); банът ползва users.last_ip, не този лог.
const EVENT_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
pruneEventLog(EVENT_LOG_RETENTION_MS);
setInterval(() => { pruneEventLog(EVENT_LOG_RETENTION_MS); }, 24 * 60 * 60 * 1000).unref();

// Изчиства изтекли временни банове на всеки час (хигиена — проверките и
// без това третират изтеклите като не-банати).
import { pruneExpiredBans } from './lib/bans';
pruneExpiredBans();
setInterval(() => { pruneExpiredBans(); }, 60 * 60 * 1000).unref();

import { initObservability, installProcessGuards } from './lib/observability';
initObservability();
installProcessGuards();

app.listen(PORT, () => {
  console.log(`[Nexus Dominion] Server listening on port ${PORT}`);
});
