// Бекъпи — вече не само изброяване: панелът реално ПУСКА снимки и проверката на
// restic хранилището (tools/vps/backup-verify.sh от текущия release).
//
// Правилото на VPS-аджията: бекъп ≠ restore-tested. Затова „провери“ е отделно
// действие (restic check + пробно възстановяване), не просто „бекъпът мина“.
import fs from 'node:fs';
import path from 'node:path';
import { DUMP_DIR } from './databases.js';

export function listDumps() {
  try {
    return fs
      .readdirSync(DUMP_DIR)
      .map((name) => {
        const st = fs.statSync(path.join(DUMP_DIR, name));
        return { name, sizeBytes: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
      .slice(0, 100);
  } catch {
    return [];
  }
}

// Снимка на ВСИЧКИ намерени бази с едно действие (SQLite + Postgres в Docker).
// Пише в DUMP_DIR, компресира и чисти по-стари от 30 дни.
export function backupAllSpec() {
  const script = [
    'set -uo pipefail',
    `mkdir -p ${DUMP_DIR}`,
    'TS=$(date +%Y%m%d-%H%M%S)',
    'rc=0',
    'echo "▸ SQLite бази…"',
    'for db in /opt/medqr/data/medqr.sqlite /opt/vizitka/data/vizitka.db /opt/nexus/state/data/nexus.db; do',
    '  [ -f "$db" ] || continue',
    '  name=$(basename "$db" | tr -c "A-Za-z0-9._-" "_")',
    `  out="${DUMP_DIR}/\${name}-\${TS}.sqlite"`,
    '  if sqlite3 "$db" ".backup \'$out\'" && gzip -f "$out"; then echo "  ✔ $db"; else echo "  ✘ $db"; rc=1; fi',
    'done',
    'echo "▸ PostgreSQL в Docker…"',
    'if command -v docker >/dev/null; then',
    '  for c in $(docker ps --filter "ancestor=postgres" --format "{{.Names}}"; docker ps --format "{{.Names}} {{.Image}}" | awk "/postgres|pgvector/ {print \\$1}"); do',
    '    for d in $(docker exec "$c" psql -U postgres -At -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> \'postgres\';" 2>/dev/null); do',
    `      out="${DUMP_DIR}/\${d}-\${TS}.sql.gz"`,
    '      if docker exec "$c" pg_dump -U postgres -d "$d" 2>/dev/null | gzip > "$out" && [ -s "$out" ]; then echo "  ✔ $c/$d"; else echo "  ✘ $c/$d"; rm -f "$out"; rc=1; fi',
    '    done',
    '  done',
    'else echo "  (няма docker — пропускам)"; fi',
    `echo "▸ Чистя снимки по-стари от 30 дни…"`,
    `find ${DUMP_DIR} -type f -mtime +30 -delete 2>/dev/null || true`,
    `ls -lh ${DUMP_DIR} | tail -20`,
    'exit $rc',
  ].join('\n');
  return {
    title: 'Снимка на всички бази',
    shell: script,
    exclusive: 'backup',
    timeoutMs: 2 * 60 * 60 * 1000,
  };
}

// restic през нашия скрипт от репото (ако е в текущия release + има конфиг).
export function resticSpec(cfg, mode) {
  if (mode !== 'backup' && mode !== 'verify') {
    throw Object.assign(new Error('Невалиден режим'), { status: 400 });
  }
  const script = path.join(cfg.paths.currentLink, 'tools', 'vps', 'backup-verify.sh');
  if (!fs.existsSync(script)) {
    throw Object.assign(new Error('Няма tools/vps/backup-verify.sh в текущия release'), { status: 400 });
  }
  // RESTIC_REPOSITORY/RESTIC_PASSWORD живеят в /etc/vps-dashboard/restic.env (mode 600)
  // — тайните никога не минават през браузъра.
  const envFile = '/etc/vps-dashboard/restic.env';
  if (!fs.existsSync(envFile)) {
    throw Object.assign(
      new Error(`Липсва ${envFile} — сложи там RESTIC_REPOSITORY и RESTIC_PASSWORD (mode 600).`),
      { status: 400 }
    );
  }
  return {
    title: mode === 'backup' ? 'restic бекъп' : 'restic проверка (check + пробно възстановяване)',
    shell: `set -a; . ${envFile}; set +a; bash ${script} ${mode}`,
    exclusive: 'backup',
    timeoutMs: 4 * 60 * 60 * 1000,
  };
}

export function resticConfigured() {
  return fs.existsSync('/etc/vps-dashboard/restic.env');
}
