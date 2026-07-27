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
import { run } from './exec.js';
import { DUMP_DIR } from './databases.js';
import { assertDockerName } from './docker.js';

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
    `echo "▸ ${worth.length} тома/папки за архивиране…"`,
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
    title: `Архив на ${worth.length} тома/папки`,
    cmd: 'bash',
    args: ['-c', lines.join('\n')],
    exclusive: 'backup',
    timeoutMs: 60 * 60 * 1000,
  };
}
