// The deploy of rilievi in one command (deploy/rilascio.sh; the owner, 28 November 2026 — „искам да направиш всичко
// възможно най-автоматизирано за този деплой“). The script decides what a person decided before, and stops where a
// person must look: the key of the suppliers' forms (asked only when missing), a backup before anything, the ref
// guard (a branch that is merged into main is switched by itself; one that is not, or a GitHub that does not
// answer, stops the deploy), the deploy from main, and a check that the new version answers. Everything outside is
// a stand-in here: curl (GitHub and the portal), fetch-deploy.sh, backup.sh and moduli-chiave.sh.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SCRIPT = join(import.meta.dirname, '..', 'deploy', 'rilascio.sh');
const KEY = 'ab'.repeat(32);
const BRANCH = 'claude/carbon-stealth-vcc-portal-hkcafp';

/** A stand-in curl: GitHub's compare, the health check and the news page, each from an env variable. */
const CURL = `#!/usr/bin/env bash
url="\${@: -1}"
printf 'curl %s\\n' "$url" >>"$LOG"
case "$url" in
  *"/compare/"*) [ "\${COMPARE_EXIT:-0}" = 0 ] || exit "$COMPARE_EXIT"; printf '%s' "$COMPARE_BODY" ;;
  *"/health") [ "\${HEALTH_EXIT:-0}" = 0 ] || exit "$HEALTH_EXIT"; printf '{"status":"ok","app":"rilievi"}' ;;
  *"/novita")
    printf '%s' "\${NOVITA_BODY:-<h2>Versione 5.9: cartelli</h2>}"
    # The real page is ~40 KB with the title near the top — more than a pipe holds. Like the real curl, a reader
    # that stops early breaks the pipe and this stand-in fails (the real one exits 23).
    if [ "\${NOVITA_GRANDE:-0}" = 1 ]; then yes 'riga della pagina' | head -c 300000; fi
    ;;
  *) exit 6 ;;
esac
`;

const FETCH = `#!/usr/bin/env bash
printf 'fetch REF=%s PROJECTS=%s ALLOW=%s\\n' "$REF" "$PROJECTS" "\${ALLOW_REF_SWITCH:-}" >>"$LOG"
exit "\${FETCH_EXIT:-0}"
`;

const BACKUP = `#!/usr/bin/env bash
printf 'backup\\n' >>"$LOG"
exit "\${BACKUP_EXIT:-0}"
`;

/** Writes the key only when CHIAVE_DATA=1 (the person pasted it). */
const CHIAVE = `#!/usr/bin/env bash
printf 'chiave\\n' >>"$LOG"
[ "\${CHIAVE_DATA:-1}" = 1 ] && printf 'MODULI_KEY=${KEY}\\n' >>"$RILIEVI_SHARED/.env"
exit 0
`;

interface Caso {
  env?: string;
  ref?: string;
  vars?: Record<string, string>;
  lastGood?: boolean;
}

function rilascio({ env = `MODULI_KEY=${KEY}\n`, ref, vars = {}, lastGood = true }: Caso = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rilievi-rilascio-'));
  const deploy = join(dir, 'rilievi', 'deploy');
  const shared = join(dir, 'shared');
  const refs = join(dir, 'refs');
  const release = join(dir, 'release');
  for (const d of [deploy, join(dir, 'rilievi', 'src'), join(dir, 'deploy'), join(dir, 'bin')])
    mkdirSync(d, { recursive: true });
  for (const d of [shared, refs, join(release, 'deploy')]) mkdirSync(d, { recursive: true });
  copyFileSync(SCRIPT, join(deploy, 'rilascio.sh'));
  const stand = (path: string, body: string) => {
    writeFileSync(path, body);
    chmodSync(path, 0o755);
  };
  stand(join(deploy, 'moduli-chiave.sh'), CHIAVE);
  stand(join(dir, 'deploy', 'fetch-deploy.sh'), FETCH);
  stand(join(release, 'deploy', 'backup.sh'), BACKUP);
  stand(join(dir, 'bin', 'curl'), CURL);
  writeFileSync(
    join(dir, 'rilievi', 'src', 'versione.ts'),
    "export const VERSIONE_SOFTWARE = '5.9';\n",
  );
  writeFileSync(join(shared, '.env'), `POSTGRES_PASSWORD=x\nHTTP_PORT=4330\n${env}`);
  if (lastGood) writeFileSync(join(shared, 'last-good'), `${release}\n`);
  if (ref) writeFileSync(join(refs, 'rilievi'), `${ref} 2026-11-27T10:00:00Z\n`);
  const log = join(dir, 'log');
  const result = spawnSync('bash', [join(deploy, 'rilascio.sh')], {
    env: {
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      RILIEVI_SHARED: shared,
      REF_STATE_DIR: refs,
      RILIEVI_RILASCIO_NONROOT: '1',
      LOG: log,
      ...vars,
    },
    encoding: 'utf8',
    input: '',
  });
  const passi = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...result, passi };
}

const fetchDi = (passi: string[]) => passi.find((p) => p.startsWith('fetch '));

describe('the deploy of rilievi in one command', () => {
  it('backs up, deploys main and checks that the new version answers', () => {
    const r = rilascio();
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      r.passi.filter((p) => !p.startsWith('curl')),
      ['backup', 'fetch REF=main PROJECTS=rilievi ALLOW='],
    );
    assert.ok(r.passi.some((p) => p === 'curl http://127.0.0.1:4330/health'));
    assert.ok(r.passi.some((p) => p.endsWith('/novita')));
    assert.match(r.stdout, /5\.9/);
  });

  it('asks the key of the forms only when it is missing, before anything else', () => {
    const presente = rilascio();
    assert.ok(!presente.passi.includes('chiave'));
    const manca = rilascio({ env: '' });
    assert.equal(manca.status, 0, manca.stderr);
    assert.equal(manca.passi[0], 'chiave');
    const sbagliata = rilascio({ env: 'MODULI_KEY=abc\n' });
    assert.equal(sbagliata.passi[0], 'chiave');
    // Nobody pasted it: nothing is touched.
    const niente = rilascio({ env: '', vars: { CHIAVE_DATA: '0' } });
    assert.equal(niente.status, 1);
    assert.equal(fetchDi(niente.passi), undefined);
    assert.ok(!niente.passi.includes('backup'));
    assert.match(niente.stderr, /MODULI_KEY/);
  });

  it('switches by itself from a branch that GitHub says is merged into main', () => {
    for (const status of ['behind', 'identical']) {
      const r = rilascio({
        ref: BRANCH,
        vars: { COMPARE_BODY: `{"status": "${status}", "ahead_by": 0, "behind_by": 3}` },
      });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.passi.some((p) => p.includes(`/compare/main...${BRANCH}`)));
      assert.equal(fetchDi(r.passi), 'fetch REF=main PROJECTS=rilievi ALLOW=1');
    }
    // Already from main: nothing to ask GitHub.
    const main = rilascio({ ref: 'main' });
    assert.ok(!main.passi.some((p) => p.includes('/compare/')));
    assert.equal(fetchDi(main.passi), 'fetch REF=main PROJECTS=rilievi ALLOW=');
  });

  it('stops before the deploy on a branch that is not merged, or when GitHub does not answer', () => {
    for (const vars of <Array<Record<string, string>>>[
      { COMPARE_BODY: '{"status": "diverged", "ahead_by": 2}' },
      { COMPARE_BODY: '{"status": "ahead", "ahead_by": 1}' },
      { COMPARE_EXIT: '22' },
    ]) {
      const r = rilascio({ ref: 'claude/altro-lavoro', vars });
      assert.equal(r.status, 1, JSON.stringify(vars));
      assert.equal(fetchDi(r.passi), undefined, JSON.stringify(vars));
      assert.ok(
        !r.passi.includes('backup'),
        'not even a backup: the daily copies stay as they are',
      );
      assert.match(r.stderr, /claude\/altro-lavoro/);
    }
    // A ref with odd characters is not even sent to GitHub.
    const strano = rilascio({ ref: 'x;rm -rf /' });
    assert.equal(strano.status, 1);
    assert.ok(!strano.passi.some((p) => p.includes('/compare/')));
    assert.equal(fetchDi(strano.passi), undefined);
  });

  it('stops when the backup fails, and says so when the deploy fails or the old version still answers', () => {
    const backup = rilascio({ vars: { BACKUP_EXIT: '1' } });
    assert.equal(backup.status, 1);
    assert.equal(fetchDi(backup.passi), undefined);

    const deploy = rilascio({ vars: { FETCH_EXIT: '1' } });
    assert.equal(deploy.status, 1);
    assert.match(deploy.stderr, /rollback|DEPLOY\.md/);

    const vecchia = rilascio({ vars: { NOVITA_BODY: '<h2>Versione 5.7</h2>' } });
    assert.equal(vecchia.status, 1);
    assert.match(vecchia.stderr, /5\.9/);

    const morto = rilascio({ vars: { HEALTH_EXIT: '7' } });
    assert.equal(morto.status, 1);
    assert.match(morto.stderr, /health/);
  });

  it('reads the whole news page: the version near the top of a long page is not a failure', () => {
    // VPS-аджията: `curl | grep -q` under pipefail — grep stops early, curl gets EPIPE (23) and a good deploy
    // was reported as failed.
    const r = rilascio({ vars: { NOVITA_GRANDE: '1' } });
    assert.equal(r.status, 0, r.stderr);
  });

  it('works on a first deploy without a previous release (the deploy makes its own backup)', () => {
    const r = rilascio({ lastGood: false });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.passi.includes('backup'));
    assert.equal(fetchDi(r.passi), 'fetch REF=main PROJECTS=rilievi ALLOW=');
  });

  it('reminds of the copy off the server when it is not set', () => {
    const senza = rilascio();
    assert.match(senza.stdout, /RILIEVI_OFFSITE/);
  });
});
