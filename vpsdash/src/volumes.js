// Бекъп на Docker volumes и bind-mount папки — качените файлове.
//
// Дупката, която това затваря, е коварна, защото бекъпът изглежда пълен:
// `pg_dump` хваща базата, но записът в нея сочи към файл в том `uploads`, който
// НЕ се архивира никъде. При възстановяване получаваш цели данни и счупени
// препратки — снимките, документите и качванията просто ги няма.
//
// Три решения, които правят разликата между „архивирано" и „възстановимо":
//
//  1. **Базите се пропускат.** Суров tar на жива Postgres/MySQL папка дава
//     непоследователна снимка (страници отпреди и след запис). За тях вече има
//     логически дъмп; тук ги изключваме нарочно, вместо да дадем фалшива
//     сигурност.
//  2. **Само томове, ползвани от контейнер.** `docker volume ls` показва и
//     сираци от изтрити стекове — архивирането им е чист разход.
//  3. **Архивира се през контейнер, не отвън.** Пътят на тома
//     (`/var/lib/docker/volumes/...`) е вътрешна подробност на Docker и се мени
//     между драйвери. `docker run -v <том>:/src:ro` работи винаги.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { run } from './exec.js';
import { DUMP_DIR } from './databases.js';
import { assertDockerName } from './docker.js';
import { plural } from './text.js';

// Томове, чието СЪДЪРЖАНИЕ не бива да се архивира суров tar — за тях има
// логически дъмп, който е последователен.
const DB_IMAGE_RX = /postgres|pgvector|mysql|mariadb|mongo|clickhouse|elasticsearch/i;

// Име на архив от път. Нормализирането е загубено — „/opt/app/uploads" и
// „/opt/app_uploads" дават еднакъв низ — затова носи и къс хеш от ПЪЛНИЯ път.
// Без него при групов архив вторият източник тихо презаписва първия.
export function archiveName(src) {
  const base = String(src).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'bind';
  const h = crypto.createHash('sha256').update(String(src)).digest('hex').slice(0, 6);
  return `${base}-${h}`;
}

export function assertVolume(name) {
  return assertDockerName(name, 'том');
}

// Кои томове/bind-mount-ове се ползват от кои контейнери и струват ли архив.
export async function discover() {
  const ps = await run('docker', ['ps', '--format', '{{.Names}}\t{{.Image}}'], { timeout: 10000 });
  if (!ps.ok) return { available: false, error: (ps.stderr || 'docker недостъпен').trim().slice(0, 200), items: [] };

  const containers = ps.stdout
    .split('\n')
    .map((l) => l.split('\t'))
    .filter(([n]) => n)
    .map(([name, image]) => ({ name, image }));

  const items = new Map();
  for (const c of containers.slice(0, 100)) {
    const r = await run(
      'docker',
      ['inspect', '-f', '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}}|{{.RW}}\n{{end}}', c.name],
      { timeout: 10000 }
    );
    if (!r.ok) continue;
    for (const line of r.stdout.split('\n')) {
      if (!line.trim()) continue;
      const [type, name, source, dest, rw] = line.split('|');
      if (type !== 'volume' && type !== 'bind') continue;
      if (rw === 'false') continue; // само за четене → няма данни за пазене
      // Сокети и конфигурации, монтирани отвън, не са данни.
      if (/^\/(etc|proc|sys|dev|run|var\/run)\//.test(source || '')) continue;
      if (/\.(sock|conf|yml|yaml|json)$/.test(source || '')) continue;
      const id = type === 'volume' ? `volume:${name}` : `bind:${source}`;
      const prev = items.get(id) || {
        type,
        name: type === 'volume' ? name : null,
        source: source || null,
        containers: [],
        mountPoints: [],
        isDatabase: false,
      };
      prev.containers.push(c.name);
      prev.mountPoints.push(dest);
      if (DB_IMAGE_RX.test(c.image || '')) prev.isDatabase = true;
      items.set(id, prev);
    }
  }

  // Размерите: за томове през `docker system df -v`, за bind — през du.
  const sizes = await volumeSizes();
  const out = [...items.values()].map((it) => ({
    ...it,
    id: it.type === 'volume' ? `volume:${it.name}` : `bind:${it.source}`,
    sizeBytes: it.type === 'volume' ? (sizes.get(it.name) ?? null) : null,
    // Причината да се пропусне се ПОКАЗВА — иначе изглежда като пропуск.
    skip: it.isDatabase ? 'база (има логически дъмп — суров tar би бил непоследователен)' : null,
  }));
  return { available: true, items: out.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0)) };
}

async function volumeSizes() {
  const map = new Map();
  const r = await run('docker', ['system', 'df', '-v', '--format', '{{json .Volumes}}'], { timeout: 20000 });
  if (!r.ok) return map;
  try {
    for (const v of JSON.parse(r.stdout.trim() || '[]')) {
      const bytes = parseSize(v.Size);
      if (v.Name && bytes != null) map.set(v.Name, bytes);
    }
  } catch {
    /* стар docker без JSON изход */
  }
  return map;
}

export function parseSize(s) {
  const m = /^([\d.]+)\s*([A-Za-z]*)$/.exec(String(s || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || 'B').toUpperCase();
  const mult = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4 };
  return mult[unit] != null ? Math.round(n * mult[unit]) : null;
}

// Архивира ЕДИН том или bind папка. Пуска се като фонова задача.
export function volumeBackupSpec(item) {
  const stamp = 'TS';
  if (item.type === 'volume') {
    const name = assertVolume(item.name);
    return {
      title: `Архив на том: ${name}`,
      cmd: 'bash',
      args: [
        '-c',
        [
          'set -euo pipefail',
          `mkdir -p ${DUMP_DIR}`,
          `${stamp}=$(date +%Y%m%d-%H%M%S)`,
          // busybox tar е в alpine — нула допълнителни зависимости на хоста.
          `docker run --rm -v ${name}:/src:ro -v ${DUMP_DIR}:/out alpine ` +
            `tar czf /out/vol-${name}-$${stamp}.tar.gz -C /src .`,
          `ls -lh ${DUMP_DIR}/vol-${name}-$${stamp}.tar.gz`,
        ].join('\n'),
      ],
      exclusive: 'backup',
      timeoutMs: 30 * 60 * 1000,
    };
  }
  const src = String(item.source || '');
  if (!src.startsWith('/') || src.includes('\0') || /[`$;&|<>"'\\]/.test(src)) {
    throw Object.assign(new Error('Невалиден път за архивиране'), { status: 400 });
  }
  const safeName = archiveName(src);
  return {
    title: `Архив на папка: ${src}`,
    cmd: 'bash',
    args: [
      '-c',
      [
        'set -euo pipefail',
        `mkdir -p ${DUMP_DIR}`,
        `${stamp}=$(date +%Y%m%d-%H%M%S)`,
        `tar czf ${DUMP_DIR}/dir-${safeName}-$${stamp}.tar.gz -C ${JSON.stringify(src)} .`,
        `ls -lh ${DUMP_DIR}/dir-${safeName}-$${stamp}.tar.gz`,
      ].join('\n'),
    ],
    exclusive: 'backup',
    timeoutMs: 30 * 60 * 1000,
  };
}

// Всичко, което си струва — с една задача. Базите се пропускат ИЗРИЧНО и се
// казва защо, вместо да изчезнат мълчаливо от изхода.
export function backupAllVolumesSpec(items) {
  const worth = (items || []).filter((i) => !i.skip);
  if (!worth.length) {
    throw Object.assign(new Error('Няма томове за архивиране (или всички са бази с логически дъмп).'), { status: 400 });
  }
  const lines = [
    'set -uo pipefail',
    `mkdir -p ${DUMP_DIR}`,
    'TS=$(date +%Y%m%d-%H%M%S)',
    'rc=0',
    `echo "▸ ${plural(worth.length, 'том', 'тома')}/папки за архивиране…"`,
  ];
  for (const i of worth) {
    if (i.type === 'volume') {
      const name = assertVolume(i.name);
      lines.push(
        `echo "  · том ${name}"`,
        `if docker run --rm -v ${name}:/src:ro -v ${DUMP_DIR}:/out alpine tar czf /out/vol-${name}-$TS.tar.gz -C /src . ` +
          `&& [ -s ${DUMP_DIR}/vol-${name}-$TS.tar.gz ]; then echo "    ✔"; else echo "    ✘"; rc=1; fi`
      );
    } else {
      const src = String(i.source || '');
      if (!src.startsWith('/') || /[`$;&|<>"'\\]/.test(src)) continue;
      const safeName = archiveName(src);
      lines.push(
        `echo "  · папка ${src}"`,
        `if tar czf ${DUMP_DIR}/dir-${safeName}-$TS.tar.gz -C ${JSON.stringify(src)} . ` +
          `&& [ -s ${DUMP_DIR}/dir-${safeName}-$TS.tar.gz ]; then echo "    ✔"; else echo "    ✘"; rc=1; fi`
      );
    }
  }
  const skipped = (items || []).filter((i) => i.skip);
  if (skipped.length) {
    lines.push(`echo "▸ Пропуснати (логически дъмп ги покрива): ${skipped.map((s) => s.name || s.source).join(', ')}"`);
  }
  lines.push(`ls -lh ${DUMP_DIR} | tail -20`, 'exit $rc');
  return {
    title: `Архив на ${plural(worth.length, 'том', 'тома')}/папки`,
    cmd: 'bash',
    args: ['-c', lines.join('\n')],
    exclusive: 'backup',
    timeoutMs: 60 * 60 * 1000,
  };
}

// ── Възстановяване ────────────────────────────────────────────────────────────
// Бекъп, който не можеш да върнеш, не е бекъп — правилото, което роди пробата за
// възстановяване на дъмповете, важи и тук. До момента томовете се архивираха, но
// връщането им беше „SSH и се оправяй".
//
// Три решения, взети от урока със SQLite (WAL/SHM миксът от две бази):
//
//  1. **Първо се ИЗПРАЗВА, после се разархивира.** tar върху непразен том оставя
//     файловете, създадени СЛЕД снимката — смес от две състояния, която изглежда
//     като успех. `find /dst -mindepth 1 -delete` преди extract е задължителен.
//  2. **Защитна снимка на ТЕКУЩОТО състояние преди всичко друго.** Ако тя не
//     стане, не се пипа нищо. При провал на разархивирането откатът връща точно
//     нея — в СЪЩИЯ процес, не „ако някой гледа".
//  3. **Контейнерите, ползващи тома, се спират и рестартът им е в trap.** Запис
//     под жив процес е повреда; а „спрях ги и забравих да ги пусна" е инцидент,
//     който trap EXIT прави невъзможен — включително по пътя на провала.
//
// За bind папки има четвърто: целта идва от заявката, но се ДОКАЗВА — краткият
// хеш от пълния път е в името на архива, значи `archiveName(цел)` трябва да
// съвпадне. Иначе архив на uploads се излива върху грешния продукт.
const RESTORABLE_RX = /^(pre-restore-)?(vol|dir)-[\w.-]+-\d{8}-\d{6}\.tar\.gz$/;

export function parseArchiveName(name) {
  const base = String(name || '');
  if (base.includes('/') || base.includes('\\') || base.includes('\0') || !RESTORABLE_RX.test(base)) {
    throw Object.assign(new Error('Невалидно име на архив на том'), { status: 400 });
  }
  let m = /^(?:pre-restore-)?vol-(.+)-\d{8}-\d{6}\.tar\.gz$/.exec(base);
  if (m) return { name: base, kind: 'volume', volume: assertVolume(m[1]) };
  m = /^(?:pre-restore-)?dir-(.+-[0-9a-f]{6})-\d{8}-\d{6}\.tar\.gz$/.exec(base);
  if (m) return { name: base, kind: 'dir', safeName: m[1] };
  throw Object.assign(new Error('Невалидно име на архив на том'), { status: 400 });
}

export function listVolumeArchives() {
  let names = [];
  try {
    names = fs.readdirSync(DUMP_DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    let parsed;
    try {
      parsed = parseArchiveName(n);
    } catch {
      continue;
    }
    try {
      const st = fs.statSync(`${DUMP_DIR}/${n}`);
      out.push({ ...parsed, sizeBytes: st.size, mtime: st.mtime.toISOString(), preRestore: n.startsWith('pre-restore-') });
    } catch {
      /* изчезнал файл */
    }
  }
  return out.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

// Пътят на bind целта: абсолютен, без опасни знаци, поне 2 нива дълбочина —
// `find <цел> -mindepth 1 -delete` върху „/" или „/opt" не бива да е изразимо.
export function assertRestoreDir(p) {
  const src = String(p || '');
  if (!src.startsWith('/') || src.includes('\0') || /[`$;&|<>"'\\\s]/.test(src) || src.includes('..')) {
    throw Object.assign(new Error('Невалиден път за възстановяване'), { status: 400 });
  }
  const depth = src.split('/').filter(Boolean).length;
  if (depth < 2) {
    throw Object.assign(new Error(`Пътят „${src}" е твърде плитък — възстановяване върху него би изтрило половината машина.`), { status: 400 });
  }
  return src;
}

// Стъпка 1: преглед — какво има вътре, НИЩО не се пипа.
export function volumeRestorePreviewSpec(name) {
  const parsed = parseArchiveName(name);
  const archive = `${DUMP_DIR}/${parsed.name}`;
  return {
    title: `Преглед на архив: ${parsed.name}`,
    cmd: 'bash',
    args: [
      '-c',
      [
        'set -uo pipefail',
        `[ -s ${JSON.stringify(archive)} ] || { echo "✘ архивът липсва или е празен"; exit 1; }`,
        `echo "▸ Съдържание (до 200 записа):"`,
        `tar tzf ${JSON.stringify(archive)} | head -200`,
        `echo "▸ Общо записи: $(tar tzf ${JSON.stringify(archive)} | wc -l)"`,
        parsed.kind === 'volume'
          ? `echo "▸ Целта би била том: ${parsed.volume}"`
          : `echo "▸ Целта е bind папка — при прилагане пътят се доказва по хеша в името (${parsed.safeName})."`,
      ].join('\n'),
    ],
    exclusive: null,
    timeoutMs: 5 * 60 * 1000,
  };
}

// Стъпка 2: прилагане — защитна снимка → спиране → изпразване → extract →
// при провал откат от снимката; рестартът на контейнерите е в trap EXIT.
export function volumeRestoreApplySpec(name, { target = null, containers = [] } = {}) {
  const parsed = parseArchiveName(name);
  const archive = `${DUMP_DIR}/${parsed.name}`;
  const stops = (containers || []).map((c) => assertDockerName(c, 'контейнер'));

  const lines = [
    'set -uo pipefail',
    `ARCHIVE=${JSON.stringify(archive)}`,
    '[ -s "$ARCHIVE" ] || { echo "✘ архивът липсва или е празен"; exit 1; }',
    'TS=$(date +%Y%m%d-%H%M%S)',
    'STOPPED=""',
    // Trap-ът е обявен ПРЕДИ първото спиране: пътят, по който контейнер остава
    // спрян завинаги, не бива да съществува.
    'restart_stopped() { for c in $STOPPED; do docker start "$c" >/dev/null 2>&1 && echo "  ▶ пуснат: $c"; done; }',
    'trap restart_stopped EXIT',
  ];

  let pre;
  let target_label;
  if (parsed.kind === 'volume') {
    const vol = parsed.volume;
    pre = `pre-restore-vol-${vol}-$TS.tar.gz`;
    target_label = `том ${vol}`;
    lines.push(
      `echo "▸ Защитна снимка на ТЕКУЩОТО състояние на том ${vol}"`,
      `docker run --rm -v ${vol}:/src:ro -v ${DUMP_DIR}:/out alpine tar czf /out/${pre} -C /src . ` +
        '|| { echo "✘ защитната снимка не стана — НЕ пипам нищо"; exit 1; }',
      ...stops.map((c) => `docker stop ${c} >/dev/null && STOPPED="$STOPPED ${c}" && echo "  ■ спрян: ${c}"`),
      `echo "▸ Изпразвам тома и разархивирам ${parsed.name}"`,
      // Изпразване + extract в ЕДИН контейнер: между двете няма прозорец, в
      // който някой да види полупразен том.
      `if docker run --rm -v ${vol}:/dst -v ${DUMP_DIR}:/in:ro alpine sh -c ` +
        `'find /dst -mindepth 1 -delete && tar xzf /in/${parsed.name} -C /dst'; then`,
      '  echo "✔ Върнато."',
      'else',
      '  echo "✘ Разархивирането се провали — връщам защитната снимка"',
      `  docker run --rm -v ${vol}:/dst -v ${DUMP_DIR}:/in:ro alpine sh -c ` +
        `"find /dst -mindepth 1 -delete && tar xzf /in/${pre} -C /dst" ` +
        `&& echo "↩ старото състояние е върнато" || echo "‼ И откатът се провали — старото състояние е в ${pre}"`,
      '  exit 1',
      'fi'
    );
  } else {
    const dst = assertRestoreDir(target);
    // Доказателството: хешът от пълния път е в името на архива. Несъвпадение
    // значи „този архив не е правен от тази папка" — отказ преди първия байт.
    if (archiveName(dst) !== parsed.safeName) {
      throw Object.assign(
        new Error(`Архивът „${parsed.name}" не е правен от „${dst}" — хешът в името не съвпада. Провери целта.`),
        { status: 400 }
      );
    }
    pre = `pre-restore-dir-${parsed.safeName}-$TS.tar.gz`;
    target_label = `папка ${dst}`;
    lines.push(
      `echo "▸ Защитна снимка на ТЕКУЩОТО състояние на ${dst}"`,
      `tar czf ${DUMP_DIR}/${pre} -C ${JSON.stringify(dst)} . || { echo "✘ защитната снимка не стана — НЕ пипам нищо"; exit 1; }`,
      ...stops.map((c) => `docker stop ${c} >/dev/null && STOPPED="$STOPPED ${c}" && echo "  ■ спрян: ${c}"`),
      `echo "▸ Изпразвам папката и разархивирам ${parsed.name}"`,
      `if find ${JSON.stringify(dst)} -mindepth 1 -delete && tar xzf "$ARCHIVE" -C ${JSON.stringify(dst)}; then`,
      '  echo "✔ Върнато."',
      'else',
      '  echo "✘ Разархивирането се провали — връщам защитната снимка"',
      `  find ${JSON.stringify(dst)} -mindepth 1 -delete; tar xzf ${DUMP_DIR}/${pre} -C ${JSON.stringify(dst)} ` +
        `&& echo "↩ старото състояние е върнато" || echo "‼ И откатът се провали — старото състояние е в ${pre}"`,
      '  exit 1',
      'fi'
    );
  }

  lines.push(`echo "ℹ Защитната снимка остава в ${DUMP_DIR}/${pre} — изтрий я, когато си сигурен."`);

  return {
    title: `Възстановяване на ${target_label} от ${parsed.name}`,
    cmd: 'bash',
    args: ['-c', lines.join('\n')],
    exclusive: 'backup',
    timeoutMs: 60 * 60 * 1000,
  };
}
