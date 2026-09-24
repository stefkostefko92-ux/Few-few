// Smoke test in headless Chromium: serves dist/ravenhold.html (three.js from node_modules in place of
// the CDN), fails on any page error, grabs frames from four beats and counts GL draw calls per frame.
// Software rendering needs no GPU; frame times here say nothing about real fps.
import { chromium } from 'playwright';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { realTimeOf, REAL_DURATION } from '../src/director.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || 8125);
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

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
  await page.addInitScript(() => {
    window.__draws = 0;
    const P = WebGL2RenderingContext.prototype;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = P[name];
      P[name] = function counted(...a) {
        window.__draws++;
        return orig.apply(this, a);
      };
    }
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) problems.push(`console error: ${m.text()}`);
  });
  await page.route(`${CDN}**`, (route) => {
    const rel = route.request().url().slice(CDN.length);
    route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(path.join(ROOT, 'node_modules/three', rel)) });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const res = await page.goto(`http://localhost:${PORT}/ravenhold.html`);
  if (!res || res.status() !== 200) problems.push(`page responded ${res && res.status()}`);
  await page.waitForSelector('#loader.done', { timeout: 420000 });
  await page.selectOption('#quality', 'high');
  await page.click('#play');
  const frames = (n) => page.evaluate((k) => new Promise((r) => {
    let i = 0;
    const f = () => (++i >= k ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
  for (const T of [4.4, 8.36, 12.93, 21.5]) {
    const v = Math.round((realTimeOf(T) / REAL_DURATION) * 1000);
    await page.evaluate((val) => {
      const s = document.getElementById('scrub');
      s.value = String(val);
      s.dispatchEvent(new Event('input'));
    }, v);
    await frames(3);
    const before = await page.evaluate(() => window.__draws);
    await frames(4);
    const draws = ((await page.evaluate(() => window.__draws)) - before) / 4;
    writeFileSync(path.join(out, `t${T}.jpg`), await page.screenshot({ type: 'jpeg', quality: 80 }));
    process.stdout.write(`T=${T}s rendered, ${draws.toFixed(0)} GL draw calls per frame\n`);
  }
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  process.stderr.write(`${problems.map((p) => `✘ ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`✓ smoke: no page errors, frames in ${path.relative(ROOT, out)}/\n`);
