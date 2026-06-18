import { randomToken } from './auth.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF защита (synchronizer-token чрез бисквитка + скрито поле във формите).
// Бисквитката е HttpOnly + SameSite=Strict; формите носят същия токен в `_csrf`.
export function csrf(req, res, next) {
  let token = req.cookies?.csrf;
  if (!token) {
    token = randomToken(24);
    res.cookie('csrf', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  }
  res.locals.csrfToken = token;

  if (!SAFE.has(req.method)) {
    // Токенът идва от скрито поле (форми) или от заглавие (fetch/JSON, напр. passkeys).
    const sent = req.body?._csrf || req.get('x-csrf-token');
    if (!sent || sent !== token) {
      return res.status(403).render('emergency-error', {
        message: 'Невалидна или изтекла заявка (CSRF). Презаредете страницата и опитайте пак.',
        user: req.user || null,
      });
    }
  }
  next();
}
