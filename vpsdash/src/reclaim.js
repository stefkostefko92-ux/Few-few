// Какво може да се освободи — с размер, обяснение и бутон.
//
// „Кой яде диска" отговаря КЪДЕ отиват байтовете. Това е другият въпрос: кои от
// тях са БОКЛУК. Разликата не е козметична — човек на пълен диск в 3 сутринта не
// иска дърво от папки, а списък с неща, които може да изтрие, без да съжалява.
//
// ЕДНО правило определя целия модул: **тук влиза само това, което по конструкция
// не може да е данни.** Кеш, който се пресваля. Логове, които вече са ротирани.
// Копия, направени от самия деплой. Всичко, за което трябва да се мисли „а дали
// пък не ми трябва", стои ИЗВЪН списъка — то се трие поименно от съответната
// секция, където човекът вижда контекста.
//
// Затова тук ГИ НЯМА и няма да ги има:
//  · Docker томове и спрени контейнери — том е данни, а спрян контейнер може да е
//    спрян нарочно; „почистих" е най-честият увод към инцидент.
//  · `/tmp` на едро — жив процес държи файлове там точно в момента.
//  · Каквато и да е папка на потребител.
//  · Текущият release и последните два преди него (откатът трябва да е възможен).
//
// Размерите се смятат с `du` по КОНКРЕТНИ пътища (не обхождане на цялото дърво),
// паралелно и с таймаут — секцията трябва да се отваря за секунда.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';
import { plural } from './text.js';
import { trashDir } from './fileops.js';

// ЗАТВОРЕН списък. Нов ред тук е съзнателно решение, не конфигурация — иначе
// това става „изтрий произволен път като root" с приятен интерфейс (същата
// заплаха като редактора на .env и корените на сканирането).
const APT_ARCHIVES = '/var/cache/apt/archives';
const LOG_DIR = '/var/log';
const CRASH_DIR = '/var/crash';
const COREDUMP_DIR = '/var/lib/systemd/coredump';
const RESTORE_DIR = '/var/lib/vps-dashboard/restore';
// Кешовете на пакетните мениджъри — пресвалят се при нужда. Последните два са
// HOME на САМИЯ панел (install.sh слага HOME=state): всеки `npm ci` от деплоя
// през панела трупа там и никой не ги гледа.
export const CACHE_DIRS = [
  '/root/.npm/_cacache',
  '/root/.cache/pip',
  '/root/.cache/yarn',
  '/usr/local/share/.cache/yarn',
  '/root/.local/share/pnpm/store',
  '/root/.cache/go-build',
  '/root/.cache/composer',
  '/var/lib/vps-dashboard/.npm/_cacache',
  '/var/lib/vps-dashboard/.cache',
];
// Копията, които редакторът на файлове пази преди всеки запис
// (`<файл>.bak-<ISO време>`). Търсят се само в тези корени и само по ТОЧНИЯ
// формат на името — чужд `.bak` (на човек, на друг инструмент) не съвпада.
const EDITOR_BAK_ROOTS = ['/etc', '/opt', '/srv', '/var/www', '/root', '/var/backups/vps-dashboard'];
const EDITOR_BAK_RX = /\.bak-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const EDITOR_BAK_KEEP_DAYS = 7;

function bytesOf(text) {
  const n = Number(String(text || '').trim().split(/\s+/)[0]);
  return Number.isFinite(n) ? n : 0;
}

async function duBytes(target) {
  // `-s` сумарно, `-x` без прескачане на файлови системи, `-b` в байтове.
  const r = await run('du', ['-sxb', target], { timeout: 12000 });
  return r.ok ? bytesOf(r.stdout) : 0;
}

async function exists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

// ── Категориите ──────────────────────────────────────────────────────────────

// Свалените .deb след инсталация. Най-безопасното нещо на машината: apt ги
// пресваля, ако някога дотрябват.
async function aptCache() {
  if (!(await exists(APT_ARCHIVES))) return null;
  const r = await run('find', [APT_ARCHIVES, '-maxdepth', '1', '-name', '*.deb', '-type', 'f'], { timeout: 20000 });
  const files = r.ok ? r.stdout.split('\n').filter(Boolean) : [];
  if (!files.length) return null;
  const bytes = await duBytes(APT_ARCHIVES);
  return {
    id: 'apt-cache',
    title: 'Кеш на apt (свалени .deb)',
    why: 'Пакетите, свалени при инсталация. Не са нужни след това — apt ги сваля пак, ако потрябват.',
    bytes,
    count: files.length,
    safety: 'safe',
    sudo: false,
  };
}

// Вече ротираните логове: `.gz`, `.1`, `.old`. ЖИВИЯТ лог никога не се пипа —
// той е отворен от процес, а изтриването му не освобождава място, докато
// процесът не го затвори (класически капан: `df` не мърда след „чистенето").
async function rotatedLogs() {
  // Размерът идва от САМИЯ find (`-printf '%s'`), не от 4000 отделни `stat`-а:
  // на машина с дълга история това е разликата между 200 ms и половин минута,
  // а секция, която виси, човек не отваря втори път.
  const r = await run(
    'find',
    [LOG_DIR, '-type', 'f', '(', '-name', '*.gz', '-o', '-name', '*.xz', '-o', '-name', '*.[0-9]', '-o', '-name', '*.old', ')', '-printf', '%s\n'],
    { timeout: 20000 }
  );
  if (!r.ok) return null;
  const sizes = r.stdout.split('\n').filter(Boolean).map(Number).filter(Number.isFinite);
  if (!sizes.length) return null;
  const bytes = sizes.reduce((a, b) => a + b, 0);
  return {
    id: 'rotated-logs',
    title: 'Ротирани логове',
    why: 'Архивните копия (.gz, .1, .old) на вече завъртени логове. Живият лог НЕ се пипа — изтриването му не освобождава място, докато процесът го държи отворен.',
    bytes,
    count: sizes.length,
    safety: 'careful',
    sudo: false,
    note: 'Губиш историята в тях. Ако разследваш инцидент отпреди дни — първо погледни, после чисти.',
  };
}

// Копията, които autodeploy/install правят преди всяка подмяна. Полезни са точно
// един деплой напред; после са просто стар код.
async function deployBackups(cfg) {
  const dir = path.dirname(cfg?.paths?.currentLink || '/opt/few-few');
  const found = [];
  for (const base of ['/opt']) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(base);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!/\.bak-\d{8}-\d{6}$/.test(e)) continue;
      found.push(path.join(base, e));
    }
  }
  if (!found.length) return null;
  const bytes = (await Promise.all(found.map(duBytes))).reduce((a, b) => a + b, 0);
  return {
    id: 'deploy-backups',
    title: 'Копия от деплоя (.bak-*)',
    why: `Снимки на кода, правени преди подмяна при деплой (в ${dir === '/opt/few-few' ? '/opt' : dir}). Откатът ползва releases/, не тези.`,
    bytes,
    count: found.length,
    safety: 'safe',
    sudo: false,
    paths: found,
  };
}

// Стари releases. ПАЗИМ текущия и двата преди него — откатът е точно това.
async function oldReleases(cfg) {
  const relDir = cfg?.paths?.releasesDir || '/opt/few-few/releases';
  let entries = [];
  try {
    entries = (await fs.promises.readdir(relDir)).filter((d) => /^\d{8}-\d{6}$/.test(d)).sort();
  } catch {
    return null;
  }
  const KEEP = 3;
  const old = entries.slice(0, Math.max(0, entries.length - KEEP));
  if (!old.length) return null;
  const bytes = (await Promise.all(old.map((d) => duBytes(path.join(relDir, d))))).reduce((a, b) => a + b, 0);
  return {
    id: 'old-releases',
    title: 'Стари releases',
    why: `Разгърнати версии отпреди. Пазят се последните ${KEEP} (текущият + два за откат) — тези са по-стари от тях.`,
    bytes,
    count: old.length,
    safety: 'safe',
    sudo: false,
    paths: old.map((d) => path.join(relDir, d)),
  };
}

// Качените архиви за деплой. Те са в /root, качват се ръчно и остават там
// завинаги — на машина с чести деплои това е тихо растящ куп.
async function uploadedArchives(cfg) {
  const dir = cfg?.paths?.archiveDir || '/root';
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    return null;
  }
  const files = entries.filter((f) => /\.(zip|tar\.gz|tgz)$/i.test(f));
  if (!files.length) return null;
  const stats = [];
  for (const f of files) {
    try {
      const st = await fs.promises.stat(path.join(dir, f));
      if (st.isFile()) stats.push({ name: f, size: st.size, mtime: st.mtimeMs });
    } catch {
      /* пропускаме */
    }
  }
  if (!stats.length) return null;
  // Най-новият остава: той е това, което току-що е деплойнато.
  stats.sort((a, b) => b.mtime - a.mtime);
  const old = stats.slice(1);
  if (!old.length) return null;
  return {
    id: 'uploaded-archives',
    title: 'Стари качени архиви',
    why: `Архивите за деплой в ${dir}. Кодът вече е разгърнат — архивът е нужен само докато трае деплоят. Най-новият се ПАЗИ.`,
    bytes: old.reduce((s, f) => s + f.size, 0),
    count: old.length,
    safety: 'safe',
    sudo: false,
    paths: old.map((f) => path.join(dir, f.name)),
  };
}

// Отчети от сривове. Полезни са, докато някой ги чете — а никой не ги чете.
async function crashDumps() {
  if (!(await exists(CRASH_DIR))) return null;
  const bytes = await duBytes(CRASH_DIR);
  if (bytes < 1024 * 1024) return null;
  return {
    id: 'crash-dumps',
    title: 'Отчети от сривове (/var/crash)',
    why: 'Автоматични отчети след срив на програма. Полезни са само ако някой ги изпраща/чете.',
    bytes,
    count: 0,
    safety: 'careful',
    sudo: false,
    note: 'Ако разследваш скорошен срив — не ги трий още.',
  };
}

// Висящи Docker образи: слоеве без таг, на които никой не сочи. НЕ са томове и
// НЕ са спрени контейнери — тях ги няма тук нарочно.
async function danglingImages() {
  const r = await run('docker', ['images', '-f', 'dangling=true', '-q'], { timeout: 20000 });
  if (!r.ok) return null;
  const ids = r.stdout.split('\n').filter(Boolean);
  if (!ids.length) return null;
  // ЧИСЛОТО ТУК НЕ ИДВА от `docker system df` — и това е поправка на лъжа.
  //
  // Старият код взимаше „Images · RECLAIMABLE" оттам с мотива, че сумирането на
  // слоеве би надуло числото (слоевете се делят). Мотивът е верен, източникът —
  // не: `system df` брои и ТАГНАТИТЕ неизползвани образи, а бутонът пуска
  // `image prune -f` БЕЗ `-a`, тоест пипа само нетагнатите. Двете множества са
  // различни. Измерено на живо: панелът показваше 13.8 GB, а командата
  // освободи 0B — нула висящи образи при цели 13.8 GB неизползвани тагнати.
  //
  // Затова тук стои това, което бутонът РЕАЛНО ще махне: броят. Точен размер не
  // се твърди, защото не е знаем предварително (споделените слоеве правят всяка
  // сума измислена). По-добре без число, отколкото с чуждо: числото до бутон е
  // обещание.
  return {
    id: 'dangling-images',
    title: 'Висящи Docker образи',
    why: 'Слоеве без таг, останали от предишни билдове. Никой контейнер не ги ползва. Томовете и спрените контейнери НЕ се пипат.',
    bytes: 0,
    human: plural(ids.length, 'образ', 'образа'),
    count: ids.length,
    safety: 'safe',
    sudo: false,
    note:
      'Размерът не се показва нарочно: слоевете се делят между образи, затова сумата им е измислена, ' +
      'а „възстановимото" от `docker system df` брои и тагнатите неизползвани образи, които този бутон НЕ пипа. ' +
      'Те се махат поименно от секция „Docker" — умишлено, за да не изтриеш образа, с който вдигаш спрян продукт.',
  };
}

// Build cache-ът на Docker расте с ВСЕКИ билд и никой не го гледа.
//
// Измерено на живо: 26.47 GB кеш при 26.45 GB възстановими — над 40% от целия
// диск и над пет пъти повече от всичко останало в тази секция, взето заедно.
// Дотук панелът показваше само висящите образи (13.8 GB) и подминаваше
// по-големия консуматор — тоест отговаряше на „кой яде диска" с втория по ред.
//
// Това е и НАЙ-безопасното за триене на машината: кешът е чисто производно на
// билда. Няма данни за губене, единствената последица е по-бавен следващ билд.
// Затова тук `-a` е уместно, за разлика от `image prune -a` (той би махнал
// образа, с който вдигаш продукта след рестарт).
export function parseDockerSize(s) {
  // „26.45GB" / „731.9MB" / „0B". Docker пише десетични единици (GB=10^9), не
  // гибибайти — смятането като 1024^3 би надувало числото с ~7%.
  const m = String(s || '').trim().match(/^([\d.]+)\s*([KMGT]?B)$/i);
  if (!m) return 0;
  const mult = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[m[2].toUpperCase()];
  return mult ? Math.round(Number(m[1]) * mult) : 0;
}

async function buildCache() {
  const df = await run('docker', ['system', 'df', '--format', '{{.Type}}|{{.Size}}|{{.Reclaimable}}'], { timeout: 20000 });
  if (!df.ok) return null;
  const line = df.stdout.split('\n').find((l) => /^Build Cache\|/.test(l));
  if (!line) return null;
  const [, size, reclaimable] = line.split('|');
  // Docker слага процент в скоби: „26.45GB (99%)". Числото е пред него.
  const human = (reclaimable || '').trim().split(/\s+/)[0] || '';
  const bytes = parseDockerSize(human);
  if (bytes < 100 * 1e6) return null; // под 100 MB не си струва реда в списъка
  return {
    id: 'build-cache',
    title: 'Docker build cache',
    why:
      'Междинни слоеве от предишни билдове. Расте с всеки деплой и никога не се чисти сам. ' +
      'Чисто производно — няма данни за губене, само следващият билд ще е по-бавен.',
    bytes,
    human: human || String(size || '').trim(),
    count: 0,
    safety: 'safe',
    sudo: false,
  };
}

// Ядрото записва паметта на всеки сринал процес (systemd-coredump). Един срив
// на голям процес е стотици MB; повтарящ се срив пълни диска тихо.
async function coreDumps() {
  if (!(await exists(COREDUMP_DIR))) return null;
  const r = await run('find', [COREDUMP_DIR, '-maxdepth', '1', '-type', 'f', '-printf', '%s\n'], { timeout: 15000 });
  if (!r.ok) return null;
  const sizes = r.stdout.split('\n').filter(Boolean).map(Number).filter(Number.isFinite);
  if (!sizes.length) return null;
  return {
    id: 'coredumps',
    title: 'Дъмпове на паметта от сривове (coredump)',
    why: 'Паметта на процес в момента на срива — за дебъгване със `coredumpctl`. След като причината е ясна, са само тежест.',
    bytes: sizes.reduce((a, b) => a + b, 0),
    count: sizes.length,
    safety: 'careful',
    sudo: false,
    note: 'Ако точно сега търсиш защо нещо пада — виж първо `coredumpctl list`, после чисти.',
  };
}

async function packageCaches() {
  const found = [];
  for (const d of CACHE_DIRS) if (await exists(d)) found.push(d);
  if (!found.length) return null;
  const sizes = await Promise.all(found.map(duBytes));
  const keep = found.filter((_, i) => sizes[i] > 0);
  const bytes = sizes.reduce((a, b) => a + b, 0);
  if (bytes < 20 * 1024 * 1024) return null;
  return {
    id: 'pkg-caches',
    title: 'Кешове на npm, pip, yarn, pnpm, go',
    why: 'Свалени пакети, пазени „за всеки случай". Следващата инсталация ги сваля пак, ако потрябват — нищо инсталирано не се пипа.',
    bytes,
    count: keep.length,
    safety: 'safe',
    sudo: false,
    paths: keep,
  };
}

// Разопакованите дъмпове от „Преглед" в Бекъпи. Дъмпът (.gz) остава — това са
// копия. И не само място: разопакована база (за medqr — чл. 9 GDPR) не бива да
// лежи на диска по-дълго от нужното.
async function restorePreviews() {
  let entries = [];
  try {
    entries = await fs.promises.readdir(RESTORE_DIR);
  } catch {
    return null;
  }
  const files = [];
  for (const e of entries) {
    if (!/^[\w.-]+$/.test(e)) continue;
    try {
      const st = await fs.promises.lstat(path.join(RESTORE_DIR, e));
      if (st.isFile()) files.push({ p: path.join(RESTORE_DIR, e), size: st.size });
    } catch {
      /* изчезнал междувременно */
    }
  }
  if (!files.length) return null;
  return {
    id: 'restore-previews',
    title: 'Разопаковани прегледи на бекъпи',
    why: 'Копия на бази, разопаковани за „Преглед" преди възстановяване. Самите дъмпове остават непокътнати.',
    bytes: files.reduce((s, f) => s + f.size, 0),
    count: files.length,
    safety: 'safe',
    sudo: false,
    note: 'Освен място — и поверителност: разопакована база не бива да стои на диска по-дълго от нужното.',
    paths: files.map((f) => f.p),
  };
}

// Копията от редактора, по-стари от седмица. По-новите остават — те са
// отмяната на скорошна промяна.
async function editorBackups() {
  const roots = [];
  for (const r of EDITOR_BAK_ROOTS) if (await exists(r)) roots.push(r);
  if (!roots.length) return null;
  const r = await run(
    'find',
    [...roots, '-xdev', '-maxdepth', '8', '-type', 'f', '-name', '*.bak-????-??-??T??-??-??-???Z', '-mtime', `+${EDITOR_BAK_KEEP_DAYS}`, '-printf', '%s\t%p\n'],
    { timeout: 20000 }
  );
  const rows = r.stdout
    .split('\n')
    .map((l) => /^(\d+)\t(.+)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ size: Number(m[1]), p: m[2] }))
    .filter((x) => isEditorBackup(x.p));
  if (!rows.length) return null;
  return {
    id: 'editor-backups',
    title: 'Стари копия от редактора (.bak-…)',
    why: `Копия на файлове отпреди редакция през панела, по-стари от ${plural(EDITOR_BAK_KEEP_DAYS, 'ден', 'дни')}. По-новите остават — те са отмяната на скорошна промяна.`,
    bytes: rows.reduce((s, x) => s + x.size, 0),
    count: rows.length,
    safety: 'safe',
    sudo: false,
    paths: rows.slice(0, 2000).map((x) => x.p),
  };
}

// Изключените ревизии на snap: snapd пази предишните версии за откат, по
// подразбиране 3 на пакет. Активната НЕ се пипа.
export function parseSnapList(text) {
  const out = [];
  for (const line of String(text || '').split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4 || !/\bdisabled\b/.test(cols.slice(5).join(' '))) continue;
    const [name, , rev] = cols;
    if (SNAP_NAME_RX.test(name) && /^\d{1,10}$/.test(rev)) out.push({ name, rev });
  }
  return out;
}
const SNAP_NAME_RX = /^[a-z0-9][a-z0-9-]{0,39}$/;

async function oldSnaps() {
  const r = await run('snap', ['list', '--all'], { timeout: 15000 });
  if (!r.ok) return null;
  const revs = parseSnapList(r.stdout);
  if (!revs.length) return null;
  let bytes = 0;
  for (const s of revs) {
    try {
      bytes += (await fs.promises.stat(`/var/lib/snapd/snaps/${s.name}_${s.rev}.snap`)).size;
    } catch {
      /* без размер — пак се брои */
    }
  }
  return {
    id: 'old-snaps',
    title: 'Стари ревизии на snap',
    why: 'Предишни версии на snap пакети, пазени за откат. Активната версия на всеки пакет НЕ се пипа.',
    bytes,
    count: revs.length,
    safety: 'safe',
    sudo: false,
    revs,
  };
}

// Кошчето на файловия мениджър — изтритото там все пак заема място до изтичането.
async function fileTrash(cfg) {
  const dir = trashDir(cfg);
  let ids = [];
  try {
    ids = (await fs.promises.readdir(dir)).filter((d) => /^[a-z0-9]{8,40}$/.test(d));
  } catch {
    return null;
  }
  if (!ids.length) return null;
  const bytes = await duBytes(dir);
  return {
    id: 'file-trash',
    title: 'Кошчето на файловия мениджър',
    why: 'Изтритото от „Файлове" стои тук до изтичането си и заема място. Изпразването е окончателно.',
    bytes,
    count: ids.length,
    safety: 'careful',
    sudo: false,
    note: 'След това „Върни" няма откъде да върне. Погледни първо кошчето в „Файлове".',
  };
}

export function isEditorBackup(p) {
  const s = String(p || '');
  return (
    // Пътят стига до `rm` като отделен аргумент (без shell), затова кирилица и
    // интервал са безопасни; нов ред и \0 — не (чупят и разбора на find).
    /^\/[^\0\n]+$/.test(s) &&
    !s.split('/').includes('..') &&
    EDITOR_BAK_RX.test(s) &&
    EDITOR_BAK_ROOTS.some((r) => s.startsWith(r + '/'))
  );
}

// ── Събирането ───────────────────────────────────────────────────────────────
export async function reclaimable(cfg) {
  const tasks = [
    aptCache(), rotatedLogs(), deployBackups(cfg), oldReleases(cfg), uploadedArchives(cfg), crashDumps(), danglingImages(), buildCache(),
    coreDumps(), packageCaches(), restorePreviews(), editorBackups(), oldSnaps(), fileTrash(cfg),
  ];
  const settled = await Promise.allSettled(tasks);
  const items = settled
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value)
    .sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  return {
    checkedAt: new Date().toISOString(),
    items,
    totalBytes: items.reduce((s, i) => s + (i.bytes || 0), 0),
  };
}

// ── Действията ───────────────────────────────────────────────────────────────
// Всяко е ОТДЕЛНО и поименно. Няма „изчисти всичко" — един бутон, който трие по
// седем места наведнъж, е точно начинът човек да махне нещо, за което после
// съжалява, без да е видял какво е било.

// Пътищата, които стигат до команда, минават през проверка ВТОРИ път (веднъж при
// откриването, веднъж тук). Стойността идва от нашия собствен код, но между
// двете има HTTP заявка — а всичко, минало през мрежата, е чужд вход.
function assertSafePath(p) {
  const s = String(p || '');
  if (!path.isAbsolute(s) || s.includes('..') || s.includes('\0')) {
    throw Object.assign(new Error(`Отказан път: ${s.slice(0, 80)}`), { status: 400 });
  }
  const ok =
    /^\/opt\/[\w.-]+\.bak-\d{8}-\d{6}$/.test(s) ||
    /^\/opt\/few-few\/releases\/\d{8}-\d{6}$/.test(s) ||
    /^\/root\/[\w.-]+\.(zip|tar\.gz|tgz)$/i.test(s);
  if (!ok) throw Object.assign(new Error(`Пътят не е в позволените: ${s.slice(0, 80)}`), { status: 400 });
  return s;
}

export function reclaimSpec(id, item, cfg) {
  switch (id) {
    case 'coredumps':
      return {
        title: 'Трия дъмповете от сривове',
        shell: `find ${COREDUMP_DIR} -mindepth 1 -maxdepth 1 -type f -print -delete | tail -30`,
        exclusive: 'system',
        timeoutMs: 5 * 60 * 1000,
      };

    case 'pkg-caches': {
      // Само ТОЧНИТЕ пътища от затворения списък — нищо, дошло отвън.
      const paths = (item?.paths || []).filter((p) => CACHE_DIRS.includes(p));
      if (!paths.length) throw Object.assign(new Error('Няма какво да се чисти.'), { status: 400 });
      return { title: 'Чистя кешовете на пакетните мениджъри', cmd: 'rm', args: ['-rf', '--', ...paths], exclusive: 'system', timeoutMs: 10 * 60 * 1000 };
    }

    case 'restore-previews': {
      const paths = (item?.paths || []).filter((p) => /^\/var\/lib\/vps-dashboard\/restore\/[\w.-]+$/.test(p) && !p.includes('..'));
      if (!paths.length) throw Object.assign(new Error('Няма какво да се чисти.'), { status: 400 });
      return { title: 'Трия разопакованите прегледи', cmd: 'rm', args: ['-f', '--', ...paths], exclusive: 'system', timeoutMs: 5 * 60 * 1000 };
    }

    case 'editor-backups': {
      const paths = (item?.paths || []).filter(isEditorBackup);
      if (!paths.length) throw Object.assign(new Error('Няма какво да се чисти.'), { status: 400 });
      // cmd + масив, не shell: пътят е произволен файл на машината.
      return { title: 'Трия старите копия от редактора', cmd: 'rm', args: ['-f', '--', ...paths], exclusive: 'system', timeoutMs: 5 * 60 * 1000 };
    }

    case 'old-snaps': {
      const revs = (item?.revs || []).filter((r) => SNAP_NAME_RX.test(r?.name) && /^\d{1,10}$/.test(String(r?.rev)));
      if (!revs.length) throw Object.assign(new Error('Няма какво да се чисти.'), { status: 400 });
      return {
        title: 'Махам старите ревизии на snap',
        // Имената и ревизиите са минали през шаблоните горе — само букви, цифри, тире.
        shell: revs.map((r) => `snap remove ${r.name} --revision=${r.rev}`).join(' && ') + ' && echo "✔ Готово"',
        exclusive: 'system',
        timeoutMs: 15 * 60 * 1000,
      };
    }

    case 'file-trash': {
      const dir = trashDir(cfg);
      if (!/^\/[\w.\/-]+-trash$/.test(dir)) throw Object.assign(new Error('Невалиден път на кошчето.'), { status: 400 });
      return {
        title: 'Изпразвам кошчето на файловия мениджър',
        shell: `find ${dir} -mindepth 1 -maxdepth 1 -print -exec rm -rf -- {} + | tail -30`,
        exclusive: 'system',
        timeoutMs: 15 * 60 * 1000,
      };
    }

    case 'apt-cache':
      return {
        title: 'Чистя кеша на apt',
        cmd: 'apt-get',
        args: ['clean'],
        exclusive: 'system',
        timeoutMs: 5 * 60 * 1000,
      };

    case 'rotated-logs':
      return {
        title: 'Трия ротираните логове',
        // `-delete` на find, ограничено до /var/log и до архивните имена. Живият
        // лог няма как да съвпадне с шаблоните.
        shell:
          `find /var/log -type f \\( -name '*.gz' -o -name '*.xz' -o -name '*.[0-9]' -o -name '*.old' \\) -print -delete | tail -50`,
        exclusive: 'system',
        timeoutMs: 5 * 60 * 1000,
      };

    case 'crash-dumps':
      return {
        title: 'Трия отчетите от сривове',
        shell: `find /var/crash -mindepth 1 -maxdepth 1 -print -exec rm -rf {} + | tail -30`,
        exclusive: 'system',
        timeoutMs: 5 * 60 * 1000,
      };

    case 'build-cache':
      return {
        title: 'Чистя Docker build cache',
        cmd: 'docker',
        // `-a` е уместно ТУК (и само тук): кешът е производен, най-лошото е
        // по-бавен следващ билд. Показаното число идва от `docker system df`,
        // затова командата трябва да освобождава СЪЩОТО — иначе панелът обещава
        // повече, отколкото прави.
        args: ['builder', 'prune', '-af'],
        exclusive: 'docker',
        timeoutMs: 15 * 60 * 1000,
      };

    case 'dangling-images':
      return {
        title: 'Махам висящите Docker образи',
        cmd: 'docker',
        // `image prune` БЕЗ `-a`: само нетагнати слоеве. С `-a` би махнал всеки
        // образ без ЖИВ контейнер — включително този, с който вдигаш продукта
        // след рестарт.
        args: ['image', 'prune', '-f'],
        exclusive: 'docker',
        timeoutMs: 10 * 60 * 1000,
      };

    case 'deploy-backups':
    case 'old-releases':
    case 'uploaded-archives': {
      const paths = (item?.paths || []).map(assertSafePath);
      if (!paths.length) throw Object.assign(new Error('Няма какво да се чисти.'), { status: 400 });
      const quoted = paths.map((p) => JSON.stringify(p)).join(' ');
      return {
        title: `Освобождавам: ${{ 'deploy-backups': 'копия от деплоя', 'old-releases': 'стари releases', 'uploaded-archives': 'стари архиви' }[id]}`,
        shell: `du -shx ${quoted} 2>/dev/null; rm -rf ${quoted} && echo "✔ Готово"`,
        exclusive: 'system',
        timeoutMs: 10 * 60 * 1000,
      };
    }

    default:
      throw Object.assign(new Error(`Непозната категория: ${String(id).slice(0, 40)}`), { status: 400 });
  }
}

export { assertSafePath };
