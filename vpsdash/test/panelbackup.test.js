// Бекъпът на самия панел — шифрирането, изключванията и това, че ключът никога
// не попада в shell реда (той влиза в одита и в изгледа на задачата).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { PANEL_RX, ensurePanelKey, panelBackupLines, restoreInstructions } from '../src/panelbackup.js';
import { backupAllSpec } from '../src/backups.js';
import { assertShipName } from '../src/backupsched.js';

const CFG = {
  nodeId: 'vps-1',
  paths: { stateDir: '/var/lib/vps-dashboard' },
  backups: { panelKey: 'тестов-ключ-няма-да-се-покаже' },
};

test('панел-бекъп: името се разпознава и ПЪТУВА offsite, но не е том/дъмп', () => {
  const name = 'panel-vps-1-20260730-030001.tar.gz.enc';
  assert.ok(PANEL_RX.test(name));
  assert.equal(assertShipName(name), name, 'шифрираният архив минава по offsite пътя');
  assert.ok(!PANEL_RX.test('vol-x-20260730-030001.tar.gz'), 'том-архивът не е панелен');
  assert.ok(!PANEL_RX.test('panel-x.tar.gz'), 'без времеви печат не е валиден');
});

test('панел-бекъп: ключът НЕ влиза в shell реда — минава през env', () => {
  const spec = backupAllSpec(CFG);
  assert.equal(spec.shell.includes(CFG.backups.panelKey), false, 'ключ в shell текста = ключ в одита');
  assert.equal(spec.env.CSD_PANEL_KEY, CFG.backups.panelKey);
  assert.match(spec.shell, /pass env:CSD_PANEL_KEY/, 'openssl чете ключа от средата');
  execFileSync('bash', ['-n', '-c', spec.shell]);
});

test('панел-бекъп: offsite/ и restore/ се ИЗКЛЮЧВАТ (иначе рекурсия и чужди дъмпове)', () => {
  const lines = panelBackupLines(CFG).join('\n');
  assert.match(lines, /--exclude="\/var\/lib\/vps-dashboard\/offsite"/);
  assert.match(lines, /--exclude="\/var\/lib\/vps-dashboard\/restore"/);
  assert.match(lines, /etc\/vps-dashboard/, 'конфигът влиза');
  assert.match(lines, /pbkdf2/, 'изрично усилено извеждане на ключа');
});

test('панел-бекъп: без ключ секцията се пропуска ВИДИМО, не пада', () => {
  const spec = backupAllSpec({ ...CFG, backups: {} });
  assert.equal(spec.env.CSD_PANEL_KEY, undefined);
  assert.match(spec.shell, /пропуснато — няма ключ/);
  execFileSync('bash', ['-n', '-c', spec.shell]);
});

test('панел-бекъп: ensurePanelKey генерира веднъж и пази съществуващия', () => {
  const saved = [];
  const cfg1 = { backups: {} };
  const r1 = ensurePanelKey(cfg1, (c, patch) => saved.push(patch));
  assert.equal(r1.fresh, true);
  assert.ok(r1.key.length >= 40, 'ключът е достатъчно дълъг за aes-256 парола');
  assert.equal(saved.length, 1, 'записва се в конфига');
  const cfg2 = { backups: { panelKey: 'вече-има' } };
  const r2 = ensurePanelKey(cfg2, () => assert.fail('не бива да презаписва'));
  assert.deepEqual(r2, { key: 'вече-има', fresh: false });
});

test('панел-бекъп: инструкцията за възстановяване първо ПРЕГЛЕЖДА, после спира услугата', () => {
  const text = restoreInstructions('panel-vps-1-20260730-030001.tar.gz.enc');
  assert.ok(text.indexOf('tar tzf') < text.indexOf('systemctl stop'), 'преглед преди презапис');
  assert.match(text, /systemctl stop vps-dashboard/);
  assert.match(text, /tar xzf - -C \//);
  assert.equal(text.includes('..'), false);
});

// Истинско шифроване/дешифроване — не вярваме на командата, изпълняваме я.
test('панел-бекъп: openssl веригата НАИСТИНА се разшифрова обратно (изпълнена)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-pb-'));
  const src = path.join(dir, 'etc');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'config.json'), '{"тайна":"да"}');
  const enc = path.join(dir, 'panel.tar.gz.enc');
  // Същите параметри като в panelBackupLines.
  execFileSync('bash', ['-c',
    `tar czf - -C ${dir} etc | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:CSD_PANEL_KEY -out ${enc}`],
    { env: { ...process.env, CSD_PANEL_KEY: 'проба-ключ' } });
  assert.ok(fs.statSync(enc).size > 0);
  // Грешен ключ НЕ минава.
  assert.throws(() =>
    execFileSync('bash', ['-c', `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:грешен -in ${enc} | tar tzf -`], { stdio: 'pipe' })
  );
  // Верният ключ връща съдържанието.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-pb-out-'));
  execFileSync('bash', ['-c', `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:проба-ключ -in ${enc} | tar xzf - -C ${out}`]);
  assert.equal(fs.readFileSync(path.join(out, 'etc', 'config.json'), 'utf8'), '{"тайна":"да"}');
});
