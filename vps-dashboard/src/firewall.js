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

// Изтриване по НОМЕР има два капана, и двата водят до заключен собственик:
//
//  1. Номерата се ПРЕМЕСТВАТ след всяко изтриване. Списък, зареден преди минута,
//     сочи друго правило сега — натискаш „изтрий 3", а махаш SSH-а. Затова
//     приемаме и `expect` (текстът, който потребителят е ВИДЯЛ) и сверяваме.
//  2. Правилото за SSH няма нищо особено на вид. Махнеш ли го при активна стена,
//     връзката пада в същата секунда и панелът също изчезва.
export async function deleteRule(num, audit, user, { expect = null, force = false } = {}) {
  const n = Number(num);
  if (!Number.isInteger(n) || n < 1 || n > 1000) {
    throw Object.assign(new Error('Невалиден номер на правило'), { status: 400 });
  }
  const st = await firewallStatus();
  const rule = st.available ? st.rules.find((r) => r.num === n) : null;
  if (st.available && !rule) {
    throw Object.assign(new Error(`Няма правило с номер ${n} — презареди списъка.`), { status: 409 });
  }
  if (rule && expect) {
    const shown = `${rule.to} ${rule.action} ${rule.dir} ${rule.from}`.replace(/\s+/g, ' ').trim();
    if (shown !== String(expect).replace(/\s+/g, ' ').trim()) {
      throw Object.assign(
        new Error(`Правило №${n} вече не е това, което видя („${shown}"). Номерата се преместват при изтриване — презареди списъка.`),
        { status: 409 }
      );
    }
  }
  if (rule && !force && rule.action === 'ALLOW' && rule.dir === 'IN') {
    const port = await sshPort();
    const to = String(rule.to || '');
    // Неизвестен порт → НЕ можем да преценим. Тогава всяко ALLOW IN правило е
    // потенциално SSH-достъпът и искаме изрично потвърждение. Досадно е веднъж;
    // алтернативата е заключен сървър.
    if (!port) {
      throw Object.assign(
        new Error(
          `Не мога да прочета SSH порта (sshd -T не отговори), затова не знам дали правило №${n} („${to}") е достъпът ти. ` +
            'Провери сам и потвърди изрично.'
        ),
        { status: 409 }
      );
    }
    // ПОДНИЗ, не дума-граница. Стандартният начин на Ubuntu е `ufw allow OpenSSH`
    // и `ufw status numbered` изписва правилото точно като „OpenSSH" — а
    // `/\bssh\b/i.test('OpenSSH')` е FALSE (буквата преди „S" е дума-символ,
    // значи няма граница). Предпазителят мълчеше точно при най-честия начин да
    // си отвориш SSH. Свръх-задействането се изчиства с `force`; пропуснатото
    // задействане се изчиства със стотинки за KVM конзола.
    if (new RegExp(`(^|[^\\d])${port}([^\\d]|$)`).test(to) || /ssh/i.test(to)) {
      throw Object.assign(
        new Error(
          `Правило №${n} („${to}") е достъпът по SSH (порт ${port}). Изтриването му при активна стена те заключва ` +
            'извън сървъра — и този панел изчезва заедно с връзката. Потвърди изрично, ако наистина го искаш.'
        ),
        { status: 409 }
      );
    }
  }
  audit.log({ action: 'firewall.delete', num: n, rule: rule ? `${rule.to} ${rule.action}` : undefined, forced: force || undefined, user });
  // --force пропуска интерактивното „y/n“ потвърждение.
  const out = await runOk('ufw', ['--force', 'delete', String(n)], { timeout: 20000 });
  return { ok: true, output: out.trim() };
}

// Кой SSH порт слуша реално (за да не се самозаключим при включване на ufw).
// Връща null, когато НЕ Е РАЗБРАЛ. Мълчаливото падане обратно на „22" правеше
// предпазителя fail-OPEN точно при нестандартен порт (2222): не разпознава
// правилото, пуска изтриването, връзката пада. „Не знам" трябва да ЗАТЯГА
// защитата, не да я отваря.
async function sshPort() {
  const r = await run('sshd', ['-T'], { timeout: 10000 });
  const m = r.ok && r.stdout.match(/^port (\d+)$/m);
  return m ? m[1] : null;
}

// Проверява дали има добавено allow правило за даден порт. `ufw show added`
// работи и когато стената е ИЗКЛЮЧЕНА (за разлика от `ufw status`, който тогава
// не изброява правилата) — точно случаят преди първото включване.
export async function hasAllowFor(port) {
  const r = await run('ufw', ['show', 'added'], { timeout: 10000 });
  if (!r.ok) return false;
  return r.stdout
    .split('\n')
    .filter((l) => /\ballow\b/i.test(l))
    // Пак подниз: `ufw allow OpenSSH` е най-честият запис и дума-границата не го
    // хваща → предпазителят отказваше да пусне стената при напълно верен конфиг.
    .some((l) => new RegExp(`(^|[^\\d])${port}([^\\d]|$)`).test(l) || /ssh/i.test(l));
}

export async function setEnabled(enabled, audit, user, { force = false } = {}) {
  // ПРЕДПАЗИТЕЛ: включване на ufw без allow за SSH заключва собственика извън
  // сървъра (и панела). Отказваме, освен ако не е поискано изрично.
  if (enabled && !force) {
    const port = await sshPort();
    if (!port) {
      throw Object.assign(
        new Error(
          'Не мога да прочета SSH порта (sshd -T не отговори) — не мога да гарантирам, че няма да те заключа. ' +
            'Провери сам, че има allow правило за твоя порт, и потвърди изрично.'
        ),
        { status: 409 }
      );
    }
    if (!(await hasAllowFor(port))) {
      throw Object.assign(
        new Error(
          `Няма allow правило за SSH (порт ${port}) — включването на ufw ще те заключи извън сървъра. ` +
            `Добави първо правило „allow ${port}/tcp“, или потвърди изрично.`
        ),
        { status: 409 }
      );
    }
  }
  audit.log({ action: `firewall.${enabled ? 'enable' : 'disable'}`, forced: force || undefined, user });
  const out = await runOk('ufw', enabled ? ['--force', 'enable'] : ['disable'], { timeout: 20000 });
  return { ok: true, enabled: Boolean(enabled), output: out.trim() };
}
