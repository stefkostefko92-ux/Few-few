// Регистрация, вход и изход.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Твърде много опити. Опитай отново след 15 минути.',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { title: 'Регистрация', error: null, values: {} });
});

router.post('/register', authLimiter, (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const type = req.body.type === 'company' ? 'company' : 'personal';
  const values = { name, email, type };

  const fail = (error) =>
    res.status(400).render('register', { title: 'Регистрация', error, values });

  if (name.length < 2 || name.length > 100) return fail('Въведи име (2–100 знака).');
  if (!EMAIL_RE.test(email) || email.length > 254) return fail('Невалиден имейл адрес.');
  if (password.length < 8 || password.length > 200)
    return fail('Паролата трябва да е поне 8 знака.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return fail('Вече има акаунт с този имейл. Опитай да влезеш.');

  const info = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, hashPassword(password));
  db.prepare(
    'INSERT INTO profiles (user_id, slug, type, display_name, contact_email) VALUES (?, ?, ?, ?, ?)'
  ).run(info.lastInsertRowid, uniqueSlug(name), type, name, email);

  createSession(res, Number(info.lastInsertRowid));
  res.redirect('/dashboard');
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
