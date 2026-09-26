// Static server for dist/, shared by the smoke test and the batch renderer (Chromium runs offline:
// the page is self-hosted, three.js included).
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

export function serveDist(port) {
  const dist = path.join(ROOT, 'dist');
  return http
    .createServer((req, res) => {
      const rel = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      const file = path.join(dist, rel === '/' ? 'staffe-3d.html' : rel);
      if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    })
    .listen(port);
}

// The page must work offline and make no third-party requests: anything not served from
// localhost is refused and reported through `report(url)`.
export async function localOnly(page, report) {
  await page.route(/^(?!https?:\/\/localhost[:/])/, (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    report(url);
    return route.abort();
  });
}

export const CHROMIUM_ARGS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
