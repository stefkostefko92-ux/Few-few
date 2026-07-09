import { Request, Response, NextFunction } from 'express';

/**
 * Country-level allowlist for the platform.
 *
 * IMPORTANT — this is a technical control only. Compliance with each
 * jurisdiction's microtransaction / consumer-protection / age-gating law
 * is the operator's legal responsibility. Talk to a lawyer before launch.
 *
 * Country detection prefers (in order):
 *   1. The X-Country-Code header (testing / trusted proxy)
 *   2. The CF-IPCountry header (Cloudflare proxied deploys)
 *   3. A simple lookup against a small in-memory range table (best-effort)
 *
 * If the country can't be determined, the request is allowed by default
 * unless STRICT_GEO is set, in which case unknown is treated as blocked.
 */

const DEFAULT_ALLOWED = 'BG,IT';
const STATIC_BLOCK_PATHS = ['/api/health']; // never block health

function allowedSet(): Set<string> {
  const raw = (process.env.ALLOWED_COUNTRIES || DEFAULT_ALLOWED).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return new Set(raw);
}

function detectCountry(req: Request): string {
  // Одит: клиентският X-Country-Code се подправя тривиално → вярваме му само
  // зад изричен флаг (тест/доверен proxy, който сам го поставя). Продукция:
  // CF-IPCountry (поставен от edge-а) + nginx strip-ва входящия header.
  if (process.env.TRUST_COUNTRY_HEADER === '1') {
    const headerCountry = (req.headers['x-country-code'] as string) || '';
    if (headerCountry) return headerCountry.toUpperCase().slice(0, 2);
  }
  const cf = (req.headers['cf-ipcountry'] as string) || '';
  if (cf) return cf.toUpperCase().slice(0, 2);
  // Localhost / private — default to allow during dev.
  const ip = (req.ip || '').replace('::ffff:', '');
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return 'DEV';
  }
  return 'XX'; // unknown
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      detectedCountry?: string;
    }
  }
}

export function geoBlock(req: Request, res: Response, next: NextFunction): void {
  if (STATIC_BLOCK_PATHS.includes(req.path)) return next();
  if (process.env.DISABLE_GEO === '1') return next();

  const allowed = allowedSet();
  const country = detectCountry(req);
  req.detectedCountry = country;

  // Dev/local always allowed.
  if (country === 'DEV') return next();

  if (allowed.has(country)) return next();

  // Unknown: block in strict mode, allow otherwise.
  if (country === 'XX' && process.env.STRICT_GEO !== '1') return next();

  // Friendly JSON for API, friendly HTML for SPA.
  if (req.path.startsWith('/api/')) {
    res.status(451).json({
      error: 'Service not available in your region.',
      country,
      allowed: Array.from(allowed),
    });
    return;
  }
  res
    .status(451)
    .type('html')
    .send(`<!doctype html><html><head><title>Service unavailable</title>
      <style>body{font-family:system-ui;margin:0;background:#0b0d12;color:#e8e7e1;display:grid;place-items:center;min-height:100vh}
      .card{max-width:520px;padding:48px;border:1px solid #2d3548;border-radius:18px;background:linear-gradient(180deg,#11141b,#0a0c12);text-align:center}
      h1{color:#f7d77e;font-family:'Cinzel',serif;margin:0 0 12px}
      p{color:#b9b8b1;line-height:1.6}</style></head><body>
      <div class="card">
        <h1>Service Unavailable</h1>
        <p>Nexus Dominion isn't currently licensed to operate in your region (${country}).</p>
        <p>We hope to serve you in the future. Until then, safe travels.</p>
      </div></body></html>`);
}

export function getGeoInfo(_req: Request, res: Response): void {
  const allowed = Array.from(allowedSet());
  res.json({
    allowed,
    detected: _req.detectedCountry || detectCountry(_req),
    strict: process.env.STRICT_GEO === '1',
    disabled: process.env.DISABLE_GEO === '1',
  });
}
