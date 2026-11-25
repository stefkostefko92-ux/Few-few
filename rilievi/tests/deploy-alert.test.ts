// The alarms of the server scripts (deploy/alert.sh; the owner, 12 November 2026: "lo faremo con un
// webhook Discord"). A Discord webhook gets JSON with no mentions; any other address the plain text as
// before. The address carries the token: it never shows in the output nor in curl's arguments, and a
// failed send never fails the script. backup.sh, restore-test.sh, backup-alert.sh and deploy.sh send one
// alarm each with what failed — no paths, no people. A stand-in `curl` records what it would send; the
// plain address is also tried with the real curl against a local server. No network.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const TOKEN = 'Tok3n_segreto-NON-stampare';
const DISCORD = `https://discord.com/api/webhooks/123456789012345678/${TOKEN}`;
const DEPLOY = join(import.meta.dirname, '..', 'deploy');

// Each call: its arguments (one per line) and its stdin (curl's config with the address).
const CURL = `#!/usr/bin/env bash
n=$(( $(ls "$CURL_LOG" | wc -l) / 2 + 1 ))
printf '%s\\n' "$@" >"$CURL_LOG/$n.args"
cat >"$CURL_LOG/$n.stdin"
exit "\${CURL_RC:-0}"
`;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'rilievi-alert-'));
  const release = join(dir, 'release');
  const shared = join(dir, 'shared');
  const log = join(dir, 'curl');
  for (const d of [join(release, 'deploy'), join(dir, 'bin'), shared, log])
    mkdirSync(d, { recursive: true });
  for (const script of ['alert.sh', 'backup.sh', 'backup-alert.sh', 'restore-test.sh', 'deploy.sh'])
    copyFileSync(join(DEPLOY, script), join(release, 'deploy', script));
  writeFileSync(join(dir, 'bin', 'curl'), CURL);
  chmodSync(join(dir, 'bin', 'curl'), 0o755);
  // backup.sh's own tools: a stand-in docker whose dump fails, and no media volume.
  writeFileSync(
    join(dir, 'bin', 'docker'),
    '#!/usr/bin/env bash\nif [ "$1" = compose ] && [ "$2" = exec ]; then echo dump; exit "${DUMP_RC:-1}"; fi\nexit 0\n',
  );
  writeFileSync(join(dir, 'bin', 'rsync'), '#!/usr/bin/env bash\nexit 23\n');
  for (const tool of ['docker', 'rsync']) chmodSync(join(dir, 'bin', tool), 0o755);
  writeFileSync(join(release, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(shared, 'last-good'), `${release}\n`);
  return { dir, release, shared, log };
}

type Setup = ReturnType<typeof setup>;

function bash(s: Setup, script: string, env: Record<string, string> = {}, args: string[] = []) {
  return spawnSync('bash', ['-c', script, 'bash', ...args], {
    cwd: s.release,
    encoding: 'utf8',
    env: {
      PATH: `${join(s.dir, 'bin')}:${process.env.PATH ?? ''}`,
      HOME: s.dir,
      CURL_LOG: s.log,
      RILIEVI_SHARED: s.shared,
      RILIEVI_LOCK: join(s.dir, 'rilievi-deploy.lock'),
      ...env,
    },
  });
}

function calls(s: Setup) {
  const out: { args: string[]; stdin: string }[] = [];
  for (let n = 1; existsSync(join(s.log, `${n}.args`)); n += 1)
    out.push({
      args: readFileSync(join(s.log, `${n}.args`), 'utf8')
        .split('\n')
        .slice(0, -1),
      stdin: readFileSync(join(s.log, `${n}.stdin`), 'utf8'),
    });
  return out;
}

function body(call: { args: string[] }) {
  const i = call.args.indexOf('--data-raw');
  assert.ok(i >= 0, 'the body is sent with --data-raw');
  return call.args[i + 1]!;
}

function discordContent(call: { args: string[] }) {
  const json = JSON.parse(body(call)) as { content: string; allowed_mentions: { parse: string[] } };
  assert.deepEqual(json.allowed_mentions, { parse: [] }, 'nobody is mentioned');
  return json.content;
}

const MESSY = 'a "quoted" path C:\\dir\\file\nsecond line\twith tab & ampersand — è';

describe('alert.sh', () => {
  it('sends valid JSON to Discord, with the address only on stdin', () => {
    const s = setup();
    const run = bash(
      s,
      'set -euo pipefail; . deploy/alert.sh; alert "$1"; echo done',
      {
        RILIEVI_ALERT_URL: DISCORD,
      },
      [MESSY],
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, 'done\n');
    const [call, more] = calls(s);
    assert.ok(call && !more, 'one call');
    assert.equal(discordContent(call), MESSY);
    assert.ok(call.args.includes('Content-Type: application/json'));
    assert.ok(call.args.includes('--max-time') && call.args.includes('--retry'));
    assert.ok(!call.args.includes('-v') && !call.args.includes('--verbose'));
    assert.ok(!call.args.join(' ').includes(TOKEN), 'the token is not in the arguments');
    assert.equal(call.stdin, `url = "${DISCORD}"\n`);
    assert.ok(!run.stdout.includes(TOKEN) && !run.stderr.includes(TOKEN));
  });

  it('knows the other Discord hosts and not the look-alikes', () => {
    for (const host of ['discordapp.com', 'ptb.discord.com', 'canary.discord.com']) {
      const s = setup();
      bash(s, '. deploy/alert.sh; alert "x\\"y"', {
        RILIEVI_ALERT_URL: `https://${host}/api/webhooks/1/${TOKEN}`,
      });
      assert.equal(discordContent(calls(s)[0]!), 'x"y', host);
    }
    for (const url of [
      `https://discord.com.evil.example/api/webhooks/1/${TOKEN}`,
      `http://discord.com/api/webhooks/1/${TOKEN}`,
      `https://ntfy.sh/${TOKEN}`,
    ]) {
      const s = setup();
      bash(s, '. deploy/alert.sh; alert "testo semplice"', { RILIEVI_ALERT_URL: url });
      const [call] = calls(s);
      assert.equal(body(call!), 'testo semplice', url);
      assert.ok(!call!.args.includes('Content-Type: application/json'), url);
    }
  });

  it('cuts a long text to 1900 characters, never inside a letter', () => {
    const s = setup();
    bash(s, '. deploy/alert.sh; alert "$1"', { RILIEVI_ALERT_URL: DISCORD }, ['è'.repeat(5000)]);
    const content = discordContent(calls(s)[0]!);
    assert.equal(content, `${'è'.repeat(1900)}…`);
  });

  it('a failed send leaves the script going, says so, and never prints the address', () => {
    const s = setup();
    const run = bash(s, 'set -euo pipefail; . deploy/alert.sh; alert "prova"; echo ancora', {
      RILIEVI_ALERT_URL: DISCORD,
      CURL_RC: '7',
    });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, 'ancora\n');
    assert.match(run.stderr, /alert non inviato \(curl exit 7/);
    assert.ok(!run.stderr.includes(TOKEN) && !run.stderr.includes('discord.com'));
  });

  it('without an address does nothing; backup.env is read, never run', () => {
    const s = setup();
    const quiet = bash(s, '. deploy/alert.sh; alert "prova"');
    assert.equal(quiet.status, 0);
    assert.equal(calls(s).length, 0);
    const pwned = join(s.dir, 'pwned');
    writeFileSync(
      join(s.shared, 'backup.env'),
      `touch ${pwned}\nexport RILIEVI_ALERT_URL="${DISCORD}"\n`,
    );
    bash(s, '. deploy/alert.sh; alert "da backup.env"');
    assert.equal(discordContent(calls(s)[0]!), 'da backup.env');
    assert.ok(!existsSync(pwned), 'the file is not executed');
  });

  it('a plain address gets the text as before — the real curl, a local server', async () => {
    const s = setup();
    const got: { method?: string; type?: string; body: string }[] = [];
    const server = createServer((req, res) => {
      let data = '';
      req.on('data', (c: Buffer) => (data += c.toString('utf8')));
      req.on('end', () => {
        got.push({ method: req.method, type: req.headers['content-type'], body: data });
        res.end('ok');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/hook?k=${TOKEN}`;
    const child = spawn('bash', ['-c', '. deploy/alert.sh; alert "backup fallito"'], {
      cwd: s.release,
      env: { PATH: process.env.PATH ?? '', RILIEVI_ALERT_URL: url, RILIEVI_SHARED: s.shared },
    });
    let output = '';
    child.stdout.on('data', (c: Buffer) => (output += c.toString()));
    child.stderr.on('data', (c: Buffer) => (output += c.toString()));
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    server.close();
    assert.equal(code, 0, output);
    assert.deepEqual(got, [
      { method: 'POST', type: 'application/x-www-form-urlencoded', body: 'backup fallito' },
    ]);
    assert.ok(!output.includes(TOKEN));
  });
});

describe('who sends an alarm', () => {
  const host = spawnSync('hostname', ['-s'], { encoding: 'utf8' }).stdout.trim();
  const when = /— \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/;

  it('backup.sh: one alarm with what failed, and backup-alert.sh does not repeat it', () => {
    const s = setup();
    const run = bash(s, 'bash deploy/backup.sh', {
      RILIEVI_ALERT_URL: DISCORD,
      RILIEVI_BACKUP_VERIFY: '0',
    });
    assert.equal(run.status, 1);
    const [call, more] = calls(s);
    assert.ok(call && !more, 'one alarm');
    const content = discordContent(call);
    assert.ok(content.startsWith(`rilievi backup FALLITO su ${host}: pg_dump exit 1 — `));
    assert.match(content, when);
    assert.doesNotMatch(content, /\//, 'no paths');
    assert.ok(!run.stdout.includes(TOKEN) && !run.stderr.includes(TOKEN));

    const onFailure = bash(s, 'bash deploy/backup-alert.sh', { RILIEVI_ALERT_URL: DISCORD });
    assert.equal(onFailure.status, 0, onFailure.stderr);
    assert.equal(calls(s).length, 1, 'already sent by backup.sh');
    assert.ok(existsSync(join(s.shared, 'backups', 'ULTIMO_ERRORE')));
  });

  it('backup.sh: a failed copy off the server is an alarm too', () => {
    const s = setup();
    const run = bash(s, 'bash deploy/backup.sh', {
      RILIEVI_ALERT_URL: DISCORD,
      RILIEVI_BACKUP_VERIFY: '0',
      RILIEVI_OFFSITE: 'u1@storage.example:rilievi',
      DUMP_RC: '0',
    });
    assert.equal(run.status, 1);
    const [call, more] = calls(s);
    assert.ok(call && !more, 'one alarm');
    assert.match(discordContent(call), /: copia dei dump fuori server \(rsync\) — /);
    assert.doesNotMatch(discordContent(call), /storage\.example/, 'not where the copy goes');
    assert.ok(!existsSync(join(s.shared, 'backups', 'ULTIMO_OK')));
  });

  it('backup-alert.sh alone (the backup was killed) sends its own', () => {
    const s = setup();
    writeFileSync(join(s.shared, 'backup.env'), `RILIEVI_ALERT_URL=${DISCORD}\n`);
    const run = bash(s, 'bash deploy/backup-alert.sh');
    assert.equal(run.status, 0, run.stderr);
    assert.match(discordContent(calls(s)[0]!), /^rilievi backup FALLITO su .+: interrotto prima/);
  });

  it('restore-test.sh alone sends one; called by backup.sh it stays quiet', () => {
    const s = setup();
    const alone = bash(s, 'bash deploy/restore-test.sh "$1"', { RILIEVI_ALERT_URL: DISCORD }, [
      join(s.dir, 'nessuno.sql.gz'),
    ]);
    assert.equal(alone.status, 1);
    assert.match(
      discordContent(calls(s)[0]!),
      /^rilievi restore-test FALLITO su .+: dump mancante/,
    );
    const quiet = bash(
      s,
      'bash deploy/restore-test.sh "$1"',
      {
        RILIEVI_ALERT_URL: DISCORD,
        RILIEVI_NO_ALERT: '1',
      },
      [join(s.dir, 'nessuno.sql.gz')],
    );
    assert.equal(quiet.status, 1);
    assert.equal(calls(s).length, 1);
  });

  it('deploy.sh: a failed deploy alarms, an unconfigured machine (exit 3) does not', () => {
    const s = setup();
    const env = { RILIEVI_ALERT_URL: DISCORD };
    const four = bash(s, '. deploy/deploy.sh; ALERT_ARMED=1; fail 4 "non risponde"', env);
    assert.equal(four.status, 4);
    assert.match(
      discordContent(calls(s)[0]!),
      /^rilievi deploy FALLITO su .+: .*health-check \(exit 4\)/,
    );
    const three = bash(s, '. deploy/deploy.sh; ALERT_ARMED=1; fail 3 "senza .env"', env);
    assert.equal(three.status, 3);
    const notArmed = bash(s, '. deploy/deploy.sh; fail 1 "pusni като root"', env);
    assert.equal(notArmed.status, 1);
    assert.equal(calls(s).length, 1);
  });

  it('deploy.sh says when RILIEVI_ALERT_URL is missing, reading only the names', () => {
    const s = setup();
    writeFileSync(join(s.shared, 'backup.env'), 'RILIEVI_OFFSITE=x\nRILIEVI_HEARTBEAT_URL=y\n');
    const run = bash(s, '. deploy/deploy.sh; backup_gaps');
    assert.match(run.stderr, /липсват: RILIEVI_ALERT_URL/);
    assert.match(run.stderr, /Аларми в Discord/);
    writeFileSync(
      join(s.shared, 'backup.env'),
      `RILIEVI_OFFSITE=x\nRILIEVI_HEARTBEAT_URL=y\nRILIEVI_ALERT_URL=${DISCORD}\n`,
    );
    const ok = bash(s, '. deploy/deploy.sh; backup_gaps');
    assert.equal(ok.stderr, '');
  });
});
