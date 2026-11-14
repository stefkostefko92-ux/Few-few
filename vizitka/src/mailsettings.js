// Пощата на сайта от админ панела (/admin/poshta) — моделът на rilievi/src/mail/posta.ts (Brevo SMTP).
//
// Откъде тръгват писмата: настройката от админ панела, докато е включена; иначе SMTP_* от средата;
// иначе никъде (dev кутията на mailer.js). Настройката се държи в паметта на процеса и се подменя при
// запис — `mailParams()` е синхронна (SQLite е синхронен, четем при първото поискване).
//
// Ключът: само се пише (празно поле — остава записаният), шифрован в базата (seal.js), никога не се
// показва и не влиза в одита. Записаният ключ важи само за записания сървър И логин — смени ли се
// някое, ключът се пише наново (иначе ключът на Brevo би отишъл при непознат сървър).
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import db from './db.js';
import { seal, unseal } from './seal.js';

const SMTP_INFO = 'vizitka/smtp-pass/v1';
export const PORTS = [587, 2525, 465]; // 587/2525 — STARTTLS (2525 минава и при блокиран 587); 465 — TLS
export const DEFAULTS = {
  host: 'smtp-relay.brevo.com',
  port: '2525',
  username: '',
  from_name: 'Vizitka',
  from_email: 'no-reply@vizitka-bg.com',
};

const prod = () => process.env.NODE_ENV === 'production';
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const CONTROL = /\p{Cc}/u;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

let cache; // undefined — още не е четено; null — няма включена настройка
let version = 0;
export const mailVersion = () => version;

const getRow = () => db.prepare("SELECT * FROM mail_settings WHERE id = 'mail'").get();

function fromRow(r) {
  const pass = unseal(SMTP_INFO, r.pass_enc);
  if (pass === null) {
    // Ключът не се разшифрова (сменен ACCOUNT_SECRET/PRINT_API_SECRET) — както без настройка.
    console.error('Пощата от админ панела: ключът не се разшифрова — ползва се средата.');
    return null;
  }
  // Тестовият SMTP сървър слуша на случаен порт; извън тестовете портът е винаги записаният.
  const testPort =
    process.env.NODE_ENV === 'test' && r.host === 'localhost' && process.env.VIZITKA_TEST_SMTP_PORT;
  return {
    host: r.host,
    port: testPort ? Number(testPort) : r.port,
    secure: r.port === 465,
    user: r.username,
    pass,
    from: { name: r.from_name, address: r.from_email },
    source: 'admin',
  };
}

export function reloadMail() {
  const r = getRow();
  cache = r && r.active ? fromRow(r) : null;
  version += 1;
}

/** Параметрите, с които тръгва писмо сега, или null — няма SMTP (писмата отиват в dev кутията). */
export function mailParams() {
  if (cache === undefined) reloadMail();
  if (cache) return cache;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    user: user && pass ? user : undefined,
    pass: user && pass ? pass : undefined,
    from: process.env.MAIL_FROM || 'Vizitka <no-reply@vizitka-bg.com>',
    source: 'env',
  };
}

/** За страницата: записаното (без ключа) и откъде тръгват писмата сега. */
export function mailStatus() {
  const r = db
    .prepare(
      `SELECT m.host, m.port, m.username, m.from_name, m.from_email, m.active, m.updated_at,
              u.email AS updated_by_email
         FROM mail_settings m LEFT JOIN users u ON u.id = m.updated_by WHERE m.id = 'mail'`
    )
    .get();
  return { row: r || null, source: mailParams()?.source ?? null };
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

function hostOf(raw) {
  const v = text(raw).toLowerCase();
  if (!v || v.length > 253) return null;
  // Извън продукция — и localhost/IP (локален тест). В продукция само име: панелът не е скенер на
  // вътрешната мрежа.
  if (!prod() && (v === 'localhost' || isIP(v) !== 0)) return v;
  return HOSTNAME.test(v) ? v : null;
}

/**
 * Чете формата строго. Връща { ok: true, values } или { ok: false, errors: {поле: текст} }.
 * values.password е null — остава записаният ключ.
 */
export function readMailForm(body) {
  const errors = {};
  const saved = getRow();
  const host = hostOf(body.host);
  if (!host) errors.host = 'Напиши името на сървъра, например smtp-relay.brevo.com.';

  const port = PORTS.find((p) => p === Number(text(body.port))) ?? null;
  if (port === null) errors.port = 'Избери един от портовете в списъка.';

  const username = text(body.username);
  if (!username || username.length > 254 || /\s/.test(username) || CONTROL.test(username))
    errors.username = 'Напиши SMTP логина, без интервали.';

  // Ключът — както е написан (без trim), без управляващи знаци (SMTP команди).
  const raw = typeof body.password === 'string' ? body.password : '';
  let password = null;
  if (!raw) {
    if (!saved) errors.password = 'Напиши SMTP ключа.';
    else if (host && (host !== saved.host || username !== saved.username))
      errors.password = 'Смени сървъра или логина — напиши SMTP ключа наново.';
  } else if (raw.length > 512 || CONTROL.test(raw)) errors.password = 'Напиши SMTP ключа.';
  else password = raw;

  const from_name = text(body.from_name);
  if (!from_name || from_name.length > 80 || /[<>"\\]/.test(from_name) || CONTROL.test(from_name))
    errors.from_name = 'До 80 знака, без < > и кавички.';

  const from_email = text(body.from_email).toLowerCase();
  if (from_email.length > 254 || CONTROL.test(from_email) || !EMAIL.test(from_email))
    errors.from_email = 'Напиши валиден имейл адрес.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { host, port, username, password, from_name, from_email } };
}

/**
 * Частен/вътрешен адрес ли е (loopback, RFC 1918, link-local, CGNAT, ULA, нулев, multicast).
 * В продукция SMTP сървърът не бива да сочи навътре — панелът не е скенер на вътрешната мрежа
 * (ревю на Кодаджията, 14.11.2026: име като 127.0.0.1.nip.io минава проверката на името).
 */
export function privateAddress(ip) {
  const v = String(ip).toLowerCase();
  const m4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (m4) {
    const [a, b] = [Number(m4[1]), Number(m4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
}

/**
 * В продукция: сървърът трябва да се резолвира само към публични адреси. Извън продукция — винаги
 * true (локален тест). Не пази от DNS rebinding между проверката и свързването — само от явно
 * вътрешно име; пълната защита би искала свързване към проверения IP.
 */
export async function publicHost(host) {
  if (!prod()) return true;
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateAddress(a.address));
  } catch {
    return false;
  }
}

const audit = (actor, action, detail = '') =>
  db
    .prepare(
      `INSERT INTO admin_audit (admin_user_id, admin_email, profile_id, action, detail)
       VALUES (?, ?, 0, ?, ?)`
    )
    .run(actor.id, actor.email, action, detail);

export class MailConflictError extends Error {
  constructor() {
    super('Настройката е сменена междувременно — напиши SMTP ключа наново.');
  }
}

/** Записва и включва настройката. Одит — без ключа и без логина. */
export function saveMail(actor, v) {
  db.transaction(() => {
    const exists = getRow();
    // Празен ключ важи само за СЪЩИЯ сървър и логин — проверено наново тук, в транзакцията:
    // между четенето на формата и записа (bcrypt) друг админ може да е записал нов сървър.
    if (
      v.password === null &&
      (!exists || exists.host !== v.host || exists.username !== v.username)
    )
      throw new MailConflictError();
    const pass_enc = v.password !== null ? seal(SMTP_INFO, v.password) : exists.pass_enc;
    db.prepare(
      `INSERT INTO mail_settings (id, host, port, username, pass_enc, from_name, from_email, active, updated_at, updated_by)
       VALUES ('mail', @host, @port, @username, @pass_enc, @from_name, @from_email, 1, datetime('now'), @by)
       ON CONFLICT(id) DO UPDATE SET host = @host, port = @port, username = @username,
         pass_enc = @pass_enc, from_name = @from_name, from_email = @from_email, active = 1,
         updated_at = datetime('now'), updated_by = @by`
    ).run({ ...v, pass_enc, by: actor.id });
    audit(actor, 'mail_set', `port=${v.port}; нов ключ=${v.password !== null ? 'да' : 'не'}`);
  })();
  reloadMail();
}

/** Изключва (остава записана): писмата — пак от средата, ако я има. */
export function disableMail(actor) {
  const n = db
    .prepare(
      "UPDATE mail_settings SET active = 0, updated_at = datetime('now'), updated_by = ? WHERE id = 'mail' AND active = 1"
    )
    .run(actor.id).changes;
  if (n) audit(actor, 'mail_off');
  reloadMail();
  return n > 0;
}

export const auditMailTest = (actor, result) => audit(actor, 'mail_test', result);
