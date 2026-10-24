import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const COMPOSE = readFileSync('docker-compose.yml', 'utf8');
const DOCKERFILE = readFileSync('Dockerfile', 'utf8');
const NGINX = readFileSync('deploy/nginx/cs2.carbonstealth.eu.conf', 'utf8');
const ENV_EXAMPLE = readFileSync('.env.example', 'utf8');

test('Compose публикува портове САМО на 127.0.0.1 (Docker заобикаля ufw)', () => {
  const published = [...COMPOSE.matchAll(/^\s*-\s*'([^']+:\d+)'\s*$/gm)].map((m) => m[1]!);
  assert.deepEqual(published, [
    '127.0.0.1:${PG_PORT:-5442}:5432',
    '127.0.0.1:${REDIS_PORT:-6392}:6379',
    '127.0.0.1:${HTTP_PORT:-4340}:4330',
  ]);
  assert.doesNotMatch(COMPOSE, /0\.0\.0\.0:/);
});

test('Compose: втвърдяване, Redis с парола и noeviction, тайни само от .env', () => {
  assert.match(COMPOSE, /read_only: true/);
  assert.match(COMPOSE, /no-new-privileges:true/);
  assert.equal((COMPOSE.match(/cap_drop: \[ALL\]/g) ?? []).length, 4, 'всяка услуга сваля правата');
  assert.match(COMPOSE, /--requirepass\n\s+- \$\{REDIS_PASSWORD:\?/);
  assert.match(COMPOSE, /--maxmemory-policy\n\s+- noeviction/);
  assert.match(COMPOSE, /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?/);
  assert.match(COMPOSE, /image: postgres:16-alpine@sha256:[0-9a-f]{64}/);
  assert.match(COMPOSE, /command: \['node', 'dist\/worker\.js'\]/);
});

test('Dockerfile: многослоен, непривилегирован, с HEALTHCHECK и закован образ', () => {
  assert.match(DOCKERFILE, /FROM node:22-slim@sha256:[0-9a-f]{64} AS base/);
  assert.match(DOCKERFILE, /^USER node$/m);
  assert.match(DOCKERFILE, /^HEALTHCHECK /m);
  assert.match(DOCKERFILE, /npm prune --omit=dev/);
});

test('nginx: TLS от Let’s Encrypt, HSTS, прокси към 127.0.0.1:4340, без дневник с IP', () => {
  assert.match(
    NGINX,
    /ssl_certificate\s+\/etc\/letsencrypt\/live\/cs2\.carbonstealth\.eu\/fullchain\.pem;/,
  );
  assert.match(
    NGINX,
    /add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;/,
  );
  assert.match(NGINX, /return 308 https:\/\/\$host\$request_uri;/);
  assert.equal((NGINX.match(/proxy_pass http:\/\/127\.0\.0\.1:4340;/g) ?? []).length, 2);
  assert.equal((NGINX.match(/access_log off;/g) ?? []).length, 2);
  assert.match(NGINX, /proxy_set_header X-Forwarded-For\s+\$remote_addr;/);
});

test('.env.example: тайните са празни', () => {
  for (const name of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'CONTACT_EMAIL', 'COMPANY_EIK']) {
    assert.match(ENV_EXAMPLE, new RegExp(`^${name}=$`, 'm'), `${name} не е празна`);
  }
});
