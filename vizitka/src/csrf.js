// CSRF защита за POST заявките.
//
// Две нива:
//  1. `csrfProtect` — synchronizer token за АВТЕНТИКИРАНИТЕ форми (токенът живее
//     в сесията).
//  2. `sameOriginOnly` — за формите БЕЗ сесия (вход, регистрация, забравена/нова
//     парола). Там synchronizer токен няма откъде да дойде, затова пазим по
//     произхода на заявката.
import crypto from 'node:crypto';

export function csrfProtect(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  // Сравняваме БАЙТОВЕ, не знаци: многобайтов токен със същия брой знаци минаваше
  // проверката за дължина и после чупеше timingSafeEqual с 500 вместо 403.
  const sent = Buffer.from(String(req.body?._csrf || req.get('x-csrf-token') || ''), 'utf8');
  const expected = Buffer.from(String(req.session?.csrf_token || ''), 'utf8');
  const ok =
    expected.length > 0 &&
    sent.length === expected.length &&
    crypto.timingSafeEqual(sent, expected);
  if (!ok) return res.status(403).send('Невалиден CSRF токен. Презареди страницата и опитай пак.');
  next();
}

// Пуска само заявки, тръгнали от нашия сайт. Без това чужда страница можеше да
// изпрати `POST /login` с ЧУЖДИ данни и да вкара жертвата в акаунта на нападателя
// (принудителен вход) — жертвата после попълва истинския си телефон и адрес там.
// `SameSite=Lax` не пази тук: бисквитка не е нужна, а Set-Cookie в отговора минава.
export function sameOriginOnly(req, res, next) {
  const host = req.get('host');
  const matches = (value) => {
    if (!value) return null; // заглавието липсва → няма присъда
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  };
  const byOrigin = matches(req.get('origin'));
  // Липсват ли и двете (curl, стар клиент), пускаме: браузърът, с който би се
  // извършила атаката, ВИНАГИ праща Origin при cross-site POST.
  const verdict = byOrigin ?? matches(req.get('referer'));
  if (verdict === false)
    return res.status(403).send('Заявката идва от чужд сайт. Отвори формата от vizitka-bg.com.');
  next();
}
