// deploy/deploy.sh: проверката на тайните спира счупен .env ПРЕДИ build-а и смяната на контейнерите.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'deploy',
  'deploy.sh',
);

const GOOD: Record<string, string> = {
  PUBLIC_BASE_URL: 'https://vps2.carbonstealth.eu',
  POSTGRES_PASSWORD: 'ab'.repeat(32),
  SESSION_SECRET: 'cd'.repeat(32),
  DISCORD_TOKEN: 'test-token-not-real',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'test-secret-not-real',
  DISCORD_GUILD_ID: '876543210987654321',
};

function run(fn: string, env: Record<string, string> | null): number {
  const dir = mkdtempSync(path.join(tmpdir(), 'semki-deploy-'));
  try {
    if (env) {
      writeFileSync(
        path.join(dir, '.env'),
        Object.entries(env)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      );
    }
    const r = spawnSync(
      'bash',
      ['-c', `source "$1"; APP_DIR="$2"; SHARED="$2/shared"; ${fn}`, 'x', SCRIPT, dir],
      { encoding: 'utf8' },
    );
    return r.status ?? -1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('валидният .env минава', () => {
  assert.equal(run('check_secrets', GOOD), 0);
});

test('счупените тайни спират деплоя с код 1', () => {
  assert.equal(run('check_secrets', { ...GOOD, POSTGRES_PASSWORD: 'pa@ss' }), 1);
  assert.equal(run('check_secrets', { ...GOOD, POSTGRES_PASSWORD: '' }), 1);
  assert.equal(run('check_secrets', { ...GOOD, SESSION_SECRET: 'short' }), 1);
  assert.equal(run('check_secrets', { ...GOOD, DISCORD_TOKEN: '' }), 1);
  assert.equal(run('check_secrets', { ...GOOD, DISCORD_GUILD_ID: 'my-server' }), 1);
  assert.equal(
    run('check_secrets', { ...GOOD, PUBLIC_BASE_URL: 'http://vps2.carbonstealth.eu' }),
    1,
  );
});

test('без .env никъде — код 3 (машината не е настроена)', () => {
  assert.equal(run('sync_env', null), 3);
});
