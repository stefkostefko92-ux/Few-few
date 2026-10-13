// Рендер на промо клипа: composition.html → кадри (Playwright) → MP4 (ffmpeg, H.264, 1080p30).
//
//   node render.mjs --shots <папка с кадрите> --out <папка за изхода> [--from 0] [--to 75] [--step 1] [--subs 0]
//
// --step 15 рендерира всеки 15-и кадър (бърз преглед, без видео). Без --step: всички кадри + promo.mp4.
// Нужни: Playwright с Chromium (PLAYWRIGHT_BROWSERS_PATH или /opt/pw-browsers/chromium), ffmpeg в PATH.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, '../../public');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = path.resolve(arg('shots', path.join(HERE, 'shots')));
const OUT = path.resolve(arg('out', path.join(HERE, 'out')));
const FPS = 30, FROM = +arg('from', 0), TO = +arg('to', 75), STEP = +arg('step', 1), SUBS = arg('subs', '1') !== '0';
const pwPath = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(pwPath);

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const ROUTES = [['/fonts/', path.join(PUB, 'fonts')], ['/brand/', path.join(PUB, 'brand')], ['/shots/', SHOTS], ['/', HERE]];
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const [pre, dir] = ROUTES.find(([p]) => u.startsWith(p));
  const f = path.join(dir, u.slice(pre.length));
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const frames = path.join(OUT, STEP > 1 ? 'preview' : 'frames');
fs.mkdirSync(frames, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await p.goto(`http://127.0.0.1:${port}/composition.html${SUBS ? '' : '?subs=0'}`, { waitUntil: 'networkidle' });
await p.evaluate(() => window.__ready);
const f0 = Math.round(FROM * FPS), f1 = Math.round(TO * FPS);
let n = 0;
for (let f = f0; f < f1; f += STEP) {
  await p.evaluate(t => window.render(t), f / FPS);
  await p.screenshot({ path: path.join(frames, String(STEP > 1 ? n : f - f0).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  n++; if (n % 150 === 0) console.log('кадри', n);
}
// субтитрите на гласа (.srt) за YouTube — същите реплики, които черновата показва долу
const vo = await p.evaluate(() => VO);
const ts = x => { const ms = Math.round(x * 1000); return [ms / 3600000 | 0, (ms / 60000 | 0) % 60, (ms / 1000 | 0) % 60].map(v => String(v).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0'); };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'carbonstealth-promo-en.srt'), vo.map((v, i) => `${i + 1}\n${ts(v[0])} --> ${ts(v[1])}\n${v[2]}\n`).join('\n'));
await b.close(); srv.close();
if (STEP === 1) {
  const mp4 = path.join(OUT, SUBS ? 'carbonstealth-promo-en.mp4' : 'carbonstealth-promo-en-nosubs.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  console.log('видео', mp4);
} else console.log('преглед', frames, n, 'кадъра');
