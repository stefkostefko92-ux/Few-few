// Живите кадри за промо клипа: цялата страница на компютър (1440) и на телефон (390 @2x).
//
//   node capture.mjs <папка за кадрите> sites.json > cap.log && python3 stitch.py cap.log
//
// Браузърът скролира като човек и снима екран по екран, за да се задействат анимациите
// при скрол; stitch.py сглобява екраните в една висока снимка (`tall: true` = една снимка
// наведнъж, за страници с фиксиран фон). Всяка заявка минава през curl — така TLS се
// проверява от системните сертификати (и от CA на прокси, ако има), никога не се изключва.
import fs from 'node:fs';
import { execFile } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const OUT = process.argv[2];
const SITES = process.argv[3].endsWith('.json') && fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : JSON.parse(process.argv[3]);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const cache = new Map();
function curl(url, method) {
  const k = method + ' ' + url; if (cache.has(k)) return cache.get(k);
  const p = new Promise((res, rej) => {
    execFile('curl', ['-sS', '-L', '--compressed', '-A', UA, '-H', 'Accept-Language: it-IT,it;q=0.9,bg;q=0.8,en;q=0.7', '--max-time', '25', '-D', '-', '-o', '-', url],
      { encoding: 'buffer', maxBuffer: 60e6 }, (err, stdout) => {
        if (err) return rej(err);
        // split the LAST header block from the body
        let buf = stdout, status = 200, headers = {};
        // every leading header block (proxy CONNECT, redirects) is skipped; the last one describes the body
        while (buf.slice(0, 5).toString('latin1') === 'HTTP/') {
          const i = buf.indexOf('\r\n\r\n'); if (i < 0) break;
          const lines = buf.slice(0, i).toString('latin1').split('\r\n'); status = +lines[0].split(' ')[1] || 200; headers = {};
          for (const l of lines.slice(1)) { const j = l.indexOf(':'); if (j > 0) headers[l.slice(0, j).trim().toLowerCase()] = l.slice(j + 1).trim(); }
          buf = buf.slice(i + 4);
        }
        delete headers['content-encoding']; delete headers['content-length']; delete headers['transfer-encoding'];
        delete headers['content-security-policy']; delete headers['set-cookie'];
        res({ status, headers, body: buf });
      });
  });
  cache.set(k, p); return p;
}
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
for (const s of SITES) {
  for (const [kind, vp, dpr, maxH] of [['d', { width: 1440, height: 900 }, 1, 3400], ['m', { width: 390, height: 844 }, 2, 2600]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, userAgent: kind === 'm' ? UA.replace('X11; Linux x86_64', 'Linux; Android 14; Pixel 8') + ' Mobile' : UA, locale: s.locale || 'it-IT', isMobile: kind === 'm', hasTouch: kind === 'm' });
    await ctx.route('**/*', async r => {
      const req = r.request(); const u = req.url();
      if (!/^https?:/.test(u) || req.method() !== 'GET' || /googletagmanager|google-analytics|googlesyndication|doubleclick|facebook\.net|hotjar|clarity\.ms/.test(u)) return r.abort();
      try { const x = await curl(u, 'GET'); await r.fulfill({ status: x.status, headers: x.headers, body: x.body }); } catch { await r.abort(); }
    });
    for (const [k, v] of Object.entries(s.storage || {})) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v) } catch (e) {} }, [k, v]);
    const p = await ctx.newPage();
    try {
      await p.goto(s.url, { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(1500);
      // dismiss cookie banners by their accept buttons (our sites + common wording)
      await p.evaluate(() => { for (const el of document.querySelectorAll('button,a,[role=button]')) { const t = (el.textContent || '').trim().toLowerCase(); if (/^(accetta|accetto|accept|accept all|приемам|приеми|ok|разбрах|got it|accetta tutti)$/.test(t)) { try { el.click() } catch (e) {} } } });
      await p.waitForTimeout(600);
      if (s.tall) {   // pages without reveal-on-scroll: one tall shot is cleaner (no fixed-background repeats)
        const H0 = await p.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < Math.min(H0, maxH + 900); y += 500) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(160); }
        await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800);
        const h0 = Math.min(H0, maxH);
        await p.setViewportSize({ width: vp.width, height: h0 }); await p.waitForTimeout(900);
        await p.screenshot({ path: `${OUT}/${s.id}-${kind}.jpg`, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: vp.width, height: h0 } });
        console.log('ok', s.id, kind, h0); await ctx.close(); continue;
      }
      // scroll like a person and photograph screen by screen: reveal-on-scroll content appears as it would
      // for a visitor; segments are stitched (top half of each screen), fixed/sticky bars kept only once
      const STEP = Math.round(vp.height / 2), H = Math.min(await p.evaluate(() => document.documentElement.scrollHeight), maxH);
      const segs = [];
      for (let y = 0, k = 0; y < H; y += STEP, k++) {
        await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(k === 0 ? 900 : 650);
        const real = await p.evaluate(() => scrollY);
        const f = `${OUT}/_${s.id}-${kind}-${String(k).padStart(2, '0')}.png`;
        await p.screenshot({ path: f });
        segs.push({ f, off: y - real });
        if (k === 0) await p.evaluate(() => { for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if ((cs.position === 'fixed' || cs.position === 'sticky') && el.getBoundingClientRect().height < innerHeight * 0.5) el.style.visibility = 'hidden'; } });
      }
      const h = Math.min(H, segs.length * STEP);
      console.log('SEGS', JSON.stringify({ id: s.id, kind, step: STEP, vh: vp.height, dpr, h, segs }));
      console.log('ok', s.id, kind, h);
    } catch (e) { console.log('FAIL', s.id, kind, e.message.slice(0, 120)); }
    await ctx.close();
  }
}
await b.close();
