// Режим „sudo" — повторна автентикация за необратимите действия.
//
// Моделът на заплахата, който това затваря: сесията е валидна 12 часа, а панелът
// управлява ЦЕЛИЯ сървър. Открадната бисквитка (или отворен лаптоп) значи изтрит
// продукт, изключен сървър или възстановена стара база — без нито едно доказване
// на самоличност. Паролата (и TOTP кодът, ако е включен) отново, точно преди
// действието, е разликата между „някой има сесията ти" и „някой е ТИ".
//
// Прозорецът е кратък и НЕ се плъзга: изтича от момента на потвърждаване, за да
// не се превърне в „вечен sudo" при активна работа. Вързан е за конкретната
// сесия (jti) — иначе потвърждаване в един браузър отключва действия в друг.
import crypto from 'node:crypto';
import { verifyPassword } from './auth.js';
import { verifyTotp, verifyRecoveryCode } from './totp.js';

export const SUDO_TTL_MS = 5 * 60 * 1000;

// Два списъка, защото „опасно" не значи „мутация".
//
// ВСЯКА заявка (вкл. GET): пътища, които дават контрол над машината дори при
// четене — жив терминал по SSE е изпълнение на код, не преглед.
export const SUDO_ALWAYS = [
  /^\/api\/terminal\//,
  /^\/api\/pty(\/|$)/,
];

// САМО мутации: четенето им е безобидно (кой е списъкът с адреси, какви лимити
// има). Ако и четенето искаше парола, панелът щеше да пита на всяка втора
// секция — а изморената защита се изключва.
export const SUDO_ON_WRITE = [
  /^\/api\/power$/,
  /^\/api\/backups\/restore\/apply$/,
  /^\/api\/deploy\/(run|rollback)$/,
  /^\/api\/env\/file$/, // запис на тайни на продукцията
  /^\/api\/agents\/tools\/run$/,
  /^\/api\/firewall\//,
  /^\/api\/totp\/(enable|disable)$/,
  /^\/api\/settings\/access$/,
  /^\/api\/limits(\/|$)/,
];

export function needsSudo(pathname, cfg, { mutating = false } = {}) {
  if (cfg?.sudoMode?.enabled === false) return false;
  if (SUDO_ALWAYS.some((rx) => rx.test(pathname))) return true;
  return mutating && SUDO_ON_WRITE.some((rx) => rx.test(pathname));
}

export class SudoGrants {
  constructor() {
    this.grants = new Map(); // jti → изтича в (ms)
  }

  // Разрешението е за КОНКРЕТНАТА сесия, не за потребителя.
  grant(jti, ttlMs = SUDO_TTL_MS) {
    if (!jti) return null;
    const until = Date.now() + ttlMs;
    this.grants.set(jti, until);
    this.prune();
    return until;
  }

  has(jti) {
    if (!jti) return false;
    const until = this.grants.get(jti);
    if (!until) return false;
    if (until <= Date.now()) {
      this.grants.delete(jti);
      return false;
    }
    return true;
  }

  remaining(jti) {
    const until = this.grants.get(jti);
    return until && until > Date.now() ? until - Date.now() : 0;
  }

  revoke(jti) {
    this.grants.delete(jti);
  }

  prune() {
    const now = Date.now();
    for (const [k, v] of this.grants) if (v <= now) this.grants.delete(k);
  }
}

// Ограничител за самото потвърждаване: без него sudo екранът се превръща в
// оракул за налучкване на паролата — с валидна сесия, но открадната.
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export function _resetSudoLimiter() {
  attempts.clear();
}

export function sudoAllowed(jti) {
  const rec = attempts.get(jti);
  if (!rec) return true;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(jti);
    return true;
  }
  return rec.count < MAX_ATTEMPTS;
}

export function sudoFailed(jti) {
  const rec = attempts.get(jti) || { first: Date.now(), count: 0 };
  rec.count++;
  attempts.set(jti, rec);
  // Таван на картата — иначе е тих път към изчерпана памет.
  if (attempts.size > 1000) {
    const oldest = [...attempts.entries()].sort((a, b) => a[1].first - b[1].first).slice(0, 500);
    for (const [k] of oldest) attempts.delete(k);
  }
}

export function sudoSucceeded(jti) {
  attempts.delete(jti);
}

// Потвърждаване: парола + (ако 2FA е включена) TOTP код или резервен код.
// Резервният код се ИЗРАЗХОДВА и тук — иначе би останал валиден завинаги.
export function confirmSudo(cfg, { password, code }, saveConfig) {
  if (!verifyPassword(password || '', cfg.passwordHash)) {
    return { ok: false, error: 'Грешна парола.' };
  }
  if (cfg.totp?.enabled) {
    const c = String(code || '').trim();
    if (!c) return { ok: false, error: 'Липсва код от приложението.' };
    if (verifyTotp(cfg.totp.secret, c)) return { ok: true };
    const idx = verifyRecoveryCode(c, cfg.totp.recoveryHashes || []);
    if (idx >= 0) {
      const left = [...(cfg.totp.recoveryHashes || [])];
      left.splice(idx, 1);
      saveConfig?.(cfg, { totp: { ...cfg.totp, recoveryHashes: left } });
      return { ok: true, usedRecovery: true, recoveryLeft: left.length };
    }
    return { ok: false, error: 'Грешен код.' };
  }
  return { ok: true };
}

// ── Списък с разрешени IP адреси ─────────────────────────────────────────────
// Втора врата пред паролата. Полезна дори зад Nginx+TLS: скенер, който намери
// панела, не стига дори до формата за вход.
//
// ВАЖНО: работи само при вярно прочетен клиентски адрес. Зад прокси това значи
// `trustProxy: true` И прокси, което ПРЕЗАПИСВА X-Real-IP (не го подава от
// клиента) — иначе списъкът се заобикаля с един хедър.
export function parseCidr(entry) {
  const s = String(entry || '').trim();
  if (!s) return null;
  const [addr, bitsRaw] = s.split('/');
  const v6 = addr.includes(':');
  const maxBits = v6 ? 128 : 32;
  const bits = bitsRaw == null ? maxBits : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) return null;
  const packed = v6 ? packV6(addr) : packV4(addr);
  if (!packed) return null;
  return { v6, bits, packed, raw: s };
}

function packV4(addr) {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  const out = Buffer.alloc(4);
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!/^\d{1,3}$/.test(parts[i]) || !Number.isInteger(n) || n < 0 || n > 255) return null;
    out[i] = n;
  }
  return out;
}

function packV6(addr) {
  // Съкратената форма („::1", „2001:db8::") е норма, не изключение.
  const clean = addr.replace(/^\[|\]$/g, '').split('%')[0];
  const dbl = clean.split('::');
  if (dbl.length > 2) return null;
  const head = dbl[0] ? dbl[0].split(':') : [];
  const tail = dbl.length === 2 ? (dbl[1] ? dbl[1].split(':') : []) : null;
  const groups = tail === null ? head : [...head, ...new Array(8 - head.length - tail.length).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const out = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/i.test(groups[i])) return null;
    const n = parseInt(groups[i], 16);
    out[i * 2] = n >> 8;
    out[i * 2 + 1] = n & 255;
  }
  return out;
}

export function ipMatches(ip, cidr) {
  if (!cidr) return false;
  // IPv4 в IPv6 обвивка („::ffff:1.2.3.4") — Node дава точно това при dual-stack.
  const plain = String(ip || '').replace(/^::ffff:/i, '').split('%')[0];
  const v6 = plain.includes(':');
  if (v6 !== cidr.v6) return false;
  const packed = v6 ? packV6(plain) : packV4(plain);
  if (!packed) return false;
  const full = cidr.bits >> 3;
  const rest = cidr.bits & 7;
  for (let i = 0; i < full; i++) if (packed[i] !== cidr.packed[i]) return false;
  if (rest) {
    const mask = 0xff << (8 - rest) & 0xff;
    if ((packed[full] & mask) !== (cidr.packed[full] & mask)) return false;
  }
  return true;
}

// Празен списък = изключено (не „никой не влиза") — иначе едно погрешно записване
// заключва собственика извън собствения му сървър.
export function ipAllowed(ip, list) {
  const entries = (list || []).map(parseCidr).filter(Boolean);
  if (!entries.length) return true;
  return entries.some((c) => ipMatches(ip, c));
}

export function validateAllowlist(list) {
  const out = [];
  for (const e of list || []) {
    const c = parseCidr(e);
    if (!c) throw Object.assign(new Error(`Невалиден адрес или CIDR: „${e}"`), { status: 400 });
    out.push(c.raw);
  }
  return out;
}

export { crypto as _crypto };
