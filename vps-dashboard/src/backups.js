// Бекъпи — вече не само изброяване: панелът реално ПУСКА снимки и проверката на
// restic хранилището (tools/vps/backup-verify.sh от текущия release).
//
// Правилото на VPS-аджията: бекъп ≠ restore-tested. Затова „провери“ е отделно
// действие (restic check + пробно възстановяване), не просто „бекъпът мина“.
import fs from 'node:fs';
import path from 'node:path';
import { DUMP_DIR } from './databases.js';

// САМО дъмпове на бази. Архивите на томове (`vol-*`/`dir-*`) живеят в същата
// папка, но не са снимки на база: ако попаднат тук, „най-новият бекъп" става
// tar.gz, `assertDumpName` го отхвърля и планираната проба се проваля ВЕЧНО с
// критична аларма. Освен това един том-архив „подмладява" бекъпа на базата и
// гаси алармата за остарял дъмп — точно обратното на смисъла ѝ.
export function listDumps() {
  try {
    return fs
      .readdirSync(DUMP_DIR)
      .filter((name) => DUMP_RX.test(name))
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
        // `--clean --if-exists` е в самия дъмп, не при възстановяването: без него
    // връщането в НЕПРАЗНА база дава „relation already exists" на всеки CREATE,
    // а COPY след това налива в СТАРИТЕ таблици. Резултатът е слята база, която
    // изглежда като успешно възстановяване. Дъмпът трябва да носи почистването си.
    '  for c in $(docker ps --filter "ancestor=postgres" --format "{{.Names}}"; docker ps --format "{{.Names}} {{.Image}}" | awk "/postgres|pgvector/ {print \\$1}"); do',
    '    for d in $(docker exec "$c" psql -U postgres -At -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> \'postgres\';" 2>/dev/null); do',
    `      out="${DUMP_DIR}/\${d}-\${TS}.sql.gz"`,
    '      if docker exec "$c" pg_dump -U postgres --clean --if-exists -d "$d" 2>/dev/null | gzip > "$out" && [ -s "$out" ]; then echo "  ✔ $c/$d"; else echo "  ✘ $c/$d"; rm -f "$out"; rc=1; fi',
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

// ── Възстановяване ────────────────────────────────────────────────────────────
// Бекъп, който не можеш да върнеш, не е бекъп. Но възстановяването е най-опасната
// операция в целия панел, затова е на ДВЕ СТЪПКИ:
//   1) „преглед" — разархивира в /tmp и показва какво има вътре (нищо не се пипа);
//   2) „приложи" — прави снимка на ТЕКУЩОТО състояние, после презаписва.
// Никога не се възстановява директно върху жива база без стъпка 1.
const DUMP_RX = /^[\w.-]+\.(sqlite|sql)\.gz$/;
export const RESTORE_PREVIEW_DIR = '/tmp/vps-dashboard-restore';

// Името на unit-а влиза в shell ред — затова минава през същия строг allowlist
// като навсякъде другаде, а не „вероятно е наред".
export function assertRestoreUnit(unit) {
  const s = String(unit || '').trim();
  if (!s) return null;
  if (!/^[a-zA-Z0-9@._-]{1,100}\.(service|socket)$/.test(s)) {
    throw Object.assign(new Error('Невалидно име на услуга'), { status: 400 });
  }
  if (s.startsWith('-')) throw Object.assign(new Error('Невалидно име на услуга'), { status: 400 });
  return s;
}

export function assertDumpName(name) {
  const base = path.basename(String(name || ''));
  if (!DUMP_RX.test(base)) throw Object.assign(new Error('Невалидно име на снимка'), { status: 400 });
  const full = path.join(DUMP_DIR, base);
  if (!fs.existsSync(full)) throw Object.assign(new Error('Няма такава снимка'), { status: 400 });
  return { base, full };
}

// Стъпка 1: разопакова в /tmp и описва съдържанието. Нищо живо не се докосва.
export function restorePreviewSpec(name) {
  const { base, full } = assertDumpName(name);
  const isSqlite = base.endsWith('.sqlite.gz');
  const out = `${RESTORE_PREVIEW_DIR}/${base.replace(/\.gz$/, '')}`;
  const describe = isSqlite
    ? `sqlite3 "${out}" "PRAGMA integrity_check;" && echo "--- таблици ---" && sqlite3 "${out}" ".tables" && echo "--- брой редове ---" && sqlite3 "${out}" "SELECT name FROM sqlite_master WHERE type='table';" | while read t; do printf '%s: ' "$t"; sqlite3 "${out}" "SELECT COUNT(*) FROM \\"$t\\";"; done`
    : `echo "--- първите 40 реда от дъмпа ---" && head -40 "${out}" && echo "--- размер ---" && wc -l "${out}"`;
  return {
    title: `Преглед на снимка · ${base}`,
    shell: [
      `set -euo pipefail`,
      `mkdir -p ${RESTORE_PREVIEW_DIR}`,
      `rm -f "${out}"`,
      `gzip -dc "${full}" > "${out}"`,
      `echo "Разопаковано в ${out}"`,
      `ls -lh "${out}"`,
      describe,
      `echo`,
      `echo "НИЩО ЖИВО НЕ Е ПРОМЕНЕНО. Ако това е снимката, която искаш, натисни „Приложи"."`,
    ].join('\n'),
    exclusive: 'backup',
    timeoutMs: 30 * 60 * 1000,
  };
}

// Стъпка 2: прилага върху целта. ВИНАГИ прави снимка на текущото състояние преди
// това — възстановяването на грешна снимка иначе е необратимо.
export function restoreApplySpec(name, target) {
  const { base } = assertDumpName(name);
  const isSqlite = base.endsWith('.sqlite.gz');
  const src = `${RESTORE_PREVIEW_DIR}/${base.replace(/\.gz$/, '')}`;
  const stamp = 'предВъзстановяване-$(date +%Y%m%d-%H%M%S)';

  if (isSqlite) {
    // Целта е или гол път (стар вид), или { path, unit } — второто позволява да
    // спрем услугата около презаписа.
    const rawPath = target && typeof target === 'object' ? target.path : target;
    const dst = path.resolve(String(rawPath || ''));
    if (!/\.(db|sqlite3?)$/.test(dst)) {
      throw Object.assign(new Error('Целта не е SQLite файл'), { status: 400 });
    }
    if (!/^[\w./@ +-]+$/.test(dst)) {
      throw Object.assign(new Error('Пътят съдържа непозволени знаци'), { status: 400 });
    }
    // Услугата, която държи базата. По избор, но силно препоръчана: без нея
    // презаписът става ПОД жив процес.
    const unit = target && typeof target === 'object' ? assertRestoreUnit(target.unit) : null;
    return {
      title: `ВЪЗСТАНОВЯВАНЕ · ${base} → ${dst}`,
      shell: [
        `set -euo pipefail`,
        `[ -f "${src}" ] || { echo "Първо направи преглед — няма разопакован файл."; exit 1; }`,
        `echo "▸ Проверявам снимката ПРЕДИ да пипна каквото и да е…"`,
        // Проверката е първа: няма смисъл да спираш продукция заради счупен файл.
        `sqlite3 "${src}" "PRAGMA integrity_check;" | grep -qx ok || { echo "Снимката е повредена — СПИРАМ."; exit 1; }`,
        // Собственикът и правата се четат ПРЕДИ презаписа. `cp` като root иначе
        // оставя root-owned файл, услугата под собствен потребител го отваря
        // само за четене и пада с „attempt to write a readonly database" —
        // възстановяване, което „мина", но продуктът не тръгва.
        `OWNER=""; MODE=""`,
        `if [ -f "${dst}" ]; then OWNER=$(stat -c '%u:%g' "${dst}"); MODE=$(stat -c '%a' "${dst}"); fi`,
        unit
          ? [
              `echo "▸ Спирам ${unit} — презапис под жив процес е повреда, не възстановяване…"`,
              `systemctl stop ${unit}`,
              // Дори след stop SQLite може да е оставил WAL — изчакваме файловете.
              `sleep 1`,
            ].join('\n')
          : `echo "⚠ Без спряна услуга: ако нещо държи базата отворена, резултатът е неопределен."`,
        `echo "▸ Снимка на ТЕКУЩОТО състояние преди презапис…"`,
        `mkdir -p ${DUMP_DIR}`,
        `[ -f "${dst}" ] && sqlite3 "${dst}" ".backup '${DUMP_DIR}/${stamp}.sqlite'" && gzip -f "${DUMP_DIR}/${stamp}.sqlite" || echo "(няма текущ файл)"`,
        `echo "▸ Възстановявам…"`,
        `cp "${src}" "${dst}"`,
        // Най-коварното: WAL и SHM от СТАРАТА база остават до новия главен файл.
        // SQLite ги приема за свои, „възпроизвежда" ги отгоре и получаваш смес от
        // две бази — или отказ да отвори. Възстановената база е самодостатъчна;
        // тези два файла трябва да ги няма.
        `rm -f "${dst}-wal" "${dst}-shm"`,
        `[ -n "$OWNER" ] && chown "$OWNER" "${dst}" || true`,
        `[ -n "$MODE" ] && chmod "$MODE" "${dst}" || true`,
        `sqlite3 "${dst}" "PRAGMA integrity_check;"`,
        // Пускането не бива да маркира ЦЯЛОТО възстановяване като провалено —
        // данните вече са върнати. Провалът се КАЗВА, изходът остава 0.
        unit
          ? `echo "▸ Пускам ${unit}…"\nsystemctl start ${unit} || echo "⚠ Стартът се провали"\nsystemctl is-active ${unit} || echo "⚠ Услугата не е active — виж: journalctl -u ${unit} -n 50"`
          : `echo "✔ Рестартирай услугата, която ползва тази база."`,
        `echo "✔ Готово."`,
      ].join('\n'),
      exclusive: 'backup',
      timeoutMs: 60 * 60 * 1000,
    };
  }

  // Postgres: целта е контейнер + база.
  const { container, database } = target || {};
  if (!/^[\w.-]{1,64}$/.test(String(container || ''))) {
    throw Object.assign(new Error('Невалиден контейнер'), { status: 400 });
  }
  if (!/^[\w-]{1,63}$/.test(String(database || ''))) {
    throw Object.assign(new Error('Невалидно име на база'), { status: 400 });
  }
  return {
    title: `ВЪЗСТАНОВЯВАНЕ · ${base} → ${container}/${database}`,
    shell: [
      `set -euo pipefail`,
      `[ -f "${src}" ] || { echo "Първо направи преглед — няма разопакован файл."; exit 1; }`,
      `echo "▸ Снимка на ТЕКУЩОТО състояние преди презапис…"`,
      `mkdir -p ${DUMP_DIR}`,
      `docker exec ${container} pg_dump -U postgres --clean --if-exists -d ${database} | gzip > "${DUMP_DIR}/${database}-${stamp}.sql.gz"`,
      // Празна „защитна" снимка е по-лоша от липсваща: тя дава увереност да
      // натиснеш „Приложи", а после няма към какво да се върнеш.
      `[ -s "${DUMP_DIR}/${database}-${stamp}.sql.gz" ] || { echo "Защитната снимка е празна — СПИРАМ преди да пипна базата."; exit 1; }`,
      `echo "▸ Възстановявам (psql)…"`,
      // Двете флагчета са разликата между възстановяване и мълчаливо
      // полувъзстановяване:
      //   ON_ERROR_STOP=1 — по подразбиране psql ПРОДЪЛЖАВА след грешка и излиза
      //     с код 0. Половин върната база рапортува „✔ Готово".
      //   --single-transaction — всичко или нищо. Без него провалът по средата
      //     оставя базата в състояние, което не е нито старото, нито новото.
      `cat "${src}" | docker exec -i ${container} psql -U postgres -v ON_ERROR_STOP=1 --single-transaction -d ${database}`,
      `echo "✔ Готово. Рестартирай приложението, което ползва тази база."`,
    ].join('\n'),
    exclusive: 'backup',
    timeoutMs: 60 * 60 * 1000,
  };
}
