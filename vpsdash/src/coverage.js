// Кои живи сайтове панелът НЕ следи.
//
// Секцията „Уеб сървър" изброяваше ФАЙЛОВЕТЕ във `sites-available` — вярно и
// почти безполезно, защото не отговаряше на въпроса, който има значение: за кой
// от тези сайтове ще разбера, ако падне? Панел с 14 vhost-а и 3 health проверки
// изглежда точно като панел с 14 покрити сайта — зелено навсякъде, защото за
// останалите 11 просто няма кой да пита.
//
// Това е същата доктрина като при портовете и бекъпа: тихото НЕПОКРИТИЕ е
// по-опасно от видимия проблем. Липсващата проверка не гърми никога — тя просто
// мълчи, докато клиентът не се обади.
//
// Разборът е нарочно ГРУБ и това е съзнателно: nginx конфигът е пълноценен език
// с `include`, променливи и map блокове. Тук не се строи парсер — вадят се
// `server_name` редовете и толкова. Ако някой домейн бъде пропуснат, резултатът е
// „предлагаме по-малко", не „твърдим покритие, каквото няма".
import fs from 'node:fs';
import path from 'node:path';

const NGINX_ENABLED = '/etc/nginx/sites-enabled';
const CADDY_SITES = '/etc/caddy/sites';

// Имена, които НЕ са домейн: заместващият знак на nginx, локалните и IP адресите.
// Пуснем ли ги нататък, панелът предлага да следи „_" — и човек спира да чете
// списъка, което е по-лошо от липсващия списък.
const NOT_A_DOMAIN = /^(_|localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/;

// `server_name a.com www.a.com;` → ['a.com', 'www.a.com']. Коментарите се режат
// ПРЕДИ разбора: `# server_name старото.com;` не е жив сайт.
export function parseServerNames(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^server_name\s+([^;]+);/);
    if (!m) continue;
    for (const name of m[1].split(/\s+/)) {
      const n = name.trim().toLowerCase();
      if (!n || NOT_A_DOMAIN.test(n)) continue;
      if (!/^[a-z0-9.*-]+\.[a-z]{2,}$/.test(n)) continue;
      out.push(n);
    }
  }
  return [...new Set(out)];
}

// Caddy: домейнът е самият начален ред на блока (`example.com {`).
export function parseCaddyNames(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([a-z0-9.,\s*-]+?)\s*\{$/i);
    if (!m) continue;
    for (const name of m[1].split(/[,\s]+/)) {
      const n = name.trim().toLowerCase();
      if (!n || NOT_A_DOMAIN.test(n)) continue;
      if (!/^[a-z0-9.*-]+\.[a-z]{2,}$/.test(n)) continue;
      out.push(n);
    }
  }
  return [...new Set(out)];
}

// `www.a.com` и `a.com` са ЕДИН сайт. Без тази нормализация панелът предлага да
// следиш два пъти едно и също и списъкът губи доверие.
export function canonical(domain) {
  return String(domain || '').toLowerCase().replace(/^www\./, '').replace(/^\*\./, '');
}

// Кои домейни вече са покрити: от health проверките (по URL или по име) и от
// следените за изтичане домейни.
export function coveredDomains(cfg) {
  const set = new Set();
  for (const h of cfg?.healthChecks || []) {
    if (h?.url) {
      try {
        const host = new URL(h.url).hostname;
        if (host && !NOT_A_DOMAIN.test(host)) set.add(canonical(host));
      } catch {
        /* невалиден URL в конфига — не чупи проверката */
      }
    }
    // Health проверка към 127.0.0.1 НЕ покрива домейна: тя мери дали процесът е
    // жив, не дали светът стига до него (изтекъл сертификат, счупен vhost, ufw).
    // Затова името се брои само ако прилича на домейн.
    if (h?.name && /\.[a-z]{2,}$/i.test(h.name)) set.add(canonical(h.name));
  }
  for (const d of cfg?.watchDomains || []) {
    const name = typeof d === 'string' ? d : d?.domain || d?.name;
    if (name) set.add(canonical(name));
  }
  return set;
}

function readDirFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.startsWith('.')) continue;
    const full = path.join(dir, e);
    try {
      const st = fs.statSync(full); // statSync следва symlink — sites-enabled са точно такива
      if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
      out.push({ file: e, text: fs.readFileSync(full, 'utf8') });
    } catch {
      /* счупен symlink — пропускаме */
    }
  }
  return out;
}

// Само ВКЛЮЧЕНИТЕ сайтове (`sites-enabled`). Файл в `sites-available` без връзка
// не се сервира от никого — да предлагаме проверка за него е чист шум.
export function siteCoverage(cfg) {
  const covered = coveredDomains(cfg);
  const sites = [];
  for (const { file, text } of readDirFiles(NGINX_ENABLED)) {
    for (const d of parseServerNames(text)) sites.push({ domain: d, file, server: 'nginx' });
  }
  for (const { file, text } of readDirFiles(CADDY_SITES)) {
    for (const d of parseCaddyNames(text)) sites.push({ domain: d, file, server: 'caddy' });
  }

  // Групираме по каноничен домейн: `a.com` и `www.a.com` са един ред.
  const byCanon = new Map();
  for (const s of sites) {
    const key = canonical(s.domain);
    if (!byCanon.has(key)) byCanon.set(key, { domain: key, aliases: [], file: s.file, server: s.server, watched: covered.has(key) });
    const rec = byCanon.get(key);
    if (s.domain !== key && !rec.aliases.includes(s.domain)) rec.aliases.push(s.domain);
  }

  const all = [...byCanon.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  return {
    total: all.length,
    watched: all.filter((s) => s.watched).length,
    unwatched: all.filter((s) => !s.watched),
    sites: all,
  };
}

// Добавянето на проверка е ОБИКНОВЕНА настройка, не мутация на системата: пише
// се ред в `healthChecks`, който панелът после чука. Затова минава без sudo — но
// през същата валидация като всичко останало.
export function healthCheckFor(domain) {
  const d = canonical(domain);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
    throw Object.assign(new Error(`Невалиден домейн: ${String(domain).slice(0, 60)}`), { status: 400 });
  }
  return { name: d, url: `https://${d}/`, expectStatus: 200 };
}
