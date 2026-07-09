// ============================================================
//  PANEV ASCENSORI — Server Node.js + Stripe + SQLite
//  v2.0 — server-side auth, DB persistence, admin CRUD API
//  Security: helmet-like headers, rate-limit, CORS, bcrypt+JWT
// ============================================================

'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const compression  = require('compression');
const path         = require('path');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const stripe       = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy',
                       { apiVersion: '2024-04-10' }); // pin — event/object shape must not drift on account upgrade

const db   = require('./lib/db');
const auth = require('./lib/auth');
const mailer = require('./lib/mailer');

const app      = express();
const PORT     = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const IS_PROD  = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1); // behind Nginx

// ─────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────
const rateLimitStore = new Map();
function rateLimit({ windowMs = 15 * 60 * 1000, max = 100, keyFn = auth.clientIp } = {}) {
  return (req, res, next) => {
    const key = 'rl:' + keyFn(req) + ':' + req.path.split('?')[0];
    const now = Date.now();
    const rec = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + windowMs; }
    rec.count++;
    rateLimitStore.set(key, rec);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - rec.count));

    if (rec.count > max) {
      return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
    }
    next();
  };
}

// GC for rate limit store
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitStore) if (now > v.resetAt) rateLimitStore.delete(k);
}, 10 * 60 * 1000);

// Daily cleanup of stale login attempts
setInterval(() => {
  try { db.cleanupLoginAttempts(); } catch (e) { console.error('[cleanup]', e.message); }
}, 24 * 60 * 60 * 1000);

function sanitize(str, maxLen = 500) {
  if (str == null) return '';
  return String(str).slice(0, maxLen)
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

function validateEmail(email) {
  return typeof email === 'string'
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      && email.length < 200;
}

function validatePrice(price) {
  const n = Number(price);
  return Number.isFinite(n) && n >= 0 && n < 100000;
}

function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && pw.length < 200;
}

// ─────────────────────────────────────────────────────────────
//  Security headers
// ─────────────────────────────────────────────────────────────
function securityHeaders(req, res, next) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.stripe.com https://www.google-analytics.com https://www.googletagmanager.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(self "https://js.stripe.com")');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  next();
}

// ─────────────────────────────────────────────────────────────
//  CORS
// ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://www.panevascensori.it',
  'https://panevascensori.it',
  ...(IS_PROD ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']),
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origine non consentita'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'stripe-signature'],
  credentials: true,
}));

app.use(compression()); // gzip/deflate text assets (CSS ~200KB → ~30KB)
app.use(securityHeaders);
app.use(cookieParser());

// ─────────────────────────────────────────────────────────────
//  Webhook Stripe — MUST come before express.json()
// ─────────────────────────────────────────────────────────────
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.post('/api/webhook',
  webhookLimiter,
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

app.use(express.json({ limit: '100kb' }));

// Hide sensitive files — MUST be BEFORE express.static to block before it serves
app.use((req, res, next) => {
  // Case-insensitive: on case-insensitive filesystems /Data/panev.DB etc. would
  // otherwise bypass the blocklist and disclose the SQLite DB (hashes + PII).
  const blocked = [/^\/data\b/i, /^\/scripts\b/i, /^\/lib\b/i, /^\/node_modules\b/i,
                   /^\/\.env/i, /^\/package(-lock)?\.json$/i, /\.db(-journal|-wal|-shm)?$/i,
                   /^\/\.git\b/i,
                   // root source / config must not be served (README leaks admin creds,
                   // server.js/contact.php/*.sh are recon surface). .htaccess covers this
                   // under Apache; the app runs under Node behind Nginx, so enforce here.
                   /^\/README\.md$/i, /^\/server\.js$/i, /\.php$/i, /\.sh$/i, /^\/\.htaccess$/i];
  if (blocked.some(r => r.test(req.path))) return res.status(404).send('Not found');
  next();
});

// ─────────────────────────────────────────────────────────────
//  Clean URL system (SEO best practice, no .html exposed)
//  - /brevetto         → serves brevetto.html
//  - /brevetto.html    → 301 redirect to /brevetto
//  - /brevetto/        → 301 redirect to /brevetto
// ─────────────────────────────────────────────────────────────
const CLEAN_URL_PAGES = new Set([
  'brevetto', 'prodotti', 'catalogo', 'servizi', 'chi-siamo',
  'contatti', 'carrello', 'success', 'privacy', 'cookie', 'termini', 'faq', 'en'
]);

app.use((req, res, next) => {
  const p = req.path;

  // Guard against protocol-relative / backslash open redirects:
  // a request to //evil.com would otherwise yield Location: //evil.com.
  if (p.startsWith('//') || p.includes('\\')) return res.status(400).send('Bad request');

  // Skip asset requests and API
  if (p.startsWith('/api/') || p.startsWith('/admin') ||
      /\.(css|js|png|jpe?g|gif|svg|webp|avif|pdf|xml|txt|ico|webmanifest|map|ttf|woff2?)$/i.test(p)) {
    return next();
  }

  // Strip trailing slash (but keep root /)
  if (p.length > 1 && p.endsWith('/')) {
    return res.redirect(301, p.slice(0, -1) + (req.url.slice(p.length) || ''));
  }

  // Redirect /page.html → /page (301)
  const htmlMatch = p.match(/^\/([^\/]+)\.html$/i);
  if (htmlMatch) {
    const slug = htmlMatch[1].toLowerCase();
    if (slug === 'index') return res.redirect(301, '/');
    if (CLEAN_URL_PAGES.has(slug)) {
      return res.redirect(301, '/' + slug + (req.url.slice(p.length) || ''));
    }
  }

  // Rewrite /page → /page.html (serve underlying file)
  const cleanMatch = p.match(/^\/([^\/.]+)$/);
  if (cleanMatch) {
    const slug = cleanMatch[1].toLowerCase();
    if (CLEAN_URL_PAGES.has(slug)) {
      req.url = '/' + slug + '.html' + (req.url.slice(p.length) || '');
    }
  }

  next();
});

// ─────────────────────────────────────────────────────────────
//  Static files
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
// Serve /.well-known (security.txt, ai.txt) — the main static uses dotfiles:'deny',
// which would otherwise 404 the RFC 9116 canonical location.
app.use('/.well-known', express.static(path.join(__dirname, '.well-known'), { maxAge: '1d' }));

// Transparent WebP content-negotiation: if the client accepts image/webp and a
// .webp sibling of the requested .png/.jpg exists, serve it instead (≈50% smaller).
app.use((req, res, next) => {
  if (/^\/img\/.+\.(png|jpe?g)$/i.test(req.path) &&
      /image\/webp/.test(req.headers.accept || '')) {
    const webpRel = req.path.replace(/\.(png|jpe?g)$/i, '.webp');
    if (fs.existsSync(path.join(__dirname, webpRel))) {
      res.setHeader('Vary', 'Accept');
      req.url = webpRel + req.url.slice(req.path.length);
    }
  }
  next();
});

app.use(express.static(path.join(__dirname), {
  maxAge: IS_PROD ? '7d' : 0,
  etag: true,
  lastModified: true,
  dotfiles: 'deny',
  index: ['index.html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('Content-Disposition', 'inline');
    }
    if (filePath.endsWith('.svg') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
    if (filePath.endsWith('.woff2')) {
      // Hashed filenames → safe to cache aggressively.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    if (filePath.includes(path.sep + 'admin' + path.sep)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    if (filePath.endsWith('.html')) {
      // Don't cache HTML (so admin edits show up)
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));

// ─────────────────────────────────────────────────────────────
//  Rate limits
// ─────────────────────────────────────────────────────────────
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const contactLimiter  = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });
const loginLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 });
const apiLimiter      = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });

// ─────────────────────────────────────────────────────────────
//  HEALTH CHECK (for uptime monitoring)
// ─────────────────────────────────────────────────────────────
const SERVER_START = Date.now();
app.get('/api/health', (req, res) => {
  try {
    // Quick DB ping
    const productCount = db.countProducts();
    res.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - SERVER_START) / 1000),
      version: '2.0.0',
      products: productCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────

// Public products feed
app.get('/api/products', apiLimiter, (req, res) => {
  try {
    const products = db.listProducts(true);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ products, count: products.length });
  } catch (err) {
    console.error('[public products]', err.message);
    res.status(500).json({ error: 'Errore nel caricamento prodotti' });
  }
});

// Single public product
app.get('/api/products/:id', apiLimiter, (req, res) => {
  const p = db.getProduct(sanitize(req.params.id, 80));
  if (!p || !p.available) return res.status(404).json({ error: 'Prodotto non trovato' });
  res.json({ product: p });
});

// Per-product SEO pages — /prodotti/<ID>.html
// These are server-rendered HTML with full schema.org Product markup
app.get(/^\/prodotti\/([A-Za-z0-9_-]+)\.html$/, apiLimiter, (req, res) => {
  const id = req.params[0];
  const p = db.getProduct(id);
  if (!p || !p.available) {
    res.status(404);
    const fs = require('fs');
    const notFoundPath = path.join(__dirname, '404.html');
    if (fs.existsSync(notFoundPath)) return res.sendFile(notFoundPath);
    return res.sendFile(path.join(__dirname, 'index.html'));
  }

  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.type('html').send(renderProductPage(p));
});

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Safe embedding of JSON into <script> blocks: JSON.stringify does NOT escape
// '<' or the line separators, so a raw </script> or U+2028/2029 in any field
// could break out of the script element. Escape them at the output boundary.
function ldjson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderProductPage(p) {
  const title = `${p.name}${p.codice ? ' (' + p.codice + ')' : ''} | Panev Ascensori`;
  const desc = (p.description || p.descrizione || p.name).slice(0, 155);
  const url  = `${BASE_URL}/prodotti/${p.id}.html`;
  const img  = p.image ? `${BASE_URL}/${p.image.replace(/^\//, '')}` : `${BASE_URL}/img/og-prodotti.jpg`;
  const priceStr = p.price > 0
    ? `€${p.price.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Su richiesta';
  const breadcrumb = [
    { name: 'Home', url: BASE_URL + '/' },
    { name: 'Prodotti', url: BASE_URL + '/prodotti.html' },
    { name: p.name, url },
  ];

  // Product schema
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url + '#product',
    name: p.name,
    description: p.description || p.descrizione || p.name,
    sku: p.id,
    mpn: p.codice || p.id,
    category: p.category,
    image: img,
    url,
    brand: {
      '@type': 'Brand',
      name: 'Panev Ascensori',
      logo: `${BASE_URL}/img/panev-logo.png`,
    },
    manufacturer: {
      '@type': 'Organization',
      name: 'Panev Ascensori SAS',
      url: BASE_URL,
    },
    material: p.materiale || undefined,
    countryOfOrigin: { '@type': 'Country', name: 'Italia' },
  };
  if (p.patented) {
    productSchema.isRelatedTo = {
      '@type': 'CreativeWork',
      name: 'Brevetto per Modello di Utilità N. 202023000002112',
      identifier: '202023000002112',
    };
  }
  if (p.price > 0) {
    productSchema.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'EUR',
      price: p.price.toFixed(2),
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Panev Ascensori SAS', url: BASE_URL },
    };
  } else {
    productSchema.offers = {
      '@type': 'Offer',
      url,
      availability: 'https://schema.org/InStock',
      priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'EUR', price: 0, description: 'Prezzo su richiesta' },
    };
  }
  // AdditionalProperty for technical specs
  const addProps = [];
  if (p.spessore)  addProps.push({ '@type': 'PropertyValue', name: 'Spessore',  value: p.spessore });
  if (p.larghezza) addProps.push({ '@type': 'PropertyValue', name: 'Larghezza', value: p.larghezza });
  if (p.lunghezza) addProps.push({ '@type': 'PropertyValue', name: 'Lunghezza', value: p.lunghezza });
  if (p.range)     addProps.push({ '@type': 'PropertyValue', name: 'Range di estensione', value: p.range });
  if (p.asole)     addProps.push({ '@type': 'PropertyValue', name: 'Asole', value: String(p.asole) });
  if (p.materiale) addProps.push({ '@type': 'PropertyValue', name: 'Materiale', value: p.materiale });
  if (p.codice)    addProps.push({ '@type': 'PropertyValue', name: 'Codice articolo', value: p.codice });
  if (addProps.length) productSchema.additionalProperty = addProps;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumb.map((b, i) => ({
      '@type': 'ListItem', position: i + 1, name: b.name, item: b.url,
    })),
  };

  // Build picture element with WebP + fallback
  let heroImageHtml;
  if (p.image) {
    const webpImg = p.image.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    const altText = `${p.name} — ${p.codice || p.id}`;
    heroImageHtml = `<picture>
      <source srcset="/${escHtml(webpImg)}" type="image/webp">
      <img itemprop="image" src="/${escHtml(p.image)}" alt="${escHtml(altText)}" style="max-width:100%;max-height:100%;object-fit:contain" fetchpriority="high" width="500" height="500" decoding="async">
    </picture>`;
  } else {
    heroImageHtml = `<div style="font-size:8rem">${escHtml(p.icon || '📦')}</div>`;
  }

  // Technical specs list
  const specsHtml = addProps.map(a =>
    `<div class="spec-row"><span class="spec-label">${escHtml(a.name)}</span><strong>${escHtml(a.value)}</strong></div>`
  ).join('');

  const badgeHtml = p.patented
    ? '<span class="product-badge" style="background:linear-gradient(135deg,var(--gold),#8a6e30);color:#000">🏛 Brevettata UIBM</span>'
    : (p.badge ? `<span class="product-badge">${escHtml(p.badge)}</span>` : '');

  return `<!DOCTYPE html>
<html lang="it" prefix="og: https://ogp.me/ns#">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-Content-Type-Options" content="nosniff">
<meta http-equiv="X-Frame-Options" content="SAMEORIGIN">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="format-detection" content="telephone=no">

<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}">
<meta name="keywords" content="${escHtml(p.name)}, ${escHtml(p.codice || '')}, ${escHtml(p.category)}, staffa ascensore, ${p.patented ? 'brevetto UIBM, ' : ''}Panev Ascensori">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="author" content="Panev Ascensori SAS">
<meta name="theme-color" content="#070e1a">
<link rel="canonical" href="${escHtml(url)}">
<link rel="alternate" hreflang="it"        href="${escHtml(url)}">
<link rel="alternate" hreflang="it-IT"     href="${escHtml(url)}">
<link rel="alternate" hreflang="x-default" href="${escHtml(url)}">

<meta name="geo.region" content="IT-MI">
<meta name="geo.placename" content="Vittuone, Milano">
<meta name="geo.position" content="45.4593;8.9612">
<meta name="ICBM" content="45.4593, 8.9612">

<meta property="og:type" content="product">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${escHtml(url)}">
<meta property="og:image" content="${escHtml(img)}">
<meta property="og:image:alt" content="${escHtml(p.name)}">
<meta property="og:locale" content="it_IT">
<meta property="og:site_name" content="Panev Ascensori SAS">
<meta property="product:price:amount" content="${p.price.toFixed(2)}">
<meta property="product:price:currency" content="EUR">
<meta property="product:availability" content="${p.available ? 'in stock' : 'out of stock'}">
<meta property="product:brand" content="Panev Ascensori">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(desc)}">
<meta name="twitter:image" content="${escHtml(img)}">

<link rel="preload" href="/fonts/Inter-latin-6ab57b19.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Fraunces-latin-8f90dc37.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" as="image" type="image/webp" href="/${escHtml((p.image || 'img/og-prodotti.jpg').replace(/\.(png|jpe?g)$/i, '.webp'))}" fetchpriority="high">
<link rel="preload" href="/css/style.css" as="style">
<link rel="preload" href="/js/app.js" as="script">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/css/style.css">

<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="msapplication-config" content="/browserconfig.xml">

<script type="application/ld+json">${ldjson(productSchema)}</script>
<script type="application/ld+json">${ldjson(breadcrumbSchema)}</script>
</head>
<body>

<header id="navbar"></header>
<div id="mobile-nav">
  <span class="mobile-nav-close" id="mobile-nav-close">✕</span>
  <a href="/index.html">Home</a>
  <a href="/brevetto.html">Brevetto</a>
  <a href="/catalogo.html">Catalogo</a>
  <a href="/servizi.html">Servizi</a>
  <a href="/prodotti.html">Prodotti</a>
  <a href="/chi-siamo.html">Chi Siamo</a>
  <a href="/contatti.html">Contatti</a>
</div>

<!-- Breadcrumb -->
<nav aria-label="Breadcrumb" style="padding:1.5rem 0 .5rem;background:var(--surface)">
  <div class="container">
    <ol style="display:flex;gap:.5rem;list-style:none;padding:0;margin:0;font-size:.85rem;flex-wrap:wrap">
      <li><a href="/" style="color:var(--gold)">Home</a></li>
      <li style="color:var(--text-muted)">›</li>
      <li><a href="/prodotti.html" style="color:var(--gold)">Prodotti</a></li>
      <li style="color:var(--text-muted)">›</li>
      <li style="color:var(--text-muted)">${escHtml(p.category)}</li>
      <li style="color:var(--text-muted)">›</li>
      <li style="color:var(--text-primary)" aria-current="page">${escHtml(p.name)}</li>
    </ol>
  </div>
</nav>

<main>
<article class="section" style="padding:2rem 0 4rem" itemscope itemtype="https://schema.org/Product">
<div class="container">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:start" class="product-detail-grid">

<!-- Image -->
<div style="position:sticky;top:100px">
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2rem;aspect-ratio:1;display:flex;align-items:center;justify-content:center;position:relative">
    ${badgeHtml ? `<div style="position:absolute;top:1rem;right:1rem;z-index:2">${badgeHtml}</div>` : ''}
    ${heroImageHtml}
  </div>
</div>

<!-- Info -->
<div>
  <div style="font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--gold);margin-bottom:.5rem" itemprop="category">${escHtml(p.category)}</div>
  <h1 itemprop="name" style="font-size:2.2rem;margin-bottom:.3rem;line-height:1.2">${escHtml(p.name)}</h1>
  ${p.codice ? `<div style="color:var(--text-muted);font-family:var(--font-mono);letter-spacing:.05em;margin-bottom:1rem" itemprop="mpn">${escHtml(p.codice)}</div>` : ''}

  <div itemprop="offers" itemscope itemtype="https://schema.org/Offer" style="padding:1.5rem;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:2rem">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.3rem">
      <span style="color:var(--text-muted);font-size:.85rem">Prezzo indicativo</span>
      <span style="font-size:1.8rem;font-weight:700;color:var(--gold)" itemprop="price" content="${p.price.toFixed(2)}">${escHtml(priceStr)}</span>
    </div>
    <div style="color:var(--text-muted);font-size:.78rem" itemprop="priceCurrency" content="EUR">IVA esclusa · ${p.price > 0 ? 'Sconti volume su richiesta' : 'Contattaci per preventivo personalizzato'}</div>
    <meta itemprop="availability" content="https://schema.org/InStock">
    <meta itemprop="itemCondition" content="https://schema.org/NewCondition">
  </div>

  <h2 style="font-size:1.1rem;margin-bottom:1rem;color:var(--gold)">Specifiche tecniche</h2>
  <div class="specs-table">${specsHtml}</div>

  <h2 style="font-size:1.1rem;margin:2rem 0 1rem;color:var(--gold)">Descrizione</h2>
  <p itemprop="description" style="line-height:1.7;color:var(--text-secondary)">${escHtml(p.description || p.descrizione || '')}</p>

  ${p.patented ? `
  <div style="margin:2rem 0;padding:1.2rem;background:rgba(201,168,76,.08);border:1px solid var(--gold-dim);border-radius:8px">
    <div style="font-weight:600;color:var(--gold);margin-bottom:.3rem">🏛 Prodotto Brevettato</div>
    <div style="font-size:.85rem;color:var(--text-muted)">Questo articolo è coperto dal <a href="/brevetto.html" style="color:var(--gold)">Brevetto UIBM N. 202023000002112</a> concesso il 07/01/2025.</div>
  </div>` : ''}

  <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:2rem">
    <a href="/prodotti.html#${escHtml(p.id)}" class="btn btn-primary">← Torna al catalogo</a>
    <a href="/contatti.html?ref=${encodeURIComponent(p.id)}" class="btn btn-outline">Richiedi preventivo</a>
  </div>
</div>

</div>
</div>
</article>
</main>

<footer id="footer"></footer>
<div id="cart-sidebar"></div>
<div id="cart-overlay" class="cart-overlay"></div>
<div id="toast" class="toast"></div>

<script src="/js/app.js" defer></script>
<script src="/js/ga4.js" defer></script>
<script src="/js/cookies.js" defer></script>

<style>
.product-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:3rem; }
@media(max-width:900px) { .product-detail-grid { grid-template-columns:1fr !important; } .product-detail-grid > div:first-child { position:relative !important; top:0 !important; } }
.specs-table { display:flex; flex-direction:column; gap:0; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
.spec-row { display:flex; justify-content:space-between; padding:.75rem 1rem; border-bottom:1px solid var(--border); font-size:.9rem; }
.spec-row:last-child { border-bottom:none; }
.spec-row:nth-child(odd) { background:var(--surface); }
.spec-label { color:var(--text-muted); text-transform:uppercase; font-size:.75rem; letter-spacing:.05em; }
</style>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
//  PUBLIC API (other endpoints)
// ─────────────────────────────────────────────────────────────

// Create Stripe checkout session
app.post('/api/create-checkout-session', checkoutLimiter, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      return res.status(503).json({ error: 'Pagamento momentaneamente non disponibile' });
    }

    const { items, customerInfo } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ error: 'Carrello non valido' });
    }

    // B2B-only sale: require a Partita IVA. Prices are shown IVA esclusa, so
    // consumer e-commerce rules (IVA-inclusive pricing, 14-day recesso) do not
    // apply. This keeps the (currently quote-first) checkout unambiguously B2B.
    const piva = String(customerInfo?.piva || customerInfo?.partitaIva || '').replace(/\s/g, '');
    if (!/^(IT)?[0-9]{11}$/i.test(piva)) {
      return res.status(400).json({ error: 'Partita IVA obbligatoria: la vendita online è riservata ai clienti B2B.' });
    }

    // Validate items against DB (don't trust client prices)
    const lineItems = [];
    for (const clientItem of items) {
      const qty = parseInt(clientItem.qty, 10);
      if (!clientItem.id || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        return res.status(400).json({ error: 'Quantità prodotto non valida' });
      }
      const p = db.getProduct(String(clientItem.id));
      if (!p || !p.available) {
        return res.status(400).json({ error: `Prodotto non disponibile: ${clientItem.id}` });
      }
      if (!(p.price > 0)) {
        return res.status(400).json({ error: `Prodotto su richiesta non acquistabile online: ${p.name}` });
      }
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: sanitize(p.name, 100),
            description: sanitize(p.codice || p.category || '', 200) || undefined,
          },
          unit_amount: Math.round(p.price * 100),
        },
        quantity: qty,
      });
    }

    if (customerInfo?.email && !validateEmail(customerInfo.email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }

    const safeInfo = {
      nome:    sanitize(customerInfo?.nome    || '', 100),
      email:   sanitize(customerInfo?.email   || '', 200),
      tel:     sanitize(customerInfo?.tel     || '', 20),
      azienda: sanitize(customerInfo?.azienda || '', 150),
      note:    sanitize(customerInfo?.note    || '', 500),
    };

    const metadata = {
      cliente_nome:    safeInfo.nome,
      cliente_email:   safeInfo.email,
      cliente_tel:     safeInfo.tel,
      cliente_azienda: safeInfo.azienda,
      note:            safeInfo.note,
      prodotti:        items.map(i => `${sanitize(String(i.id), 40)} x${parseInt(i.qty, 10)}`).join(', ').slice(0, 500),
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      customer_email: validateEmail(safeInfo.email) ? safeInfo.email : undefined,
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true }, // B2B — collect/validate VAT id
      shipping_address_collection: { allowed_countries: ['IT', 'SM', 'VA'] },
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE_URL}/carrello.html?cancelled=1`,
      payment_intent_data: { metadata },
      metadata,
      locale: 'it',
    }, {
      // Guard against duplicate sessions if the request is retried after a network blip.
      idempotencyKey: 'co_' + auth.clientIp(req) + '_' + crypto.createHash('sha256')
        .update(JSON.stringify(lineItems) + (safeInfo.email || '')).digest('hex').slice(0, 32),
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[checkout]', err.message);
    res.status(500).json({ error: IS_PROD ? 'Errore interno' : err.message });
  }
});

// Verify Stripe session status
app.get('/api/session-status', apiLimiter, async (req, res) => {
  try {
    const sessionId = sanitize(req.query.session_id || '', 100);
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return res.status(400).json({ error: 'session_id non valido' });
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'line_items'],
    });
    // This endpoint is UNAUTHENTICATED and the cs_ id leaks via success_url,
    // Referer and analytics — so never echo customer PII (email/name/phone/
    // address/notes in metadata). Return only the non-personal order outcome.
    res.json({
      status:      session.payment_status,
      amountTotal: session.amount_total,
      currency:    session.currency,
      lineItems:   (session.line_items?.data || []).map(li => ({
        description: li.description,
        quantity:    li.quantity,
        price:       { unit_amount: li.price?.unit_amount },
      })),
    });
  } catch (err) {
    console.error('[session-status]', err.message);
    res.status(500).json({ error: IS_PROD ? 'Errore interno' : err.message });
  }
});

// Contact form (public)
app.post('/api/contact', contactLimiter, (req, res) => {
  try {
    // Honeypot
    if (req.body.website && String(req.body.website).trim() !== '') {
      return res.json({ ok: true });
    }

    const { nome, email, tel, citta, azienda, servizio, oggetto, messaggio, privacy, source, items, totale, phpId } = req.body || {};

    if (!nome || !email || !messaggio || !privacy) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }

    // If cart items provided, append a formatted product list to the message
    let fullMessage = sanitize(messaggio, 3000);
    if (Array.isArray(items) && items.length > 0) {
      const productLines = items.map(it =>
        `  • ${it.name || ''} [${it.codice || it.id || ''}] — qty ${it.qty || 1} × €${Number(it.price || 0).toFixed(2)} = €${(Number(it.price || 0) * Number(it.qty || 1)).toFixed(2)}`
      ).join('\n');
      const totLine = typeof totale !== 'undefined'
        ? `\n\nTOTALE: €${Number(totale).toFixed(2)} (IVA esclusa)`
        : '';
      fullMessage = `=== PRODOTTI RICHIESTI (${items.length}) ===\n${productLines}${totLine}\n\n=== NOTE CLIENTE ===\n${fullMessage}`;
      fullMessage = fullMessage.slice(0, 5000);
    }

    const msg = db.insertMessage({
      nome:      sanitize(nome, 150),
      email:     sanitize(email, 200),
      tel:       sanitize(tel || '', 30),
      citta:     sanitize(citta || '', 100),
      azienda:   sanitize(azienda || '', 150),
      servizio:  sanitize(servizio || '', 100),
      oggetto:   sanitize(oggetto || (phpId ? `PHP:${phpId}` : ''), 200),
      messaggio: fullMessage,
      source:    sanitize(source || 'contatti', 50),
      ip:        auth.clientIp(req),
    });

    console.log(`[contact] ${msg.id} ${msg.nome} <${msg.email}> source=${msg.source}${items ? ' items=' + items.length : ''}`);

    // Send email (admin + user confirmation) — fire & return immediately
    mailer.sendContactEmails({
      nome:      msg.nome,
      email:     msg.email,
      tel:       msg.tel,
      azienda:   msg.azienda,
      citta:     msg.citta,
      servizio:  msg.servizio,
      messaggio: sanitize(messaggio, 3000),
      items:     Array.isArray(items) ? items : [],
      totale:    totale,
      msgId:     msg.id,
      ip:        auth.clientIp(req),
      source:    msg.source,
    }).then(result => {
      console.log(`[contact:mail] ${msg.id} admin=${result.adminSent} user=${result.userSent}${result.errors.length ? ' errors=' + result.errors.join('|') : ''}`);
    }).catch(err => {
      console.error(`[contact:mail] ${msg.id} failed:`, err.message);
    });

    res.json({ ok: true, id: msg.id });
  } catch (err) {
    console.error('[contact]', err.message);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─────────────────────────────────────────────────────────────
//  Stripe webhook
// ─────────────────────────────────────────────────────────────
async function handleStripeWebhook(req, res) {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    // Fail closed in production: processing unverified webhook events is unsafe.
    if (IS_PROD) {
      console.error('[webhook] STRIPE_WEBHOOK_SECRET non configurato — rifiuto in produzione');
      return res.status(503).send('Webhook non configurato');
    }
    console.warn('[webhook] STRIPE_WEBHOOK_SECRET non configurato — skip verifica (dev)');
    return res.json({ received: true, verified: false });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[webhook] Firma non valida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;

        // Only record a paid session (async methods can complete unpaid).
        if (s.payment_status && s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') {
          console.warn(`[webhook] session ${s.id} completata ma payment_status=${s.payment_status} — skip`);
          break;
        }

        // Idempotency: skip if already stored.
        if (db.getOrderByStripeSession(s.id)) {
          console.log(`[webhook] Order già presente per session ${s.id}, skip`);
          break;
        }

        // MUST finish the DB write BEFORE returning 2xx: if this throws we return
        // 500 so Stripe retries (otherwise a failed insert = a paid order lost).
        const full = await stripe.checkout.sessions.retrieve(s.id, { expand: ['line_items'] });
        const items = (full.line_items?.data || []).map(li => ({
          name:  li.description || '—',
          price: (li.price?.unit_amount || 0) / 100,
          qty:   li.quantity,
        }));
        try {
          db.insertOrder({
            id: 'ORD-' + db.genId(),
            stripeSessionId: s.id,
            stripePaymentId: s.payment_intent,
            cliente: s.metadata?.cliente_nome || s.customer_details?.name || '',
            email:   s.customer_email || s.customer_details?.email || '',
            tel:     s.metadata?.cliente_tel || s.customer_details?.phone || '',
            azienda: s.metadata?.cliente_azienda || '',
            note:    s.metadata?.note || '',
            items,
            totale:  (s.amount_total || 0) / 100,
            valuta:  (s.currency || 'EUR').toUpperCase(),
            stato:   'Confermato',
            pagamento: 'Stripe',
          });
        } catch (e) {
          // UNIQUE(stripe_session_id) → a concurrent delivery already inserted it: treat as done.
          if (/UNIQUE|constraint/i.test(e.message) && db.getOrderByStripeSession(s.id)) {
            console.log(`[webhook] Order inserito concorrentemente per ${s.id}, ok`);
            break;
          }
          throw e;
        }
        console.log(`[webhook] ✓ Ordine salvato — ${s.id} — €${((s.amount_total||0)/100).toFixed(2)}`);
        break;
      }
      case 'payment_intent.payment_failed':
        console.warn(`[webhook] ✗ Pagamento fallito: ${event.data.object.id}`);
        break;
      case 'charge.refunded':
      case 'charge.dispute.created':
        // Order status is keyed by session, not payment_intent; log for manual
        // reconciliation (refund/dispute flow is out of scope for the quote-first UI).
        console.warn(`[webhook] ${event.type} — payment_intent ${event.data.object.payment_intent}`);
        break;
      default:
        console.log(`[webhook] Evento ignorato: ${event.type}`);
    }
  } catch (err) {
    // Return 5xx so Stripe retries — do NOT swallow into a 200.
    console.error('[webhook] elaborazione fallita, richiedo retry:', err.message);
    return res.status(500).send('Webhook processing failed');
  }

  res.json({ received: true });
}

// ─────────────────────────────────────────────────────────────
//  ADMIN AUTH
// ─────────────────────────────────────────────────────────────

// CSRF defense for the cookie-authenticated admin API: the session cookie is
// SameSite=strict, and additionally we reject any cross-origin state-changing
// request by validating the Origin header against the allowlist.
app.use('/api/admin', (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE' || req.method === 'PATCH') {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return res.status(403).json({ error: 'Richiesta cross-origin non consentita' });
    }
  }
  next();
});

// Login
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, remember } = req.body || {};
    const ip = auth.clientIp(req);

    const lockMinutes = auth.isLocked(ip);
    if (lockMinutes) {
      return res.status(429).json({
        error: `Troppi tentativi falliti. Riprova tra ${lockMinutes} minuti.`,
        lockedForMinutes: lockMinutes,
      });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password richiesti' });
    }

    const user = db.getAdminByEmail(String(email).toLowerCase().trim());
    if (!user) {
      const rec = auth.recordFailure(ip);
      return res.status(401).json({
        error: 'Email o password non corretti',
        remaining: Math.max(0, auth.MAX_ATTEMPTS - rec.count),
      });
    }

    const ok = await auth.verifyPassword(password, user.password_hash);
    if (!ok) {
      const rec = auth.recordFailure(ip);
      return res.status(401).json({
        error: 'Email o password non corretti',
        remaining: Math.max(0, auth.MAX_ATTEMPTS - rec.count),
      });
    }

    auth.clearFailures(ip);
    db.markAdminLoggedIn(user.id);
    const token = auth.issueToken(user);
    auth.setAuthCookie(res, token, IS_PROD);

    res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: IS_PROD ? 'Errore interno' : err.message });
  }
});

// Logout
app.post('/api/admin/logout', (req, res) => {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

// Session info (used by pages to check if user is logged in)
app.get('/api/admin/me', auth.requireAdmin, (req, res) => {
  res.json({
    user: { id: req.adminUser.id, email: req.adminUser.email, name: req.adminUser.name }
  });
});

// Change password
app.post('/api/admin/password', auth.requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !validPassword(newPassword)) {
      return res.status(400).json({ error: 'Nuova password deve avere almeno 8 caratteri' });
    }
    const user = db.getAdminById(req.adminUser.id);
    const ok = await auth.verifyPassword(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Password attuale non corretta' });

    const hash = await auth.hashPassword(newPassword);
    db.updateAdminPassword(user.id, hash);
    res.json({ ok: true });
  } catch (err) {
    console.error('[password]', err.message);
    res.status(500).json({ error: IS_PROD ? 'Errore interno' : err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  ADMIN API — Products CRUD
// ─────────────────────────────────────────────────────────────
app.get('/api/admin/products', auth.requireAdmin, (req, res) => {
  res.json({ products: db.listProducts(false) });
});

app.post('/api/admin/products', auth.requireAdmin, (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.category) return res.status(400).json({ error: 'Nome e categoria obbligatori' });
    if (!validatePrice(b.price)) return res.status(400).json({ error: 'Prezzo non valido' });
    const id = b.id ? sanitize(b.id, 80).replace(/[^A-Za-z0-9_-]/g, '') : 'p_' + Date.now().toString(36);
    if (db.getProduct(id)) return res.status(409).json({ error: 'ID già esistente' });
    const product = db.insertProduct({
      id,
      name:        sanitize(b.name, 200),
      category:    sanitize(b.category, 100),
      codice:      sanitize(b.codice || '', 80),
      price:       Number(b.price) || 0,
      priceLabel:  sanitize(b.priceLabel || '', 80),
      spessore:    sanitize(b.spessore || '', 30),
      larghezza:   sanitize(b.larghezza || '', 30),
      lunghezza:   sanitize(b.lunghezza || '', 30),
      range:       sanitize(b.range || '', 30),
      asole:       b.asole != null ? Number(b.asole) : null,
      materiale:   sanitize(b.materiale || '', 80),
      descrizione: sanitize(b.descrizione || '', 500),
      description: sanitize(b.description || '', 2000),
      image:       sanitize(b.image || '', 300),
      icon:        sanitize(b.icon || '📦', 10),
      badge:       sanitize(b.badge || '', 80),
      available:   b.available !== false,
      featured:    !!b.featured,
      patented:    !!b.patented,
      sortOrder:   Number(b.sortOrder) || 0,
    });
    res.status(201).json({ product });
  } catch (err) {
    console.error('[admin products POST]', err.message);
    res.status(500).json({ error: IS_PROD ? 'Errore interno' : err.message });
  }
});

app.put('/api/admin/products/:id', auth.requireAdmin, (req, res) => {
  try {
    const id = sanitize(req.params.id, 80);
    const b = req.body || {};
    const updates = {};
    const fields = ['name','category','codice','priceLabel','spessore','larghezza','lunghezza','range','materiale','descrizione','description','image','icon','badge'];
    fields.forEach(f => { if (b[f] != null) updates[f] = sanitize(String(b[f]), f === 'description' ? 2000 : 300); });
    if (b.price != null && validatePrice(b.price)) updates.price = Number(b.price);
    if (b.asole != null) updates.asole = Number(b.asole);
    if (b.available != null) updates.available = !!b.available;
    if (b.featured != null)  updates.featured  = !!b.featured;
    if (b.patented != null)  updates.patented  = !!b.patented;
    if (b.sortOrder != null) updates.sortOrder = Number(b.sortOrder);

    const product = db.updateProduct(id, updates);
    if (!product) return res.status(404).json({ error: 'Prodotto non trovato' });
    res.json({ product });
  } catch (err) {
    console.error('[admin products PUT]', err.message);
    res.status(500).json({ error: IS_PROD ? 'Errore interno' : err.message });
  }
});

app.delete('/api/admin/products/:id', auth.requireAdmin, (req, res) => {
  const id = sanitize(req.params.id, 80);
  const changes = db.deleteProduct(id);
  if (!changes) return res.status(404).json({ error: 'Prodotto non trovato' });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
//  ADMIN API — Orders
// ─────────────────────────────────────────────────────────────
app.get('/api/admin/orders', auth.requireAdmin, (req, res) => {
  res.json({
    orders: db.listOrders(500, 0),
    stats:  db.orderStats(),
  });
});

app.put('/api/admin/orders/:id', auth.requireAdmin, (req, res) => {
  const id = sanitize(req.params.id, 80);
  const stato = sanitize(req.body.stato || '', 40);
  const allowed = ['Nuovo','Confermato','In lavorazione','Spedito','Completato','Annullato'];
  if (!allowed.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
  const changes = db.updateOrderStatus(id, stato);
  if (!changes) return res.status(404).json({ error: 'Ordine non trovato' });
  res.json({ ok: true });
});

app.delete('/api/admin/orders/:id', auth.requireAdmin, (req, res) => {
  const id = sanitize(req.params.id, 80);
  const changes = db.deleteOrder(id);
  if (!changes) return res.status(404).json({ error: 'Ordine non trovato' });
  res.json({ ok: true });
});

app.delete('/api/admin/orders', auth.requireAdmin, (req, res) => {
  const n = db.clearOrders();
  res.json({ ok: true, deleted: n });
});

// ─────────────────────────────────────────────────────────────
//  ADMIN API — Messages
// ─────────────────────────────────────────────────────────────
app.get('/api/admin/messages', auth.requireAdmin, (req, res) => {
  res.json({
    messages: db.listMessages(1000, 0),
    stats:    db.messageStats(),
  });
});

app.put('/api/admin/messages/:id/read', auth.requireAdmin, (req, res) => {
  const id = sanitize(req.params.id, 80);
  const changes = db.markMessageRead(id);
  if (!changes) return res.status(404).json({ error: 'Messaggio non trovato' });
  res.json({ ok: true });
});

app.put('/api/admin/messages/read-all', auth.requireAdmin, (req, res) => {
  const n = db.markAllMessagesRead();
  res.json({ ok: true, updated: n });
});

app.delete('/api/admin/messages/:id', auth.requireAdmin, (req, res) => {
  const id = sanitize(req.params.id, 80);
  const changes = db.deleteMessage(id);
  if (!changes) return res.status(404).json({ error: 'Messaggio non trovato' });
  res.json({ ok: true });
});

app.delete('/api/admin/messages', auth.requireAdmin, (req, res) => {
  const n = db.clearMessages();
  res.json({ ok: true, deleted: n });
});

// ─────────────────────────────────────────────────────────────
//  ADMIN API — Backup / Stats
// ─────────────────────────────────────────────────────────────
app.get('/api/admin/backup', auth.requireAdmin, (req, res) => {
  res.json({
    backup_date: new Date().toISOString(),
    products:    db.listProducts(false),
    orders:      db.listOrders(10000),
    messages:    db.listMessages(10000),
  });
});

app.get('/api/admin/stats', auth.requireAdmin, (req, res) => {
  const orderStats   = db.orderStats();
  const messageStats = db.messageStats();
  const products     = db.listProducts(false);
  res.json({
    products: {
      total:      products.length,
      available:  products.filter(p => p.available).length,
      featured:   products.filter(p => p.featured).length,
      categories: [...new Set(products.map(p => p.category))].length,
    },
    orders:   orderStats,
    messages: messageStats,
  });
});

// ─────────────────────────────────────────────────────────────
//  404 / Error handlers
// ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  // Branded 404 page with proper status
  const notFoundPath = path.join(__dirname, '404.html');
  const fs = require('fs');
  if (fs.existsSync(notFoundPath)) {
    return res.status(404).sendFile(notFoundPath);
  }
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: IS_PROD ? 'Errore interno' : err.message });
  }
  res.status(500).sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────────────────────
//  Startup
// ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, '127.0.0.1', () => {
  const productCount = db.countProducts();
  console.log('\n  ╔══════════════════════════════════════════════╗');
  console.log('  ║   🛗  Panev Ascensori — Server avviato       ║');
  console.log(`  ║   URL:      ${BASE_URL.padEnd(33)}║`);
  console.log(`  ║   Port:     ${String(PORT).padEnd(33)}║`);
  console.log(`  ║   Mode:     ${(process.env.NODE_ENV || 'development').padEnd(33)}║`);
  console.log(`  ║   Products: ${String(productCount).padEnd(33)}║`);
  console.log('  ╚══════════════════════════════════════════════╝\n');

  if (productCount === 0) {
    console.warn('  ⚠  Nessun prodotto nel database. Esegui: npm run db:seed\n');
  }
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
    console.warn('  ⚠  STRIPE_SECRET_KEY non configurata — Stripe Checkout disabilitato');
    console.warn('  ⚠  Copia .env.example in .env e configura le chiavi\n');
  }
  if (!process.env.JWT_SECRET) {
    console.warn('  ⚠  JWT_SECRET non impostato — usa valore dev INSICURO');
    console.warn('  ⚠  Genera: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n');
  }
});

// Graceful shutdown (PM2/systemd send SIGTERM/SIGINT): stop accepting, close DB.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[shutdown] ${sig} — chiusura in corso…`);
    server.close(() => { try { db.raw.close(); } catch {} process.exit(0); });
    setTimeout(() => process.exit(0), 10000).unref(); // hard cap
  });
}
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e); process.exit(1); });
