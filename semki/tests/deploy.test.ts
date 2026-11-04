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

// Подменени `ss` и `docker` в PATH: `busy` — портовете, на които „слуша“ нещо; `ours` — какво казва
// `docker compose port app 4340` (празно — нашият контейнер не върви).
function withFakeTools(
  busy: number[],
  ours: string,
  script: string,
  fn: string,
): { status: number; out: string } {
  const bin = mkdtempSync(path.join(tmpdir(), 'semki-bin-'));
  try {
    const ports = busy
      .map((p) => `*":${p}"*) echo "LISTEN 0 4096 127.0.0.1:${p} 0.0.0.0:*" ;;`)
      .join('\n');
    writeFileSync(path.join(bin, 'ss'), `#!/bin/sh\ncase "$*" in\n${ports}\nesac\n`, {
      mode: 0o755,
    });
    writeFileSync(
      path.join(bin, 'docker'),
      `#!/bin/sh\n[ "$1 $2 $3" = "compose port app" ] && [ -n "${ours}" ] && echo "${ours}"\nexit 0\n`,
      { mode: 0o755 },
    );
    const r = spawnSync('bash', ['-c', `source "$1"; ${fn}`, 'x', script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    });
    return { status: r.status ?? -1, out: r.stdout };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

const SETUP = path.resolve(path.dirname(SCRIPT), 'setup-env.sh');

test('портът: свободен или наш минава, чужд спира деплоя', () => {
  assert.equal(withFakeTools([], '', SCRIPT, 'port_is_ours_or_free 4340').status, 0);
  assert.equal(
    withFakeTools([4340], '127.0.0.1:4340', SCRIPT, 'port_is_ours_or_free 4340').status,
    0,
  );
  assert.equal(withFakeTools([4340], '', SCRIPT, 'port_is_ours_or_free 4340').status, 1);
  assert.equal(
    withFakeTools([4341], '127.0.0.1:4340', SCRIPT, 'port_is_ours_or_free 4341').status,
    1,
  );
});

test('setup-env избира първия свободен порт от 4340 нагоре', () => {
  assert.equal(withFakeTools([], '', SETUP, 'free_port').out, '4340');
  assert.equal(withFakeTools([4340, 4341], '', SETUP, 'free_port').out, '4342');
});
