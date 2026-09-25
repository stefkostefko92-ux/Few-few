// Уеб сървър (Nginx/Caddy) — преглед и редакция на vhost-овете, проверка на
// конфига и презареждане, обновяване на TLS.
//
// Патърнът е този на autodeploy.sh, защото е доказано безопасен: бекъп → запис →
// ВАЛИДИРАЙ (`nginx -t` / `caddy validate`) → само тогава reload. Невалиден конфиг
// НИКОГА не стига до живия сървър (автоматичен откат).
import fs from 'node:fs';
import path from 'node:path';
import { run, runOk } from './exec.js';

const NGINX_AVAILABLE = '/etc/nginx/sites-available';
const NGINX_ENABLED = '/etc/nginx/sites-enabled';
const CADDY_SITES = '/etc/caddy/sites';
const NAME_RX = /^[\w][\w.-]{0,80}$/;
const MAX_CONF = 512 * 1024;

function assertName(name) {
  const base = String(name || '');
  if (base.includes('/') || base.includes('\0') || !NAME_RX.test(base)) {
    throw Object.assign(new Error('Невалидно име на конфиг'), { status: 400 });
  }
  return base;
}

export async function webserverStatus() {
  const [nginxBin, caddyBin] = await Promise.all([
    run('which', ['nginx'], { timeout: 5000 }),
    run('which', ['caddy'], { timeout: 5000 }),
  ]);
  const out = { nginx: null, caddy: null };

  if (nginxBin.ok) {
    const [test, active] = await Promise.all([
      run('nginx', ['-t'], { timeout: 10000 }),
      run('systemctl', ['is-active', 'nginx'], { timeout: 5000 }),
    ]);
    out.nginx = {
      active: active.stdout.trim(),
      configOk: test.ok,
      configOutput: ((test.stderr || '') + (test.stdout || '')).trim().slice(0, 2000),
      sites: listDirSafe(NGINX_AVAILABLE).map((name) => ({
        name,
        enabled: fs.existsSync(path.join(NGINX_ENABLED, name)),
      })),
    };
  }
  if (caddyBin.ok) {
    const active = await run('systemctl', ['is-active', 'caddy'], { timeout: 5000 });
    out.caddy = { active: active.stdout.trim(), sites: listDirSafe(CADDY_SITES).map((name) => ({ name, enabled: true })) };
  }
  return out;
}

function listDirSafe(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
  } catch {
    return [];
  }
}

function siteDir(server) {
  if (server === 'caddy') return CADDY_SITES;
  if (server === 'nginx') return NGINX_AVAILABLE;
  throw Object.assign(new Error('Непознат уеб сървър'), { status: 400 });
}

export function readSite(server, name) {
  const full = path.join(siteDir(server), assertName(name));
  const st = fs.statSync(full);
  if (!st.isFile()) throw Object.assign(new Error('Не е файл'), { status: 400 });
  if (st.size > MAX_CONF) throw Object.assign(new Error('Конфигът е твърде голям'), { status: 400 });
  return { server, name, content: fs.readFileSync(full, 'utf8'), sizeBytes: st.size };
}

// Запис + валидация + reload. При невалиден конфиг връща стария и НЕ презарежда.
export async function writeSite(server, name, content, audit, user) {
  const dir = siteDir(server);
  const base = assertName(name);
  const full = path.join(dir, base);
  const text = String(content ?? '');
  if (text.length > MAX_CONF) throw Object.assign(new Error('Конфигът е твърде голям'), { status: 400 });

  const existed = fs.existsSync(full);
  const backup = existed ? fs.readFileSync(full, 'utf8') : null;
  audit.log({ action: 'webserver.write', server, name: base, bytes: text.length, user });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, text, { mode: 0o644 });

  const check = await validate(server);
  if (!check.ok) {
    // Откат — живият сървър не вижда счупения конфиг.
    if (existed) fs.writeFileSync(full, backup, { mode: 0o644 });
    else fs.rmSync(full, { force: true });
    audit.log({ action: 'webserver.rollback', server, name: base, user });
    throw Object.assign(new Error(`Конфигът е невалиден — върнах стария:\n${check.output}`), { status: 400 });
  }
  const rl = await reload(server);
  return { ok: true, validated: check.output, reloaded: rl.ok, reloadOutput: rl.output };
}

export async function validate(server) {
  if (server === 'nginx') {
    const r = await run('nginx', ['-t'], { timeout: 15000 });
    return { ok: r.ok, output: ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 3000) };
  }
  if (server === 'caddy') {
    const r = await run('caddy', ['validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], {
      timeout: 15000,
    });
    return { ok: r.ok, output: ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 3000) };
  }
  throw Object.assign(new Error('Непознат уеб сървър'), { status: 400 });
}

export async function reload(server) {
  if (server !== 'nginx' && server !== 'caddy') {
    throw Object.assign(new Error('Непознат уеб сървър'), { status: 400 });
  }
  const r = await run('systemctl', ['reload', server], { timeout: 20000 });
  return { ok: r.ok, output: ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 1000) };
}

export async function setEnabled(server, name, enabled, audit, user) {
  if (server !== 'nginx') throw Object.assign(new Error('Само за Nginx'), { status: 400 });
  const base = assertName(name);
  const link = path.join(NGINX_ENABLED, base);
  audit.log({ action: `webserver.${enabled ? 'enable' : 'disable'}`, name: base, user });
  if (enabled) {
    const target = path.join(NGINX_AVAILABLE, base);
    if (!fs.existsSync(target)) throw Object.assign(new Error('Няма такъв сайт'), { status: 400 });
    fs.symlinkSync(target, link);
  } else {
    fs.rmSync(link, { force: true });
  }
  const check = await validate('nginx');
  if (!check.ok) {
    // Връщаме състоянието на връзката, ако конфигът се счупи.
    if (enabled) fs.rmSync(link, { force: true });
    else fs.symlinkSync(path.join(NGINX_AVAILABLE, base), link);
    throw Object.assign(new Error(`Конфигът е невалиден — върнах състоянието:\n${check.output}`), { status: 400 });
  }
  await reload('nginx');
  return { ok: true, name: base, enabled: Boolean(enabled) };
}

// Обновяване на сертификатите. Пуска се като фонова задача (може да е бавно).
export function certRenewSpec({ dry = false } = {}) {
  return {
    title: dry ? 'certbot renew (проба)' : 'certbot renew',
    cmd: 'certbot',
    args: dry ? ['renew', '--dry-run'] : ['renew', '--non-interactive'],
    exclusive: 'system',
    timeoutMs: 15 * 60 * 1000,
  };
}
