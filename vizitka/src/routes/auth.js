// Регистрация, вход, изход и нулиране на паролата.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import db from '../db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  requireAuth,
} from '../auth.js';
import { csrfProtect } from '../csrf.js';
import { uniqueSlug } from '../slug.js';
import { sendPasswordReset } from '../mailer.js';
import { baseUrl } from '../config.js';

const RESET_TTL_MS = 60 * 60 * 1000; // токенът за нулиране важи 1 час
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
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

router.post('/register', authLimiter, (req, res) => {
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

  const info = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, hashPassword(password));
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

  createSession(res, Number(info.lastInsertRowid));
  res.redirect(fromMastilko ? '/dashboard?welcome=mastilko' : '/dashboard');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Вход', error: null, values: {} });
});

router.post('/login', authLimiter, (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res
      .status(401)
      .render('login', { title: 'Вход', error: 'Грешен имейл или парола.', values: { email } });
  }
  createSession(res, user.id);
  res.redirect('/dashboard');
});

// ── Забравена парола ─────────────────────────────────────────────────────────
router.get('/forgot', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('forgot', { title: 'Забравена парола', sent: false, error: null });
});

router.post('/forgot', authLimiter, async (req, res) => {
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

router.post('/reset', authLimiter, (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  const reset = findReset(token);
  const fail = (error) =>
    res.status(400).render('reset', { title: 'Нулиране на паролата', token, error });
  if (!reset) return fail('Връзката е невалидна или изтекла. Заяви ново нулиране.');
  if (password.length < 8 || password.length > 200)
    return fail('Паролата трябва да е поне 8 знака.');

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(password),
      reset.user_id
    );
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
    // Инвалидираме всички сесии на потребителя — новата парола е задължителна.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id);
  });
  tx();
  res.render('login', {
    title: 'Вход',
    error: null,
    values: {},
    notice: 'Паролата е сменена. Влез с новата.',
  });
});

// Смяна на парола от таблото (изисква текущата парола).
router.post('/settings/password', requireAuth, csrfProtect, authLimiter, (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, user.password_hash)) {
    return res.status(400).send('Грешна текуща парола. Върни се и опитай пак.');
  }
  if (next.length < 8 || next.length > 200) {
    return res.status(400).send('Новата парола трябва да е поне 8 знака. Върни се и опитай пак.');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    hashPassword(next),
    req.user.id
  );
  // Инвалидираме всички други сесии — само текущата остава.
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.user.id, req.session.id);
  res.redirect('/dashboard?pw=1');
});

router.post('/logout', csrfProtect, (req, res) => {
  destroySession(req, res);
  res.redirect('/');
});

export default router;
