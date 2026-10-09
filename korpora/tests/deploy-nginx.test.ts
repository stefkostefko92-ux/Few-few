import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/paths.js';
import {
  certificate,
  deploy,
  DOMAIN,
  MAINT_PAGE,
  mode,
  sharedEnv,
  VHOST,
  withLayout,
} from './deploy-harness.js';

test('with a certificate the vhost from the repo is installed and reloaded; a refused one is rolled back', () => {
  withLayout((L) => {
    sharedEnv(L);
    certificate(L);

    const first = deploy(L);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(readFileSync(L.site, 'utf8'), readFileSync(VHOST, 'utf8'));
    assert.equal(readlinkSync(L.link), L.site);
    assert.match(first.log, /nginx -t\nsystemctl reload nginx\n/);
    assert.match(first.stderr, /certbot не презарежда nginx след подновяване/);

    writeFileSync(
      join(L.le, 'renewal', `${DOMAIN}.conf`),
      '[renewalparams]\nauthenticator = nginx\nrenew_hook = systemctl reload nginx\n',
    );
    const same = deploy(L);
    assert.doesNotMatch(same.log, /nginx -t|systemctl reload/, 'in sync: nothing to reload');
    assert.doesNotMatch(same.stderr, /certbot не презарежда/);

    const changed = join(L.app, 'deploy', 'nginx', `${DOMAIN}.conf`);
    writeFileSync(changed, `${readFileSync(VHOST, 'utf8')}# промяна\n`);
    const refused = deploy(L, { NGINX_T_RC: '1' });
    assert.equal(refused.status, 0, 'the app is live; only nginx kept the old vhost');
    assert.equal(
      readFileSync(L.site, 'utf8'),
      readFileSync(VHOST, 'utf8'),
      'the old vhost is back',
    );
    assert.doesNotMatch(refused.log, /systemctl reload/);
    assert.match(refused.stderr, /nginx -t отказа новия vhost/);
    assert.deepEqual(
      readdirSync(join(L.base, 'nginx', 'sites-available')),
      ['korpora'],
      'no backup copy left behind',
    );
  });
});

test('a failed nginx reload after a healthy swap still exits 0 and puts the old vhost back', () => {
  withLayout((L) => {
    sharedEnv(L);
    certificate(L);
    const first = deploy(L, { SYSTEMCTL_RC: '1' });
    assert.equal(
      first.status,
      0,
      'the new code is live: code 1 would mean "stopped before the swap"',
    );
    assert.match(first.stderr, /reload на nginx не мина/);
    assert.equal(existsSync(L.site), false, 'nothing installed that nginx did not load');
    assert.equal(existsSync(L.link), false);
    assert.match(first.log, /node \S+indexnow\.mjs/, 'the steps after nginx still run');
    assert.ok(existsSync(join(L.shared, 'last-good')));

    const loaded = deploy(L);
    assert.equal(loaded.status, 0, loaded.stderr);
    const changed = join(L.app, 'deploy', 'nginx', `${DOMAIN}.conf`);
    writeFileSync(changed, `${readFileSync(VHOST, 'utf8')}# промяна\n`);
    const again = deploy(L, { SYSTEMCTL_RC: '1' });
    assert.equal(again.status, 0);
    assert.equal(readFileSync(L.site, 'utf8'), readFileSync(VHOST, 'utf8'), 'the loaded vhost');
    assert.deepEqual(readdirSync(join(L.base, 'nginx', 'sites-available')), ['korpora']);
  });
});

test('HTTP_PORT from .env is written into the vhost, so the domain points at Korpora', () => {
  withLayout((L) => {
    sharedEnv(L, undefined, 'HTTP_PORT=4400\n');
    certificate(L);
    const r = deploy(L);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.log, /curl http:\/\/127\.0\.0\.1:4400\/health/);
    const site = readFileSync(L.site, 'utf8');
    assert.match(site, /proxy_pass http:\/\/127\.0\.0\.1:4400;/);
    assert.doesNotMatch(site, /127\.0\.0\.1:4320;/);
  });
});

test("while the app does not answer, nginx shows Korpora's own page instead of its bare 502", () => {
  const vhost = readFileSync(VHOST, 'utf8');
  const tls = vhost.slice(vhost.indexOf('listen 443'));
  // only the errors nginx makes itself (no upstream): the app's own 503 answers stay as they are
  assert.match(tls, /\n {4}error_page 502 503 504 \/maintenance\.html;\n/);
  assert.doesNotMatch(vhost, /^\s*proxy_intercept_errors\s+on/m);
  const loc = /location = \/maintenance\.html \{([\s\S]*?)\n {4}\}/.exec(tls)?.[1] ?? '';
  assert.match(loc, /\n {8}root \/var\/www\/korpora;/);
  assert.match(loc, /\n {8}internal;/, 'not a page of its own: only the target of error_page');
  assert.match(loc, /add_header Retry-After 30 always;/);
  assert.match(loc, /\n {8}charset utf-8;/);
  assert.match(loc, /add_header Cache-Control "no-store" always;/);
  assert.match(loc, /add_header X-Content-Type-Options "nosniff" always;/);

  const page = readFileSync(MAINT_PAGE, 'utf8');
  // self-contained: /static goes to the same upstream that is down, and nothing leaves the server
  assert.doesNotMatch(page, /<script|<link|@import|url\(|(src|href)="(?!data:)[^"]/i);
  const logo = readFileSync(join(ROOT, 'public', 'img', 'brand', 'logo-320.webp')).toString(
    'base64',
  );
  assert.ok(page.includes(`src="data:image/webp;base64,${logo}"`), 'the logo of the brand, inline');
  const styles = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
  assert.equal(styles.length, 1);
  const hash = createHash('sha256')
    .update(styles[0] ?? '')
    .digest('base64');
  assert.match(
    loc,
    new RegExp(
      `add_header Content-Security-Policy "default-src 'none'; style-src 'sha256-${hash.replace(/[+/]/g, '\\$&')}'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;`,
    ),
    "a strict CSP that lets in only this page's style (its hash) and the inline logo",
  );
  assert.match(page, /<html lang="bg">/);
  for (const lang of ['en', 'it']) assert.match(page, new RegExp(`<section lang="${lang}">`));
  assert.match(page, /<meta name="robots" content="noindex, nofollow" \/>/);
  const keywords = /name="keywords"\s+content="([^"]+)"/.exec(page)?.[1]?.split(', ') ?? [];
  assert.ok(keywords.length >= 5 && keywords.includes('Carbon Stealth'), keywords.join(' | '));
});

test('the deploy puts that page where nginx reads it, before the app is restarted', () => {
  withLayout((L) => {
    sharedEnv(L);
    // `up` fails: the page must already be in place, since the restart is when nginx needs it
    const r = deploy(L, { UP_RC: '1' });
    assert.equal(r.status, 4);
    const page = join(L.maint, 'maintenance.html');
    assert.equal(readFileSync(page, 'utf8'), readFileSync(MAINT_PAGE, 'utf8'));
    // nginx (www-data) reads it; the deploy's umask 077 must not make it root-only
    assert.deepEqual([mode(L.maint), mode(page)], ['755', '644']);
  });
});

test('TLS 1.2 offers only AEAD with forward secrecy, and neither server block names the nginx version', () => {
  const vhost = readFileSync(VHOST, 'utf8');
  const [plain = '', tls = ''] = vhost.split(/\n(?=server \{)/).slice(1);
  assert.match(plain, /listen 80;/);
  assert.match(tls, /listen 443 ssl/);
  // nginx's own default is HIGH:!aNULL:!MD5 — CBC with SHA-1 MACs, DHE and CAMELLIA included
  const ciphers = /\n {4}ssl_ciphers ([^;]+);/.exec(tls)?.[1]?.split(':') ?? [];
  assert.ok(ciphers.length > 0, 'ssl_ciphers is set');
  for (const c of ciphers)
    assert.match(c, /^ECDHE-(ECDSA|RSA)-(AES(128|256)-GCM-SHA(256|384)|CHACHA20-POLY1305)$/, c);
  assert.match(tls, /\n {4}ssl_session_tickets off;/);
  for (const block of [plain, tls]) assert.match(block, /\n {4}server_tokens off;/);
});
