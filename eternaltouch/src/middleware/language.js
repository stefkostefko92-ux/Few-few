// Eternal Touch — Language detection
// Priority: cookie override > URL prefix > IP geolocation > Accept-Language > default (en)

import geoip from 'geoip-lite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED = ['bg', 'it', 'en'];
const DEFAULT_LANG = 'bg';

// Load locale files
const locales = {};
for (const lang of SUPPORTED) {
  try {
    const localePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
    locales[lang] = JSON.parse(fs.readFileSync(localePath, 'utf-8'));
  } catch (e) {
    console.warn(`Locale file missing: ${lang}.json`);
    locales[lang] = {};
  }
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || '';
}

function detectByIp(req) {
  const ip = getClientIp(req);
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null;
  }
  // Strip IPv6 prefix
  const cleanIp = ip.replace(/^::ffff:/, '');
  const geo = geoip.lookup(cleanIp);
  if (!geo) return null;
  // Bulgaria-first: BG checked first
  if (geo.country === 'BG') return 'bg';
  if (geo.country === 'IT') return 'it';
  return null;
}

function detectByAcceptLang(req) {
  const accept = req.headers['accept-language'] || '';
  const langs = accept.split(',').map(s => s.split(';')[0].trim().substring(0, 2).toLowerCase());
  for (const lang of langs) {
    if (SUPPORTED.includes(lang)) return lang;
  }
  return null;
}

// Recursive translation lookup with dot notation
function getTranslation(obj, key) {
  return key.split('.').reduce((acc, part) => acc && acc[part], obj);
}

export function languageMiddleware(req, res, next) {
  let lang = null;

  // 1. URL prefix (e.g. /bg/about, /it/about, /en/about)
  const urlMatch = req.path.match(/^\/(bg|it|en)(\/|$)/);
  if (urlMatch) {
    lang = urlMatch[1];
    // Strip prefix from path for routing
    req.url = req.url.substring(3) || '/';
    if (req.url[0] !== '/') req.url = '/' + req.url;
    // Persist the language so subsequent (prefix-less) navigation stays in it.
    res.cookie('lang', lang, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
  }

  // 2. Cookie override (manual selection)
  if (!lang && req.cookies?.lang && SUPPORTED.includes(req.cookies.lang)) {
    lang = req.cookies.lang;
  }

  // 3. IP-based detection
  if (!lang) {
    lang = detectByIp(req);
  }

  // 4. Accept-Language header
  if (!lang) {
    lang = detectByAcceptLang(req);
  }

  // 5. Default
  if (!lang) lang = DEFAULT_LANG;

  req.lang = lang;
  req.locale = locales[lang] || locales[DEFAULT_LANG];

  // Translation helper
  req.t = (key, fallback = '') => {
    const value = getTranslation(req.locale, key);
    if (value !== undefined && value !== null) return value;
    // Fallback: BG (default), then EN
    const bgValue = getTranslation(locales.bg, key);
    if (bgValue !== undefined && bgValue !== null) return bgValue;
    const enValue = getTranslation(locales.en, key);
    if (enValue !== undefined && enValue !== null) return enValue;
    return fallback || key;
  };

  // Helper for selecting localized field from db record
  req.localized = (record, field) => {
    if (!record) return '';
    const suffix = lang.charAt(0).toUpperCase() + lang.slice(1);
    return record[`${field}${suffix}`] || record[`${field}Bg`] || record[`${field}It`] || record[`${field}En`] || '';
  };

  // Available languages (for hreflang etc.)
  req.languages = SUPPORTED;

  // ── SEO: canonical + hreflang, computed AFTER the language prefix is known ──
  // req.path is now the *clean* path (prefix already stripped above), so it is
  // identical whether the page was reached via /it/x, cookie, or IP. We expose:
  //   • path         → the prefix-less path, used to build every hreflang alt
  //   • canonicalUrl → the served language's prefixed URL (bg = root, no prefix)
  // Making canonical depend on the served language (not the request URL)
  // consolidates the cookie/IP-served "/" with its "/it" | "/en" twin, killing
  // the duplicate-content split. The earlier request-context middleware set
  // provisional values from the raw (still-prefixed) path — we override them.
  const site = process.env.SITE_URL || 'https://eternaltouch.it';
  const cleanPath = req.path || '/';
  const prefix = lang === DEFAULT_LANG ? '' : `/${lang}`;

  // Expose to view templates as plain locals
  res.locals.t = req.t;
  res.locals.localized = req.localized;
  res.locals.lang = lang;
  res.locals.locale = req.locale;
  res.locals.languages = SUPPORTED;
  res.locals.langPrefix = prefix;
  res.locals.path = cleanPath;
  res.locals.canonicalUrl = site + prefix + (cleanPath === '/' ? '' : cleanPath);
  res.locals.req = req;

  next();
}

export { SUPPORTED, DEFAULT_LANG };
