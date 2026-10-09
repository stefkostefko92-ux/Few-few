import { createServer, type Server } from 'node:http';
import { CONTENT_TYPE, type Registry } from './metrics.js';

/**
 * Отделният слушател за `/metrics` (NFR-09) — НЕ публичният порт: nginx проксира само PORT, а този
 * слушател е на METRICS_HOST:METRICS_PORT (по подразбиране 127.0.0.1; в Docker 0.0.0.0 ВЪТРЕ в
 * контейнера, публикуван на хоста само като 127.0.0.1:…). Само GET/HEAD /metrics; без бисквитки,
 * без тяло на заявката, без съдържание от потребители — само агрегати с етикети-кодове.
 */
export function startMetricsServer(
  registry: Registry,
  opts: { host: string; port: number; onError?: (err: Error) => void },
): Promise<Server> {
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/metrics') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found\n');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let body: string;
    try {
      body = registry.render();
    } catch (err) {
      opts.onError?.(err as Error);
      res.writeHead(500).end();
      return;
    }
    res.writeHead(200, {
      'content-type': CONTENT_TYPE,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  // Скрейпът е кратък; бавен/злонамерен клиент не държи сокета.
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => {
      server.off('error', reject);
      if (opts.onError) server.on('error', opts.onError);
      resolve(server);
    });
  });
}
