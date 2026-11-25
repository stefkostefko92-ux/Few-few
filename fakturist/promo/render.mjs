// Клипът кадър по кадър в истински Chromium → MP4 (promo/README.md).
//
//   node promo/render.mjs                        # целият клип → dist/promo/fakturist-promo-bg.mp4
//   node promo/render.mjs --stills 3,12.5,40     # само кадри в тези секунди → dist/promo/stills/
//   node promo/render.mjs --step 6               # бърз преглед: всеки 6-и кадър, без музика
//
// Нужни: снимките от promo/capture.ts (dist/promo/shots), ffmpeg, python3 + numpy (promo/music.py),
// Playwright с Chromium от средата, sharp (зависимост на продукта).
import http from 'node:http';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'dist', 'promo');
const SHOTS = join(OUT, 'shots');
const BRAND = join(OUT, 'brand');
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const FPS = 30;
const STEP = Number(arg('step', '1'));
const NAME = arg('name', 'fakturist-promo-bg');
if (!existsSync(join(SHOTS, 'shots.json')))
  throw new Error('няма снимки — първо: npx tsx promo/capture.ts');
mkdirSync(BRAND, { recursive: true });

// 1) логото за тъмен фон: тъмните пиксели (текстът и рамката на знака) стават светли, тюркоазът остава
async function brand() {
  const src = sharp(join(ROOT, 'assets', 'logo-source.webp')).ensureAlpha();
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const light = Buffer.from(data);
  for (let i = 0; i < light.length; i += 4) {
    const [r, g, b] = [light[i], light[i + 1], light[i + 2]];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 40 && r + g + b < 300) {
      light[i] = 238;
      light[i + 1] = 243;
      light[i + 2] = 248;
    }
  }
  // Знакът F€ е отляво, отделен от надписа с колони без пиксели.
  let markEnd = 0;
  let seen = false;
  for (let x = 0; x < info.width; x++) {
    let any = false;
    for (let y = 0; y < info.height && !any; y++) any = light[(y * info.width + x) * 4 + 3] > 20;
    if (any) seen = true;
    else if (seen) {
      markEnd = x;
      break;
    }
  }
  const raw = { raw: { width: info.width, height: info.height, channels: 4 } };
  await sharp(light, raw).png().toFile(join(BRAND, 'logo-light.png'));
  // extract и trim — в два прохода: в един sharp прилага trim преди extract.
  const part = async (left, width, file) => {
    const cut = await sharp(light, raw)
      .extract({ left, top: 0, width, height: info.height })
      .png()
      .toBuffer();
    await sharp(cut).trim().png().toFile(join(BRAND, file));
  };
  await part(0, markEnd, 'mark.png');
  await part(markEnd, info.width - markEnd, 'wordmark.png');
  const meta = async (f) => sharp(join(BRAND, f)).metadata();
  const [m, w, l] = await Promise.all([
    meta('mark.png'),
    meta('wordmark.png'),
    meta('logo-light.png'),
  ]);
  return {
    markRatio: m.width / m.height,
    wordRatio: w.width / w.height,
    logoRatio: l.width / l.height,
  };
}

// 2) XML-ът на документа № 4 с оцветяване — за сцената „PDF и XML“
function xmlLines() {
  const xml = readFileSync(join(SHOTS, 'invoice.ubl.xml'), 'utf8').split('\n').slice(1, 44);
  const esc = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Таг по таг: име, атрибути, текстът между таговете — всяко парче се екранира поотделно.
  const tag = /<(\/?)([\w:]+)((?:\s+[\w:]+="[^"]*")*)\s*(\/?)>/g;
  return xml.map((line) => {
    let out = '';
    let last = 0;
    for (const m of line.matchAll(tag)) {
      const text = line.slice(last, m.index);
      out += /\S/.test(text) ? `<span class="vl">${esc(text)}</span>` : esc(text);
      const attrs = m[3].replace(
        /\s+([\w:]+)="([^"]*)"/g,
        (_, k, v) => ` <span class="at">${esc(k)}</span>=<span class="vl">"${esc(v)}"</span>`,
      );
      out += `&lt;${m[1]}<span class="tg">${esc(m[2])}</span>${attrs}${m[4]}&gt;`;
      last = m.index + m[0].length;
    }
    const rest = line.slice(last);
    return out + (/\S/.test(rest) ? `<span class="vl">${esc(rest)}</span>` : esc(rest));
  });
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
};
const MOUNTS = [
  ['/fonts/', join(ROOT, 'public', 'fonts')],
  ['/shots/', SHOTS],
  ['/brand/', BRAND],
];
async function serve(film) {
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/') {
      res.setHeader('content-type', 'text/html');
      return res.end(film);
    }
    if (/^\/film(-lib|-end)?\.js$/.test(url)) {
      res.setHeader('content-type', 'text/javascript');
      return res.end(readFileSync(join(HERE, url.slice(1))));
    }
    for (const [prefix, dir] of MOUNTS) {
      if (!url.startsWith(prefix)) continue;
      const file = normalize(join(dir, url.slice(prefix.length)));
      if (!file.startsWith(dir) || !existsSync(file)) break;
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      return res.end(readFileSync(file));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return srv;
}

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ratios = await brand();
const film = readFileSync(join(HERE, 'film.html'), 'utf8').replace(
  '/*__DATA__*/',
  () =>
    `window.SHOTS = ${readFileSync(join(SHOTS, 'shots.json'), 'utf8')};\nwindow.XML = ${JSON.stringify(xmlLines())};\nwindow.BRAND = ${JSON.stringify(ratios)};`,
);
const srv = await serve(film);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForFunction(
  () => window.__ready === true && document.fonts.status === 'loaded',
  null,
  { timeout: 60_000 },
);
if (errors.length) throw new Error(errors.join('\n'));
const duration = await page.evaluate(() => window.DURATION);

const stills = arg('stills');
if (stills) {
  const dir = join(OUT, 'stills');
  mkdirSync(dir, { recursive: true });
  for (const s of stills.split(',').map(Number)) {
    await page.evaluate((t) => window.render(t), s);
    await page.screenshot({ path: join(dir, `t${String(s).replace('.', '_')}.png`) });
  }
  console.log(`кадри: ${stills} → ${dir}`);
} else {
  const music = join(OUT, 'music.wav');
  const withMusic = STEP === 1 && !process.argv.includes('--no-music');
  if (withMusic) execFileSync('python3', [join(HERE, 'music.py'), music], { stdio: 'inherit' });
  const out = join(OUT, `${STEP === 1 ? NAME : `${NAME}-preview`}.mp4`);
  const ff = spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(FPS / STEP),
      '-i',
      '-',
      ...(withMusic
        ? [
            '-i',
            music,
            '-af',
            'loudnorm=I=-14:TP=-1.5:LRA=11',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-shortest',
          ]
        : []),
      '-c:v',
      'libx264',
      '-preset',
      STEP === 1 ? 'slow' : 'veryfast',
      '-crf',
      '17',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(FPS),
      '-movflags',
      '+faststart',
      out,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const frames = Math.round(duration * FPS);
  for (let i = 0; i < frames; i += STEP) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(jpg)) await new Promise((ok) => ff.stdin.once('drain', ok));
    if (i % (FPS * 5) === 0) process.stdout.write(`${(i / FPS).toFixed(0)}s `);
  }
  ff.stdin.end();
  await new Promise((ok, fail) =>
    ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg ${code}`)))),
  );
  console.log(`\nклип: ${out} (${duration.toFixed(1)} s)`);
  // Корицата за YouTube (1280×720) — кадърът с логото и призива.
  await page.evaluate((t) => window.render(t), duration - 3.2);
  const cover = await page.screenshot({ type: 'png' });
  await sharp(cover)
    .resize(1280, 720)
    .png()
    .toFile(join(OUT, `${NAME}-cover.png`));
}
if (errors.length) console.error(errors.join('\n'));
await browser.close();
srv.close();
writeFileSync(join(OUT, 'render.done'), new Date().toISOString());
