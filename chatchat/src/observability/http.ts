import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Metrics } from './catalog.js';

/**
 * RED по маршрут (NFR-09): брояч по шаблон/метод/статус + хистограма на продължителността.
 * Етикетът `route` е ШАБЛОНЪТ, с който Express е намерил маршрута (`/api/v1/cases/:id`) —
 * никога суровият път: id-тата взривяват кардиналността и могат да носят лични данни
 * (QR токен, номер на случай). Без съвпаднал маршрут — фиксирани кофи (`(static)`, `(unmatched)`).
 */

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

type RouteLike = { path?: unknown } | undefined;

/**
 * Шаблонът: точката на монтиране (`req.baseUrl` В МОМЕНТА, в който Express избира маршрута) +
 * пътят на маршрута. Точките на монтиране в app.ts и app-routes.ts са само статични префикси —
 * нов `app.use` с параметър (`/x/:id`) би сложил id в етикета, затова не се прави (CLAUDE.md,
 * инварианти).
 */
export function routeTemplate(baseUrl: string, route: RouteLike, originalUrl: string): string {
  if (route && typeof route.path === 'string') {
    const full = `${baseUrl}${route.path}`;
    return full.length <= 64 ? full : '(other)';
  }
  const path = originalUrl.split('?')[0] ?? '';
  return path === '/api' || path.startsWith('/api/') ? '(unmatched)' : '(static)';
}

/**
 * Express записва `req.route = …` при избор на маршрут; след грешка (next(err)) рутерът връща
 * baseUrl към родителя, затова шаблонът се хваща в самия момент на избора — сетер върху заявката.
 */
function captureRoute(req: Request): () => string | null {
  let current: RouteLike;
  let template: string | null = null;
  Object.defineProperty(req, 'route', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (value: RouteLike) => {
      current = value;
      if (value && typeof value.path === 'string') {
        template = routeTemplate(req.baseUrl, value, req.originalUrl);
      }
    },
  });
  return () => template;
}

export function httpMetrics(metrics: Metrics): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    const matched = captureRoute(req);
    let done = false;
    const record = () => {
      if (done) return;
      done = true;
      const method = METHODS.has(req.method) ? req.method : 'OTHER';
      const route = matched() ?? routeTemplate('', undefined, req.originalUrl);
      // Скъсана връзка преди отговор — 499 по конвенцията на nginx (клиентът е затворил).
      const status = res.writableFinished || res.headersSent ? String(res.statusCode) : '499';
      metrics.httpRequests.inc({ method, route, status });
      // Потокът в реално време живее минути/часове — продължителността му не е латентност.
      const type = res.getHeader('content-type');
      if (typeof type === 'string' && type.startsWith('text/event-stream')) return;
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      metrics.httpDuration.observe({ method, route }, seconds);
    };
    res.on('finish', record);
    res.on('close', record);
    next();
  };
}
