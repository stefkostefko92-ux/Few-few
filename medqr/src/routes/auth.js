import { Router } from 'express';
import db from '../db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  randomToken,
} from '../auth.js';

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 24 * 7,
};

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { error: null, email: '' });
});

router.post('/register', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fullName = String(req.body.full_name || '').trim();

  if (!email || !password || !fullName) {
    return res.status(400).render('register', {
      error: 'Имейл, парола и име са задължителни.',
      email,
    });
  }
  if (password.length < 8) {
    return res.status(400).render('register', {
      error: 'Паролата трябва да е поне 8 символа.',
      email,
    });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.status(409).render('register', {
      error: 'Вече има регистрация с този имейл.',
      email,
    });
  }

  const info = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, hashPassword(password));

  // Създаваме празен профил с уникален спешен токен веднага.
  db.prepare(
    'INSERT INTO profiles (user_id, emergency_token, full_name) VALUES (?, ?, ?)'
  ).run(info.lastInsertRowid, randomToken(24), fullName);

  const sid = createSession(info.lastInsertRowid);
  res.cookie('sid', sid, COOKIE_OPTS);
  res.redirect('/dashboard');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { error: null, email: '' });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).render('login', {
      error: 'Грешен имейл или парола.',
      email,
    });
  }

  const sid = createSession(user.id);
  res.cookie('sid', sid, COOKIE_OPTS);
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  destroySession(req.cookies?.sid);
  res.clearCookie('sid');
  res.redirect('/login');
});

export default router;
