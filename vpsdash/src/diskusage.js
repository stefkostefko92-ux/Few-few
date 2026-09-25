// „Кой яде диска" — отговорът, който прогнозата не дава.
//
// Панелът вече казва „дискът ще се напълни след 3.2 дни". Това е действено само
// наполовина: човекът разбира, че има проблем, и после отваря SSH и почва да
// налучква с `du`. Тази секция е втората половина — кои папки и кои файлове.
//
// Три решения, които не са очевидни:
//
//  1. **Сканирането е ЗАДАЧА, не заявка.** `--max-depth` ограничава само какво се
//     ОТПЕЧАТВА, не какво се обхожда: `du -d1 /` пак минава през цялото дърво и на
//     пълен диск това са минути. Затова върви като фонова задача с жив изход, а
//     резултатът се кешира с дата. Секция, която виси 4 минути, човек не отваря.
//  2. **Непълното сканиране НЕ се показва като пълно.** Скриптът пише маркер за
//     край; без него резултатът е „прекъснато" вместо „ето какво яде диска" с
//     половин истина. („Не знам" е състояние — същата доктрина като при портовете.)
//  3. **Кореновите пътища са ЗАТВОРЕН списък.** Произволен път в тялото прави
//     панела „изброй ми имената на файловете навсякъде като root" с приятен
//     интерфейс — същата заплаха като редактора на `.env` с произволен път.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';
import { DUMP_DIR } from './databases.js';

const STATE = 'disk-scan.json';
const DONE = '###КРАЙ';
const SEP_DIRS = '###ПАПКИ';
const SEP_FILES = '###ФАЙЛОВЕ';

// Кандидати за сканиране: местата, където реално се трупа. Всичко останало на
// коренова файлова система се вижда през самия корен.
const STATIC_ROOTS = ['/', '/var', '/var/log', '/var/lib', '/var/lib/docker', '/opt', '/home', '/root', '/tmp', '/srv'];

export function roots(cfg) {
  const fromCfg = [cfg?.paths?.releasesDir, cfg?.paths?.archiveDir, cfg?.paths?.stateDir, DUMP_DIR].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of [...STATIC_ROOTS, ...fromCfg.map((x) => path.resolve(x))]) {
    if (seen.has(p) || !isSafePath(p)) continue;
    seen.add(p);
    // Липсващият път не се показва: „сканирай /srv", когато го няма, е бутон,
    // който само може да разочарова.
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(p);
  }
  return out;
}

function isSafePath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.includes('\0') && !/[`$;&|<>"'\\\s]/.test(p);
}

// Точно съвпадение със списъка, не префикс: префиксната проверка би пуснала
// „/var/../root/.ssh" и всичко от този род.
export function assertRoot(cfg, p) {
  const want = String(p || '/');
  const allowed = roots(cfg);
  if (!allowed.includes(want)) {
    throw Object.assign(new Error(`„${want}" не е в списъка за сканиране (позволени: ${allowed.join(', ')})`), {
      status: 400,
    });
  }
  return want;
}

export function assertDepth(v) {
  const n = Number(v ?? 2);
  if (!Number.isInteger(n) || n < 1 || n > 4) {
    throw Object.assign(new Error('Дълбочината трябва да е 1–4'), { status: 400 });
  }
  return n;
}

export function assertMinMB(v) {
  const n = Number(v ?? 50);
  if (!Number.isInteger(n) || n < 1 || n > 1024 * 100) {
    throw Object.assign(new Error('Минималният размер трябва да е 1–102400 MB'), { status: 400 });
  }
  return n;
}

// ── Сканирането ──────────────────────────────────────────────────────────────
export function scanSpec(cfg, { root = '/', depth = 2, minMB = 50 } = {}) {
  const r = assertRoot(cfg, root);
  const d = assertDepth(depth);
  const m = assertMinMB(minMB);
  // `-x` не прекосява файлови системи: без него сканирането на „/" влиза в
  // /proc, /sys и всеки монтиран том и брои едни и същи байтове по няколко пъти.
  const script = [
    'set -uo pipefail',
    `echo "▸ Сканирам ${r} (дълбочина ${d}, файлове над ${m} MB). Това обхожда ЦЯЛОТО дърво — може да отнеме минути."`,
    `echo "${SEP_DIRS}"`,
    `du -x -B1 --max-depth=${d} ${r} 2>/dev/null | sort -rn | head -80 || true`,
    `echo "${SEP_FILES}"`,
    `find ${r} -xdev -type f -size +${m}M -printf '%s\\t%p\\n' 2>/dev/null | sort -rn | head -50 || true`,
    `echo "${DONE}"`,
  ].join('\n');
  return {
    title: `Разбивка на диска: ${r}`,
    shell: script,
    // Не заедно с бекъп/деплой: сканирането е тежко по вход-изход и би им
    // удължило времето точно когато най-малко трябва.
    exclusive: 'system',
    timeoutMs: 30 * 60 * 1000,
    scan: { root: r, depth: d, minMB: m },
  };
}

// „<байтове>\t<път>" — един и същ формат от `du -B1` и от `find -printf '%s\t%p'`.
export function parseScan(output) {
  const text = String(output || '');
  const complete = text.includes(DONE);
  const section = (from, to) => {
    const i = text.indexOf(from);
    if (i < 0) return '';
    const rest = text.slice(i + from.length);
    const j = to ? rest.indexOf(to) : -1;
    return j < 0 ? rest : rest.slice(0, j);
  };
  const rows = (chunk) =>
    chunk
      .split('\n')
      .map((l) => /^(\d+)\t(.+)$/.exec(l.trim()))
      .filter(Boolean)
      .map((m) => ({ bytes: Number(m[1]), path: m[2] }))
      .filter((x) => Number.isFinite(x.bytes) && x.bytes > 0);

  return {
    complete,
    dirs: rows(section(SEP_DIRS, SEP_FILES)),
    files: rows(section(SEP_FILES, DONE)),
  };
}

export class DiskScanStore {
  constructor(stateDir) {
    this.file = path.join(stateDir, STATE);
    this.state = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return { at: null, root: null, complete: false, dirs: [], files: [], code: null };
    }
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.state), { mode: 0o600 });
    } catch {
      /* best-effort */
    }
  }

  record({ root, depth, minMB, output, code }) {
    const parsed = parseScan(output);
    this.state = {
      at: new Date().toISOString(),
      root,
      depth,
      minMB,
      code: code ?? null,
      // Прекъснато сканиране (таймаут, изчерпана памет) НЕ минава за пълно.
      complete: parsed.complete && code === 0,
      dirs: parsed.dirs.slice(0, 80),
      files: parsed.files.slice(0, 50),
    };
    this.save();
    return this.state;
  }
}

// ── Бързите числа (без задача) ───────────────────────────────────────────────
export async function journalUsage() {
  const r = await run('journalctl', ['--disk-usage'], { timeout: 10000 });
  if (!r.ok) return { available: false, error: (r.stderr || r.error || 'journalctl недостъпен').slice(0, 200) };
  // „Archived and active journals take up 1.6G in the file system."
  const m = /take up ([\d.]+)([KMGT]?)/i.exec(r.stdout);
  const mult = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return {
    available: true,
    text: r.stdout.trim().slice(0, 200),
    bytes: m ? Math.round(Number(m[1]) * (mult[m[2].toUpperCase()] ?? 1)) : null,
  };
}

export async function dockerUsage() {
  const r = await run('docker', ['system', 'df', '--format', '{{json .}}'], { timeout: 20000 });
  if (!r.ok) return { available: false, error: (r.stderr || r.error || 'docker недостъпен').slice(0, 200) };
  const rows = [];
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      rows.push({
        type: j.Type,
        total: j.TotalCount ?? null,
        active: j.Active ?? null,
        size: j.Size ?? null,
        reclaimable: j.Reclaimable ?? null,
      });
    } catch {
      /* стар docker без --format {{json .}} */
    }
  }
  return { available: true, rows };
}

export async function overview(cfg, store) {
  const [journal, docker] = await Promise.all([journalUsage(), dockerUsage()]);
  return {
    roots: roots(cfg),
    journal,
    docker,
    scan: store.state,
  };
}

// ── Освобождаване ────────────────────────────────────────────────────────────
// Само двете БЕЗОПАСНИ действия.
//
// `docker system prune -a --volumes` умее да изтрие томове с ЖИВИ данни (качени
// файлове, бази) и е най-честият начин човек сам да си направи инцидент, докато
// „чисти място". Тук съзнателно го НЯМА: показваме разбивката и препращаме към
// секция „Docker", където изтриването е поименно и одитирано.
export function vacuumJournalSpec(keepMB) {
  const n = Number(keepMB);
  if (!Number.isInteger(n) || n < 16 || n > 1024 * 50) {
    throw Object.assign(new Error('Оставаният размер трябва да е 16–51200 MB'), { status: 400 });
  }
  return {
    title: `Свиване на журнала до ${n} MB`,
    cmd: 'journalctl',
    args: [`--vacuum-size=${n}M`],
    exclusive: 'system',
    timeoutMs: 10 * 60 * 1000,
  };
}

export function pruneBuildCacheSpec() {
  return {
    title: 'Чистене на Docker build кеша',
    // САМО `builder prune`: той пипа единствено кеша от билдове. Нула образи,
    // нула томове, нула контейнери — тоест няма как да изтрие данни.
    cmd: 'docker',
    args: ['builder', 'prune', '-f'],
    exclusive: 'system',
    timeoutMs: 30 * 60 * 1000,
  };
}
