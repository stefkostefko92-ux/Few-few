// Регистрация, вход, изход и нулиране на паролата.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import db from '../db.js';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  isReservedAdminEmail,
  createSession,
  destroySession,
  startPendingLogin,
  pendingLoginUser,
  clearPendingLogin,
} from '../auth.js';
import { verifySecondFactor, remainingRecoveryCodes } from '../twofactor.js';
import { csrfProtect, sameOriginOnly } from '../csrf.js';
import { uniqueSlug } from '../slug.js';
import { sendPasswordReset, sendVerifyEmail, notifySafely } from '../mailer.js';
import { issueToken, cancelPendingChange } from '../emailflow.js';
import { baseUrl } from '../config.js';

const RESET_TTL_MS = 60 * 60 * 1000; // токенът за нулиране важи 1 час
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Лимитът е по IP и е споделен между /login, /register, /forgot и /reset.
  // Конфигурируем е само за да може тестовият пакет (всичко от 127.0.0.1) да не
  // се самоограничава; в продукция остава 20.
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Твърде много опити. Опитай отново след 15 минути.',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clip = (v, n) =>
  String(v || '')
    .trim()
    .slice(0, n);

// Prefill от Мастилко: „Направи я жива визитка" носи данните на дизайна в URL-а.
// Само публичните текстови полета — БЕЗ имейл (privacy-by-default, чл. 25(2) ОРЗД).
function mastilkoPrefill(src) {
  const website = clip(src.website, 200);
  return {
    role: clip(src.role, 120),
    company: clip(src.company, 120),
    phone: clip(src.phone, 40),
    website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
  };
}

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  const fromMastilko = req.query.from === 'mastilko';
  res.render('register', {
    title: 'Регистрация',
    error: null,
    values: {
      name: clip(req.query.name, 100),
      email: clip(req.query.email, 254),
      type: req.query.type === 'company' ? 'company' : 'personal',
    },
    prefill: mastilkoPrefill(req.query),
    fromMastilko,
  });
});

router.post('/register', sameOriginOnly, authLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const type = req.body.type === 'company' ? 'company' : 'personal';
  const values = { name, email, type };
  const prefill = mastilkoPrefill(req.body);
  const fromMastilko = req.body.from === 'mastilko';

  const fail = (error) =>
    res
      .status(400)
      .render('register', { title: 'Регистрация', error, values, prefill, fromMastilko });

  if (name.length < 2 || name.length > 100) return fail('Въведи име (2–100 знака).');
  if (!EMAIL_RE.test(email) || email.length > 254) return fail('Невалиден имейл адрес.');
  if (password.length < 8 || password.length > 200)
    return fail('Паролата трябва да е поне 8 знака.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return fail('Вече има акаунт с този имейл. Опитай да влезеш.');
  // Админските имейли не се регистрират от сайта — иначе всеки, който познае
  // адреса, си взема правата. Провизионират се от сървъра (`npm run admin:add`).
  if (isReservedAdminEmail(email))
    return fail('Този имейл не може да се регистрира оттук. Свържи се с администратор.');

  const info = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, await hashPassword(password));
  // Privacy-by-default: профилът тръгва СКРИТ и без предварително попълнен имейл —
  // потребителят сам решава какво да публикува от таблото (чл. 25(2) ОРЗД).
  db.prepare(
    'INSERT INTO profiles (user_id, slug, type, display_name, is_public) VALUES (?, ?, ?, ?, 0)'
  ).run(info.lastInsertRowid, uniqueSlug(name), type, name);

  // Prefill от Мастилко („Направи я жива визитка"): попълваме публичните полета на
  // новата (скрита) визитка. Имейл НЕ пипаме — остава по избор от таблото.
  if (fromMastilko && (prefill.role || prefill.company || prefill.phone || prefill.website)) {
    db.prepare(
      `UPDATE profiles SET headline = @role, company = @company, phone = @phone, website = @website
       WHERE user_id = @uid`
    ).run({ ...prefill, uid: info.lastInsertRowid });
  }

  // Потвърждаване на имейла — по избор, не спира нищо (виж src/emailflow.js).
  const verifyToken = issueToken(Number(info.lastInsertRowid), 'verify', email);
  sendVerifyEmail(email, `${baseUrl(req)}/verify-email?token=${verifyToken}`).catch((err) =>
    console.error('Писмото за потвърждаване не беше изпратено:', err.message)
  );

  createSession(res, Number(info.lastInsertRowid), req);
  res.redirect(fromMastilko ? '/dashboard?welcome=mastilko' : '/dashboard');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Вход', error: null, values: {} });
});

router.post('/login', sameOriginOnly, authLimiter, async (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Няма ли такъв потребител, пак плащаме цената на bcrypt срещу фиктивен хеш —
  // иначе времето на отговора издава кои имейли са регистрирани.
  const okPassword = user
    ? await verifyPassword(password, user.password_hash)
    : await verifyDummyPassword(password);
  if (!user || !okPassword) {
    return res
      .status(401)
      .render('login', { title: 'Вход', error: 'Грешен имейл или парола.', values: { email } });
  }
  // Включен ли е 2FA — паролата сама не стига: сесия има едва след верния код.
  if (user.totp_enabled) {
    startPendingLogin(res, user.id);
    return res.redirect('/login/2fa');
  }
  createSession(res, user.id, req);
  res.redirect('/dashboard');
});

// ── Втора стъпка на входа (2FA) ──────────────────────────────────────────────
router.get('/login/2fa', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  if (!pendingLoginUser(req)) return res.redirect('/login');
  res.render('login-2fa', { title: 'Код за вход', error: null });
});

router.post('/login/2fa', sameOriginOnly, authLimiter, (req, res) => {
  const user = pendingLoginUser(req);
  // Изтекла/липсваща първа стъпка → обратно към паролата (не издаваме нищо повече).
  if (!user) return res.redirect('/login');
  const method = verifySecondFactor(user, req.body.code);
  if (!method)
    return res.status(401).render('login-2fa', {
      title: 'Код за вход',
      error: 'Грешен или вече използван код. Опитай с нов код от приложението.',
    });
  clearPendingLogin(res);
  createSession(res, user.id, req);
  // Влязъл с резервен код → насочваме към настройките: кодовете намаляват, а
  // телефонът вероятно е изгубен.
  if (method === 'recovery') {
    const left = remainingRecoveryCodes(user.id);
    notifySafely(
      user.email,
      'Влизане в акаунта ти с резервен код',
      `Използван е един от резервните кодове за двуфакторно влизане; остават ${left}.`
    );
    return res.redirect(`/settings?recovery_used=${left}`);
  }
  res.redirect('/dashboard');
});

// ── Забравена парола ─────────────────────────────────────────────────────────
router.get('/forgot', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('forgot', { title: 'Забравена парола', sent: false, error: null });
});

router.post('/forgot', sameOriginOnly, authLimiter, async (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  // Винаги отговаряме еднакво — без разкриване дали имейлът съществува.
  const done = () => res.render('forgot', { title: 'Забравена парола', sent: true, error: null });
  if (!EMAIL_RE.test(email)) return done();

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id); // само 1 активен
    db.prepare(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
    ).run(user.id, sha256(token), Date.now() + RESET_TTL_MS);
    try {
      await sendPasswordReset(email, `${baseUrl(req)}/reset?token=${token}`);
    } catch (err) {
      console.error('Изпращане на имейл за нулиране се провали:', err.message);
    }
  }
  done();
});

// Намира валиден (неизползван, неизтекъл) reset запис по токен от URL.
function findReset(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  return db
    .prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > ?')
    .get(sha256(token), Date.now());
}

router.get('/reset', (req, res) => {
  const reset = findReset(req.query.token);
  if (!reset)
    return res.status(400).render('reset', {
      title: 'Нулиране на паролата',
      token: null,
      error: 'Връзката е невалидна или изтекла. Заяви ново нулиране.',
    });
  res.render('reset', { title: 'Нулиране на паролата', token: req.query.token, error: null });
});

router.post('/reset', sameOriginOnly, authLimiter, async (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  const reset = findReset(token);
  const fail = (error) =>
    res.status(400).render('reset', { title: 'Нулиране на паролата', token, error });
  if (!reset) return fail('Връзката е невалидна или изтекла. Заяви ново нулиране.');
  if (password.length < 8 || password.length > 200)
    return fail('Паролата трябва да е поне 8 знака.');

  const newHash = await hashPassword(password);
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
    // Инвалидираме всички сесии на потребителя — новата парола е задължителна.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id);
    // Висяща смяна на имейла (може да е на нападателя) — също отпада.
    cancelPendingChange(reset.user_id);
  });
  tx();
  const owner = db.prepare('SELECT email FROM users WHERE id = ?').get(reset.user_id);
  if (owner)
    notifySafely(
      owner.email,
      'Паролата за акаунта ти е сменена',
      'Смяната е през „Забравена парола“; всички устройства излязоха от акаунта.'
    );
  res.render('login', {
    title: 'Вход',
    error: null,
    values: {},
    notice: 'Паролата е сменена. Влез с новата.',
  });
});

router.post('/logout', csrfProtect, (req, res) => {
  destroySession(req, res);
  res.redirect('/');
});

export default router;
