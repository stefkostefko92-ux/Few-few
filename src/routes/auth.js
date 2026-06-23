import { Router } from 'express';
import { authenticator } from 'otplib';
import db from '../db.js';
import { decrypt } from '../crypto.js';
import { createForUser } from '../profiles.js';
import { audit } from '../audit.js';
import { sendMail, baseUrl } from '../mailer.js';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  createSession,
  sessionCookieOptions,
  destroySession,
  isLocked,
  registerFailedAttempt,
  resetAttempts,
  createPendingLogin,
  userIdFromPending,
  destroyPending,
  createToken,
  consumeToken,
  peekToken,
  destroyUserSessions,
  requireAuth,
  consumeRecoveryCode,
} from '../auth.js';

const router = Router();
const CONSENT_VERSION = '1.0';
const MIN_PASSWORD = 10;
const prod = process.env.NODE_ENV === 'production';

async function sendVerification(req, userId, email) {
  const raw = createToken(userId, 'verify', 1440); // 24 часа
  const link = `${baseUrl(req)}/verify-email/${raw}`;
  try {
    await sendMail({
      to: email,
      subject: 'Потвърдете имейла си — MedQR',
      text: `Здравейте,\n\nЗа да активирате профила си в MedQR, потвърдете имейла си:\n${link}\n\nЛинкът е валиден 24 часа. Ако не сте се регистрирали, игнорирайте това писмо.`,
    });
  } catch (e) {
    console.error('Грешка при изпращане на имейл:', e.message);
  }
}

const pendingCookie = { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 1000 * 60 * 5 };

// remember=true → дълготрайна сесия (за приложението / „остани вписан“).
function startSession(req, res, userId, remember = false) {
  const { token, maxAge } = createSession(userId, req, remember);
  res.cookie('sid', token, sessionCookieOptions(maxAge));
}

// ---------- Регистрация ----------
router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { error: null, email: '' });
});

router.post('/register', async (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const fullName = String(req.body.full_name || '').trim();
  const consent = req.body.consent === 'on' || req.body.consent === 'true';

  const t = res.locals.t;
  const fail = (msg, code = 400) => res.status(code).render('register', { error: msg, email });

  if (!email || !password || !fullName) return fail(t('err.required_all'));
  if (password.length < MIN_PASSWORD) return fail(t('err.password_min', { n: MIN_PASSWORD }));
  if (!consent) return fail(t('err.consent_needed'));
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return fail(t('err.email_taken'), 409);

  const pwHash = await hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, consent_at, consent_version)
       VALUES (?, ?, datetime('now'), ?)`
    )
    .run(email, pwHash, CONSENT_VERSION);

  createForUser(info.lastInsertRowid, fullName);
  audit(req, 'register', { userId: info.lastInsertRowid });
  audit(req, 'consent_given', {
    userId: info.lastInsertRowid,
    detail: `version ${CONSENT_VERSION}`,
  });
  await sendVerification(req, info.lastInsertRowid, email);

  startSession(req, res, info.lastInsertRowid, true); // новорегистрираният остава вписан
  res.redirect('/dashboard');
});

// ---------- Потвърждение на имейл ----------
router.get('/verify-email/:token', (req, res) => {
  const t = res.locals.t;
  const userId = consumeToken(req.params.token, 'verify');
  if (!userId) {
    return res.status(400).render('notice', {
      user: req.user,
      title: t('msg.link_invalid_title'),
      message: t('msg.verify_invalid'),
      link: { href: '/login', label: t('msg.to_login') },
    });
  }
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
  audit(req, 'email_verified', { userId });
  res.render('notice', {
    user: req.user,
    icon: 'check',
    title: t('msg.email_verified_title'),
    message: t('msg.email_verified'),
    link: { href: '/dashboard', label: t('msg.to_profile') },
  });
});

router.post('/verify-email/resend', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.email_verified) return res.redirect('/dashboard');
  await sendVerification(req, user.id, user.email);
  const t = res.locals.t;
  res.render('notice', {
    user: req.user,
    title: t('msg.resend_title'),
    message: t('msg.resend_body', { email: user.email }),
    link: { href: '/dashboard', label: t('msg.to_profile') },
  });
});

// ---------- Вход ----------
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { error: null, email: '' });
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const remember = req.body.remember === 'on' || req.body.remember === 'true';
  const t = res.locals.t;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // Еднакво съобщение при липсващ потребител и грешна парола (без разкриване).
  const bad = () => res.status(401).render('login', { error: t('err.bad_login'), email });

  if (!user) return bad();
  if (isLocked(user)) {
    audit(req, 'login_locked', { userId: user.id });
    return res.status(429).render('login', { error: t('err.locked'), email });
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    const locked = registerFailedAttempt(user);
    audit(req, locked ? 'login_lockout' : 'login_fail', { userId: user.id });
    return bad();
  }

  resetAttempts(user.id);

  // Прозрачна миграция на стари (bcrypt) хешове към Argon2id.
  if (needsRehash(user.password_hash)) {
    try {
      const fresh = await hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(fresh, user.id);
    } catch {
      /* без значение за входа */
    }
  }

  if (user.totp_enabled) {
    const pending = createPendingLogin(user.id);
    res.cookie('p2fa', pending, pendingCookie);
    res.cookie('rmb', remember ? '1' : '0', pendingCookie); // пренасяме избора през 2FA
    return res.redirect('/2fa');
  }

  startSession(req, res, user.id, remember);
  audit(req, 'login_success', { userId: user.id });
  res.redirect('/dashboard');
});

// ---------- 2FA предизвикателство при вход ----------
router.get('/2fa', (req, res) => {
  if (!userIdFromPending(req.cookies?.p2fa)) return res.redirect('/login');
  res.render('2fa-verify', { error: null });
});

router.post('/2fa', async (req, res) => {
  const userId = userIdFromPending(req.cookies?.p2fa);
  if (!userId) return res.redirect('/login');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const code = String(req.body.code || '').replace(/\s+/g, '');
  const secret = decrypt(user.totp_secret);

  // Приема валиден TOTP код ИЛИ еднократен резервен код.
  const totpOk = secret && authenticator.check(code, secret);
  const recoveryOk = !totpOk && (await consumeRecoveryCode(userId, code));

  if (!totpOk && !recoveryOk) {
    audit(req, 'twofactor_fail', { userId });
    return res.status(401).render('2fa-verify', { error: res.locals.t('err.bad_code') });
  }

  destroyPending(req.cookies.p2fa);
  res.clearCookie('p2fa');
  const remember = req.cookies?.rmb === '1';
  res.clearCookie('rmb');
  startSession(req, res, userId, remember);
  audit(req, 'login_success', { userId, detail: recoveryOk ? '2fa-recovery' : '2fa' });
  res.redirect('/dashboard');
});

// ---------- Забравена парола ----------
router.get('/forgot', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('forgot', { sent: false });
});

router.post('/forgot', async (req, res) => {
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  // Винаги едно и също съобщение — не разкриваме дали имейлът съществува.
  if (user) {
    const raw = createToken(user.id, 'reset', 60); // 60 минути
    const link = `${baseUrl(req)}/reset/${raw}`;
    try {
      await sendMail({
        to: user.email,
        subject: 'Нулиране на парола — MedQR',
        text: `Здравейте,\n\nЗа да зададете нова парола, отворете:\n${link}\n\nЛинкът е валиден 60 минути. Ако не сте поискали това, игнорирайте писмото.`,
      });
    } catch (e) {
      console.error('Грешка при изпращане на имейл:', e.message);
    }
    audit(req, 'password_reset_requested', { userId: user.id });
  }
  res.render('forgot', { sent: true });
});

router.get('/reset/:token', (req, res) => {
  const t = res.locals.t;
  if (!peekToken(req.params.token, 'reset')) {
    return res.status(400).render('notice', {
      user: null,
      title: t('msg.link_invalid_title'),
      message: t('msg.reset_invalid'),
      link: { href: '/forgot', label: t('msg.request_new') },
    });
  }
  res.render('reset', { token: req.params.token, error: null });
});

router.post('/reset/:token', async (req, res) => {
  const t = res.locals.t;
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');
  const reRender = (msg) =>
    res.status(400).render('reset', { token: req.params.token, error: msg });

  if (!peekToken(req.params.token, 'reset')) {
    return res.status(400).render('notice', {
      user: null,
      title: t('msg.link_invalid_title'),
      message: t('msg.reset_invalid'),
      link: { href: '/forgot', label: t('msg.request_new') },
    });
  }
  if (password.length < MIN_PASSWORD) return reRender(t('err.password_min', { n: MIN_PASSWORD }));
  if (password !== confirm) return reRender(t('err.passwords_mismatch'));

  const userId = consumeToken(req.params.token, 'reset');
  const newHash = await hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
  destroyUserSessions(userId); // обезсилва всички стари сесии
  audit(req, 'password_reset', { userId });
  res.render('notice', {
    user: null,
    icon: 'check',
    title: t('msg.password_changed_title'),
    message: t('msg.password_changed'),
    link: { href: '/login', label: t('msg.to_login') },
  });
});

// ---------- Изход ----------
router.post('/logout', (req, res) => {
  if (req.user) audit(req, 'logout', { userId: req.user.id });
  destroySession(req.cookies?.sid);
  res.clearCookie('sid');
  res.redirect('/login');
});

export default router;
