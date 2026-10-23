import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { ROOT } from '../src/paths.js';

/**
 * deploy/setup-env.sh runs for real (bash) on a temporary folder; only `id` and the owner flags of
 * `install` are stubbed. The answers come on stdin, as when typed (without a terminal no prompt is shown).
 */
const STUBS = `
id() { echo "$FAKE_UID"; }
install() {
  local a=()
  while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) a+=("$1"); shift ;; esac; done
  command install "\${a[@]}"
}
`;
const KEY = 'c'.repeat(64);
const SMTP_KEY = 'xsmtpsib-secret-1';

function setup(shared: string, input: string, uid = '0') {
  return spawnSync('bash', ['-c', `source "$SCRIPT"\n${STUBS}\nmain`], {
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      SCRIPT: join(ROOT, 'deploy', 'setup-env.sh'),
      KORPORA_SHARED: shared,
      FAKE_UID: uid,
    },
  });
}

const mode = (path: string) => (statSync(path).mode & 0o777).toString(8);
const envOf = (file: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );

function withShared(run: (shared: string) => void): void {
  const base = mkdtempSync(join(tmpdir(), 'korpora-setup-'));
  try {
    run(join(base, 'shared'));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test('it writes a .env the app accepts: generated keys, the answers, mode 600, data for the app', () => {
  withShared((shared) => {
    const r = setup(shared, `login@example.test\n${SMTP_KEY}\n${KEY}\n`);
    assert.equal(r.status, 0, r.stderr);
    const file = join(shared, '.env');
    assert.deepEqual([mode(shared), mode(join(shared, 'data')), mode(file)], ['700', '700', '600']);
    const env = envOf(file);
    for (const name of ['POSTGRES_PASSWORD', 'ENC_KEY', 'HMAC_KEY']) {
      assert.match(env[name] ?? '', /^[0-9a-f]{64}$/, name);
    }
    assert.equal(new Set([env.POSTGRES_PASSWORD, env.ENC_KEY, env.HMAC_KEY]).size, 3);
    assert.deepEqual(
      [env.SMTP_USER, env.SMTP_PASS, env.CATALOG_KEY, env.KORPORA_DATA],
      ['login@example.test', SMTP_KEY, KEY, join(shared, 'data')],
    );
    assert.ok(!`${r.stdout}${r.stderr}`.includes(SMTP_KEY), 'the SMTP key is not echoed');
    // what docker-compose.yml hands to the container passes the app's own config check
    const cfg = loadConfig({
      ...env,
      NODE_ENV: 'production',
      DATABASE_URL: `postgresql://korpora:${env.POSTGRES_PASSWORD}@db:5432/korpora`,
    });
    assert.equal(cfg.PUBLIC_BASE_URL, 'https://korpora.carbonstealth.eu');
    assert.equal(cfg.CATALOG_KEY, KEY);
  });
});

test('without a catalog key there is no CATALOG_KEY line and it says the base catalog is used', () => {
  withShared((shared) => {
    const r = setup(shared, `login@example.test\n${SMTP_KEY}\n\n`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(envOf(join(shared, '.env')).CATALOG_KEY, undefined);
    assert.match(r.stdout, /основния каталог/);
  });
});

test('an existing .env is never overwritten — the keys in it must not change', () => {
  withShared((shared) => {
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, '.env'), 'ENC_KEY=keep\n');
    const r = setup(shared, `login@example.test\n${SMTP_KEY}\n\n`);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /вече съществува — не го пипам/);
    assert.equal(readFileSync(join(shared, '.env'), 'utf8'), 'ENC_KEY=keep\n');
  });
});

test('a bad answer or no root writes nothing', () => {
  withShared((shared) => {
    const cases: Array<[string, string, RegExp]> = [
      [`login\n${SMTP_KEY}\n${'c'.repeat(63)}\n`, '0', /CATALOG_KEY трябва да е 64 hex/],
      ['login\n\n\n', '0', /задължителни/],
      [`login\n${SMTP_KEY}#x\n\n`, '0', /SMTP_PASS съдържа/],
      [`log in\n${SMTP_KEY}\n\n`, '0', /SMTP_USER съдържа/],
      [`login\n${SMTP_KEY}\n\n`, '1000', /пусни като root/],
    ];
    for (const [input, uid, reason] of cases) {
      const r = setup(shared, input, uid);
      assert.equal(r.status, 1, input);
      assert.match(r.stderr, reason);
      assert.ok(!existsSync(shared), `nothing created for ${JSON.stringify(input)}`);
    }
  });
});
