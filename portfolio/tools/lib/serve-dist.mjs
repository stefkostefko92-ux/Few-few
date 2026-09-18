// tools/lib/serve-dist.mjs — минимален статичен сървър за dist/ на случаен порт (за инструментите, които
// зареждат билда в Chromium: a11y.mjs, brochure.mjs). Нула зависимости.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf" };

/** Пуска сървъра; връща {srv, base}. Затваряне: srv.close(). */
export function serveDist(dist) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let f = join(dist, p);
      if (!f.startsWith(dist)) { res.writeHead(403); res.end(); return; }
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
      if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
      res.end(readFileSync(f));
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}
