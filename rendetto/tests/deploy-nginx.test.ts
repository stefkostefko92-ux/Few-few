import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { certificate, deploy, DOMAIN, sharedEnv, VHOST, withLayout } from './deploy-harness.js';

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
      ['rendetto'],
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
    assert.deepEqual(readdirSync(join(L.base, 'nginx', 'sites-available')), ['rendetto']);
  });
});

test('HTTP_PORT from .env is written into the vhost, so the domain points at Rendetto', () => {
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
