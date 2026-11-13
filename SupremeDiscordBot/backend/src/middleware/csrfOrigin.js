// backend/src/middleware/csrfOrigin.js
// CSRF: всяка ПРОМЯНА под /api (не-GET) с браузърна бисквитка трябва да идва
// от нашия Origin.
//
// Защо не стига SameSite=Lax: той пази само между различни „sites“, а
// *.carbonstealth.eu е ЕДИН site — там живеят всички продукти на собственика.
// Форма или fetch от който и да е съседен поддомейн изпращаше бисквитката
// `sid`; например `/api/gdpr/delete-account` иска само публичния Discord ID
// (Кодаджията, 10.10.2026). Webhook-ите (Stripe, Discord, top.gg), ботът
// (x-bot-secret) и публичното API (bearer ключ) не носят бисквитка и се пазят
// с подпис/тайна/ключ — те са изключени изрично.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_EXEMPT = Object.freeze([
  /^\/api\/stripe\/webhook$/,
  /^\/api\/bot(\/|$)/,
  /^\/api\/discord(\/|$)/,
  /^\/api\/topgg(\/|$)/,
  /^\/api\/v1(\/|$)/,
]);

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

export function allowedOrigins(env = process.env) {
  const set = new Set();
  const main = originOf(env.FRONTEND_URL || "http://localhost:5173");
  if (main) set.add(main);
  if (env.NODE_ENV !== "production") {
    for (const dev of ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080", "http://127.0.0.1:8080"]) set.add(dev);
  }
  return set;
}

export function csrfOriginGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const path = (req.originalUrl || "").split("?")[0];
  if (CSRF_EXEMPT.some((r) => r.test(path))) return next();
  const origin = req.get("origin");
  const site = req.get("sec-fetch-site");
  if (origin) {
    if (allowedOrigins().has(origin)) return next();
    return res.status(403).json({ error: "Cross-site request blocked", code: "CSRF_ORIGIN" });
  }
  // Браузърите пращат Origin на всяка POST/PUT/PATCH/DELETE; без него, но с
  // Sec-Fetch-Site, което не е нашето — пак отказ.
  if (site && site !== "same-origin" && site !== "none") {
    return res.status(403).json({ error: "Cross-site request blocked", code: "CSRF_ORIGIN" });
  }
  // Без Origin и без Sec-Fetch-Site: не е браузър (curl, сървър-сървър) —
  // такъв клиент няма чужда бисквитка за злоупотреба.
  return next();
}
