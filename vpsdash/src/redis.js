// Redis — преглед, изхвърлени ключове и последователна снимка.
//
// Защо изобщо е отделен модул: Supreme върти Redis с
// `--maxmemory 128mb --maxmemory-policy allkeys-lru`. Тази комбинация значи, че
// когато Redis опре в тавана, той **тихо изхвърля ключове**, за да направи място
// — без грешка, без ред в лога, без падаща услуга. Ако там стоят сесии, опашки
// или кеш с истинска стойност, това е реален отказ, който не се вижда никъде.
// Единственият видим белег е броячът `evicted_keys`, който расте.
//
// Втората причина: `dump.rdb`/AOF живее в Docker volume, който досега не влизаше
// в нито един бекъп.
import fs from 'node:fs';
import { run } from './exec.js';
import { assertDockerName } from './docker.js';

export function assertName(name) {
  return assertDockerName(name, 'контейнер');
}

// Redis като системна услуга (apt redis-server), не в Docker. Табът виждаше само
// контейнерите — на машина с Redis от пакет секцията мълчеше, а алармите за
// изхвърлени ключове и провалена снимка не стигаха до него. Името е `host:<порт>`.
const HOST_RX = /^host:(\d{2,5})$/;
export const hostPort = (name) => {
  const m = HOST_RX.exec(String(name || ''));
  return m && Number(m[1]) > 0 && Number(m[1]) < 65536 ? Number(m[1]) : null;
};

// `ss -tlnpH` → портовете, на които слуша процес redis-server/valkey-server.
export function parseHostRedis(ssOut) {
  const ports = new Set();
  for (const line of String(ssOut || '').split('\n')) {
    if (!/"(redis|valkey)-server"/.test(line)) continue;
    const m = /\s(\S+):(\d+)\s/.exec(line);
    if (m) ports.add(Number(m[2]));
  }
  return [...ports].sort((a, b) => a - b);
}

// Паролата (requirepass) се чете от конфига и минава през REDISCLI_AUTH в средата —
// НИКОГА като `-a` аргумент: той се вижда в `ps` от всеки потребител на машината.
function hostAuthEnv() {
  try {
    const conf = fs.readFileSync('/etc/redis/redis.conf', 'utf8');
    const m = /^\s*requirepass\s+("?)(.+?)\1\s*$/m.exec(conf);
    return m ? { REDISCLI_AUTH: m[2] } : {};
  } catch {
    return {};
  }
}

// `redis-cli INFO` връща секции с „ключ:стойност" и коментари с „#".
export function parseInfo(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i <= 0) continue;
    out[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return out;
}

// „db0:keys=1234,expires=56,avg_ttl=0" → { db: 'db0', keys, expires }
export function parseKeyspace(info) {
  const out = [];
  for (const [k, v] of Object.entries(info)) {
    if (!/^db\d+$/.test(k)) continue;
    const keys = Number(/keys=(\d+)/.exec(v)?.[1] ?? 0);
    const expires = Number(/expires=(\d+)/.exec(v)?.[1] ?? 0);
    out.push({ db: k, keys, expires });
  }
  return out.sort((a, b) => b.keys - a.keys);
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function summarize(info) {
  const used = num(info.used_memory);
  const max = num(info.maxmemory);
  const hits = num(info.keyspace_hits) ?? 0;
  const misses = num(info.keyspace_misses) ?? 0;
  const keyspace = parseKeyspace(info);
  return {
    version: info.redis_version || null,
    uptimeSec: num(info.uptime_in_seconds),
    usedMemory: used,
    usedMemoryHuman: info.used_memory_human || null,
    maxMemory: max || null,
    // Процентът има смисъл САМО при зададен таван — иначе „100% от 0" е безсмислица.
    memoryPct: max && used != null ? Math.round((used / max) * 1000) / 10 : null,
    policy: info.maxmemory_policy || null,
    // При „noeviction" Redis връща грешка вместо да трие — коренно различно
    // поведение, затова се показва изрично.
    evicts: Boolean(info.maxmemory_policy && info.maxmemory_policy !== 'noeviction' && max),
    evictedKeys: num(info.evicted_keys) ?? 0,
    expiredKeys: num(info.expired_keys) ?? 0,
    connectedClients: num(info.connected_clients),
    blockedClients: num(info.blocked_clients),
    rejectedConnections: num(info.rejected_connections) ?? 0,
    hitRate: hits + misses > 0 ? Math.round((hits / (hits + misses)) * 1000) / 10 : null,
    keyspace,
    totalKeys: keyspace.reduce((s, d) => s + d.keys, 0),
    // AOF/RDB: без нито едно от двете рестартът изтрива всичко.
    aofEnabled: info.aof_enabled === '1',
    rdbLastSaveTime: num(info.rdb_last_save_time),
    rdbChangesSinceSave: num(info.rdb_changes_since_last_save),
    rdbLastBgsaveStatus: info.rdb_last_bgsave_status || null,
    persistence: info.aof_enabled === '1' ? 'AOF' : num(info.rdb_last_save_time) ? 'RDB' : 'НЯМА',
  };
}

// Открива Redis контейнерите (по образ) + volume-а, в който пази данните си.
export async function discover() {
  const found = [];
  const [ps, ss] = await Promise.all([
    run('docker', ['ps', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}'], { timeout: 10000 }),
    run('ss', ['-tlnpH'], { timeout: 8000 }),
  ]);
  if (ss.ok) {
    for (const port of parseHostRedis(ss.stdout)) {
      found.push({ name: `host:${port}`, image: 'redis-server (системна услуга)', status: `слуша на ${port}`, host: true });
    }
  }
  if (ps.ok) {
    for (const line of ps.stdout.split('\n')) {
      const [name, image, status] = line.split('\t');
      if (!name || !/redis|valkey/i.test(image || '')) continue;
      found.push({ name, image, status });
    }
  }
  // Без docker пак има какво да се покаже, ако Redis е от пакет — „docker
  // недостъпен" не бива да скрива системния Redis.
  if (!ps.ok && !found.length) return { available: false, error: (ps.stderr || 'docker недостъпен').trim().slice(0, 200), instances: [] };
  return { available: true, instances: found };
}

export async function dataVolume(container) {
  const c = assertName(container);
  const r = await run('docker', ['inspect', '-f', '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}}\n{{end}}', c], { timeout: 10000 });
  if (!r.ok) return null;
  for (const line of r.stdout.split('\n')) {
    const [type, name, source, dest] = line.split('|');
    if (dest === '/data') return { type, name: name || null, source: source || null };
  }
  return null;
}

// ── Redis с парола ───────────────────────────────────────────────────────────
// `redis-cli` при `requirepass` отговаря „NOAUTH Authentication required." — и
// излиза с КОД 0 (измерено на redis:7-alpine, 24.10.2026). Затова голият
// `docker exec … redis-cli INFO` показваше Redis-а на Supreme като „ok" с празни
// числа (празна нула — лъжа), а BGSAVE „минаваше" като задача, без да е снимал.
//
// Паролата е в средата на САМИЯ контейнер (`REDIS_PASSWORD`, както я подава
// docker-compose на Supreme). Панелът не я чете и не я държи: `sh` в контейнера
// я прехвърля в `REDISCLI_AUTH` — не в `-a`, където стои в списъка с процеси.
// Без зададена парола поведението е същото като преди.
const WITH_AUTH = 'if [ -n "${REDIS_PASSWORD:-}" ]; then export REDISCLI_AUTH="$REDIS_PASSWORD"; fi; ';
export const INFO_SH = WITH_AUTH + 'exec redis-cli INFO';
// Кодът на изхода трябва да КАЗВА провала — иначе задачата е зелена без снимка.
const FAIL_ON_REFUSAL = 'case "$out" in *NOAUTH*|*WRONGPASS*|*ERR*|*"Could not connect"*) exit 1;; esac';
export const BGSAVE_SH = WITH_AUTH + 'out=$(redis-cli BGSAVE 2>&1); echo "$out"; ' + FAIL_ON_REFUSAL;
// Системният Redis: паролата идва от конфига през REDISCLI_AUTH в средата на
// задачата; портът е позиционен аргумент ($1), не текст в скрипта.
export const HOST_BGSAVE_SH = 'out=$(redis-cli -h 127.0.0.1 -p "$1" BGSAVE 2>&1); echo "$out"; ' + FAIL_ON_REFUSAL;

const firstLine = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';

// Чиста функция: какво значи отговорът на `redis-cli INFO`. Нашето изречение
// (`error`) и чуждият изход (`detail`) са в различни полета — слети дават низ,
// който се мени с всяка машина и затова е непреводим.
export function readInfo(r) {
  if (!r?.ok) {
    return { ok: false, reason: 'error', error: 'redis-cli се провали', detail: firstLine(r?.stderr || r?.error).slice(0, 200) };
  }
  const err = firstLine(r.stderr);
  const out = firstLine(r.stdout);
  // Сгрешена парола: redis-cli казва WRONGPASS на stderr, а INFO пак дава NOAUTH.
  if (/WRONGPASS|^AUTH failed/i.test(err)) {
    return { ok: false, reason: 'auth', error: 'Паролата в REDIS_PASSWORD на контейнера не е вярна — Redis отказва INFO.' };
  }
  if (/^NOAUTH\b/.test(out)) {
    return { ok: false, reason: 'auth', error: 'Redis иска парола, а контейнерът няма REDIS_PASSWORD — панелът не може да прочете INFO.' };
  }
  if (/^(ERR\b|Could not connect)/.test(out)) {
    return { ok: false, reason: 'error', error: 'redis-cli върна грешка', detail: out.slice(0, 200) };
  }
  const info = parseInfo(r.stdout);
  // Отговор без нито едно поле на INFO не е „празен Redis" — не знаем нищо.
  if (!info.redis_version) {
    return { ok: false, reason: 'error', error: 'redis-cli не върна INFO', detail: out.slice(0, 200) };
  }
  return { ok: true, info };
}

// Образ без `sh` (distroless): пада обратно към голото извикване, както преди.
const noShell = (r) => !r.ok && /executable file not found|no such file or directory/i.test(r.stderr || '') && /"sh"|\bsh\b/.test(r.stderr || '');

export async function inspect(container) {
  const port = hostPort(container);
  if (port) {
    const r = await run('redis-cli', ['-h', '127.0.0.1', '-p', String(port), 'INFO'], { timeout: 10000, env: hostAuthEnv() });
    // Същият разбор като за контейнер — празен отговор и тук не е „ok";
    // само изречението за паролата казва къде да се гледа при системния Redis.
    const res = readInfo(r);
    if (!res.ok) {
      return { name: container, ...res, ...(res.reason === 'auth' ? { error: 'иска парола, а requirepass в /etc/redis/redis.conf не съвпада' } : {}) };
    }
    return { name: container, ok: true, ...summarize(res.info), volume: null };
  }
  const c = assertName(container);
  let r = await run('docker', ['exec', c, 'sh', '-c', INFO_SH], { timeout: 10000 });
  if (noShell(r)) r = await run('docker', ['exec', c, 'redis-cli', 'INFO'], { timeout: 10000 });
  const res = readInfo(r);
  if (!res.ok) return { name: c, ...res };
  const vol = await dataVolume(c);
  return { name: c, ok: true, ...summarize(res.info), volume: vol };
}

export async function overview() {
  const d = await discover();
  if (!d.available) return d;
  const instances = [];
  for (const i of d.instances.slice(0, 10)) {
    instances.push({ ...i, ...(await inspect(i.name)) });
  }
  return { available: true, instances };
}

// ── Аларми ───────────────────────────────────────────────────────────────────
// Изхвърлянето се мери по РАЗЛИКА, не по общ брой: общият расте вечно и казва
// само, че някога е било тясно. Ръст СЕГА значи, че точно сега губиш данни.
export function evictionChecks(prev, now, { memPct = 90 } = {}) {
  const before = new Map((prev || []).map((i) => [i.name, i]));
  const out = [];
  for (const i of now || []) {
    if (!i.ok) continue;
    const was = before.get(i.name);
    if (was?.ok) {
      const delta = (i.evictedKeys ?? 0) - (was.evictedKeys ?? 0);
      if (delta > 0) {
        out.push({
          key: `redis-evict:${i.name}`,
          severity: 'warning',
          title: `Redis изхвърля ключове (${i.name})`,
          body:
            `${delta} изхвърлени ключа от последната проверка (общо ${i.evictedKeys}). Политиката е ` +
            `„${i.policy}" при таван ${i.maxMemory ? Math.round(i.maxMemory / 1048576) + ' MB' : '—'} — ` +
            'Redis прави място, като трие. Загубата е тиха: няма грешка и няма ред в лога. ' +
            'Или вдигни maxmemory, или намали какво пазиш там.',
          sustain: false,
          transient: true, // разлика между две проверки, не състояние
        });
      }
      const rejDelta = (i.rejectedConnections ?? 0) - (was.rejectedConnections ?? 0);
      if (rejDelta > 0) {
        out.push({
          key: `redis-rejected:${i.name}`,
          severity: 'critical',
          title: `Redis отказва връзки (${i.name})`,
          body: `${rejDelta} отказани от последната проверка — опрян е в maxclients. Приложението получава грешки при свързване.`,
          sustain: false,
          transient: true,
        });
      }
    }
    if (i.memoryPct != null && i.memoryPct >= memPct) {
      out.push({
        key: `redis-mem:${i.name}`,
        severity: i.evicts ? 'warning' : 'critical',
        title: `Redis е на ${i.memoryPct}% от тавана (${i.name})`,
        body: i.evicts
          ? `Политика „${i.policy}" — при опиране започва да трие ключове.`
          : `Политика „${i.policy}" — при опиране ЗАПИСИТЕ ще започнат да връщат грешка вместо да се трие.`,
      });
    }
    // Без AOF и без RDB рестартът изтрива всичко — това е решение, което човек
    // трябва да е взел съзнателно, не да открие след рестарт.
    if (i.ok && i.persistence === 'НЯМА' && i.totalKeys > 0) {
      out.push({
        key: `redis-persist:${i.name}`,
        severity: 'warning',
        title: `Redis няма нито AOF, нито RDB (${i.name})`,
        body: `${i.totalKeys} ключа живеят само в паметта — рестарт на контейнера ги изтрива всичките.`,
        sustain: false,
      });
    }
    if (i.ok && i.rdbLastBgsaveStatus && i.rdbLastBgsaveStatus !== 'ok') {
      out.push({
        key: `redis-bgsave:${i.name}`,
        severity: 'critical',
        title: `Последната снимка на Redis се провали (${i.name})`,
        body: `rdb_last_bgsave_status = ${i.rdbLastBgsaveStatus}. Обикновено е липса на място или права — записът на диск не работи.`,
        sustain: false,
      });
    }
  }
  return out;
}

// Последователна снимка: първо BGSAVE (Redis сам изхвърля точно състояние на
// диска), после архивиране на volume-а. Tar върху жив AOF без BGSAVE обикновено
// се възстановява, но „обикновено" не е дума за бекъп.
export function saveSpec(container) {
  const port = hostPort(container);
  if (port) {
    return {
      title: `Redis BGSAVE: ${container}`,
      // През sh, за да падне задачата при NOAUTH/WRONGPASS (redis-cli дава изход 0).
      cmd: 'sh',
      args: ['-c', HOST_BGSAVE_SH, 'sh', String(port)],
      env: hostAuthEnv(),
      exclusive: 'backup',
      timeoutMs: 60000,
    };
  }
  const c = assertName(container);
  return {
    title: `Redis BGSAVE: ${c}`,
    cmd: 'docker',
    // През sh: паролата от средата на контейнера + изход ≠ 0 при отказ (виж BGSAVE_SH).
    args: ['exec', c, 'sh', '-c', BGSAVE_SH],
    exclusive: 'backup',
    timeoutMs: 60000,
  };
}
