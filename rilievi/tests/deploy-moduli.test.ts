// The sealed supplier forms on the server (deploy/deploy.sh, deploy/moduli-chiave.sh): without MODULI_KEY the
// new portal could not open a single form, so the deploy stops before anything is touched; with a key that
// does not open the forms of the new release, it stops after the build and before the containers change.
// The key goes into the server's .env only through moduli-chiave.sh: hidden input, never in the shell history.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DEPLOY = join(import.meta.dirname, '..', 'deploy');
const KEY = 'ab'.repeat(32);
const BASE =
  'POSTGRES_PASSWORD=abc\nJWT_SECRET=' +
  'a'.repeat(64) +
  '\nINTERVENTI_SEAL_KEY=' +
  'b'.repeat(64) +
  '\n';

/** A stand-in `docker` that writes its arguments and exits with $DOCKER_EXIT. */
const DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$DOCKER_LOG"
exit "\${DOCKER_EXIT:-0}"
`;

function deploy(fn: string, env: string, dockerExit = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'rilievi-moduli-deploy-'));
  mkdirSync(join(dir, 'deploy'));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'shared'));
  copyFileSync(join(DEPLOY, 'deploy.sh'), join(dir, 'deploy', 'deploy.sh'));
  writeFileSync(join(dir, 'bin', 'docker'), DOCKER);
  chmodSync(join(dir, 'bin', 'docker'), 0o755);
  writeFileSync(join(dir, 'shared', '.env'), env);
  const log = join(dir, 'docker.log');
  const result = spawnSync(
    'bash',
    ['-c', `cd "${dir}" && source deploy/deploy.sh && sync_env && ${fn}`],
    {
      env: {
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        RILIEVI_SHARED: join(dir, 'shared'),
        DOCKER_LOG: log,
        DOCKER_EXIT: String(dockerExit),
      },
      encoding: 'utf8',
    },
  );
  return { ...result, docker: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

describe('the deploy and the key of the supplier forms', () => {
  it('stops before anything when the key is missing, and says how to set it', () => {
    const result = deploy('check_secrets', BASE);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MODULI_KEY/);
    assert.match(result.stderr, /moduli-chiave\.sh/);
  });

  it('stops when the key is not 32 bytes in hex', () => {
    const result = deploy('check_secrets', `${BASE}MODULI_KEY=abc\n`);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MODULI_KEY/);
  });

  it('goes on with a well-formed key', () => {
    const result = deploy('check_secrets', `${BASE}MODULI_KEY=${KEY}\n`);
    assert.equal(result.status, 0, result.stderr);
  });

  it('opens the forms with the new image before the containers change', () => {
    const result = deploy('check_moduli', `${BASE}MODULI_KEY=${KEY}\n`);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.docker,
      /^compose run --rm --no-deps --entrypoint node app dist\/scripts\/moduli-verifica\.js$/m,
    );
  });

  it('stops after the build when the key does not open them', () => {
    const result = deploy('check_moduli', `${BASE}MODULI_KEY=${KEY}\n`, 1);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MODULI_KEY/);
    assert.match(result.stderr, /non sono toccat|не са пипани/);
  });

  it('checks the forms in main between the build and the switch', () => {
    const main = readFileSync(join(DEPLOY, 'deploy.sh'), 'utf8').split('\nmain() {')[1]!;
    const build = main.indexOf('docker compose build app worker');
    const check = main.indexOf('check_moduli');
    const up = main.indexOf('docker compose up -d --remove-orphans db app');
    assert.ok(build > 0 && check > build && up > check, 'build → check_moduli → up');
  });
});

describe('moduli-chiave.sh', () => {
  function chiave(input: string, env = BASE) {
    const dir = mkdtempSync(join(tmpdir(), 'rilievi-moduli-chiave-'));
    writeFileSync(join(dir, '.env'), env, { mode: 0o600 });
    const result = spawnSync('bash', [join(DEPLOY, 'moduli-chiave.sh')], {
      input,
      env: { PATH: process.env.PATH, RILIEVI_SHARED: dir, RILIEVI_CHIAVE_NONROOT: '1' },
      encoding: 'utf8',
    });
    return { ...result, file: join(dir, '.env') };
  }

  it('writes the key into the server .env, mode 600, without printing it', () => {
    const result = chiave(`${KEY}\n`);
    assert.equal(result.status, 0, result.stderr);
    const env = readFileSync(result.file, 'utf8');
    assert.ok(env.startsWith(BASE), 'the other secrets stay as they were');
    assert.match(env, new RegExp(`^MODULI_KEY=${KEY}$`, 'm'));
    assert.equal(statSync(result.file).mode & 0o777, 0o600);
    assert.ok(
      !result.stdout.includes(KEY) && !result.stderr.includes(KEY),
      'the key is not printed',
    );
  });

  it('replaces an older key instead of adding a second one', () => {
    const result = chiave(`${KEY}\n`, `${BASE}MODULI_KEY=${'c'.repeat(64)}\n`);
    assert.equal(result.status, 0, result.stderr);
    const env = readFileSync(result.file, 'utf8');
    assert.equal(env.match(/^MODULI_KEY=/gm)?.length, 1);
    assert.match(env, new RegExp(`^MODULI_KEY=${KEY}$`, 'm'));
  });

  it('refuses anything that is not 32 bytes in hex and leaves the file as it was', () => {
    for (const bad of ['abc\n', `${KEY}0\n`, `${'z'.repeat(64)}\n`, '\n']) {
      const result = chiave(bad);
      assert.equal(result.status, 1, bad);
      assert.equal(readFileSync(result.file, 'utf8'), BASE);
    }
  });

  it('refuses a server without the .env of setup-env.sh', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rilievi-moduli-chiave-'));
    const result = spawnSync('bash', [join(DEPLOY, 'moduli-chiave.sh')], {
      input: `${KEY}\n`,
      env: { PATH: process.env.PATH, RILIEVI_SHARED: dir, RILIEVI_CHIAVE_NONROOT: '1' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /setup-env\.sh/);
    assert.ok(!existsSync(join(dir, '.env')));
  });
});
