// Защо apt не работи — диагностика, не списък с пакети.
//
// Секцията „Ъпдейти" показваше КАКВО чака да се обнови. Когато обновяването се
// проваля обаче, това е точно безполезната половина: човекът вижда 40 пакета и
// бутон, който гърми, а причината е на съвсем друго място. Оттук нататък панелът
// отговаря на въпроса, който наистина се задава — ЗАЩО не минава.
//
// Петте начина, по които apt се чупи на нашите сървъри, подредени по честота:
//
//  1. **Пълен `/boot`.** Класиката. Дялът е ~1 GB, всяко ново ядро иска ~120 MB, а
//     старите се трупат. Мери се в МЕГАБАЙТИ, не в проценти: `/boot` на 78% може
//     да е фатален (остават 190 MB → едно ядро не се събира), докато коренът на
//     78% е спокоен. Общият процентен праг на дисковата аларма по конструкция не
//     може да го хване — затова е отделно условие.
//  2. **Прекъснат dpkg.** Убит по средата apt (timeout на задачата, рестарт) оставя
//     пакет в междинно състояние и ВСЯКА следваща команда отказва, докато не мине
//     `dpkg --configure -a`.
//  3. **Заключен apt.** Друг процес държи lock-а — обикновено `unattended-upgrades`,
//     който тръгва по таймер. Това НЕ е повреда: чака се. Различаваме двете.
//  4. **Задържани пакети.** `apt-mark hold` от някого, забравено. Пакетът тихо не
//     се обновява, включително при security ъпдейти.
//  5. **Счупен източник.** Изтекъл GPG ключ или 404 на PPA — `apt update` частично
//     се проваля, а списъкът остава СТАР. Панелът иначе показва вчерашната истина
//     като днешна.
//
// Всичко тук е ЧЕТЕНЕ. Поправките са отделни, изрични действия.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';

// Ново ядро + initramfs на Ubuntu заема ~120 MB. Прагът е с резерв, защото
// `apt` разопакова НОВОТО, преди да махне старото — за миг трябват и двете.
export const KERNEL_NEED_BYTES = 250 * 1024 * 1024;

// ── Чисти функции (тестваеми без система) ────────────────────────────────────

// Прекъснатите пакети се четат от `dpkg-query`, НЕ от `dpkg --audit`.
//
// Причината е урок: `--audit` е човешки формат — параграф с обяснение, следван от
// списъка. И двете части са с отстъп, затова всеки филтър „ред с отстъп = пакет"
// хваща и думи от изречението („probably", видяно в тест). Тук няма евристика:
// `${Status}` е три полета (искано · грешка · състояние) и третото казва точно.
//
// „Наред" са две състояния, не едно: `installed` (нормалното) и `config-files`
// (пакетът е махнат, конфигурациите му са останали — това е СЪЗНАТЕЛЕН избор на
// някого, не повреда). Всичко друго — half-configured, half-installed, unpacked,
// triggers-pending — значи прекъснато и apt отказва да продължи.
const DPKG_OK_STATES = new Set(['installed', 'config-files', 'not-installed']);

export function parseDpkgStatus(text) {
  const broken = [];
  for (const line of String(text || '').split('\n')) {
    const [pkg, status] = line.split('|');
    if (!pkg || !status) continue;
    const state = status.trim().split(/\s+/).pop();
    if (!DPKG_OK_STATES.has(state)) broken.push({ pkg: pkg.trim(), state });
  }
  return { broken: broken.map((b) => b.pkg), details: broken.slice(0, 10) };
}

export function parseHolds(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[a-z0-9][a-z0-9+.:-]*$/i.test(l));
}

// Кои ядра са ИЗЛИШНИ. Никога не броим текущото (върви в момента) и никога
// най-новото (то е следващото при рестарт) — махането им прави машината
// незагрузима, а това е най-скъпата възможна „поправка".
export function classifyKernels(files, current) {
  const versions = (files || [])
    .map((f) => path.basename(f).replace(/^vmlinuz-/, ''))
    .filter(Boolean)
    .sort(cmpKernel);
  const newest = versions[versions.length - 1] || null;
  // FAIL-CLOSED. Без ИЗВЕСТНО текущо ядро (`uname -r` се провали) списъкът за
  // махане е ПРАЗЕН, не „всичко освен най-новото": иначе една неуспяла команда
  // предлага да изтриеш ядрото, което върви в момента — машината не се вдига,
  // а панелът също не се вдига, за да го поправиш. Тук „не знам" не бива да
  // означава „действай", защото цената на грешката е самата машина.
  if (!current) return { all: versions, current: null, newest, removable: [], unknown: true };
  const keep = new Set([current, newest].filter(Boolean));
  return { all: versions, current, newest, removable: versions.filter((v) => !keep.has(v)), unknown: false };
}

// Сортиране по версия: 6.8.0-40 е ПО-НОВО от 6.8.0-9, а лексикографски е обратното.
function cmpKernel(a, b) {
  const na = String(a).match(/\d+/g) || [];
  const nb = String(b).match(/\d+/g) || [];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (Number(na[i]) || 0) - (Number(nb[i]) || 0);
    if (d) return d;
  }
  return String(a).localeCompare(String(b));
}

// Излиза ли място за следващото ядро. `/boot` като отделен дял е обичайното на
// Hetzner образите; ако го няма, ядрата живеят на корена и питаме него.
export function bootSpace(disks) {
  const list = disks || [];
  const boot = list.find((d) => d.mount === '/boot');
  const target = boot || list.find((d) => d.mount === '/');
  if (!target) return null;
  return {
    mount: target.mount,
    availBytes: target.availBytes,
    usePercent: target.usePercent,
    separate: Boolean(boot),
    enoughForKernel: target.availBytes >= KERNEL_NEED_BYTES,
  };
}

// Счупени източници от изхода на `apt-get update`. Само редовете, които наистина
// значат провал — предупрежденията за нестабилен CLI не са проблем.
export function parseSourceErrors(text) {
  return String(text || '')
    .split('\n')
    .filter((l) => /^(E:|W: (Failed|GPG|The repository))/.test(l.trim()))
    .map((l) => l.trim().slice(0, 220))
    .slice(0, 8);
}

function fmtMb(n) {
  const mb = Number(n) / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

// ── Условията за алармите (чиста функция от вече събраното здраве) ───────────
// Всяко условие носи КОНКРЕТНАТА поправка в текста си — аларма, която казва само
// „apt е счупен", праща човека на SSH промпт да гадае.
export function aptConditions(h) {
  const out = [];
  if (!h || h.error) return out;

  if (h.boot && !h.boot.enoughForKernel) {
    const removable = h.kernels?.removable?.length || 0;
    out.push({
      key: 'apt:boot-space',
      // Тук няма „предупреждение": без място ъпдейтът за сигурност просто НЕ минава.
      severity: h.boot.availBytes < KERNEL_NEED_BYTES / 2 ? 'critical' : 'warning',
      title: `Няма място за ново ядро в ${h.boot.mount}`,
      body:
        `Остават ${fmtMb(h.boot.availBytes)} (${h.boot.usePercent}%), а ново ядро иска ~${fmtMb(KERNEL_NEED_BYTES)}. ` +
        `Ъпдейтите ще се провалят, включително за сигурност. ` +
        (removable
          ? `Има ${removable} излишни ядра — изчисти ги от „Ъпдейти" (текущото и най-новото се пазят).`
          : 'Няма излишни ядра за махане — трябва ръчно освобождаване.'),
      sustain: false,
      repeatEvery: 24 * 3600 * 1000,
    });
  }

  // `h.dpkg === null` значи НЕ ЗНАЕМ (командата се провали) — нито аларма, нито
  // успокоение. Интерфейсът го казва изрично.
  if (h.dpkg?.broken?.length) {
    out.push({
      key: 'apt:dpkg-broken',
      severity: 'critical',
      title: 'dpkg е прекъснат — apt отказва всичко',
      body:
        `Незавършени пакети: ${h.dpkg.broken.slice(0, 5).join(', ')}. ` +
        'Докато това стои, НИТО един ъпдейт не минава. Поправя се с „Довърши прекъснатия dpkg" в „Ъпдейти".',
      sustain: false,
      repeatEvery: 12 * 3600 * 1000,
    });
  }

  if (h.sources?.length) {
    out.push({
      key: 'apt:sources',
      severity: 'warning',
      title: 'Счупен източник за пакети',
      body:
        `${h.sources[0]} ` +
        'Списъкът с ъпдейти остава СТАР — панелът показва вчерашната истина. Провери /etc/apt/sources.list.d/.',
      sustain: false,
      repeatEvery: 24 * 3600 * 1000,
    });
  }

  if (h.holds?.length) {
    out.push({
      key: 'apt:holds',
      // info: задържането обикновено е нечие СЪЗНАТЕЛНО решение — казваме го,
      // не будим човек. Опасното е да се забрави, не да съществува.
      severity: 'info',
      title: `Задържани пакети: ${h.holds.length}`,
      body: `${h.holds.slice(0, 6).join(', ')} — не се обновяват, включително при ъпдейт за сигурност.`,
      sustain: false,
      repeatEvery: 7 * 24 * 3600 * 1000,
    });
  }

  return out;
}

// ── Събирането (пипа системата, само за четене) ──────────────────────────────
export async function aptHealth(disks) {
  const out = { checkedAt: new Date().toISOString(), boot: null, kernels: null, dpkg: null, holds: [], sources: [], lock: null, error: null };
  try {
    out.boot = bootSpace(disks);

    let files = [];
    try {
      files = fs.readdirSync('/boot').filter((f) => f.startsWith('vmlinuz-')).map((f) => path.join('/boot', f));
    } catch {
      /* без /boot няма какво да класифицираме */
    }
    const uname = await run('uname', ['-r'], { timeout: 5000 });
    out.kernels = classifyKernels(files, uname.ok ? uname.stdout.trim() : null);

    // Провалената команда дава NULL, не празен списък. `{broken: []}` при липсващ
    // `dpkg-query` е панелът, който твърди „dpkg е в ред", без да е питал —
    // същата лъжа като „портът е защитен", когато ufw не е отговорил.
    const q = await run('dpkg-query', ['-W', '-f=${Package}|${Status}\n'], { timeout: 20000, env: { LC_ALL: 'C' } });
    out.dpkg = q.ok ? parseDpkgStatus(q.stdout) : null;

    const holds = await run('apt-mark', ['showhold'], { timeout: 15000, env: { LC_ALL: 'C' } });
    out.holds = holds.ok ? parseHolds(holds.stdout) : null;

    // Кой държи lock-а. Наличието му НЕ е повреда (unattended-upgrades по таймер
    // е нормално) — затова е отделно поле, не аларма.
    const lock = await run('fuser', ['-v', '/var/lib/dpkg/lock-frontend'], { timeout: 8000, env: { LC_ALL: 'C' } });
    const busy = (lock.stdout || lock.stderr || '').trim();
    out.lock = busy && !/no process/i.test(busy) ? busy.split('\n').slice(0, 4).join('\n') : null;
  } catch (err) {
    out.error = String(err.message || err).slice(0, 200);
  }
  return out;
}

// Грешките на източниците идват от САМИЯ `apt update`, който е задача, не заявка
// (може да трае минута). Прочитаме ги от последния му изход, вместо да го пускаме
// пак при всяко отваряне на секцията.
export function sourceErrorsFromJob(jobOutput) {
  return parseSourceErrors(jobOutput);
}

// ── Поправките (изрични действия, всяка зад sudo) ────────────────────────────

// `dpkg --configure -a` довършва прекъснатото. Безопасно е: не сваля и не трие
// нищо ново, само доизкарва вече започнатото.
export function dpkgRepairSpec() {
  return {
    title: 'Довършвам прекъснатия dpkg',
    cmd: 'dpkg',
    args: ['--configure', '-a'],
    env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' },
    exclusive: 'system',
    timeoutMs: 20 * 60 * 1000,
  };
}

// Чистене на старите ядра. НЕ `apt autoremove` на едро — той маха всичко, което
// смята за ненужно, включително пакети, които някой ползва. Тук е ТОЧНО ядрата,
// поименно, и то само класифицираните като излишни (текущото и най-новото никога
// не влизат — виж classifyKernels).
export function kernelCleanSpec(removable) {
  const list = (removable || []).filter((v) => /^[\w.+-]+$/.test(v));
  if (!list.length) {
    throw Object.assign(new Error('Няма излишни ядра за махане.'), { status: 400 });
  }
  const pkgs = list.flatMap((v) => [`linux-image-${v}`, `linux-modules-${v}`, `linux-headers-${v}`]);
  return {
    title: `Чистя ${list.length} стари ядра`,
    cmd: 'apt-get',
    // --purge маха и конфигурациите; `|| true` няма — искаме изходния код честен.
    args: ['purge', '-y', '--auto-remove', ...pkgs],
    env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' },
    exclusive: 'system',
    timeoutMs: 20 * 60 * 1000,
  };
}
