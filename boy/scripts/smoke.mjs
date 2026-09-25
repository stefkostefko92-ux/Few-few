// Smoke test in Chromium: serves dist/ (three.js from node_modules in place of the CDN), runs the
// page on both GPU backends — WebGPU and the WebGL 2 fallback (?webgl) — fails on any page error,
// and saves frames from four beats with the HUD's draw-call count.
// WebGPU canvases only present in a headed browser, so run it under a display:
//   xvfb-run -a npm run smoke
// Everything renders in software (SwiftShader); frame times here say nothing about real fps.
import { chromium } from 'playwright';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { realTimeOf, REAL_DURATION } from '../src/director.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || 8125);
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.0/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp' };
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
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  })
  .listen(PORT);

const headed = Boolean(process.env.DISPLAY);
const browser = await chromium.launch({
  headless: !headed,
  args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];
const backends = headed ? [['webgpu', ''], ['webgl2', '?webgl']] : [['webgl2', '?webgl']];
if (!headed) process.stdout.write('No display: WebGPU cannot present headless, testing the WebGL 2 fallback only (use xvfb-run for both)\n');
try {
  for (const [name, query] of backends) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
    page.on('pageerror', (e) => problems.push(`${name}: page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) problems.push(`${name}: console error: ${m.text()}`);
    });
    await page.route(`${CDN}**`, (route) => {
      const rel = route.request().url().slice(CDN.length);
      route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(path.join(ROOT, 'node_modules/three', rel)) });
    });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const res = await page.goto(`http://localhost:${PORT}/ravenhold.html${query}`);
    if (!res || res.status() !== 200) problems.push(`${name}: page responded ${res && res.status()}`);
    await page.waitForSelector('#loader.done', { timeout: 420000 });
    await page.selectOption('#quality', 'high');
    await page.click('#stats-btn');
    await page.waitForTimeout(1500);
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
      await frames(6);
      writeFileSync(path.join(out, `${name}-t${T}.jpg`), await page.screenshot({ type: 'jpeg', quality: 80 }));
      const draws = await page.evaluate(() => document.getElementById('st-draw')?.textContent);
      const tier = await page.evaluate(() => document.getElementById('st-tier')?.textContent);
      process.stdout.write(`${name} T=${T}s rendered · ${draws} · ${tier}\n`);
    }
    await page.close();
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
