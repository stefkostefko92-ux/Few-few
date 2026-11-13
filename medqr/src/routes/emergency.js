import { asyncRouter } from '../async-router.js';
import db from '../db.js';
import { getByToken } from '../profiles.js';
import { verifyPassword } from '../auth.js';
import { clientIp } from '../audit.js';
import { mac, safeEqual } from '../crypto.js';
import { notifyScan, notifyActive, notifyLocation } from '../notify.js';

const router = asyncRouter();
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

function logAccess(profileId, req) {
  const ua = String(req.get('user-agent') || '').slice(0, 300);
  db.prepare('INSERT INTO access_log (profile_id, ip, user_agent) VALUES (?, ?, ?)').run(
    profileId,
    clientIp(req),
    ua
  );
}

function pinLocked(profile) {
  return !!(profile.pin_locked_until && new Date(profile.pin_locked_until).getTime() > Date.now());
}

// Доказателство „PIN е въведен“: подписана бисквитка, вързана към профила, срока и
// ТЕКУЩИЯ PIN хеш (смяна на PIN я обезсилва). Нужна е за /locate при защитен профил —
// иначе токенът сам би заобикалял PIN-а.
const PIN_PROOF_COOKIE = 'pinok';
const PIN_PROOF_TTL_MS = 2 * 60 * 60 * 1000;
const pinProofMac = (profile, exp) =>
  mac(`pinok|${profile.id}|${exp}|${String(profile.pin_hash).slice(-24)}`);

function issuePinProof(res, profile) {
  const exp = Date.now() + PIN_PROOF_TTL_MS;
  res.cookie(PIN_PROOF_COOKIE, `${profile.id}.${exp}.${pinProofMac(profile, exp)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/e',
    maxAge: PIN_PROOF_TTL_MS,
  });
}

function hasPinProof(req, profile) {
  const [id, exp, sig] = String(req.cookies?.[PIN_PROOF_COOKIE] || '').split('.');
  if (!sig || Number(id) !== profile.id || !(Number(exp) > Date.now())) return false;
  return safeEqual(sig, pinProofMac(profile, exp));
}

// Разграничава реално отваряне (сканиран QR/NFC → навигация в браузър) от
// автоматично издърпване на връзката (link-preview ботове на WhatsApp/Signal/
// Slack и т.н., които игнорират robots.txt). Целта е да не пращаме ФАЛШИВО
// „спешно" известие до близкия само защото линкът е споделен в чат.
// Известните link-preview/unfurler ботове се разпознават надеждно по User-Agent.
// Съзнателно клоним към ИЗПРАЩАНЕ при съмнение — за спешен продукт пропуснато
// истинско известие е по-лошо от рядък фалшив preview (който дедупът ограничава).
const PREVIEW_BOTS = new RegExp(
  [
    // Точни имена на известни unfurler/търсещи ботове (НЕ „bot“ като подниз — хваща телефони CUBOT)
    '\\b(?:googlebot|bingbot|bingpreview|yandexbot|baiduspider|duckduckbot|applebot|facebookexternalhit|facebot)\\b',
    '\\b(?:slackbot|slack-imgproxy|twitterbot|linkedinbot|telegrambot|discordbot|pinterestbot|redditbot)\\b',
    '\\b(?:skypeuripreview|embedly|vkshare|google-read-aloud|petalbot|semrushbot|ahrefsbot|mj12bot)\\b',
    'whatsapp\\/',
    // общи белези: „…bot/1.0“, crawler/spider, CLI клиенти и безглави браузъри
    '\\bbot\\/\\d',
    'crawler|spider',
    '\\b(?:curl|wget|python-requests|go-http-client|headlesschrome|uptimerobot)\\b',
  ].join('|'),
  'i'
);
export function looksLikeRealVisit(req) {
  const ua = String(req.get('user-agent') || '');
  if (!ua) return false; // без User-Agent → скрипт/бот
  return !PREVIEW_BOTS.test(ua);
}

// Публичен спешен изглед. Достъпен само със знание на дългия токен (от QR кода).
// Показва само нужното на спешен екип. Всеки достъп се записва.
router.get('/e/:token', (req, res) => {
  const profile = getByToken(req.params.token);
  if (!profile) {
    return res
      .status(404)
      .render('emergency-error', { message: res.locals.t('msg.emerg_invalid') });
  }
  if (profile.pin_hash) {
    return res.render('emergency-pin', {
      token: req.params.token,
      error: null,
      locked: pinLocked(profile),
    });
  }
  // Всеки показ на данни (чл. 9 GDPR) се записва — и при бот-UA, защото User-Agent е в ръцете на клиента
  // и зад него одитът се заобикаляше (Разбивача, 2026-09-24). UA се пази, та preview-тата се различават.
  // Известието към близкия остава само за реално отваряне.
  logAccess(profile.id, req);
  if (looksLikeRealVisit(req)) notifyScan(profile);
  res.render('emergency', { profile, notifyActive: notifyActive(profile) });
});

router.post('/e/:token', async (req, res) => {
  const profile = getByToken(req.params.token);
  if (!profile) {
    return res
      .status(404)
      .render('emergency-error', { message: res.locals.t('msg.emerg_invalid') });
  }
  if (!profile.pin_hash) return res.redirect(`/e/${req.params.token}`);

  if (pinLocked(profile)) {
    return res.status(429).render('emergency-pin', {
      token: req.params.token,
      error: res.locals.t('pin.too_many'),
      locked: true,
    });
  }

  // Опитът се „таксува“ СИНХРОННО преди бавната (async) проверка на хеша. Иначе
  // паралелни заявки четат един и същ брояч, всички минават проверката и заобикалят
  // заключването (брутфорс с N успоредни опита). better-sqlite3 е синхронен, така че
  // четене+запис тук не могат да се преплетат между заявките.
  const fresh = db
    .prepare('SELECT pin_attempts, pin_locked_until FROM profiles WHERE id = ?')
    .get(profile.id);
  if (pinLocked(fresh)) {
    return res.status(429).render('emergency-pin', {
      token: req.params.token,
      error: res.locals.t('pin.too_many'),
      locked: true,
    });
  }
  const attempts = (fresh.pin_attempts || 0) + 1;
  if (attempts > PIN_MAX_ATTEMPTS) {
    const until = new Date(Date.now() + PIN_LOCK_MINUTES * 60000).toISOString();
    db.prepare('UPDATE profiles SET pin_attempts = 0, pin_locked_until = ? WHERE id = ?').run(
      until,
      profile.id
    );
    return res.status(429).render('emergency-pin', {
      token: req.params.token,
      error: res.locals.t('pin.too_many'),
      locked: true,
    });
  }
  db.prepare('UPDATE profiles SET pin_attempts = ? WHERE id = ?').run(attempts, profile.id);

  const pin = String(req.body.pin || '').trim();
  if (!(await verifyPassword(pin, profile.pin_hash))) {
    if (attempts >= PIN_MAX_ATTEMPTS) {
      const until = new Date(Date.now() + PIN_LOCK_MINUTES * 60000).toISOString();
      db.prepare('UPDATE profiles SET pin_attempts = 0, pin_locked_until = ? WHERE id = ?').run(
        until,
        profile.id
      );
    }
    return res.status(401).render('emergency-pin', {
      token: req.params.token,
      error: res.locals.t('pin.wrong'),
      locked: false,
    });
  }

  db.prepare('UPDATE profiles SET pin_attempts = 0, pin_locked_until = NULL WHERE id = ?').run(
    profile.id
  );
  issuePinProof(res, profile);
  logAccess(profile.id, req);
  notifyScan(profile);
  res.render('emergency', { profile, notifyActive: notifyActive(profile) });
});

// Намерилият споделя местоположението си с близкия контакт.
router.post('/e/:token/locate', (req, res) => {
  const profile = getByToken(req.params.token);
  if (!profile) return res.status(404).json({ error: res.locals.t('msg.emerg_invalid') });
  // При защитен с PIN профил споделянето на локация изисква въведен PIN — иначе
  // знанието на токена сам по себе си заобикаля PIN-а.
  if (profile.pin_hash && !hasPinProof(req, profile)) {
    return res.status(403).json({ error: res.locals.t('msg.pin_required') });
  }
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return res.status(400).json({ error: res.locals.t('err.bad_coords') });
  }
  // Радиус на грешката в метри (по избор); закръгляме до цяло число.
  const acc = Number(req.body.accuracy);
  const accuracy = Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null;
  const sent = notifyLocation(profile, lat.toFixed(5), lng.toFixed(5), accuracy);
  res.json({ ok: sent });
});

export default router;
