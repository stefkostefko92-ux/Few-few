// Ключът (решение на собственика: файл в %LOCALAPPDATA%): липсва, странен вид или четим за други → пултът не
// тръгва; съобщението НИКОГА не съдържа стойността. Самопроверката пуска истинския guard-dangerous през bash.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, readKey, DEFAULT_PORT } from '../src/config.js';
import { selfCheck, findBash } from '../src/selfcheck.js';
import { FAKE_KEY } from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'pult-key-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const posix = process.platform !== 'win32';

test('пътищата: Windows → %LOCALAPPDATA%\\studiopult; иначе $XDG_CONFIG_HOME/studiopult; порт 4390', () => {
  const w = loadConfig(
    { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', USERPROFILE: 'C:\\Users\\u' },
    'win32',
  );
  assert.match(w.keyFile, /AppData.Local.studiopult.key\.txt$/);
  const l = loadConfig({ XDG_CONFIG_HOME: '/home/u/.config', HOME: '/home/u' }, 'linux');
  assert.equal(l.keyFile, join('/home/u/.config', 'studiopult', 'key.txt'));
  assert.equal(l.port, DEFAULT_PORT);
  assert.throws(() => loadConfig({ STUDIOPULT_PORT: '80', HOME: '/h' }, 'linux'), /1024/);
});

test('ключ: липсва → грешка с пътя; лош вид → грешка; стойността не е в съобщението', () => {
  assert.throws(() => readKey(join(dir, 'nema.txt')), /липсва файлът/);
  const bad = join(dir, 'bad.txt');
  writeFileSync(bad, 'не-е-ключ-ама-е-тайно-123', { mode: 0o600 });
  assert.throws(
    () => readKey(bad),
    (e: Error) => /sk-ant-/.test(e.message) && !e.message.includes('тайно'),
  );
});

test('ключ: четим за други (POSIX) → отказ с chmod; 600 → чете се', { skip: !posix }, () => {
  const f = join(dir, 'key.txt');
  writeFileSync(f, `${FAKE_KEY}\n`);
  chmodSync(f, 0o644);
  assert.throws(
    () => readKey(f),
    (e: Error) => /chmod 600/.test(e.message) && !e.message.includes(FAKE_KEY),
  );
  chmodSync(f, 0o600);
  assert.equal(readKey(f), FAKE_KEY);
});

test('самопроверка: истинският guard-dangerous спира канарчето; без bash → ясен отказ', async () => {
  const repo = join(import.meta.dirname, '..', '..');
  const r = await selfCheck(repo, findBash());
  assert.equal(r.ok, true, r.detail);
  const none = await selfCheck(repo, null);
  assert.equal(none.ok, false);
  assert.match(none.detail, /Git for Windows/);
});
