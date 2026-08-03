// Смяна на порта на продукт — ВОДЕНА верига, не едно поле.
//
// Защо изобщо съществува този модул: смяната на порт е четири промени на четири
// различни места и се чупи, защото хората правят три от тях.
//
//   1. `.env`/compose на продукта — къде слуша;
//   2. рестарт — иначе старият процес държи стария порт;
//   3. vhost на Nginx/Caddy — `proxy_pass` продължава да сочи стария порт, тоест
//      сайтът дава 502, докато продуктът е жив и здрав;
//   4. `healthChecks` в конфига на панела — иначе панелът вика стария порт, вижда
//      мълчание и вдига критична аларма за напълно работещ продукт.
//
// Четвъртата е най-коварната: тя не чупи нищо на потребителя, а чупи ДОВЕРИЕТО в
// алармите. Затова целият модул е на две стъпки: „план" (нищо не се пипа, но се
// казва точно какво ще се пипне) и „приложи" (с копия, проверка и автоматичен
// откат). Същият патърн като възстановяването на база.
import fs from 'node:fs';
import path from 'node:path';
import { discover as discoverEnv, parseEnv } from './env.js';
import { assertRestoreUnit } from './backups.js';

// Ключове, в които продуктите ни държат порта. Редът е по вероятност.
const PORT_KEYS = ['PORT', 'HTTP_PORT', 'APP_PORT', 'SERVER_PORT', 'LISTEN_PORT'];

export function assertPort(v, label = 'Портът') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw Object.assign(new Error(`${label} трябва да е цяло число 1–65535`), { status: 400 });
  }
  // Под 1024 е привилегирован диапазон: продукт под собствен потребител не може
  // да го заеме и рестартът пада с EACCES. Казваме го ПРЕДИ да сме пипнали нещо.
  return n;
}

export function isPrivileged(port) {
  return port < 1024;
}

// ── Стъпка 1: план ───────────────────────────────────────────────────────────
export function plan(cfg, { product, newPort }) {
  const name = String(product || '').trim();
  if (!/^[\w.-]{1,64}$/.test(name)) {
    throw Object.assign(new Error('Невалидно име на продукт'), { status: 400 });
  }
  const target = assertPort(newPort, 'Новият порт');

  const health = (cfg.healthChecks || []).find((h) => h.name === name);
  if (!health) {
    throw Object.assign(
      new Error(`Не познавам продукт „${name}" — трябва да е в healthChecks на конфига.`),
      { status: 400 }
    );
  }
  let currentPort = null;
  let healthUrl = null;
  try {
    const u = new URL(health.url);
    currentPort = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    healthUrl = u;
  } catch {
    throw Object.assign(new Error(`Health URL-ът на „${name}" е невалиден: ${health.url}`), { status: 400 });
  }
  if (currentPort === target) {
    throw Object.assign(new Error(`„${name}" вече е на порт ${target}.`), { status: 400 });
  }

  const steps = [];
  const warnings = [];

  // (1) Къде е записан портът.
  const envHit = findEnvPort(cfg, name, currentPort);
  if (envHit) {
    steps.push({
      kind: 'env',
      file: envHit.file,
      key: envHit.key,
      from: String(currentPort),
      to: String(target),
      what: `${envHit.file}: ${envHit.key}=${currentPort} → ${target}`,
    });
  } else {
    warnings.push(
      `Не намерих порта в никой .env на „${name}". Ако продуктът е Docker Compose, портът е в compose ` +
        'файла — смени го от секция „Compose" и после пусни тази верига само за vhost-а и проверката.'
    );
  }

  // (2) Кого да рестартираме.
  const unit = health.unit || guessUnit(name);
  if (unit) {
    steps.push({ kind: 'restart', unit, what: `рестарт на ${unit}` });
  } else {
    warnings.push(`Не знам кой systemd unit да рестартирам за „${name}" — добави „unit" в healthChecks.`);
  }

  // (3) Кой vhost сочи стария порт.
  for (const hit of findVhostRefs(currentPort)) {
    steps.push({
      kind: 'vhost',
      server: hit.server,
      file: hit.file,
      from: String(currentPort),
      to: String(target),
      what: `${hit.server}: ${hit.file} — ${hit.matches} препратки към ${currentPort}`,
    });
  }
  if (!steps.some((s) => s.kind === 'vhost')) {
    warnings.push(
      `Нито един vhost не сочи порт ${currentPort}. Ако продуктът е публичен, ще остане недостъпен отвън — ` +
        'провери сам конфигурацията на уеб сървъра.'
    );
  }

  // (4) Собствената проверка на панела — винаги последна и винаги я има.
  steps.push({
    kind: 'health',
    from: health.url,
    to: health.url.replace(`:${currentPort}`, `:${target}`),
    what: `healthChecks на панела: ${health.url} → :${target}`,
  });

  if (isPrivileged(target)) {
    warnings.push(
      `Порт ${target} е под 1024 (привилегирован). Ако продуктът върви под собствен потребител, ` +
        'рестартът ще падне с EACCES — тогава верига ще се върне назад сама.'
    );
  }

  return {
    product: name,
    currentPort,
    newPort: target,
    healthPath: healthUrl.pathname || '/',
    healthHost: health.host || null,
    steps,
    warnings,
    // Без нито едно място за смяна е безсмислено да се пипа каквото и да е.
    applicable: steps.some((s) => s.kind === 'env' || s.kind === 'vhost'),
  };
}

function findEnvPort(cfg, name, currentPort) {
  let files = [];
  try {
    files = discoverEnv(cfg);
  } catch {
    return null;
  }
  // Първо файловете, чието име/път съдържа продукта — иначе бихме сменили порта
  // на ЧУЖД продукт, който случайно има същото число.
  const ranked = [...files].sort((a, b) => scoreEnv(b, name) - scoreEnv(a, name));
  for (const f of ranked) {
    if (scoreEnv(f, name) <= 0) break;
    let text;
    try {
      text = fs.readFileSync(f.path, 'utf8');
    } catch {
      continue;
    }
    // `parseEnv` връща { lines, entries } — не масив. (Проверих го, вместо да
    // предположа; първият вариант падна с „entries.find is not a function".)
    const { entries } = parseEnv(text);
    for (const key of PORT_KEYS) {
      const hit = entries.find((e) => e.key === key && Number(e.value) === currentPort);
      if (hit) return { file: f.path, key };
    }
    // И по-свободно: КОЙ ДА Е ключ, който съдържа „PORT" и точната стойност.
    const loose = entries.find((e) => /PORT/i.test(e.key) && Number(e.value) === currentPort);
    if (loose) return { file: f.path, key: loose.key };
  }
  return null;
}

function scoreEnv(f, name) {
  const hay = `${f.name || ''} ${f.path || ''}`.toLowerCase();
  return hay.includes(name.toLowerCase()) ? 1 : 0;
}

function guessUnit(name) {
  for (const candidate of [`${name}.service`, `${name}d.service`]) {
    if (fs.existsSync(path.join('/etc/systemd/system', candidate))) return candidate;
  }
  return null;
}

const VHOST_DIRS = [
  { server: 'nginx', dir: '/etc/nginx/sites-available' },
  { server: 'nginx', dir: '/etc/nginx/conf.d' },
  { server: 'caddy', dir: '/etc/caddy' },
];

export function findVhostRefs(port) {
  const out = [];
  const rx = new RegExp(`(127\\.0\\.0\\.1|localhost|\\[::1\\]):${port}\\b`, 'g');
  for (const { server, dir } of VHOST_DIRS) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      const full = path.join(dir, n);
      let text;
      try {
        if (!fs.statSync(full).isFile()) continue;
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const matches = (text.match(rx) || []).length;
      if (matches) out.push({ server, file: full, matches });
    }
  }
  return out;
}

// ── Стъпка 2: приложи ────────────────────────────────────────────────────────
// Всичко в ЕДИН скрипт с копия и откат. Причината да е shell, а не Node: точно
// така работи и възстановяването на база — жив изход, един изход-код, и откатът
// е в същия процес, който е направил промяната. Разделиш ли го, откатът зависи
// от това дали някой гледа.
export function applySpec(plan) {
  const { product, currentPort, newPort, healthPath, healthHost } = plan;
  const stamp = 'преди-смяна-на-порт';
  const lines = [
    'set -uo pipefail',
    `echo "▸ Смяна на порта на ${product}: ${currentPort} → ${newPort}"`,
    'rc=0',
    'declare -a BACKED=()',
  ];

  // Копие на всеки файл, който ще пипнем — ПРЕДИ да го пипнем.
  const files = plan.steps.filter((s) => s.kind === 'env' || s.kind === 'vhost').map((s) => s.file);
  for (const f of files) {
    lines.push(
      `cp -a ${q(f)} ${q(`${f}.${stamp}`)} || { echo "✘ не мога да направя копие на ${f}"; exit 1; }`,
      `BACKED+=(${q(f)})`
    );
  }

  // Откатът е ФУНКЦИЯ, за да е един и същ по всички пътища на провала.
  lines.push(
    'rollback() {',
    '  echo "▸ ОТКАТ — връщам файловете и рестартирам"',
    '  for f in "${BACKED[@]}"; do',
    `    mv -f "\$f.${stamp}" "\$f" && echo "  ↩ $f"`,
    '  done',
    ...restartLines(plan, '  '),
    '}'
  );

  for (const s of plan.steps) {
    if (s.kind === 'env') {
      // Точен ред „КЛЮЧ=стойност", не сляпо търсене на числото: същото число може
      // да е и в друга променлива (таймаут, лимит), а тя няма нищо общо с порта.
      lines.push(
        `echo "▸ ${s.file}: ${s.key}=${s.from} → ${s.to}"`,
        `sed -i -E ${q(`s/^(\\s*(export\\s+)?${s.key}\\s*=\\s*)["']?${s.from}["']?\\s*$/\\1${s.to}/`)} ${q(s.file)}`,
        `grep -qE ${q(`^\\s*(export\\s+)?${s.key}\\s*=\\s*["']?${s.to}`)} ${q(s.file)} || { echo "✘ записът не се потвърди"; rollback; exit 1; }`
      );
    }
    if (s.kind === 'vhost') {
      lines.push(
        `echo "▸ ${s.file}: ${s.matches} препратки ${s.from} → ${s.to}"`,
        `sed -i -E ${q(`s/(127\\.0\\.0\\.1|localhost|\\[::1\\]):${s.from}\\b/\\1:${s.to}/g`)} ${q(s.file)}`
      );
    }
  }

  // Уеб конфигът се ВАЛИДИРА, преди да бъде презареден — канонът на продукта.
  const vhosts = plan.steps.filter((s) => s.kind === 'vhost');
  if (vhosts.some((v) => v.server === 'nginx')) {
    lines.push(
      'echo "▸ nginx -t"',
      'nginx -t || { echo "✘ конфигът на nginx е невалиден"; rollback; exit 1; }',
      'systemctl reload nginx || { echo "✘ nginx не се презареди"; rollback; exit 1; }'
    );
  }
  if (vhosts.some((v) => v.server === 'caddy')) {
    lines.push(
      'echo "▸ caddy validate"',
      'caddy validate --config /etc/caddy/Caddyfile || { echo "✘ Caddyfile е невалиден"; rollback; exit 1; }',
      'systemctl reload caddy || { echo "✘ caddy не се презареди"; rollback; exit 1; }'
    );
  }

  lines.push('echo "▸ Рестартирам продукта"', ...restartLines(plan, ''));

  // Проверката е СРЕЩУ НОВИЯ порт и е задължителна. Верига без проверка е
  // „надявам се", а не смяна на порт.
  const hostHeader = healthHost ? `-H ${q(`Host: ${healthHost}`)} ` : '';
  lines.push(
    `echo "▸ Проверявам http://127.0.0.1:${newPort}${healthPath} (до 30s)"`,
    'ok=0',
    'for i in $(seq 30); do',
    `  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 ${hostHeader}${q(`http://127.0.0.1:${newPort}${healthPath}`)} || echo 000)`,
    '  case "$code" in 2*|3*|401|403) ok=1; break;; esac',
    '  sleep 1',
    'done',
    'if [ "$ok" != "1" ]; then echo "✘ новият порт не отговаря (последен код: ${code:-няма})"; rollback; exit 1; fi',
    'echo "✔ Новият порт отговаря."',
    // Копията се пазят — човек може да иска да види какво е било.
    `echo "ℹ Копията са до файловете със суфикс .${stamp} — изтрий ги, когато си сигурен."`,
    'exit 0'
  );

  return {
    title: `Смяна на порт · ${product} ${currentPort} → ${newPort}`,
    shell: lines.join('\n'),
    exclusive: 'system',
    timeoutMs: 10 * 60 * 1000,
  };
}

function restartLines(plan, indent) {
  const unit = plan.steps.find((s) => s.kind === 'restart')?.unit;
  if (!unit) return [`${indent}echo "⚠ няма unit за рестарт — направи го сам"`];
  const u = assertRestoreUnit(unit);
  return [`${indent}systemctl restart ${u} || echo "⚠ рестартът на ${u} се провали"`];
}

// Единично кавичкиране за shell — всичко, което влиза в скрипта, минава оттук.
function q(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
