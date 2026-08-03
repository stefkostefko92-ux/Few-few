// Домейни и TLS — с проверка на DNS ПРЕДИ certbot.
//
// Причината: Let's Encrypt има строг лимит „5 провалени опита на час на акаунт и
// домейн". Пуснеш ли certbot срещу домейн, който още не сочи насам, изгаряш
// опитите за час — и после не можеш да издадеш сертификата дори когато DNS-ът
// вече е верен. Затова панелът първо проверява:
//
//   1. Домейнът резолвва ли се изобщо (A/AAAA)?
//   2. Сочи ли към НАШИЯ публичен адрес?
//   3. Има ли вече жив сертификат и колко му остава?
//
// и чак тогава дава бутона. За wildcard (*.example.com) HTTP-01 е невъзможен по
// дефиниция — там пътят е DNS-01, който иска TXT запис.
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { run } from './exec.js';
import { probe } from './probe.js';

const LE_LIVE = '/etc/letsencrypt/live';
export const DOMAIN_RX = /^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function assertDomain(d) {
  const s = String(d || '').trim().toLowerCase();
  if (!DOMAIN_RX.test(s) || s.length > 253) {
    throw Object.assign(new Error(`Невалиден домейн: „${d}"`), { status: 400 });
  }
  return s;
}

export function isWildcard(d) {
  return String(d || '').startsWith('*.');
}

// Публичният ни адрес — питаме мрежовия стек накъде би тръгнал трафикът, което
// дава адреса на изходящия интерфейс. Зад NAT това е ЧАСТЕН адрес и сравнението
// с DNS ще се разминава — затова резултатът носи и предупреждение.
export async function publicAddresses() {
  const out = { v4: null, v6: null, private: false, note: null };
  const r4 = await run('ip', ['-4', '-json', 'route', 'get', '1.1.1.1'], { timeout: 5000 });
  try {
    out.v4 = JSON.parse(r4.stdout)[0]?.prefsrc || null;
  } catch {
    /* без IPv4 маршрут */
  }
  const r6 = await run('ip', ['-6', '-json', 'route', 'get', '2606:4700:4700::1111'], { timeout: 5000 });
  try {
    out.v6 = JSON.parse(r6.stdout)[0]?.prefsrc || null;
  } catch {
    /* без IPv6 */
  }
  if (out.v4 && /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(out.v4)) {
    out.private = true;
    out.note = 'Изходящият адрес е частен (NAT) — сравнението с DNS ще се различава по дизайн.';
  }
  return out;
}

// Наличните сертификати от Let's Encrypt: домейни + дни до изтичане.
export async function certificates() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(LE_LIVE, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const out = [];
  for (const name of dirs.slice(0, 100)) {
    const cert = path.join(LE_LIVE, name, 'cert.pem');
    if (!fs.existsSync(cert)) continue;
    const [end, names] = await Promise.all([
      run('openssl', ['x509', '-enddate', '-noout', '-in', cert], { timeout: 8000 }),
      run('openssl', ['x509', '-noout', '-ext', 'subjectAltName', '-in', cert], { timeout: 8000 }),
    ]);
    const m = (end.stdout || '').match(/notAfter=(.+)/);
    const expiresAt = m ? new Date(m[1]) : null;
    out.push({
      name,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null,
      daysLeft: expiresAt && !Number.isNaN(expiresAt.getTime())
        ? Math.floor((expiresAt.getTime() - Date.now()) / 86400000)
        : null,
      domains: [...new Set((names.stdout || '').match(/DNS:([^\s,]+)/g)?.map((s) => s.slice(4)) || [])],
    });
  }
  return out.sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
}

// Проверката преди издаване. Нищо не се променя — само се гледа.
export async function preflight(domain) {
  const d = assertDomain(domain);
  const wildcard = isWildcard(d);
  const lookupName = wildcard ? d.slice(2) : d;
  const mine = await publicAddresses();
  const res = { domain: d, wildcard, server: mine, a: [], aaaa: [], caa: [], matches: null, http: null, problems: [], ready: false };

  try {
    res.a = (await dns.resolve4(lookupName)).slice(0, 10);
  } catch (err) {
    if (err.code !== 'ENODATA') res.problems.push(`Няма A запис за ${lookupName} (${err.code || err.message}).`);
  }
  try {
    res.aaaa = (await dns.resolve6(lookupName)).slice(0, 10);
  } catch {
    /* IPv6 е по избор */
  }
  // CAA ограничава КОЙ издател може да пише за домейна — забравен стар CAA е
  // класическата причина certbot да се проваля при иначе верен DNS.
  try {
    res.caa = (await dns.resolveCaa(lookupName)).slice(0, 10);
  } catch {
    /* липсващ CAA значи „всеки издател" — това е нормално */
  }
  const caaIssuers = res.caa.filter((c) => c.issue || c.issuewild).map((c) => c.issue || c.issuewild);
  if (caaIssuers.length && !caaIssuers.some((v) => /letsencrypt\.org|;/.test(String(v)))) {
    res.problems.push(`CAA записът позволява само: ${caaIssuers.join(', ')} — Let's Encrypt няма да издаде.`);
  }

  if (!res.a.length && !res.aaaa.length) {
    res.problems.push('Домейнът не се резолвва към нито един адрес — насочи го, преди да искаш сертификат.');
  } else if (mine.v4 || mine.v6) {
    res.matches = (mine.v4 && res.a.includes(mine.v4)) || (mine.v6 && res.aaaa.includes(mine.v6));
    if (!res.matches && !mine.private) {
      res.problems.push(
        `Домейнът сочи към ${[...res.a, ...res.aaaa].join(', ')}, а този сървър е ${mine.v4 || mine.v6}. ` +
          'Ако пред него стои CDN/прокси (Cloudflare), HTTP-01 иска временно изключено прокси или мини през DNS-01.'
      );
    }
  }

  if (wildcard) {
    res.problems.push('Wildcard сертификат НЕ може през HTTP-01 — задължително е DNS-01 (TXT запис _acme-challenge).');
  } else {
    // ACME чука на порт 80 и следва пренасочванията. Ако 80 е затворен, издаването
    // пада — по-добре да го научим сега, отколкото след изгорен лимит.
    try {
      res.http = await probe({ url: `http://${d}/.well-known/acme-challenge/csd-preflight` }, { timeoutMs: 8000 });
      // Всеки HTTP отговор върши работа — 404 за несъществуващото предизвикателство
      // е точно каквото очакваме. Липсата на отговор е проблемът.
      if (res.http.status == null) {
        res.problems.push(`Порт 80 не отговаря отвън (${res.http.error || 'без отговор'}) — HTTP-01 няма да мине (виж firewall/Nginx).`);
      }
    } catch {
      res.problems.push('Порт 80 не можа да бъде проверен отвън.');
    }
  }

  res.ready = res.problems.length === 0;
  return res;
}

// Издаване. Пуска се като фонова задача — certbot може да е бавен.
// НЕ е достъпно, докато preflight не мине: маршрутът го проверява преди старт.
export function issueSpec(domains, { email = '', webroot = '', dnsPlugin = '', staging = false } = {}) {
  const list = domains.map(assertDomain);
  if (!list.length) throw Object.assign(new Error('Няма домейни'), { status: 400 });
  const args = ['certonly', '--non-interactive', '--agree-tos'];
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Невалиден имейл'), { status: 400 });
    args.push('-m', email);
  } else {
    args.push('--register-unsafely-without-email');
  }
  if (list.some(isWildcard)) {
    if (!dnsPlugin) {
      throw Object.assign(
        new Error('Wildcard иска DNS-01 — избери плъгин (напр. dns-cloudflare) с настроен credentials файл на сървъра.'),
        { status: 400 }
      );
    }
  }
  if (dnsPlugin) {
    if (!/^dns-[a-z0-9-]{2,32}$/.test(dnsPlugin)) throw Object.assign(new Error('Невалиден DNS плъгин'), { status: 400 });
    args.push(`--${dnsPlugin}`);
  } else if (webroot) {
    const w = path.resolve(webroot);
    if (!fs.existsSync(w)) throw Object.assign(new Error('Няма такава webroot папка'), { status: 400 });
    args.push('--webroot', '-w', w);
  } else {
    args.push('--nginx');
  }
  // Пробното издаване е срещу staging средата — не гори бойния лимит.
  if (staging) args.push('--staging');
  for (const d of list) args.push('-d', d);
  return {
    title: `certbot: ${list.join(', ')}${staging ? ' (проба)' : ''}`,
    cmd: 'certbot',
    args,
    exclusive: 'system',
    timeoutMs: 10 * 60 * 1000,
  };
}
