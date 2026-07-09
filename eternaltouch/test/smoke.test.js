// Eternal Touch — smoke test (no external services required).
// 1) every EJS template compiles
// 2) every src/prisma JS file passes `node --check`
// 3) the app boots (fail-fast secrets accepted) and serves its key routes even
//    with the DB unreachable — validates routing, language middleware,
//    hreflang/canonical, self-hosted fonts and security headers.
//
// Run: npm test    (exit 0 = pass, non-zero = fail)

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import ejs from 'ejs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let failures = 0;
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); failures++; };

function walk(dir, ext, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, acc);
    else if (e.name.endsWith(ext)) acc.push(p);
  }
  return acc;
}

// ── 1) EJS templates compile ────────────────────────────────────────────────
console.log('EJS templates:');
for (const f of walk(path.join(ROOT, 'src/views'), '.ejs')) {
  try { ejs.compile(readFileSync(f, 'utf-8'), { filename: f }); pass(path.relative(ROOT, f)); }
  catch (e) { fail(`${path.relative(ROOT, f)} :: ${e.message.split('\n')[0]}`); }
}

// ── 2) JS syntax ────────────────────────────────────────────────────────────
console.log('JS syntax (node --check):');
for (const f of [...walk(path.join(ROOT, 'src'), '.js'), ...walk(path.join(ROOT, 'prisma'), '.js')]) {
  try { execFileSync(process.execPath, ['--check', f]); }
  catch (e) { fail(`${path.relative(ROOT, f)} :: ${e.message.split('\n')[0]}`); }
}
pass('all JS files parse');

// ── 3) boot + route smoke (DB intentionally unreachable) ────────────────────
async function bootSmoke() {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '4788',
    SITE_URL: 'http://localhost:4788',
    JWT_SECRET: 'x'.repeat(48),
    COOKIE_SECRET: 'y'.repeat(48),
    ADMIN_EMAIL: 'info@eternaltouch.it',
    ADMIN_PASSWORD: 'ci-smoke-password',
    DATABASE_URL: 'postgresql://x:x@127.0.0.1:1/x',
    DB_CONNECT_RETRIES: '1',
    DB_CONNECT_DELAY_MS: '50',
  };
  const child = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  try {
    const B = 'http://localhost:4788';
    // wait for listen
    let up = false;
    for (let i = 0; i < 40; i++) {
      try { await fetch(`${B}/healthz`); up = true; break; } catch { await new Promise(r => setTimeout(r, 250)); }
    }
    assert.ok(up, 'server did not start listening');
    pass('server booted with fail-fast secrets');

    const hz = await fetch(`${B}/healthz`);
    assert.equal(hz.status, 503, '/healthz should be 503 with DB down');
    const body = await hz.json();
    assert.deepEqual(Object.keys(body).sort(), ['ok', 'timestamp'], '/healthz must expose only {ok,timestamp}');
    pass('/healthz minimal + 503 when DB down');

    for (const p of ['/', '/en', '/it', '/privacy', '/admin/login', '/fonts/fonts.css']) {
      const r = await fetch(`${B}${p}`);
      assert.equal(r.status, 200, `${p} should be 200 (got ${r.status})`);
    }
    pass('key routes render 200 (home, /en, /it, /privacy, admin login, fonts)');

    const home = await fetch(`${B}/it`);
    const html = await home.text();
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), 'no Google Fonts requests (self-hosted)');
    assert.ok(/hreflang="it"\s+href="http:\/\/localhost:4788\/it"/.test(html), 'hreflang it must not be doubled');
    assert.ok(/rel="canonical" href="http:\/\/localhost:4788\/it"/.test(html), 'canonical must reflect served language');
    pass('self-hosted fonts + correct hreflang/canonical on /it');

    const csp = (await fetch(`${B}/`)).headers.get('content-security-policy') || '';
    assert.ok(csp.includes("default-src 'self'") && !csp.includes('googleapis'), 'CSP present, no google hosts');
    pass('Content-Security-Policy header present without Google hosts');
  } finally {
    child.kill('SIGKILL');
  }
}

await bootSmoke().catch((e) => fail(`boot smoke :: ${e.message}`));

console.log(failures === 0 ? '\n✅ smoke test passed' : `\n❌ smoke test failed (${failures})`);
process.exit(failures === 0 ? 0 : 1);
