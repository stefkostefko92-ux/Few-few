// Деплоят: панелът е зад IP allowlist; публичен е само POST на тайния път на webhook-а; webhook-ът е с
// таван на честотата и тяло до 11 MB. Проверено и на живо с nginx 1.24 при създаването (27.11.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');

test('nginx: хостът е зад allowlist, публичен е само POST на /inbound/brevo/<таен път>', () => {
  const conf = read('../deploy/nginx/otgovorko.carbonstealth.eu.conf');
  const tls = conf.slice(conf.indexOf('listen 443'));
  assert.match(tls, /include \/etc\/nginx\/otgovorko-allow\.conf;\s*\n\s*deny all;/);
  const loc = tls.match(
    /location ~ "\^\/inbound\/brevo\/\[A-Za-z0-9_-\]\{32,128\}\$" \{([\s\S]*?)\n {4}\}/,
  );
  assert.ok(loc, 'отделен location само за тайния път');
  assert.match(loc[1]!, /allow all;/);
  assert.match(loc[1]!, /limit_except POST \{ deny all; \}/);
  assert.match(loc[1]!, /limit_req zone=otgovorko_inbound/);
  assert.equal((tls.match(/allow all;/g) ?? []).length, 1, 'никъде другаде „allow all“');
});

test('compose: тайните са задължителни, Vertex е по избор, портът е 4380 само на 127.0.0.1', () => {
  const c = read('../docker-compose.yml');
  for (const k of [
    'JWT_SECRET',
    'TOTP_KEY',
    'DATA_KEY',
    'INBOUND_PATH',
    'INBOUND_TOKEN',
    'APP_ORIGIN',
  ]) {
    assert.match(c, new RegExp(`${k}: \\$\\{${k}:\\?`), k);
  }
  assert.match(c, /VERTEX_PROJECT_ID: \$\{VERTEX_PROJECT_ID:-\}/);
  assert.match(c, /'127\.0\.0\.1:\$\{HTTP_PORT:-4380\}:4380'/);
});
