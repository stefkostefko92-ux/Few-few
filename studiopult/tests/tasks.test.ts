// Критерий 6: бутоните са таблица задача → argv (без шел); непозната задача → 400; метазнаци стигат като
// отделен аргумент; без потвърждение няма --run/--force; втори рендер, докато тече първи → 409; „Спри“ убива
// цялото дърво; ходът на ffmpeg (frame=, time=) се разчита.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArgv, TaskRunner, TaskError, parseProgress, TASK_IDS } from '../src/tasks.js';
import { startTestServer, post } from './helpers.js';

const repo = join(import.meta.dirname, '..', '..');
const root = mkdtempSync(join(tmpdir(), 'pult-tasks-'));
mkdirSync(join(root, 'out'));
writeFileSync(join(root, 'out', 'a; rm -r x $(id).mov'), 'x');
writeFileSync(join(root, 'out', 'voice.wav'), 'x');
after(() => rmSync(root, { recursive: true, force: true }));
const ctx = { repoRoot: repo, previewRoot: root };

test('задачите са точно шестте', () => {
  assert.deepEqual(TASK_IDS, [
    'doctor',
    'loudnorm',
    'frames',
    'master',
    'youtube4k60',
    'vertical916',
  ]);
});

test('непозната задача → TaskError 400', async () => {
  await assert.rejects(
    buildArgv('rm', {}, ctx),
    (e: unknown) => e instanceof TaskError && e.status === 400,
  );
  await assert.rejects(buildArgv('__proto__', {}, ctx), TaskError);
});

test('doctor → node tools/video/doctor.mjs --json', async () => {
  const a = await buildArgv('doctor', {}, ctx);
  assert.equal(a.cmd, process.execPath);
  assert.deepEqual(a.args, [join(repo, 'tools', 'video', 'doctor.mjs'), '--json']);
  // Червеният екип на #515 (F5): на Windows libuv търси голо име (ffmpeg) първо в cwd → подхвърлен
  // studio\\ffmpeg.exe печелеше пред PATH. Задачите тичат с cwd = репото; пътищата са абсолютни.
  assert.equal(a.cwd, await realpath(repo));
  const m = await buildArgv('loudnorm', { in: 'out/voice.wav', out: 'out/v2.wav' }, ctx);
  assert.equal(m.cwd, await realpath(repo));
});

test('метазнаците в името са един аргумент; изходът е под корена', async () => {
  const a = await buildArgv('master', { in: 'out/a; rm -r x $(id).mov', out: 'out/m.mov' }, ctx);
  const i = a.args.indexOf('--in');
  assert.ok(a.args[i + 1]!.endsWith('a; rm -r x $(id).mov'));
  assert.equal(a.args.filter((x) => x.includes('rm -r')).length, 1);
  await assert.rejects(buildArgv('master', { in: '../x.mov', out: 'out/m.mov' }, ctx), TaskError);
  await assert.rejects(
    buildArgv('master', { in: 'out/voice.wav', out: '/tmp/m.mov' }, ctx),
    TaskError,
  );
});

test('--run и --force само с потвърждение', async () => {
  await assert.rejects(
    buildArgv('loudnorm', { in: 'out/voice.wav', out: 'out/v14.wav', run: true }, ctx),
    (e: unknown) => e instanceof TaskError && e.status === 409 && e.code === 'confirm',
  );
  const a = await buildArgv(
    'loudnorm',
    { in: 'out/voice.wav', out: 'out/v14.wav', run: true, confirm: true },
    ctx,
  );
  assert.ok(a.args.includes('--run'));
  const b = await buildArgv('loudnorm', { in: 'out/voice.wav', out: 'out/v14.wav' }, ctx);
  assert.equal(b.args.includes('--run'), false, 'без run само печата командата');
});

test('frames: шаблонът е %0Nd.png в папка под корена', async () => {
  mkdirSync(join(root, 'out', 'frames'));
  const a = await buildArgv(
    'frames',
    { pattern: 'out/frames/%05d.png', out: 'out/scene.mp4' },
    ctx,
  );
  assert.ok(a.args.some((x) => x.endsWith('%05d.png')));
  await assert.rejects(
    buildArgv('frames', { pattern: 'out/frames/*.png', out: 'out/s.mp4' }, ctx),
    TaskError,
  );
  await assert.rejects(
    buildArgv('frames', { pattern: '../%05d.png', out: 'out/s.mp4' }, ctx),
    TaskError,
  );
});

test('parseProgress чете frame= и time= от ffmpeg', () => {
  assert.deepEqual(
    parseProgress(
      'frame=  120 fps= 60 q=28.0 size=    1024kB time=00:00:02.00 bitrate=4194.3kbits/s speed=1x',
    ),
    { frame: 120, time: '00:00:02.00' },
  );
  assert.equal(parseProgress('Input #0, mov'), null);
});

function fakeSpawn() {
  const procs: (EventEmitter & { pid: number; stdout: EventEmitter; stderr: EventEmitter })[] = [];
  const spawn = () => {
    const p = Object.assign(new EventEmitter(), {
      pid: 4242 + procs.length,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    procs.push(p);
    return p as never;
  };
  return { spawn, procs };
}

test('един рендер наведнъж (409); „Спри“ убива дървото; ходът стига до слушателя', () => {
  const { spawn, procs } = fakeSpawn();
  const killed: number[] = [];
  const events: unknown[] = [];
  const r = new TaskRunner({ spawn, killTree: (pid) => killed.push(pid) });
  r.start({ cmd: 'node', args: ['x'], cwd: root }, (e) => events.push(e));
  assert.throws(
    () => r.start({ cmd: 'node', args: ['y'], cwd: root }, () => {}),
    (e: unknown) => e instanceof TaskError && e.status === 409,
  );
  procs[0]!.stderr.emit('data', Buffer.from('frame=   30 fps=60 time=00:00:00.50 bitrate=1\n'));
  assert.ok(events.some((e) => (e as { type: string }).type === 'progress'));
  assert.equal(r.stop(), true);
  assert.deepEqual(killed, [4242]);
  procs[0]!.emit('close', null);
  assert.equal(r.busy, false);
  r.start({ cmd: 'node', args: ['z'], cwd: root }, () => {});
  assert.equal(r.busy, true);
});

const p = await startTestServer();
after(() => p.close());

test('HTTP: непозната задача → 400; без потвърждение за --run → 409', async () => {
  assert.equal((await post(p, '/api/task', { task: 'nema' })).status, 400);
  writeFileSync(join(p.preview, 'g.wav'), 'x');
  const r = await post(p, '/api/task', {
    task: 'loudnorm',
    in: 'g.wav',
    out: 'g14.wav',
    run: true,
  });
  assert.equal(r.status, 409);
  assert.equal(((await r.json()) as { code: string }).code, 'confirm');
});
