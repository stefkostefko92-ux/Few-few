// Ресурсни лимити — systemd (cgroup v2) и Docker.
//
// Защо изобщо: един продукт, който изтече памет, събаря ЦЕЛИЯ сървър — ядрото
// избира жертвата на OOM и това рядко е виновникът. Лимит на unit-а превръща
// „падна ми сървърът" в „падна ми един продукт", което е несравнимо по-добре.
//
// Пишем drop-in файл (`/etc/systemd/system/<unit>.d/50-csd-limits.conf`), не
// самия unit файл: деплоят подменя unit-а, drop-in-ът оцелява, а `systemctl
// revert` го маха с една команда. Ръчните промени на потребителя в други drop-in
// файлове не се пипат.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';
import { assertUnit, parseShowKv } from './services.js';
import { assertDockerName } from './docker.js';

const DROPIN = '50-csd-limits.conf';
const UNIT_DIR = '/etc/systemd/system';

// MemoryMax/MemoryHigh: число + K/M/G/T или проценти. Празно = маха лимита.
const BYTES_RX = /^\d+(\.\d+)?[KMGT]?$/;
const PCT_RX = /^\d{1,3}%$/;

const MIN_MEMORY_BYTES = 16 * 1024 * 1024; // под това всяка услуга е мъртва

export function toBytes(s) {
  const m = /^(\d+(?:\.\d+)?)([KMGT]?)$/.exec(String(s || '').trim());
  if (!m) return null;
  const mult = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[m[2]];
  return Number(m[1]) * mult;
}

export function assertBytes(v, label) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!BYTES_RX.test(s) && !PCT_RX.test(s)) {
    throw Object.assign(new Error(`${label}: очаквам напр. „512M", „2G" или „80%"`), { status: 400 });
  }
  // „MemoryMax=1K" минава синтаксиса и се прилага ВЕДНАГА през set-property →
  // мигновен OOM на избраната услуга. Долен праг вместо доверие в пръстите.
  const bytes = toBytes(s);
  if (bytes != null && bytes < MIN_MEMORY_BYTES) {
    throw Object.assign(
      new Error(`${label}: под 16M услугата умира мигновено от OOM. Ако наистина искаш толкова, направи го от терминала.`),
      { status: 400 }
    );
  }
  return s;
}

// CPUQuota е в проценти от ЕДНО ядро — 200% значи две пълни ядра. Това бърка
// хората постоянно, затова интерфейсът го казва изрично.
export function assertQuota(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^\d{1,5}%$/.test(s)) throw Object.assign(new Error('CPUQuota: очаквам напр. „150%" (150% = 1.5 ядра)'), { status: 400 });
  const n = Number(s.slice(0, -1));
  if (n < 1) throw Object.assign(new Error('CPUQuota под 1% спира услугата на практика'), { status: 400 });
  return s;
}

export function assertTasks(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^\d{1,7}$/.test(s) || Number(s) < 1) throw Object.assign(new Error('TasksMax: цяло число ≥ 1'), { status: 400 });
  return s;
}

export function renderDropin({ memoryMax, memoryHigh, cpuQuota, tasksMax }) {
  const body = [
    '# Управлява се от Carbon Stealth VPS Dashboard.',
    '# Махни лимитите с: systemctl revert <unit>',
    '[Service]',
  ];
  // Празната стойност ИЗРИЧНО нулира наследеното — иначе стар лимит остава.
  body.push(`MemoryMax=${memoryMax || 'infinity'}`);
  body.push(`MemoryHigh=${memoryHigh || 'infinity'}`);
  body.push(`CPUQuota=${cpuQuota || ''}`);
  body.push(`TasksMax=${tasksMax || 'infinity'}`);
  return body.join('\n') + '\n';
}

// Текущите ефективни стойности идват от systemd, не от нашия файл — така се
// вижда и това, което някой е сложил на ръка.
export async function readLimits(unit) {
  const u = assertUnit(unit);
  const r = await run(
    'systemctl',
    ['show', u, '-p', 'MemoryMax', '-p', 'MemoryHigh', '-p', 'CPUQuotaPerSecUSec', '-p', 'TasksMax', '-p', 'MemoryCurrent', '-p', 'TasksCurrent'],
    { timeout: 8000 }
  );
  const kv = parseShowKv(r.stdout);
  const file = path.join(UNIT_DIR, `${u}.d`, DROPIN);
  return {
    unit: u,
    memoryMax: normalizeInfinity(kv.MemoryMax),
    memoryHigh: normalizeInfinity(kv.MemoryHigh),
    tasksMax: normalizeInfinity(kv.TasksMax),
    // CPUQuotaPerSecUSec е „микросекунди процесор на секунда" — 1 000 000 = едно
    // пълно ядро = 100%. Интерфейсът иска процент, за да не смята човекът наум.
    cpuQuotaPct: quotaToPercent(kv.CPUQuotaPerSecUSec),
    memoryCurrent: normalizeInfinity(kv.MemoryCurrent),
    tasksCurrent: normalizeInfinity(kv.TasksCurrent),
    managedByPanel: fs.existsSync(file),
    dropinPath: file,
  };
}

// systemd връща или сурови микросекунди, или форматирано („1s 500ms", „750ms").
export function quotaToPercent(raw) {
  const v = String(raw ?? '').trim();
  if (!v || v === 'infinity' || v === '[not set]') return null;
  if (/^\d+$/.test(v)) return Math.round(Number(v) / 10000); // usec/сек → %
  let usec = 0;
  const rx = /(\d+(?:\.\d+)?)(us|ms|s|min)/g;
  let m;
  let matched = false;
  while ((m = rx.exec(v))) {
    matched = true;
    const n = Number(m[1]);
    usec += n * { us: 1, ms: 1000, s: 1e6, min: 6e7 }[m[2]];
  }
  return matched ? Math.round(usec / 10000) : null;
}

function normalizeInfinity(v) {
  if (v == null || v === '' || v === 'infinity' || v === '[not set]') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

export async function setLimits(unit, values, audit, user) {
  const u = assertUnit(unit);
  const clean = {
    memoryMax: assertBytes(values.memoryMax, 'MemoryMax'),
    memoryHigh: assertBytes(values.memoryHigh, 'MemoryHigh'),
    cpuQuota: assertQuota(values.cpuQuota),
    tasksMax: assertTasks(values.tasksMax),
  };
  const dir = path.join(UNIT_DIR, `${u}.d`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  const file = path.join(dir, DROPIN);
  fs.writeFileSync(file, renderDropin(clean), { mode: 0o644 });
  audit.log({ action: 'limits.set', unit: u, ...clean, user });
  const reload = await run('systemctl', ['daemon-reload'], { timeout: 20000 });
  if (!reload.ok) throw Object.assign(new Error(`daemon-reload се провали: ${reload.stderr}`), { status: 500 });
  // Част от свойствата (MemoryMax) се прилагат и на живо; други искат рестарт.
  // Рестартът е ИЗРИЧЕН избор на човека — панелът не сваля продукт сам.
  const applied = await run('systemctl', ['set-property', '--runtime', u,
    `MemoryMax=${clean.memoryMax || 'infinity'}`,
    `MemoryHigh=${clean.memoryHigh || 'infinity'}`,
    `TasksMax=${clean.tasksMax || 'infinity'}`,
  ], { timeout: 15000 });
  return {
    ok: true,
    unit: u,
    ...clean,
    liveApplied: applied.ok,
    note: applied.ok
      ? 'Приложено веднага. CPUQuota влиза в сила при следващия рестарт на услугата.'
      : 'Записано. Влиза в сила при рестарт на услугата.',
  };
}

export async function clearLimits(unit, audit, user) {
  const u = assertUnit(unit);
  const file = path.join(UNIT_DIR, `${u}.d`, DROPIN);
  if (fs.existsSync(file)) fs.rmSync(file);
  audit.log({ action: 'limits.clear', unit: u, user });
  await run('systemctl', ['daemon-reload'], { timeout: 20000 });
  await run('systemctl', ['set-property', '--runtime', u, 'MemoryMax=infinity', 'MemoryHigh=infinity', 'TasksMax=infinity'], { timeout: 15000 });
  return { ok: true, unit: u, note: 'Лимитите са махнати.' };
}

// ── Docker ───────────────────────────────────────────────────────────────────
// `docker update` сменя лимитите на ЖИВ контейнер, без рестарт. Compose го
// презаписва при следващия `up` — затова интерфейсът казва да сложиш лимита и в
// compose файла, ако искаш да е траен.
export async function setDockerLimits(name, { memory = '', cpus = '' }, audit, user) {
  assertDockerName(name, 'контейнер');
  const args = ['update'];
  if (memory) {
    const m = String(memory).trim();
    if (!/^\d+(\.\d+)?[bkmg]?$/i.test(m)) throw Object.assign(new Error('memory: напр. „512m" или „2g"'), { status: 400 });
    args.push('--memory', m, '--memory-swap', m); // без swap лимит „--memory" е половинчат
  }
  if (cpus) {
    const c = String(cpus).trim();
    if (!/^\d+(\.\d+)?$/.test(c) || Number(c) <= 0) throw Object.assign(new Error('cpus: напр. „1.5"'), { status: 400 });
    args.push('--cpus', c);
  }
  if (args.length === 1) throw Object.assign(new Error('Няма зададен лимит'), { status: 400 });
  args.push(name);
  audit.log({ action: 'docker.limits', container: name, memory, cpus, user });
  const r = await run('docker', args, { timeout: 20000 });
  if (!r.ok) throw Object.assign(new Error(r.stderr || 'docker update се провали'), { status: 400 });
  return {
    ok: true,
    container: name,
    memory,
    cpus,
    note: 'Приложено на живо. Сложи същото и в compose файла — иначе следващият „up" го връща.',
  };
}
