// systemd услуги + journal логове. Всичко през execFile (без shell).
import { run, runOk } from './exec.js';
import { spawn } from 'node:child_process';
import { readCgroupStats } from './kernel.js';

const UNIT_RX = /^[\w@.\\-]+$/; // валидни имена на unit-и — нищо друго не стига до systemctl
const ACTIONS = new Set(['start', 'stop', 'restart', 'reload', 'enable', 'disable']);

// Услуги, чието СПИРАНЕ те оставя без път обратно към машината или сваля самия
// панел по средата на действие. Задачите вървят като ДЕЦА на панела (в неговия
// cgroup), затова „рестартирай vps-dashboard" по време на apt upgrade убива dpkg
// по средата — а „dpkg was interrupted" се оправя само по SSH.
// Рестартът им е позволен САМО отложено (виж autodeploy.sh CSD_SELF_DEPLOY).
const PROTECTED = [
  /^vps-dashboard(\.service)?$/,
  /^ssh(d)?(\.service|\.socket)?$/,
  /^docker(\.service|\.socket)?$/,
  /^containerd(\.service)?$/,
  /^systemd-(journald|logind|networkd|resolved|udevd)(\.service|\.socket)?$/,
  /^dbus(\.service|\.socket)?$/,
  /^network(ing)?(\.service)?$/,
];

export function isProtected(unit) {
  const u = String(unit || '').replace(/\.service$/, '');
  return PROTECTED.some((rx) => rx.test(unit) || rx.test(u));
}

// Спиране/изключване на защитена услуга е отказано. Рестартът също — той минава
// през същия cgroup и убива течащи задачи.
export function assertActionAllowed(unit, action) {
  if (!isProtected(unit)) return;
  if (action === 'start' || action === 'reload') return; // безобидни
  throw Object.assign(
    new Error(
      `„${unit}" е защитена: ${action} оттук може да те остави без достъп до машината или да прекъсне течаща задача по средата. ` +
        'Направи го от терминала, ако наистина трябва.'
    ),
    { status: 400 }
  );
}

export function assertUnit(unit) {
  if (typeof unit !== 'string' || unit.length > 200 || !UNIT_RX.test(unit)) {
    throw Object.assign(new Error('Невалидно име на услуга'), { status: 400 });
  }
  // Име, започващо с „-", стига до systemctl като ОПЦИЯ, не като unit.
  if (unit.startsWith('-')) throw Object.assign(new Error('Невалидно име на услуга'), { status: 400 });
  return unit;
}

export async function listServices() {
  // systemd ≥ 246 поддържа JSON изход — стабилен за парсване.
  const r = await run('systemctl', [
    'list-units',
    '--type=service',
    '--all',
    '--no-pager',
    '--output=json',
  ]);
  if (!r.ok) return { available: false, services: [], error: (r.stderr || r.error || '').trim() };
  let units = [];
  try {
    units = JSON.parse(r.stdout);
  } catch {
    return { available: false, services: [], error: 'Непарсваем изход от systemctl' };
  }
  // Кои са enabled — за колоната „автостарт“.
  const enabledMap = new Map();
  const uf = await run('systemctl', ['list-unit-files', '--type=service', '--no-pager', '--output=json']);
  if (uf.ok) {
    try {
      for (const u of JSON.parse(uf.stdout)) enabledMap.set(u.unit_file, u.state);
    } catch {
      /* по-стар systemd */
    }
  }
  const services = units.map((u) => {
    // Ресурси по cgroup — „кой изяде паметта" се вижда стабилно по unit, докато
    // per-process числата се губят при всеки рестарт на процеса.
    const cg = u.active === 'active' ? readCgroupStats(u.unit) : null;
    return {
      unit: u.unit,
      load: u.load,
      active: u.active,
      sub: u.sub,
      description: u.description,
      enabled: enabledMap.get(u.unit) || null,
      memoryBytes: cg?.memoryBytes ?? null,
      memoryPeak: cg?.memoryPeak ?? null,
      oomKills: cg?.oomKills ?? null,
      pids: cg?.pids ?? null,
      throttledUsec: cg?.throttledUsec ?? null,
    };
  });
  return { available: true, services };
}

export async function serviceAction(unit, action, audit, user) {
  assertUnit(unit);
  if (!ACTIONS.has(action)) throw Object.assign(new Error('Невалидно действие'), { status: 400 });
  assertActionAllowed(unit, action);
  audit.log({ action: `service.${action}`, unit, user });
  await runOk('systemctl', [action, unit], { timeout: 60000 });
  const st = await run('systemctl', ['is-active', unit]);
  return { unit, action, state: st.stdout.trim() };
}

export async function serviceStatus(unit) {
  assertUnit(unit);
  const r = await run('systemctl', ['status', unit, '--no-pager', '-l', '-n', '20']);
  return { unit, text: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).slice(0, 20000) };
}

export async function journalTail({ unit, priority, lines = 200 }) {
  const args = ['--no-pager', '-n', String(Math.min(Number(lines) || 200, 2000)), '-o', 'short-iso'];
  if (unit) args.push('-u', assertUnit(unit));
  if (priority !== undefined && priority !== '') {
    const p = Number(priority);
    if (!Number.isInteger(p) || p < 0 || p > 7)
      throw Object.assign(new Error('Невалиден приоритет'), { status: 400 });
    args.push('-p', String(p));
  }
  const r = await run('journalctl', args, { timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
  return { text: r.ok ? r.stdout : r.stderr || 'journalctl недостъпен' };
}

// Живо следене: spawn journalctl -f, редовете отиват към SSE до затваряне на връзката.
export function journalFollow({ unit, priority }, sse, res) {
  const args = ['-f', '--no-pager', '-n', '50', '-o', 'short-iso'];
  if (unit) args.push('-u', assertUnit(unit));
  if (priority !== undefined && priority !== '') {
    const p = Number(priority);
    if (Number.isInteger(p) && p >= 0 && p <= 7) args.push('-p', String(p));
  }
  const child = spawn('journalctl', args);
  child.stdout.on('data', (c) => sse.send('line', c.toString('utf8')));
  child.stderr.on('data', (c) => sse.send('line', c.toString('utf8')));
  child.on('close', () => sse.close());
  res.on('close', () => child.kill('SIGTERM'));
}
