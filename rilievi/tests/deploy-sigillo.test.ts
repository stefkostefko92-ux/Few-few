// The seal key of the intervention forms on a server without it (deploy/deploy.sh, ensure_seal_key): the
// deploy of 30 October 2026 stopped because `docker compose` refuses the whole file while the required
// INTERVENTI_SEAL_KEY is missing — even for the command that asks the database whether a key may be
// created. A stand-in `docker` that interpolates like the real CLI runs the real script in a temp dir.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DOCKER = `#!/usr/bin/env bash
# Like the real CLI: compose interpolates the whole file before anything else, and the app service
# requires INTERVENTI_SEAL_KEY (from the environment or the project .env).
[ "$1" = volume ] && exit 0
if [ "$1" = compose ]; then
  key="\${INTERVENTI_SEAL_KEY:-$(sed -n 's/^INTERVENTI_SEAL_KEY=//p' .env 2>/dev/null | tail -n 1)}"
  if [ -z "$key" ]; then
    echo "error while interpolating services.app.environment.INTERVENTI_SEAL_KEY: required variable INTERVENTI_SEAL_KEY is missing a value" >&2
    exit 15
  fi
  shift
  case "$1" in
    up) exit 0 ;;
    exec) sql="\${@: -1}"
      case "$sql" in
        *information_schema*) echo 1 ;;
        *sigillo*) echo "\${SEALED:-0}" ;;
      esac
      exit 0 ;;
  esac
fi
exit 0
`;

const ENV = 'POSTGRES_PASSWORD=abc\nJWT_SECRET=' + 'a'.repeat(64) + '\n';

function run(options: { sealed: number; env?: string }) {
  const dir = mkdtempSync(join(tmpdir(), 'rilievi-deploy-'));
  mkdirSync(join(dir, 'deploy'));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'shared'));
  copyFileSync(
    join(import.meta.dirname, '..', 'deploy', 'deploy.sh'),
    join(dir, 'deploy', 'deploy.sh'),
  );
  writeFileSync(join(dir, 'bin', 'docker'), DOCKER);
  chmodSync(join(dir, 'bin', 'docker'), 0o755);
  writeFileSync(join(dir, 'shared', '.env'), options.env ?? ENV);
  const result = spawnSync(
    'bash',
    ['-c', `cd "${dir}" && source deploy/deploy.sh && sync_env && ensure_seal_key`],
    {
      env: {
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        RILIEVI_SHARED: join(dir, 'shared'),
        SEALED: String(options.sealed),
      },
      encoding: 'utf8',
    },
  );
  return { ...result, env: readFileSync(join(dir, 'shared', '.env'), 'utf8') };
}

describe('the seal key on a server that has none yet', () => {
  it('is created when the database has no sealed form — compose does not stop the check', () => {
    const result = run({ sealed: 0 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.env, /^INTERVENTI_SEAL_KEY=[0-9a-f]{64}$/m);
    assert.ok(result.env.startsWith(ENV), 'the other secrets stay as they were');
  });

  it('is never invented when sealed forms exist: the key was lost, not new', () => {
    const result = run({ sealed: 3 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /3 запечатани листа/);
    assert.equal(result.env, ENV);
  });

  it('is left alone when it is already there', () => {
    const env = `${ENV}INTERVENTI_SEAL_KEY=${'b'.repeat(64)}\n`;
    const result = run({ sealed: 3, env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.env, env);
  });
});
