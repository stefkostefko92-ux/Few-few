// CSRF защита (synchronizer token) за автентикираните POST заявки.
import crypto from 'node:crypto';

export function csrfProtect(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const sent = req.body?._csrf || req.get('x-csrf-token') || '';
  const expected = req.session?.csrf_token || '';
  const ok =
    sent.length === expected.length &&
    expected.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).send('Невалиден CSRF токен. Презареди страницата и опитай пак.');
  next();
}
