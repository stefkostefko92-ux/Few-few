// Защо apt не работи — разборът и условията.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDpkgStatus,
  parseHolds,
  classifyKernels,
  bootSpace,
  parseSourceErrors,
  aptConditions,
  kernelCleanSpec,
  KERNEL_NEED_BYTES,
} from '../src/apthealth.js';

const MB = 1024 * 1024;

// ── dpkg състояние ───────────────────────────────────────────────────────────
test('apt: чистата машина дава празен списък', () => {
  const out = parseDpkgStatus(
    ['nginx|install ok installed', 'curl|install ok installed', 'oldpkg|deinstall ok config-files'].join('\n')
  );
  assert.deepEqual(out.broken, [], 'config-files е СЪЗНАТЕЛЕН избор, не повреда');
});

test('apt: прекъснатите се разпознават по СЪСТОЯНИЕ, не по отстъп в проза', () => {
  const out = parseDpkgStatus(
    [
      'nginx|install ok installed',
      'postgresql-16|install ok half-configured',
      'linux-image-6.8.0-40|install ok unpacked',
      'redis|install ok triggers-pending',
    ].join('\n')
  );
  assert.deepEqual(out.broken, ['postgresql-16', 'linux-image-6.8.0-40', 'redis']);
  assert.equal(out.details[0].state, 'half-configured');
});

test('apt: празен/счупен изход не измисля повреда', () => {
  assert.deepEqual(parseDpkgStatus('').broken, []);
  assert.deepEqual(parseDpkgStatus('боклук без разделител').broken, []);
});

// ── Задържани ────────────────────────────────────────────────────────────────
test('apt: задържаните са имена, не шум', () => {
  assert.deepEqual(parseHolds('nginx\ndocker-ce\n\n'), ['nginx', 'docker-ce']);
  assert.deepEqual(parseHolds(''), []);
});

// ── Ядра ─────────────────────────────────────────────────────────────────────
test('apt: текущото и НАЙ-НОВОТО ядро никога не са за махане', () => {
  const files = [
    '/boot/vmlinuz-6.8.0-31-generic',
    '/boot/vmlinuz-6.8.0-40-generic',
    '/boot/vmlinuz-6.8.0-45-generic',
  ];
  const k = classifyKernels(files, '6.8.0-40-generic');
  assert.equal(k.newest, '6.8.0-45-generic');
  assert.deepEqual(k.removable, ['6.8.0-31-generic'], 'махаме само старото, не работещото и не следващото');
});

test('apt: подредбата е по ЧИСЛО, не лексикографски (40 > 9)', () => {
  const k = classifyKernels(
    ['/boot/vmlinuz-6.8.0-9-generic', '/boot/vmlinuz-6.8.0-40-generic'],
    '6.8.0-9-generic'
  );
  assert.equal(k.newest, '6.8.0-40-generic', '„-9" лексикографски бие „-40" — точно тук се бърка');
  assert.deepEqual(k.removable, []);
});

test('apt: едно-единствено ядро не се пипа', () => {
  const k = classifyKernels(['/boot/vmlinuz-6.8.0-40-generic'], '6.8.0-40-generic');
  assert.deepEqual(k.removable, []);
});

// ── Място ────────────────────────────────────────────────────────────────────
test('apt: /boot се мери в МЕГАБАЙТИ — 78% там може да е фатално', () => {
  const b = bootSpace([
    { mount: '/', availBytes: 50e9, usePercent: 40 },
    { mount: '/boot', availBytes: 190 * MB, usePercent: 78 },
  ]);
  assert.equal(b.mount, '/boot');
  assert.equal(b.separate, true);
  assert.equal(b.enoughForKernel, false, '190 MB не стигат за ядро при праг 250 MB');
});

test('apt: без отделен /boot питаме корена', () => {
  const b = bootSpace([{ mount: '/', availBytes: 5e9, usePercent: 60 }]);
  assert.equal(b.mount, '/');
  assert.equal(b.separate, false);
  assert.equal(b.enoughForKernel, true);
});

test('apt: без дискове изобщо → null, не измислено „наред"', () => {
  assert.equal(bootSpace([]), null);
  assert.equal(bootSpace(null), null);
});

// ── Източници ────────────────────────────────────────────────────────────────
test('apt: само истинските провали са грешка, не всяко предупреждение', () => {
  const errs = parseSourceErrors(
    [
      'WARNING: apt does not have a stable CLI interface.',
      'W: GPG error: https://repo.example jammy InRelease: EXPKEYSIG 1234',
      'E: The repository https://ppa.example jammy Release does not have a Release file.',
      'Hit:1 http://archive.ubuntu.com noble InRelease',
    ].join('\n')
  );
  assert.equal(errs.length, 2);
  assert.match(errs[0], /GPG error/);
  assert.match(errs[1], /does not have a Release file/);
});

// ── Условията ────────────────────────────────────────────────────────────────
test('apt: здравата машина мълчи', () => {
  const c = aptConditions({
    boot: { mount: '/boot', availBytes: 600 * MB, usePercent: 40, enoughForKernel: true },
    kernels: { removable: [] },
    dpkg: { broken: [] },
    holds: [],
    sources: [],
  });
  assert.deepEqual(c, []);
});

test('apt: пълният /boot КАЗВА колко липсва и как се чисти', () => {
  const c = aptConditions({
    boot: { mount: '/boot', availBytes: 190 * MB, usePercent: 82, enoughForKernel: false },
    kernels: { removable: ['6.8.0-31-generic', '6.8.0-35-generic'] },
    dpkg: { broken: [] },
    holds: [],
    sources: [],
  });
  const a = c.find((x) => x.key === 'apt:boot-space');
  assert.ok(a);
  assert.equal(a.severity, 'warning');
  assert.match(a.body, /190 MB/);
  assert.match(a.body, /2 излишни ядра/);
  assert.match(a.body, /включително за сигурност/);
});

test('apt: под половината нужно място е КРИТИЧНО, не предупреждение', () => {
  const c = aptConditions({
    boot: { mount: '/boot', availBytes: 40 * MB, usePercent: 96, enoughForKernel: false },
    kernels: { removable: [] },
    dpkg: { broken: [] },
    holds: [],
    sources: [],
  });
  assert.equal(c[0].severity, 'critical');
  assert.match(c[0].body, /Няма излишни ядра/, 'казва и когато чистенето НЕ е решението');
});

test('apt: прекъснатият dpkg е критичен — блокира всичко', () => {
  const c = aptConditions({ boot: null, dpkg: { broken: ['postgresql-16'] }, holds: [], sources: [] });
  const a = c.find((x) => x.key === 'apt:dpkg-broken');
  assert.equal(a.severity, 'critical');
  assert.match(a.body, /postgresql-16/);
  assert.match(a.body, /НИТО един ъпдейт/);
});

test('apt: задържаните са info — съзнателно решение, не буди човек', () => {
  const c = aptConditions({ boot: null, dpkg: { broken: [] }, holds: ['nginx'], sources: [] });
  const a = c.find((x) => x.key === 'apt:holds');
  assert.equal(a.severity, 'info');
  assert.match(a.body, /включително при ъпдейт за сигурност/);
});

test('apt: счупеният източник казва, че списъкът е СТАР', () => {
  const c = aptConditions({ boot: null, dpkg: { broken: [] }, holds: [], sources: ['W: GPG error: …'] });
  const a = c.find((x) => x.key === 'apt:sources');
  assert.equal(a.severity, 'warning');
  assert.match(a.body, /остава СТАР/);
});

// ── Чистенето ────────────────────────────────────────────────────────────────
test('apt: чистенето е ПОИМЕННО, не autoremove на едро', () => {
  const spec = kernelCleanSpec(['6.8.0-31-generic']);
  assert.equal(spec.cmd, 'apt-get');
  assert.ok(spec.args.includes('linux-image-6.8.0-31-generic'));
  assert.ok(spec.args.includes('linux-modules-6.8.0-31-generic'));
  assert.equal(spec.args.includes('autoremove'), false, 'autoremove на едро маха и чужди пакети');
});

test('apt: инжекция във версията не стига до командата', () => {
  assert.throws(() => kernelCleanSpec(['6.8.0-31; rm -rf /']), /Няма излишни ядра/);
  assert.throws(() => kernelCleanSpec([]), /Няма излишни ядра/);
});

test('apt: прагът за ядро е с резерв (разопакова НОВОТО преди да махне старото)', () => {
  assert.ok(KERNEL_NEED_BYTES >= 200 * MB, 'едно ядро е ~120 MB, но за миг трябват две');
});
