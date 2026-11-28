// Критерий 5: прегледът и задачите стигат само до файлове под корена на студиото. Отказва се изход навън
// (.., абсолютен път, UNC, \\?\, буква на диск, ADS „:“, NUL, двойно кодиране, запазени имена на Windows,
// symlink/junction навън, непозволено разширение); валиден вложен файл минава. Тича на Linux и Windows.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeResolve, safeOutput, contentTypeOf, PathError } from '../src/files.js';
import { startTestServer } from './helpers.js';

const root = mkdtempSync(join(tmpdir(), 'pult-root-'));
const outside = mkdtempSync(join(tmpdir(), 'pult-out-'));
mkdirSync(join(root, 'renders'));
writeFileSync(join(root, 'renders', 'a.mp4'), 'x');
writeFileSync(join(root, 'renders', 'кадър 1.png'), 'x');
writeFileSync(join(outside, 'secret.mp4'), 'x');
let linked = true;
try {
  symlinkSync(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
} catch {
  linked = false;
}
after(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

test('валиден вложен файл минава (и с интервал и кирилица)', async () => {
  assert.equal(
    await safeResolve(root, 'renders/a.mp4'),
    join(await realRoot(), 'renders', 'a.mp4'),
  );
  assert.ok((await safeResolve(root, 'renders/кадър 1.png')).endsWith('кадър 1.png'));
});

test('изход навън и опасни имена → отказ', async () => {
  for (const bad of [
    '../x.mp4',
    'renders/../../x.mp4',
    '/etc/passwd.mp4',
    'C:\\Windows\\x.mp4',
    'C:x.mp4',
    '\\\\server\\share\\a.mp4',
    '\\\\?\\C:\\a.mp4',
    'renders/a.mp4:stream',
    'renders/a\u0000.mp4',
    'CON.mp4',
    'renders/nul.png',
    'COM1.png',
    'lpt9.wav',
    'a%2e%2e/x.mp4',
    'renders%2fa.mp4',
    'renders/a.exe',
    'renders/a.html',
    'renders/липсва.mp4',
    '',
  ]) {
    await assert.rejects(safeResolve(root, bad), PathError, JSON.stringify(bad));
  }
});

test('symlink/junction към папка извън корена → отказ', { skip: !linked }, async () => {
  await assert.rejects(safeResolve(root, 'link/secret.mp4'), PathError);
});

test('изход за задача: файлът може да не съществува, папката трябва да е под корена', async () => {
  assert.ok((await safeOutput(root, 'renders/нов.mp4')).endsWith('нов.mp4'));
  await assert.rejects(safeOutput(root, '../нов.mp4'), PathError);
  await assert.rejects(safeOutput(root, 'nema-papka/нов.mp4'), PathError);
  await assert.rejects(safeOutput(root, 'renders/нов.bat'), PathError);
  if (linked) await assert.rejects(safeOutput(root, 'link/нов.mp4'), PathError);
});

test('Content-Type е по позволен списък', () => {
  assert.equal(contentTypeOf('a.mp4'), 'video/mp4');
  assert.equal(contentTypeOf('a.MOV'), 'video/quicktime');
  assert.equal(contentTypeOf('a.png'), 'image/png');
  assert.equal(contentTypeOf('a.wav'), 'audio/wav');
});

async function realRoot() {
  const { realpath } = await import('node:fs/promises');
  return realpath(root);
}

const p = await startTestServer();
after(() => p.close());

test('HTTP: прегледът дава файла с nosniff и поддържа Range; лош път → 400', async () => {
  mkdirSync(join(p.preview, 'out'));
  writeFileSync(join(p.preview, 'out', 'v.mp4'), '0123456789');
  const ok = await fetch(`${p.base}/api/file?path=${encodeURIComponent('out/v.mp4')}`, {
    headers: { cookie: p.cookie },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'video/mp4');
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await ok.text(), '0123456789');
  const part = await fetch(`${p.base}/api/file?path=out/v.mp4`, {
    headers: { cookie: p.cookie, range: 'bytes=2-4' },
  });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), '234');
  const bad = await fetch(`${p.base}/api/file?path=${encodeURIComponent('../x.mp4')}`, {
    headers: { cookie: p.cookie },
  });
  assert.equal(bad.status, 400);
});
