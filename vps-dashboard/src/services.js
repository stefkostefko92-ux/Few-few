// systemd услуги + journal логове. Всичко през execFile (без shell).
import { run, runOk } from './exec.js';
import { spawn } from 'node:child_process';

const UNIT_RX = /^[\w@.\\-]+$/; // валидни имена на unit-и — нищо друго не стига до systemctl
const ACTIONS = new Set(['start', 'stop', 'restart', 'reload', 'enable', 'disable']);

export function assertUnit(unit) {
  if (typeof unit !== 'string' || unit.length > 200 || !UNIT_RX.test(unit)) {
    throw Object.assign(new Error('Невалидно име на услуга'), { status: 400 });
  }
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
  const services = units.map((u) => ({
    unit: u.unit,
    load: u.load,
    active: u.active,
    sub: u.sub,
    description: u.description,
    enabled: enabledMap.get(u.unit) || null,
  }));
  return { available: true, services };
}

export async function serviceAction(unit, action, audit, user) {
  assertUnit(unit);
  if (!ACTIONS.has(action)) throw Object.assign(new Error('Невалидно действие'), { status: 400 });
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
