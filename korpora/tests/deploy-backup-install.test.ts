import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/paths.js';
import { deploy, mode, sharedEnv, withLayout, type Layout } from './deploy-harness.js';

/** The owner's public key on the server — what turns the installed timer into real backups. */
const recipient = (L: Layout) =>
  writeFileSync(join(L.shared, 'backup-recipients.txt'), `age1${'q'.repeat(58)}\n`, {
    mode: 0o600,
  });

test('a live deploy installs the backup script and the timer, with the shared path in the unit', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L);
    assert.equal(r.status, 0, r.stderr);
    const script = join(L.sbin, 'korpora-backup');
    assert.equal(
      readFileSync(script, 'utf8'),
      readFileSync(join(ROOT, 'deploy', 'backup.sh'), 'utf8'),
    );
    assert.equal(mode(script), '700');
    const unit = readFileSync(join(L.systemd, 'korpora-backup.service'), 'utf8');
    assert.match(unit, new RegExp(`^ReadWritePaths=${L.shared}/backups/daily$`, 'm'));
    assert.match(unit, new RegExp(`^Environment=KORPORA_SHARED=${L.shared}$`, 'm'));
    assert.match(unit, /^ExecStart=\/usr\/local\/sbin\/korpora-backup$/m);
    assert.match(unit, /^CapabilityBoundingSet=$/m, 'no capabilities');
    assert.match(unit, /^RestrictAddressFamilies=AF_UNIX$/m, 'no network');
    assert.match(
      readFileSync(join(L.systemd, 'korpora-backup.timer'), 'utf8'),
      /^OnCalendar=\*-\*-\* 02:30:00 UTC$/m,
    );
    assert.equal(mode(join(L.shared, 'backups', 'daily')), '700');
    assert.match(
      r.log,
      /systemctl daemon-reload\nsystemctl enable --now korpora-backup\.timer\n/,
      'reload, then the timer',
    );
    // no recipient yet: the timer is there, but it says what is missing and runs no backup
    assert.match(r.stderr, /няма получател/);
    assert.doesNotMatch(r.log, /systemctl start korpora-backup/);
    assert.ok(!existsSync(join(L.sbin, 'korpora-backup-restore')), 'restore runs from the release');
  });
});

test('installing again changes nothing: no daemon-reload, the timer stays enabled', () => {
  withLayout((L) => {
    sharedEnv(L);
    assert.equal(deploy(L).status, 0);
    const again = deploy(L);
    assert.equal(again.status, 0, again.stderr);
    assert.doesNotMatch(again.log, /daemon-reload/);
    assert.match(again.log, /systemctl enable --now korpora-backup\.timer\n/);
  });
});

test('with a recipient and no backup from the last 26 hours, the deploy runs one at once', () => {
  withLayout((L) => {
    sharedEnv(L);
    recipient(L);
    const first = deploy(L);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.log, /systemctl start korpora-backup\.service\n/);
    assert.match(first.stdout, /дневният шифрован бекъп мина/);
    mkdirSync(join(L.shared, 'backups', 'daily'), { recursive: true });
    writeFileSync(join(L.shared, 'backups', 'daily', 'korpora-20261006-023000.dump.age'), 'x');
    const fresh = deploy(L);
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.doesNotMatch(fresh.log, /systemctl start korpora-backup/);
    assert.match(fresh.stdout, /дневният шифрован бекъп е на място/);
  });
});

test('a backup problem is only a warning: the deploy of a live Korpora still exits 0', () => {
  withLayout((L) => {
    sharedEnv(L);
    recipient(L);
    const failing = deploy(L, { SYSTEMCTL_RC: '1' });
    assert.equal(failing.status, 0, failing.stderr);
    assert.match(failing.stderr, /дневният шифрован бекъп не е готов/);
    const noAge = deploy(L, { KORPORA_AGE: '/nonexistent/age' });
    assert.equal(noAge.status, 0, noAge.stderr);
    assert.match(noAge.stderr, /липсва age — .*apt-get install -y age/);
    assert.doesNotMatch(noAge.log, /systemctl start korpora-backup/);
  });
});

test('a deploy that does not come up installs nothing', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L, { HEALTH_BODY: '' });
    assert.equal(r.status, 4);
    assert.ok(!existsSync(join(L.sbin, 'korpora-backup')));
    assert.ok(!existsSync(join(L.systemd, 'korpora-backup.timer')));
  });
});
