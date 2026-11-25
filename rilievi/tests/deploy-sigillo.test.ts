// The seal key of the intervention forms on a server without it (deploy/deploy.sh, ensure_seal_key): the
// deploy of 30 October 2026 stopped because `docker compose` refuses the whole file while the required
// INTERVENTI_SEAL_KEY is missing — even for the command that asks the database whether a key may be
// created. A stand-in `docker` that interpolates like the real CLI runs the real script in a temp dir.
// The key also derives the 2FA secrets, the encrypted mail and Revolut keys, the API keys and the seals of
// the evidence registers (src/auth/chiavi.ts): any of them in the database means the key was lost, not new.
// The database answers one `Table.column|count` row per object (empty count — not in this database yet).
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
[ "$1" = volume ] && exit "\${NO_VOLUME:-0}"
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
        *query_to_xml*) printf '%s\n' "$ROWS" ;;
      esac
      exit 0 ;;
  esac
fi
exit 0
`;

const ENV = 'POSTGRES_PASSWORD=abc\nJWT_SECRET=' + 'a'.repeat(64) + '\n';

/** Every object the new SQL asks about, with these counts (the rest 0). */
function rows(counts: Record<string, number | ''> = {}): string {
  return [
    'Intervento.sigillo',
    'Verbale.sigillo',
    'BuonoFirma.sigillo',
    'Accettazione.sigillo',
    'AccettazioneOfferta.sigillo',
    'EmissioneCalcolo.sigillo',
    'User.totpSecretEnc',
    'RecoveryCode.codeHash',
    'ConfigPagamenti.chiaveEnc',
    'ConfigPagamenti.webhookSegretoEnc',
    'PostaPortale.passwordEnc',
    'ChiaveApi.hash',
  ]
    .map((what) => `${what}|${counts[what] ?? 0}`)
    .join('\n');
}

function run(options: { sealed: number; env?: string; rows?: string; noVolume?: boolean }) {
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
        ROWS: options.rows ?? rows({ 'Intervento.sigillo': options.sealed }),
        NO_VOLUME: options.noVolume ? '1' : '0',
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
    assert.match(result.stderr, /3 записа, вързани за ключа \(Intervento\.sigillo=3\)/);
    assert.equal(result.env, ENV);
  });

  it('is never invented when only 2FA, a Revolut key or an accepted contract is there', () => {
    const result = run({
      sealed: 0,
      rows: rows({
        'User.totpSecretEnc': 2,
        'ConfigPagamenti.chiaveEnc': 1,
        'Accettazione.sigillo': 4,
      }),
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /7 записа/);
    assert.match(result.stderr, /User\.totpSecretEnc=2/);
    assert.match(result.stderr, /ConfigPagamenti\.chiaveEnc=1/);
    assert.equal(result.env, ENV);
  });

  it('is created on an older database where the newer tables are not there yet', () => {
    const old = rows({ 'Intervento.sigillo': 0 })
      .split('\n')
      .map((line) => (line.startsWith('Intervento.') ? line : line.replace(/\|0$/, '|')))
      .join('\n');
    const result = run({ sealed: 0, rows: old });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.env, /^INTERVENTI_SEAL_KEY=[0-9a-f]{64}$/m);
  });

  it('is not created when the database gives no answer at all', () => {
    const result = run({ sealed: 0, rows: '' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /не каза/);
    assert.equal(result.env, ENV);
  });

  it('is created on the first deploy, with no database volume yet', () => {
    const result = run({ sealed: 0, rows: '', noVolume: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.env, /^INTERVENTI_SEAL_KEY=[0-9a-f]{64}$/m);
  });

  it('is left alone when it is already there', () => {
    const env = `${ENV}INTERVENTI_SEAL_KEY=${'b'.repeat(64)}\n`;
    const result = run({ sealed: 3, env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.env, env);
  });
});
