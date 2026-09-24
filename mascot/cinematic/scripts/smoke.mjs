// Smoke test in headless Chromium: serves dist/mascot-cinematic.html (three.js from node_modules
// in place of the CDN), fails on any page error, grabs a handful of frames. Software rendering
// needs no GPU; frame times here say nothing about real fps.
import { chromium } from 'playwright';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || 8126);
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.0/';
const out = path.join(ROOT, 'dist', 'smoke');
mkdirSync(out, { recursive: true });

const server = http
  .createServer((req, res) => {
    const file = path.join(ROOT, 'dist', path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(path.join(ROOT, 'dist')) || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(file));
  })
  .listen(PORT);

const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) problems.push(`console error: ${m.text()}`);
  });
  await page.route(`${CDN}**`, (route) => {
    const rel = route.request().url().slice(CDN.length);
    route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(path.join(ROOT, 'node_modules/three', rel)) });
  });
  // The reduced-data/no-WebGL2 fallback <img> points at ../svg/…, outside dist/ — only served in
  // the real deploy alongside the rest of mascot/. Fulfil it here so the eager <img> request does
  // not 404 in this single-file harness; that 404 is a smoke-harness artifact, not a page bug.
  await page.route('**/svg/jelly-mascot-full-animated.svg', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
  const res = await page.goto(`http://localhost:${PORT}/mascot-cinematic.html`);
  if (!res || res.status() !== 200) problems.push(`page responded ${res && res.status()}`);
  await page.waitForTimeout(1500);
  const frames = (n) => page.evaluate((k) => new Promise((r) => {
    let i = 0;
    const f = () => (++i >= k ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
  await frames(20);
  writeFileSync(path.join(out, 'frame.jpg'), await page.screenshot({ type: 'jpeg', quality: 85 }));
  await page.click('#pause-btn');
  await page.selectOption('#quality-select', 'ultra');
  await frames(5);
  writeFileSync(path.join(out, 'ultra.jpg'), await page.screenshot({ type: 'jpeg', quality: 85 }));
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  process.stderr.write(`${problems.map((p) => `✘ ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`✓ smoke: no page errors, frames in ${path.relative(ROOT, out)}/\n`);
