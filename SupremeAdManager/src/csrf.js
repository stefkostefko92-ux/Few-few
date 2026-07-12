// CSRF: double-submit token, подписан с md на сесийния секрет; проверява се на всяка мутация.
import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE = 'sam_csrf';

export function csrfMiddleware(req, res, next) {
  let token = req.cookies?.[COOKIE];
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.env === 'production',
    });
  }
  res.locals.csrfToken = token;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const sent = req.body?._csrf || req.get('x-csrf-token');
    if (!sent || sent !== token) {
      return res.status(403).render('error', {
        title: 'Грешка',
        message: 'Невалиден CSRF токен. Презареди страницата и опитай пак.',
      });
    }
  }
  next();
}
