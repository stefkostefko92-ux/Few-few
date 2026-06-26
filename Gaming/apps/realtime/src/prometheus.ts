import { collectDefaultMetrics, Gauge, Registry } from "prom-client";

/**
 * Prometheus metrics for the realtime node (§ ops / launch readiness). Process
 * defaults + live gauges for matches, sockets and open lobbies, served at
 * GET /metrics on the same http server as /health (firewall to monitoring).
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "aso_realtime_" });

interface Getters {
  rooms: () => number;
  sockets: () => number;
  lobbies: () => number;
}

/** Wire live gauges to the node's in-memory counts (sampled on each scrape). */
export function registerRealtimeGauges(get: Getters): void {
  new Gauge({
    name: "aso_realtime_active_matches",
    help: "Authoritative matches currently in memory on this node",
    registers: [registry],
    collect() {
      this.set(get.rooms());
    },
  });
  new Gauge({
    name: "aso_realtime_connected_sockets",
    help: "Connected Socket.IO clients on this node",
    registers: [registry],
    collect() {
      this.set(get.sockets());
    },
  });
  new Gauge({
    name: "aso_realtime_open_lobbies",
    help: "Open pre-game lobbies on this node",
    registers: [registry],
    collect() {
      this.set(get.lobbies());
    },
  });
}

export async function metricsText(): Promise<{ body: string; type: string }> {
  return { body: await registry.metrics(), type: registry.contentType };
}
