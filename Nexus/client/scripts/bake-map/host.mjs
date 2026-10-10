/* Малък хост: статичен сървър + headless Chromium (SwiftShader WebGL2). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.glsl': 'text/plain', '.frag': 'text/plain', '.vert': 'text/plain' };

export function findThree() {
  // „main“ на three сочи към build/three.cjs
  return path.dirname(require.resolve('three'));
}

export function findChromium() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r).sort().reverse()) {
      const exe = path.join(r, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium-') && fs.existsSync(exe)) return exe;
    }
  }
  return undefined; // playwright сам ще намери
}

export function serve() {
  const three = findThree();
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let f;
    if (u.startsWith('/three/')) f = path.join(three, u.slice(7));
    else if (u === '/') f = path.join(here, 'index.html');
    else f = path.join(here, u);
    if (!f.startsWith(here) && !f.startsWith(three)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(b);
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, port: srv.address().port })));
}

export async function openPage({ log = true } = {}) {
  const { chromium } = await import('playwright-core');
  const { srv, port } = await serve();
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.setDefaultTimeout(0);
  if (log) page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall')) console.log('[page]', t.slice(0, 1500)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => !!window.Baker);
  return { page, close: async () => { await browser.close(); srv.close(); } };
}
