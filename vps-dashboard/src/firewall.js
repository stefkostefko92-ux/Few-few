// Firewall (ufw) — преглед и управление на правилата. Всеки аргумент минава през
// строга валидация: ufw се вика с масив аргументи (без shell), а стойностите се
// проверяват по allowlist, не по „escape-ване“.
import { run, runOk } from './exec.js';

const ACTIONS = new Set(['allow', 'deny', 'reject', 'limit']);
const PROTOS = new Set(['tcp', 'udp']);
// Валиден порт, диапазон (1000:2000) или именувана услуга от /etc/services (ssh, http…)
const PORT_RX = /^\d{1,5}(:\d{1,5})?$/;
const SERVICE_RX = /^[a-zA-Z][\w+.-]{0,30}$/;
// IPv4/IPv6 адрес или CIDR, или „any"
const FROM_RX = /^(any|[0-9a-fA-F:.]{2,45}(\/\d{1,3})?)$/;

export async function firewallStatus() {
  const [numbered, verbose] = await Promise.all([
    run('ufw', ['status', 'numbered'], { timeout: 10000 }),
    run('ufw', ['status', 'verbose'], { timeout: 10000 }),
  ]);
  if (!numbered.ok) {
    return { available: false, error: (numbered.stderr || numbered.error || 'ufw недостъпен').trim().slice(0, 200) };
  }
  const active = /Status:\s*active/i.test(numbered.stdout);
  const rules = [];
  for (const line of numbered.stdout.split('\n')) {
    // Формат: "[ 1] 22/tcp                     ALLOW IN    Anywhere"
    const m = line.match(/^\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT)\s*(.*)$/);
    if (m) rules.push({ num: Number(m[1]), to: m[2].trim(), action: m[3], dir: m[4], from: (m[5] || '').trim() });
  }
  return { available: true, active, rules, verbose: verbose.ok ? verbose.stdout.trim() : '' };
}

// Съставя аргументите за `ufw` от валидирано описание на правило.
export function buildRuleArgs({ action, port, proto, from, comment }) {
  const a = String(action || '').toLowerCase();
  if (!ACTIONS.has(a)) throw Object.assign(new Error('Невалидно действие'), { status: 400 });
  const p = String(port || '').trim();
  if (!p) throw Object.assign(new Error('Липсва порт/услуга'), { status: 400 });
  const isPort = PORT_RX.test(p);
  if (!isPort && !SERVICE_RX.test(p)) throw Object.assign(new Error('Невалиден порт/услуга'), { status: 400 });
  if (isPort) {
    for (const part of p.split(':')) {
      const n = Number(part);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw Object.assign(new Error('Портът е извън 1–65535'), { status: 400 });
      }
    }
  }
  const pr = String(proto || '').toLowerCase();
  if (pr && !PROTOS.has(pr)) throw Object.assign(new Error('Невалиден протокол'), { status: 400 });
  // Диапазон изисква протокол — така иска самият ufw.
  if (isPort && p.includes(':') && !pr) {
    throw Object.assign(new Error('Диапазон от портове изисква протокол (tcp/udp)'), { status: 400 });
  }
  const src = String(from || '').trim();
  if (src && !FROM_RX.test(src)) throw Object.assign(new Error('Невалиден източник'), { status: 400 });

  const args = [a];
  if (src && src !== 'any') {
    args.push('from', src, 'to', 'any', 'port', p);
    if (pr) args.push('proto', pr);
  } else {
    args.push(pr ? `${p}/${pr}` : p);
  }
  const c = String(comment || '').trim();
  if (c) {
    if (!/^[\wа-яА-Я .,:@()+-]{1,60}$/u.test(c)) {
      throw Object.assign(new Error('Невалиден коментар'), { status: 400 });
    }
    args.push('comment', c);
  }
  return args;
}

export async function addRule(rule, audit, user) {
  const args = buildRuleArgs(rule);
  audit.log({ action: 'firewall.add', rule: args.join(' '), user });
  const out = await runOk('ufw', args, { timeout: 20000 });
  return { ok: true, output: out.trim() };
}

export async function deleteRule(num, audit, user) {
  const n = Number(num);
  if (!Number.isInteger(n) || n < 1 || n > 1000) {
    throw Object.assign(new Error('Невалиден номер на правило'), { status: 400 });
  }
  audit.log({ action: 'firewall.delete', num: n, user });
  // --force пропуска интерактивното „y/n“ потвърждение.
  const out = await runOk('ufw', ['--force', 'delete', String(n)], { timeout: 20000 });
  return { ok: true, output: out.trim() };
}

export async function setEnabled(enabled, audit, user) {
  audit.log({ action: `firewall.${enabled ? 'enable' : 'disable'}`, user });
  const out = await runOk('ufw', enabled ? ['--force', 'enable'] : ['disable'], { timeout: 20000 });
  return { ok: true, enabled: Boolean(enabled), output: out.trim() };
}
