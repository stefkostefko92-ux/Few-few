// Проверка на панела СРЕЩУ машината, на която върви.
//
// Защо: панелът се мести. Конфигът (`/etc/vps-dashboard/config.json`) пътува с
// него, а той помни СТАРАТА машина — портове на продукти, пътища до .env, съседи,
// папки за бекъп. Нищо от това не гърми при старт: панелът се вдига, табовете се
// рисуват, а половината числа са за машина, която я няма. Тази секция отговаря на
// един въпрос — „съвпада ли това, което панелът мисли, с това, което е тук?" — и
// за всяко разминаване казва какво да направиш.
//
// Правила:
//  · Всяка проверка е НЕЗАВИСИМА и с таван на времето: една увиснала (DNS, docker)
//    не бива да скрие останалите.
//  · Само четене. Единственият „запис" е проба за запис във временен файл, който
//    се трие веднага — иначе „папката е записваема" е предположение.
//  · Данните (пътища, адреси) са в `detail`, отделно от изречението: текстът се
//    превежда, данните — не.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './exec.js';
import { productHealth } from './deploy.js';
import { CONFIG_PATH } from './config.js';
import { DUMP_DIR } from './databases.js';

const ok = (area, title, detail = '') => ({ area, status: 'ok', title, detail });
// `fix` е изречение (превежда се); `cmd` е команда (данни — не се превежда).
const warn = (area, title, detail, fix, cmd) => ({ area, status: 'warn', title, detail, fix, cmd });
const bad = (area, title, detail, fix, cmd) => ({ area, status: 'bad', title, detail, fix, cmd });
const info = (area, title, detail = '', fix = '') => ({ area, status: 'info', title, detail, fix });

function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms).unref?.())]);
}

// Пише и трие временен файл. `fs.accessSync(W_OK)` лъже под systemd с
// ProtectSystem=strict: правата на файловата система позволяват, а unit-ът не.
export function canWrite(dir) {
  const probeFile = path.join(dir, `.csd-selfcheck-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probeFile, 'x', { mode: 0o600 });
    fs.rmSync(probeFile, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.code || err.message };
  }
}

function pathsChecks(cfg) {
  const out = [];
  const p = cfg.paths || {};
  // Конфигът: тайните на панела. Друг потребител на машината не бива да го чете.
  try {
    const st = fs.statSync(CONFIG_PATH);
    if (st.mode & 0o077) out.push(bad('panel', 'Конфигът се чете от други потребители', `${CONFIG_PATH} · 0${(st.mode & 0o777).toString(8)}`, 'В него са паролата и ключовете на панела.', `chmod 600 ${CONFIG_PATH}`));
    else out.push(ok('panel', 'Конфигът е само за root (600)', CONFIG_PATH));
  } catch {
    out.push(info('panel', 'Конфигът е ефимерен (dev режим)', CONFIG_PATH));
  }
  const dirs = [
    ['panel', 'Папката за състоянието е записваема', p.stateDir, 'Одит, история и бекъп графикът пишат тук. Провери ReadWritePaths в unit-а (sudo bash deploy/install.sh го прави).'],
    ['deploy', 'Папката за архиви е записваема', p.archiveDir, 'Качването на архив за деплой пише тук.'],
    ['panel', 'Папката на конфига е записваема', path.dirname(CONFIG_PATH), '2FA, настройките и ключовете се записват в конфига — без запис нищо не се запазва.'],
    ['backups', 'Папката за снимки на базите е записваема', path.dirname(DUMP_DIR), 'Нощният бекъп пише тук.'],
  ];
  for (const [area, title, dir, fix] of dirs) {
    if (!dir) continue;
    if (!fs.existsSync(dir)) {
      out.push(bad(area, title.replace(' е записваема', ' НЕ е записваема'), `${dir} · ENOENT`, fix, `mkdir -p ${dir}`));
      continue;
    }
    const w = canWrite(dir);
    out.push(w.ok ? ok(area, title, dir) : bad(area, title.replace(' е записваема', ' НЕ е записваема'), `${dir} — ${w.error}`, fix));
  }
  // Release структурата: без нея „Деплой" и „Бекъпи → restic" са слепи.
  if (p.currentLink) {
    let target = null;
    try {
      target = fs.realpathSync(p.currentLink);
    } catch {
      /* няма връзка */
    }
    if (!target) out.push(warn('deploy', 'Няма текущ release', p.currentLink, 'Първият деплой с deploy/fetch-deploy.sh го създава.'));
    else {
      out.push(ok('deploy', 'Текущият release съществува', target));
      const ad = cfg.paths.autodeploy || path.join(target, 'deploy', 'autodeploy.sh');
      out.push(fs.existsSync(ad) ? ok('deploy', 'autodeploy.sh е на мястото си', ad) : bad('deploy', 'Липсва autodeploy.sh', ad, 'Деплой от панела няма да тръгне. Пусни fetch-deploy.sh веднъж.'));
    }
  }
  return out;
}

async function productChecks(cfg) {
  const list = cfg.healthChecks || [];
  if (!list.length) return [info('products', 'Няма продукти за следене', '', 'Добави healthChecks в конфига — иначе „Продукти" и алармите за паднал сайт мълчат.')];
  // СЪЩАТА проверка като таба „Продукти" и алармите (с `host` за сайтовете зад
  // nginx по домейн) — иначе двете места си противоречат за един и същ продукт.
  const results = await withTimeout(productHealth({ ...cfg, healthChecks: list.slice(0, 40) }), 9000, list.map((t) => ({ name: t.name, url: t.url, up: false, error: 'няма отговор за 9 s' })));
  const out = results.map((r) =>
    r.up
      ? ok('products', 'Продуктът отговаря', `${r.name} · ${r.url}`)
      : bad('products', 'Продуктът не отговаря', `${r.name} · ${r.url} · ${r.error || r.status || ''}`, 'Ако сайтът работи отвън, адресът за проверка е от старата машина — поправи порта в healthChecks.')
  );
  const down = results.filter((r) => !r.up).length;
  if (down && down === results.length && results.length > 1) {
    out.unshift(bad('products', 'Нито един продукт не отговаря на проверката', `${down}/${results.length}`, 'Почти сигурно healthChecks са от друга машина (други портове). Сравни с портовете в секция „Портове".'));
  }
  return out;
}

function envFileChecks(cfg) {
  return (cfg.envFiles || []).map((f) =>
    fs.existsSync(f.path)
      ? ok('products', 'Файлът с променливи съществува', `${f.name || ''} · ${f.path}`)
      : warn('products', 'Файлът с променливи липсва', `${f.name || ''} · ${f.path}`, 'Пътят е от старата машина или продуктът не е разгърнат тук — махни реда от envFiles.')
  );
}

async function toolChecks() {
  // Без тези команди съответните табове показват „недостъпно" — по-добре да се
  // знае наведнъж, отколкото таб по таб.
  const tools = [
    ['systemctl', 'Услуги, Крон, Логове'],
    ['journalctl', 'Логове, анализ на грешки'],
    ['docker', 'Docker, Compose, Redis, бекъп на Postgres'],
    ['nginx', 'Уеб сървър, покритие'],
    ['ufw', 'Firewall'],
    ['fail2ban-client', 'fail2ban'],
    ['sqlite3', 'SQLite бекъп и проверка'],
    ['certbot', 'Домейни и TLS'],
    ['restic', 'Бекъп извън машината'],
    ['ss', 'Портове'],
    ['script', 'Терминал (PTY)'],
  ];
  const res = await Promise.all(tools.map(([cmd]) => withTimeout(run('sh', ['-c', `command -v ${cmd}`], { timeout: 3000 }), 4000, { ok: false })));
  const missing = tools.filter((_, i) => !res[i].ok);
  if (!missing.length) return [ok('machine', 'Всички инструменти на панела са налице', tools.map((t) => t[0]).join(' · '))];
  const pkg = { 'fail2ban-client': 'fail2ban', ss: 'iproute2', script: 'util-linux', docker: 'docker-ce' };
  // `tabs` е отделно поле: то е НАШ низ (превежда се), а `detail` е данни (raw).
  return missing.map(([cmd, where]) => ({ ...warn('machine', 'Липсва инструмент', cmd, 'Тези табове ще показват „недостъпно".', `apt-get install ${pkg[cmd] || cmd}`), tabs: where }));
}

async function clockCheck() {
  // 2FA кодовете са по ЧАСОВНИКА. На нова машина без синхронизация входът
  // с код „мистериозно" не минава.
  const r = await withTimeout(run('timedatectl', ['show', '-p', 'NTPSynchronized', '--value'], { timeout: 4000 }), 5000, { ok: false });
  if (!r.ok) return [info('machine', 'Синхронизацията на часовника не може да се провери', 'timedatectl', '')];
  return r.stdout.trim() === 'yes'
    ? [ok('machine', 'Часовникът е синхронизиран (NTP)')]
    : [bad('machine', 'Часовникът НЕ е синхронизиран', 'NTPSynchronized=no', 'Без верен час 2FA кодовете не минават.', 'timedatectl set-ntp true')];
}

async function unitCheck() {
  const r = await withTimeout(run('systemctl', ['show', 'vps-dashboard', '-p', 'ActiveState', '-p', 'UnitFileState', '-p', 'MemoryCurrent'], { timeout: 4000 }), 5000, { ok: false });
  if (!r.ok) return [info('panel', 'Панелът не върви като systemd услуга', '', '')];
  const kv = Object.fromEntries(r.stdout.trim().split('\n').map((l) => l.split('=')));
  const out = [];
  out.push(kv.UnitFileState === 'enabled' ? ok('panel', 'Панелът тръгва сам след рестарт', 'vps-dashboard · enabled') : warn('panel', 'Панелът НЕ тръгва сам след рестарт', `vps-dashboard · ${kv.UnitFileState || '?'}`, 'След рестарт на машината панелът няма да се вдигне.', 'systemctl enable vps-dashboard'));
  return out;
}

function proxyCheck(cfg, req) {
  const viaProxy = Boolean(req?.headers?.['x-real-ip'] || req?.headers?.['x-forwarded-for']);
  if (viaProxy && !cfg.trustProxy) return [bad('panel', 'Зад прокси, но trustProxy е изключен', 'X-Real-IP', 'trustProxy: true в конфига — иначе бисквитката не е Secure, а всички заявки изглеждат от 127.0.0.1 (ограничителят за вход и списъкът с адреси са слепи).')];
  if (!viaProxy && cfg.trustProxy) return [warn('panel', 'trustProxy е включен, но заявката не мина през прокси', '', 'Ако влизаш директно към 127.0.0.1:7700 (SSH тунел) — нормално. Иначе провери, че nginx слага X-Real-IP.')];
  return [ok('panel', viaProxy ? 'Зад прокси с trustProxy' : 'Директен достъп без прокси')];
}

// Vhost-ът на панела: без тези редове части от панела НЕ работят, без грешка.
export function vhostFindings(text) {
  const out = [];
  if (!/client_max_body_size\s+\d+[gGmM]/.test(text)) out.push(['Качването на архиви над 1 MB ще бъде отказано от nginx (413)', 'client_max_body_size 3g;']);
  if (!/proxy_buffering\s+off/.test(text)) out.push(['Живите графики и логове (SSE) ще засичат', 'proxy_buffering off; proxy_read_timeout 24h;']);
  if (!/proxy_set_header\s+X-Real-IP/.test(text)) out.push(['Панелът не вижда истинския адрес на посетителя', 'proxy_set_header X-Real-IP $remote_addr;']);
  if (!/proxy_set_header\s+Upgrade/.test(text)) out.push(['Десктопът (WebSocket) няма да се свърже', 'proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;']);
  return out;
}

function nginxCheck(cfg) {
  const dir = '/etc/nginx/sites-enabled';
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const port = cfg.port || 7700;
  const rx = new RegExp(`proxy_pass\\s+http://(127\\.0\\.0\\.1|localhost):${port}\\b`);
  const hits = [];
  for (const f of files) {
    try {
      // readFileSync следва символните връзки — sites-enabled обикновено е от тях.
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      if (rx.test(text)) hits.push({ f, text });
    } catch {
      /* нечетим файл */
    }
  }
  if (!hits.length) return [info('panel', 'Не намирам vhost в nginx, който сочи към панела', `${dir} · :${port}`, 'Ако панелът е зад Caddy или друг прокси — нормално.')];
  const out = [];
  if (hits.length > 1) out.push(warn('panel', 'Повече от един vhost сочи към панела', hits.map((h) => h.f).join(' · '), 'Остатък от старата машина? Махни излишния (и сертификата му).'));
  for (const h of hits) {
    const problems = vhostFindings(h.text);
    if (!problems.length) out.push(ok('panel', 'Vhost-ът на панела има всичко нужно', h.f));
    for (const [title, fix] of problems) out.push(warn('panel', title, h.f, 'Добави в location / на vhost-а, после nginx -t и reload.', fix));
  }
  return out;
}

function securityChecks(cfg, ctx) {
  const out = [];
  out.push(cfg.totp?.enabled ? ok('security', '2FA е включено') : bad('security', '2FA е изключено', '', 'Настройки → Включи 2FA. На нова машина панелът е root достъп до всичко.'));
  out.push(cfg.sudoMode?.enabled === false ? warn('security', 'Режимът „sudo" е изключен', '', 'Достъп по IP → Режим „sudo".') : ok('security', 'Режимът „sudo" е включен'));
  try {
    const v = ctx.audit?.verify?.();
    if (v) out.push(v.ok ? ok('security', 'Веригата на одита е цяла', `${v.checked ?? 0}`) : bad('security', 'Веригата на одита е скъсана', v.error || v.note || '', 'Виж секция „Одит" — след местене това значи непълно копие на state папката.'));
  } catch {
    /* одитът няма verify в тест */
  }
  return out;
}

function backupChecks(cfg, ctx) {
  const out = [];
  out.push(cfg.backups?.schedule?.enabled === false ? bad('backups', 'Нощният бекъп е изключен', '', 'Бекъпи → График.') : ok('backups', 'Нощният бекъп е включен', `${cfg.backups?.schedule?.atHour ?? 3}:00`));
  out.push(fs.existsSync('/etc/vps-dashboard/restic.env') ? ok('backups', 'Има хранилище извън машината (restic)') : warn('backups', 'Няма копие извън машината', '', 'Бекъпите живеят на същия диск — виж „Сигурност" за restic.'));
  try {
    const h = ctx.drill?.status?.(cfg);
    if (h?.backup) {
      out.push(h.backup.hasBackup && (h.backup.ageDays ?? 99) <= (h.maxAgeDays ?? 2)
        ? ok('backups', 'Има пресен бекъп', h.backup.newest || '')
        : bad('backups', 'Няма пресен бекъп', h.backup.newest || '—', 'Бекъпи → Снимка на всички бази.'));
    }
  } catch {
    /* няма drill в тест */
  }
  const channels = cfg.notify || {};
  const any = channels.telegram?.botToken || channels.ntfy?.topic || channels.webhook?.url || channels.email?.to;
  out.push(any ? ok('backups', 'Има канал за известия') : warn('backups', 'Няма канал за известия', '', 'Аларми → канали. Иначе за проблем научаваш, когато сам отвориш панела.'));
  return out;
}

function machineChecks() {
  const out = [];
  const major = Number(process.versions.node.split('.')[0]);
  out.push(major >= 20 ? ok('machine', 'Node.js е достатъчно нов', process.version) : bad('machine', 'Node.js е твърде стар', process.version, 'Нужен е Node ≥ 20.'));
  out.push(typeof process.getuid === 'function' && process.getuid() === 0 ? ok('machine', 'Панелът върви като root') : warn('machine', 'Панелът НЕ върви като root', String(process.getuid?.()), 'Управлението на услуги, firewall и пакети иска root.'));
  out.push(info('machine', 'Машина', `${os.hostname()} · ${os.cpus().length} CPU · ${Math.round(os.totalmem() / 1073741824)} GB RAM`));
  return out;
}

export async function selfCheck(cfg, ctx = {}, req = null) {
  const groups = await Promise.all([
    Promise.resolve(pathsChecks(cfg)),
    productChecks(cfg),
    Promise.resolve(envFileChecks(cfg)),
    toolChecks(),
    clockCheck(),
    unitCheck(),
    Promise.resolve(proxyCheck(cfg, req)),
    Promise.resolve(nginxCheck(cfg)),
    Promise.resolve(securityChecks(cfg, ctx)),
    Promise.resolve(backupChecks(cfg, ctx)),
    Promise.resolve(machineChecks()),
  ].map((p) => p.catch((err) => [warn('panel', 'Проверката гръмна', String(err.message || err).slice(0, 200), '')])));
  const checks = groups.flat();
  const count = (s) => checks.filter((c) => c.status === s).length;
  return { checkedAt: new Date().toISOString(), summary: { ok: count('ok'), warn: count('warn'), bad: count('bad') }, checks };
}
