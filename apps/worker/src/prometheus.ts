import { createServer } from "node:http";
import { collectDefaultMetrics, Counter, Registry } from "prom-client";
import { logger } from "./logger.js";

/**
 * Prometheus metrics for the worker (§ ops / launch readiness). The worker has
 * no HTTP server of its own, so we start a tiny one exposing /metrics + /health
 * on WORKER_METRICS_PORT (default 9091). Firewall it to the monitoring network.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "aso_worker_" });

const jobsTotal = new Counter({
  name: "aso_worker_jobs_total",
  help: "Maintenance jobs processed, by name and outcome",
  labelNames: ["job", "outcome"] as const,
  registers: [registry],
});

export function recordJob(job: string, outcome: "completed" | "failed"): void {
  jobsTotal.inc({ job, outcome });
}

export function startMetricsServer(): void {
  const parsed = Number(process.env.WORKER_METRICS_PORT);
  const port = Number.isInteger(parsed) && parsed > 0 ? parsed : 9091;
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "worker" }));
      return;
    }
    if (req.url === "/metrics") {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { "content-type": registry.contentType });
          res.end(body);
        })
        .catch((err: unknown) => {
          logger.error({ err }, "metrics render failed");
          res.writeHead(500);
          res.end();
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => logger.info({ port }, "worker metrics server listening"));
  server.unref(); // never keep the process alive for metrics alone
}
