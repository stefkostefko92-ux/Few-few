// Редактор на планираните задачи: root crontab + systemd таймери.
//
// Две неща правят разликата спрямо „ето ти crontab -e в браузър":
//
//  1. **Пусни сега.** Половината проблеми с планирана задача са „работи ли
//     изобщо". Изчакването до 3 сутринта, за да разбереш, е загубен ден.
//  2. **История и провали.** `systemctl list-timers` казва кога СЛЕДВА, не дали
//     последният път е минал успешно. Резултатът се чете от самия systemd
//     (`Result`, `ExecMainStatus`), а изходът — от журнала на конкретното
//     пускане (`_SYSTEMD_INVOCATION_ID`), не от последните 50 реда наслуки.
//
// Всеки ред на crontab-а минава през строга валидация: 5 полета разписание +
// команда. Записът е атомарен през `crontab <файл>` — частично записан crontab е
// начин да загубиш всички задачи.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './exec.js';
import { assertUnit } from './services.js';

const FIELD_RX = /^[\d*\/,\-]+$/;
const NICKNAMES = new Set(['@reboot', '@yearly', '@annually', '@monthly', '@weekly', '@daily', '@midnight', '@hourly']);
const MAX_LINES = 500;

// Проверява само СИНТАКСИСА на разписанието. Диапазоните (напр. „минута 70")
// оставяме на cron — целта тук е да не се запише нещо, което чупи целия файл.
export function validateSchedule(spec) {
  const s = String(spec || '').trim();
  if (NICKNAMES.has(s)) return s;
  const fields = s.split(/\s+/);
  if (fields.length !== 5) {
    throw Object.assign(new Error('Разписанието иска 5 полета (мин час ден месец седмица) или @daily/@reboot/…'), { status: 400 });
  }
  for (const f of fields) {
    if (!FIELD_RX.test(f)) throw Object.assign(new Error(`Невалидно поле в разписанието: „${f}"`), { status: 400 });
  }
  return fields.join(' ');
}

export function validateCommand(cmd) {
  const c = String(cmd || '').trim();
  if (!c) throw Object.assign(new Error('Празна команда'), { status: 400 });
  if (c.length > 1000) throw Object.assign(new Error('Командата е твърде дълга'), { status: 400 });
  // Нов ред би добавил СКРИТ втори запис под невинно изглеждащ ред.
  if (/[\n\r\0]/.test(c)) throw Object.assign(new Error('Командата не може да съдържа нов ред'), { status: 400 });
  // `%` в crontab значи нов ред на входа — почти винаги неволна грешка (`date +%F`).
  if (c.includes('%') && !c.includes('\\%')) {
    throw Object.assign(new Error('В crontab „%" значи нов ред — екранирай го като „\\%" (напр. date +\\%F).'), { status: 400 });
  }
  return c;
}

export async function readCrontab() {
  const r = await run('crontab', ['-l'], { timeout: 8000 });
  // Липсващ crontab не е грешка — просто още няма нито един ред.
  if (!r.ok && /no crontab/i.test(r.stderr || '')) return { lines: [], exists: false, available: true };
  // Липсваща ПРОГРАМА също не е грешка на панела: минимални образи (и контейнери)
  // нямат cron изобщо. Секцията казва това вместо да върне 500.
  if (!r.ok && r.code === 'ENOENT') return { lines: [], exists: false, available: false };
  if (!r.ok) throw Object.assign(new Error(r.stderr || 'crontab -l се провали'), { status: 500 });
  return { lines: r.stdout.replace(/\n$/, '').split('\n'), exists: true, available: true };
}

export async function parseCrontab() {
  const { lines, exists, available } = await readCrontab();
  if (!available) return { available: false, exists: false, lines: [], jobs: [] };
  const jobs = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    if (/^[A-Z_]+\s*=/.test(line)) return; // променлива на средата (PATH=…), не задача
    let schedule;
    let command;
    if (line.startsWith('@')) {
      const sp = line.indexOf(' ');
      if (sp < 0) return;
      schedule = line.slice(0, sp);
      command = line.slice(sp + 1).trim();
    } else {
      const m = line.match(/^((?:\S+\s+){5})(.+)$/);
      if (!m) return;
      schedule = m[1].trim();
      command = m[2].trim();
    }
    jobs.push({ index: i, schedule, command, raw });
  });
  return { available: true, exists, lines, jobs };
}

async function installCrontab(lines, audit, user, meta) {
  if (lines.length > MAX_LINES) throw Object.assign(new Error('Твърде много редове в crontab'), { status: 400 });
  const tmp = path.join(os.tmpdir(), `csd-crontab-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  try {
    const r = await run('crontab', [tmp], { timeout: 10000 });
    if (!r.ok) throw Object.assign(new Error(r.stderr || 'crontab отказа файла'), { status: 400 });
    audit.log({ action: 'cron.write', user, ...meta });
    return { ok: true, lines: lines.length };
  } finally {
    try {
      fs.rmSync(tmp);
    } catch {
      /* временният файл */
    }
  }
}

export async function addCronJob({ schedule, command, comment }, audit, user) {
  const s = validateSchedule(schedule);
  const c = validateCommand(command);
  const { lines } = await parseCrontab();
  const out = [...lines];
  if (comment) out.push(`# ${String(comment).replace(/[\n\r]/g, ' ').slice(0, 200)}`);
  out.push(`${s} ${c}`);
  // В одита влиза командата (тя е действие на машината), не тайни — затова
  // задачите с вграден токен трябва да четат от файл, не от командния ред.
  return installCrontab(out, audit, user, { op: 'add', schedule: s });
}

export async function removeCronJob(index, audit, user) {
  const i = Number(index);
  const { lines, jobs } = await parseCrontab();
  const job = jobs.find((j) => j.index === i);
  if (!job) throw Object.assign(new Error('Няма такъв ред'), { status: 400 });
  const out = lines.filter((_, n) => n !== i);
  return installCrontab(out, audit, user, { op: 'remove', schedule: job.schedule });
}

// ── systemd таймери ──────────────────────────────────────────────────────────
// „Пусни сега" стартира УСЛУГАТА, която таймерът активира — стартиране на самия
// таймер само нагласява следващото пускане и не прави нищо видимо.
export async function timerRunNow(unit, audit, user) {
  const u = assertUnit(unit);
  const service = u.endsWith('.timer') ? u.replace(/\.timer$/, '.service') : u;
  audit.log({ action: 'timer.runNow', unit: service, user });
  const r = await run('systemctl', ['start', '--no-block', service], { timeout: 15000 });
  if (!r.ok) throw Object.assign(new Error(r.stderr || 'Стартирането се провали'), { status: 400 });
  return { ok: true, unit: service, note: 'Пуснато. Виж резултата в историята след няколко секунди.' };
}

// Резултат от последното пускане + изходът именно от него.
export async function timerHistory(unit, { lines = 200 } = {}) {
  const u = assertUnit(unit);
  const service = u.endsWith('.timer') ? u.replace(/\.timer$/, '.service') : u;
  const show = await run(
    'systemctl',
    ['show', service, '-p', 'Result', '-p', 'ExecMainStatus', '-p', 'ExecMainStartTimestamp', '-p',
      'ExecMainExitTimestamp', '-p', 'NRestarts', '-p', 'InvocationID', '-p', 'ActiveState'],
    { timeout: 8000 }
  );
  const kv = {};
  for (const line of (show.stdout || '').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1);
  }
  const args = ['-u', service, '-n', String(Math.min(1000, Math.max(10, Number(lines) || 200))), '--no-pager', '-o', 'short-iso'];
  // Само редовете от ПОСЛЕДНОТО пускане — иначе четеш чужди изходи и си
  // въобразяваш провал, който е отпреди седмица.
  if (kv.InvocationID) args.push(`_SYSTEMD_INVOCATION_ID=${kv.InvocationID}`);
  const log = await run('journalctl', args, { timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  const status = Number(kv.ExecMainStatus);
  return {
    unit: service,
    result: kv.Result || null, // success / exit-code / timeout / signal …
    exitStatus: Number.isFinite(status) ? status : null,
    ok: kv.Result === 'success' && (!Number.isFinite(status) || status === 0),
    activeState: kv.ActiveState || null,
    startedAt: kv.ExecMainStartTimestamp || null,
    finishedAt: kv.ExecMainExitTimestamp || null,
    restarts: Number(kv.NRestarts) || 0,
    output: log.ok ? log.stdout.trim() : (log.stderr || '').trim(),
  };
}

// Всички таймери с резултата от последното им пускане — това е екранът, който
// отговаря на „минаха ли ми нощните задачи".
export async function timersWithResults() {
  const r = await run('systemctl', ['list-timers', '--all', '--no-pager', '--output=json'], { timeout: 15000 });
  let list = [];
  try {
    list = JSON.parse(r.stdout);
  } catch {
    return [];
  }
  const out = [];
  for (const t of list.slice(0, 100)) {
    const unit = t.unit || '';
    let res = null;
    try {
      res = await timerHistory(unit, { lines: 1 });
    } catch {
      /* таймер без услуга */
    }
    out.push({
      unit,
      activates: t.activates || null,
      next: t.next || null,
      last: t.last || null,
      result: res?.result || null,
      ok: res ? res.ok : null,
      exitStatus: res?.exitStatus ?? null,
    });
  }
  return out;
}
