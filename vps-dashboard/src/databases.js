// Бази — откриване, размери, здраве и снимки (dump). Продуктите тук ползват
// SQLite (medqr, vizitka, CSPos, Nexus) и PostgreSQL в Docker (zabobovdol,
// supreme, eternaltouch, linketto).
//
// Всичко е САМО ЧЕТЕНЕ + dump. Никакво писане/DROP от панела — за заявки има
// терминал, а правилото на репото е read-only достъп до бази (skill db-readonly).
import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';

const SQLITE_SPOTS = [
  { product: 'medqr', file: '/opt/medqr/data/medqr.sqlite' },
  { product: 'vizitka', file: '/opt/vizitka/data/vizitka.db' },
  { product: 'nexus', file: '/opt/nexus/state/data/nexus.db' },
];

export async function databasesOverview() {
  return {
    sqlite: await sqliteOverview(),
    postgres: await postgresOverview(),
  };
}

async function sqliteOverview() {
  const out = [];
  const seen = new Set();
  const candidates = [...SQLITE_SPOTS];
  // Допълнително: всякакви .db/.sqlite в известните data папки.
  for (const dir of ['/opt/medqr/data', '/opt/vizitka/data', '/opt/nexus/state/data', '/opt/cspos/data']) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (/\.(db|sqlite3?)$/.test(f)) candidates.push({ product: path.basename(path.dirname(dir)), file: path.join(dir, f) });
      }
    } catch {
      /* няма такава папка на този VPS */
    }
  }
  for (const c of candidates) {
    if (seen.has(c.file)) continue;
    seen.add(c.file);
    let st;
    try {
      st = fs.statSync(c.file);
    } catch {
      continue;
    }
    // WAL файловете също заемат място — показваме сумата.
    let walBytes = 0;
    for (const suffix of ['-wal', '-shm']) {
      try {
        walBytes += fs.statSync(c.file + suffix).size;
      } catch {
        /* няма WAL */
      }
    }
    out.push({
      product: c.product,
      file: c.file,
      sizeBytes: st.size,
      walBytes,
      mtime: st.mtime.toISOString(),
    });
  }
  return out;
}

export async function sqliteCheck(file) {
  const f = assertSqlite(file);
  const [integrity, tables] = await Promise.all([
    run('sqlite3', [f, 'PRAGMA integrity_check;'], { timeout: 60000 }),
    run('sqlite3', [f, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"], { timeout: 20000 }),
  ]);
  return {
    file: f,
    integrity: integrity.ok ? integrity.stdout.trim() : integrity.stderr.trim() || 'sqlite3 недостъпен',
    ok: integrity.ok && /^ok$/im.test(integrity.stdout.trim()),
    tables: tables.ok ? tables.stdout.split('\n').filter(Boolean) : [],
  };
}

function assertSqlite(file) {
  const full = path.resolve(String(file || ''));
  if (!/\.(db|sqlite3?)$/.test(full)) throw Object.assign(new Error('Не е SQLite файл'), { status: 400 });
  if (!fs.existsSync(full)) throw Object.assign(new Error('Няма такъв файл'), { status: 400 });
  return full;
}

// Postgres обикновено върви в Docker контейнер — питаме през docker exec.
async function postgresOverview() {
  const ps = await run('docker', ['ps', '--format', '{{json .}}'], { timeout: 15000 });
  if (!ps.ok) return { available: false, instances: [] };
  const containers = ps.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((c) => c && /postgres|pgvector/i.test(c.Image || ''));

  const instances = [];
  for (const c of containers) {
    const sizes = await run(
      'docker',
      [
        'exec',
        c.ID,
        'psql',
        '-U',
        'postgres',
        '-At',
        '-F',
        '|',
        '-c',
        'SELECT datname, pg_database_size(datname), numbackends FROM pg_database JOIN pg_stat_database USING (datname) WHERE datistemplate = false ORDER BY 2 DESC;',
      ],
      { timeout: 20000 }
    );
    instances.push({
      container: c.Names,
      id: c.ID,
      image: c.Image,
      status: c.Status,
      reachable: sizes.ok,
      databases: sizes.ok
        ? sizes.stdout
            .split('\n')
            .filter(Boolean)
            .map((l) => {
              const [name, bytes, conns] = l.split('|');
              return { name, sizeBytes: Number(bytes) || 0, connections: Number(conns) || 0 };
            })
        : [],
      error: sizes.ok ? null : (sizes.stderr || '').trim().slice(0, 200),
    });
  }
  return { available: true, instances };
}

// ── Снимки (dump) ─────────────────────────────────────────────────────────────
export const DUMP_DIR = '/opt/few-few/shared/db-dumps';

export function sqliteDumpSpec(file) {
  const f = assertSqlite(file);
  const name = path.basename(f).replace(/\W+/g, '_');
  // .backup прави КОНСИСТЕНТНА снимка (не cp — заради WAL). Същият подход като autodeploy.sh.
  return {
    title: `SQLite снимка · ${path.basename(f)}`,
    shell: `mkdir -p ${DUMP_DIR} && out="${DUMP_DIR}/${name}-$(date +%Y%m%d-%H%M%S).sqlite" && sqlite3 "${f}" ".backup '$out'" && gzip -f "$out" && ls -lh "$out.gz"`,
    exclusive: 'backup',
    timeoutMs: 30 * 60 * 1000,
  };
}

export function postgresDumpSpec({ container, database }) {
  if (!/^[\w.-]{1,64}$/.test(String(container || ''))) {
    throw Object.assign(new Error('Невалиден контейнер'), { status: 400 });
  }
  if (!/^[\w-]{1,63}$/.test(String(database || ''))) {
    throw Object.assign(new Error('Невалидно име на база'), { status: 400 });
  }
  return {
    title: `pg_dump · ${database}`,
    shell: `mkdir -p ${DUMP_DIR} && out="${DUMP_DIR}/${database}-$(date +%Y%m%d-%H%M%S).sql.gz" && docker exec ${container} pg_dump -U postgres -d ${database} | gzip > "$out" && ls -lh "$out"`,
    exclusive: 'backup',
    timeoutMs: 60 * 60 * 1000,
  };
}
