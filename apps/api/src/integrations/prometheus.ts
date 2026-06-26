import { collectDefaultMetrics, Histogram, Registry } from "prom-client";
import type { RequestHandler } from "express";
import { logger } from "../logger.js";

/**
 * Prometheus metrics for the API (§ ops / launch readiness). Exposes process +
 * RED HTTP metrics at GET /metrics (plain text). The endpoint is unauthenticated
 * but should be firewalled to the monitoring network at the edge (it is not
 * proxied on the public nginx vhost). Distinct from /api/metrics, which is the
 * staff-facing JSON snapshot.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "aso_api_" });

const httpDuration = new Histogram({
  name: "aso_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

/** Times each request and records it under its matched route (keeps label
 *  cardinality bounded — the route pattern, not the concrete path). */
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || "unmatched";
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
};

export const metricsHandler: RequestHandler = (_req, res) => {
  registry
    .metrics()
    .then((body) => {
      res.setHeader("content-type", registry.contentType);
      res.end(body);
    })
    .catch((err: unknown) => {
      logger.error({ err }, "metrics render failed");
      if (!res.headersSent) res.status(500).end();
    });
};
