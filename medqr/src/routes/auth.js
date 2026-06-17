import { Router } from 'express';
import { authenticator } from 'otplib';
import db from '../db.js';
import { decrypt } from '../crypto.js';
import { createForUser } from '../profiles.js';
import { audit } from '../audit.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  isLocked,
  registerFailedAttempt,
  resetAttempts,
  createPendingLogin,
  userIdFromPending,
  destroyPending,
} from '../auth.js';

const router = Router();
const CONSENT_VERSION = '1.0';
const MIN_PASSWORD = 10;
const prod = process.env.NODE_ENV === 'production';

const sessionCookie = {
  httpOnly: true,
  sameSite: 'lax',
  secure: prod,
  maxAge: 1000 * 60 * 60 * 24 * 7,
};
const pendingCookie = { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 1000 * 60 * 5 };

function startSession(res, userId) {
  res.cookie('sid', createSession(userId), sessionCookie);
}

// ---------- Регистрация ----------
router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { error: null, email: '' });
});

router.post('/register', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fullName = String(req.body.full_name || '').trim();
  const consent = req.body.consent === 'on' || req.body.consent === 'true';

  const fail = (msg, code = 400) =>
    res.status(code).render('register', { error: msg, email });

  if (!email || !password || !fullName) return fail('Имейл, парола и име са задължителни.');
  if (password.length < MIN_PASSWORD)
    return fail(`Паролата трябва да е поне ${MIN_PASSWORD} символа.`);
  if (!consent)
    return fail('Трябва да се съгласите с обработката на данните, за да продължите.');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return fail('Вече има регистрация с този имейл.', 409);

  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, consent_at, consent_version)
       VALUES (?, ?, datetime('now'), ?)`
    )
    .run(email, hashPassword(password), CONSENT_VERSION);

  createForUser(info.lastInsertRowid, fullName);
  audit(req, 'register', { userId: info.lastInsertRowid });
  audit(req, 'consent_given', {
    userId: info.lastInsertRowid,
    detail: `version ${CONSENT_VERSION}`,
  });

  startSession(res, info.lastInsertRowid);
  res.redirect('/dashboard');
});

// ---------- Вход ----------
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { error: null, email: '' });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // Еднакво съобщение при липсващ потребител и грешна парола (без разкриване).
  const bad = () =>
    res.status(401).render('login', { error: 'Грешен имейл или парола.', email });

  if (!user) return bad();
  if (isLocked(user)) {
    audit(req, 'login_locked', { userId: user.id });
    return res.status(429).render('login', {
      error: 'Профилът е временно заключен след твърде много опити. Опитайте по-късно.',
      email,
    });
  }
  if (!verifyPassword(password, user.password_hash)) {
    const locked = registerFailedAttempt(user);
    audit(req, locked ? 'login_lockout' : 'login_fail', { userId: user.id });
    return bad();
  }

  resetAttempts(user.id);

  if (user.totp_enabled) {
    const pending = createPendingLogin(user.id);
    res.cookie('p2fa', pending, pendingCookie);
    return res.redirect('/2fa');
  }

  startSession(res, user.id);
  audit(req, 'login_success', { userId: user.id });
  res.redirect('/dashboard');
});

// ---------- 2FA предизвикателство при вход ----------
router.get('/2fa', (req, res) => {
  if (!userIdFromPending(req.cookies?.p2fa)) return res.redirect('/login');
  res.render('2fa-verify', { error: null });
});

router.post('/2fa', (req, res) => {
  const userId = userIdFromPending(req.cookies?.p2fa);
  if (!userId) return res.redirect('/login');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const code = String(req.body.code || '').replace(/\s+/g, '');
  const secret = decrypt(user.totp_secret);

  if (!secret || !authenticator.check(code, secret)) {
    audit(req, 'twofactor_fail', { userId });
    return res.status(401).render('2fa-verify', { error: 'Грешен код.' });
  }

  destroyPending(req.cookies.p2fa);
  res.clearCookie('p2fa');
  startSession(res, userId);
  audit(req, 'login_success', { userId, detail: '2fa' });
  res.redirect('/dashboard');
});

// ---------- Изход ----------
router.post('/logout', (req, res) => {
  if (req.user) audit(req, 'logout', { userId: req.user.id });
  destroySession(req.cookies?.sid);
  res.clearCookie('sid');
  res.redirect('/login');
});

export default router;
