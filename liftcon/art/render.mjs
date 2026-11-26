// Рендер през headless Chromium (Playwright). Употреба:
//   node render.mjs [hero dettaglio og] [--scale 0.25] [--spp 16] [--no-post]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const names = args.filter((a, i) => !a.startsWith('--') && !['--scale', '--spp', '--off'].includes(args[i - 1]));
const shots = names.length ? names : ['hero', 'dettaglio', 'og'];
const scale = parseFloat(opt('scale', '1')), spp = opt('spp') ? parseInt(opt('spp')) : undefined;
const out = path.join(here, 'out'); fs.mkdirSync(out, { recursive: true });

const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = path.join(here, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+$/, '/index.html'));
  if (!p.startsWith(here) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r));
const url = `http://127.0.0.1:${srv.address().port}/index.html`;

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.setDefaultTimeout(0);
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const off = opt('off', ''); await page.addInitScript((o) => { window.OFF = o.split(',').filter(Boolean); }, off);
await page.goto(url); await page.waitForFunction('window.__ready === true');
for (const name of shots) {
  const t0 = Date.now();
  const log = await page.evaluate(([n, o]) => window.R.init(n, o), [name, { scale, spp }]);
  console.log(name, 'init', log.join(', '), Date.now() - t0, 'ms');
  let done = 0, total = 0;
  do { done = await page.evaluate(() => window.R.step(2)); total = await page.evaluate(() => window.R.N); process.stdout.write(`\r${name} ${done}/${total} ${Math.round((Date.now() - t0) / 1000)}s `); } while (done < total);
  const dataUrl = await page.evaluate(() => window.R.finish());
  const file = path.join(out, `${name}${scale !== 1 ? '-preview' : ''}${off ? '-' + off.replace(/,/g, '_') : ''}.png`);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log('\n->', file);
}
await browser.close(); srv.close();
if (scale === 1 && !args.includes('--no-post')) spawnSync('python3', [path.join(here, 'postprocess.py')], { stdio: 'inherit' });
