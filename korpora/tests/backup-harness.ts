import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/paths.js';

/**
 * deploy/backup.sh and deploy/backup-restore.sh run for real (bash, real age) on a temporary folder.
 * Only `id` and `docker` are stubbed; `docker exec [-i] <id> pg_dump|pg_restore|psql …` runs what
 * DOCKER_EXEC says: `fake` (no database: PGDMP and DUMP_BYTES of filler) or `local` (the PostgreSQL tools
 * against PG* from the environment — the integration test's real restore). Like the real docker, `exec -i`
 * copies the script's stdin into the container whether the command reads it or not: what the command
 * leaves unread is lost (measured: hundreds of KiB), here the first 4096 bytes.
 */
export const HAS_AGE = spawnSync('age', ['--version']).status === 0;

const STUBS = `
id() { echo 0; }
docker() {
  echo "docker $*" >> "$LOG"
  local eat=0 rc=0
  case "$1" in
    ps)
      case "$*" in
        *service=db*) [ "$DB_RUNNING" = 1 ] && echo dbid ;;
        *service=app*) [ "$APP_RUNNING" = 1 ] && echo appid ;;
      esac
      return 0 ;;
    stop|start) return 0 ;;
    exec)
      shift
      if [ "$1" = -i ]; then eat=1 && shift; fi
      shift ;;
    *) return 0 ;;
  esac
  docker_run "$@" || rc=$?
  if [ "$eat" = 1 ]; then head -c 4096 >/dev/null; fi
  return "$rc"
}
docker_run() {
  if [ "$DOCKER_EXEC" = local ]; then "$@"; return; fi
  case "$1" in
    pg_dump)
      printf 'PGDMP'
      head -c "$DUMP_BYTES" /dev/zero | tr '\\0' 'x'
      return "$DUMP_RC" ;;
    pg_restore)
      # VERIFY_RC: refuses at once (not an archive); TRUNCATED_RC: reads it all, then fails (cut-off end)
      [ "$VERIFY_RC" = 0 ] || return "$VERIFY_RC"
      [ "$(head -c 5)" = PGDMP ] || return 1
      cat >/dev/null
      return "$TRUNCATED_RC" ;;
    psql)
      # '-f -' reads the SQL to the end; '-c' answers every count (and the last migration) with FAKE_COUNT
      case "$*" in
        *' -f -'*) cat >/dev/null ;;
        *) echo "$FAKE_COUNT" ;;
      esac ;;
  esac
}
`;

export interface Box {
  base: string;
  shared: string;
  daily: string;
  recipients: string;
  identity: string;
  log: string;
}

export interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function makeBox(): Box {
  const base = mkdtempSync(join(tmpdir(), 'korpora-backup-'));
  const shared = join(base, 'shared');
  const box: Box = {
    base,
    shared,
    daily: join(shared, 'backups', 'daily'),
    recipients: join(shared, 'backup-recipients.txt'),
    identity: join(base, 'owner-key.txt'),
    log: join(base, 'log.txt'),
  };
  mkdirSync(join(shared, 'backups'), { recursive: true });
  if (HAS_AGE) {
    spawnSync('age-keygen', ['-o', box.identity], { encoding: 'utf8' });
    const pub = spawnSync('age-keygen', ['-y', box.identity], { encoding: 'utf8' }).stdout;
    writeFileSync(box.recipients, `# the owner's key (public)\n${pub}`);
    chmodSync(box.recipients, 0o600);
  }
  return box;
}

/** A temporary shared folder with an age key pair: the public half as the server's recipient. */
export function withBox(run: (box: Box) => void): void {
  const box = makeBox();
  try {
    run(box);
  } finally {
    rmSync(box.base, { recursive: true, force: true });
  }
}

export async function withBoxAsync(run: (box: Box) => Promise<void>): Promise<void> {
  const box = makeBox();
  try {
    await run(box);
  } finally {
    rmSync(box.base, { recursive: true, force: true });
  }
}

function bash(
  script: string,
  args: string[],
  box: Box,
  env: Record<string, string>,
  input?: string | Buffer,
): Run {
  const res = spawnSync(
    'bash',
    ['-c', `source "$SCRIPT"\n${STUBS}\n${script} "$@"`, 'bash', ...args],
    {
      encoding: 'utf8',
      input,
      env: {
        ...process.env,
        SCRIPT: join(ROOT, 'deploy', script === 'backup' ? 'backup.sh' : 'backup-restore.sh'),
        LOG: box.log,
        KORPORA_SHARED: box.shared,
        DB_RUNNING: '1',
        APP_RUNNING: '1',
        DOCKER_EXEC: 'fake',
        DUMP_BYTES: '20000',
        DUMP_RC: '0',
        VERIFY_RC: '0',
        TRUNCATED_RC: '0',
        FAKE_COUNT: '12',
        ...env,
      },
    },
  );
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

/** One run of the daily backup. */
export const backup = (box: Box, env: Record<string, string> = {}): Run =>
  bash('backup', [], box, env);

/** One run of backup-restore.sh with its arguments; `input` goes to stdin. */
export const restore = (
  box: Box,
  args: string[],
  env: Record<string, string> = {},
  input?: string | Buffer,
): Run => bash('main', args, box, env, input);

/** The plaintext of an encrypted backup, with the owner's key — what only the owner can do. */
export function decrypt(box: Box, file: string): Buffer {
  const res = spawnSync('age', ['-d', '-i', box.identity, file]);
  if (res.status !== 0) throw new Error(`age -d failed: ${res.stderr.toString()}`);
  return res.stdout;
}

/** What the stubbed docker was asked to do, in order. */
export const logOf = (box: Box): string =>
  existsSync(box.log) ? readFileSync(box.log, 'utf8') : '';
