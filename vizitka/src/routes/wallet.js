// Портфейл маршрути: сваляне на Apple .pkpass, „Запази в Google Wallet" редирект,
// и Apple Wallet update web service (регистрация на устройства + сервиране на
// обновен пас). Токен-базирана автентикация за web service-а (без сесии).
import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import db from '../db.js';
import { baseUrl } from '../config.js';
import {
  getPkpass,
  googleSaveUrl,
  passAuthToken,
  appleEnabled,
  googleEnabled,
} from '../wallet/index.js';

const router = Router();
const jsonBody = express.json({ limit: '4kb' });

// Генерирането на .pkpass е скъпо (openssl spawn) → ограничаваме публичните
// портфейл маршрути срещу претоварване. Устройствата на Apple викат /v1/* по-често,
// но там няма скъпа операция освен /v1/passes (пак с кеш).
const walletLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Твърде много заявки. Опитай отново по-късно.',
});

function findVisibleProfile(req, slug) {
  const profile = db.prepare('SELECT * FROM profiles WHERE slug = ?').get(slug);
  if (!profile) return null;
  if (!profile.is_public && profile.user_id !== req.user?.id) return null;
  return profile;
}

// --- Публични действия --------------------------------------------------------

// Сваляне на подписания .pkpass — iOS го отваря директно в Apple Wallet.
router.get('/p/:slug/wallet/apple.pkpass', walletLimiter, (req, res) => {
  if (!appleEnabled()) return res.status(404).end();
  const profile = findVisibleProfile(req, req.params.slug);
  if (!profile) return res.status(404).end();
  try {
    const buf = getPkpass(profile, baseUrl(req));
    res.type('application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="${profile.slug}.pkpass"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) {
    console.error('pkpass:', e.message);
    res.status(500).send('Неуспешно генериране на картата.');
  }
});

// „Запази в Google Wallet" — редирект към подписания save линк.
router.get('/p/:slug/wallet/google', walletLimiter, (req, res) => {
  if (!googleEnabled()) return res.status(404).end();
  const profile = findVisibleProfile(req, req.params.slug);
  if (!profile) return res.status(404).end();
  res.redirect(302, googleSaveUrl(profile, baseUrl(req)));
});

// --- Apple Wallet update web service (Apple добавя /v1 към webServiceURL) -------

// Проверка на Authorization: ApplePass <token> срещу токена на визитката.
function authorizedFor(req, serial) {
  const header = req.get('authorization') || '';
  const m = /^ApplePass\s+(.+)$/.exec(header);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(passAuthToken(serial));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Регистрация на устройство за обновявания.
router.post('/v1/devices/:device/registrations/:passType/:serial', jsonBody, (req, res) => {
  if (!authorizedFor(req, req.params.serial)) return res.status(401).end();
  if (!appleEnabled()) return res.status(404).end();
  const pushToken = req.body?.pushToken;
  if (!pushToken) return res.status(400).end();
  const existing = db
    .prepare(
      'SELECT id FROM apple_pass_registrations WHERE device_library_id = ? AND serial_number = ?'
    )
    .get(req.params.device, req.params.serial);
  db.prepare(
    `INSERT INTO apple_pass_registrations (device_library_id, pass_type_id, serial_number, push_token)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_library_id, serial_number)
       DO UPDATE SET push_token = excluded.push_token, updated_at = datetime('now')`
  ).run(req.params.device, req.params.passType, req.params.serial, pushToken);
  res.status(existing ? 200 : 201).end();
});

// Отписване на устройство.
router.delete('/v1/devices/:device/registrations/:passType/:serial', (req, res) => {
  if (!authorizedFor(req, req.params.serial)) return res.status(401).end();
  db.prepare(
    'DELETE FROM apple_pass_registrations WHERE device_library_id = ? AND serial_number = ?'
  ).run(req.params.device, req.params.serial);
  res.status(200).end();
});

// Списък със серийни номера, обновени след даден момент.
router.get('/v1/devices/:device/registrations/:passType', (req, res) => {
  const rows = db
    .prepare(
      'SELECT serial_number, updated_at FROM apple_pass_registrations WHERE device_library_id = ?'
    )
    .all(req.params.device);
  if (!rows.length) return res.status(204).end();
  res.json({
    lastUpdated: String(Math.floor(Date.now() / 1000)),
    serialNumbers: rows.map((r) => r.serial_number),
  });
});

// Сервиране на обновения пас (устройството дърпа след пуш). Серийният номер е
// стабилният profile.id (не слъгът), затова заявката е по id.
router.get('/v1/passes/:passType/:serial', (req, res) => {
  if (!authorizedFor(req, req.params.serial)) return res.status(401).end();
  if (!appleEnabled()) return res.status(404).end();
  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.serial);
  if (!profile) return res.status(404).end();
  // Скрита визитка спира да се обновява в портфейла (Apple маха паса при 404).
  if (!profile.is_public) return res.status(404).end();

  const modified = new Date(`${profile.updated_at.replace(' ', 'T')}Z`);
  const since = req.get('if-modified-since');
  if (since && new Date(since) >= modified) return res.status(304).end();
  try {
    const buf = getPkpass(profile, baseUrl(req));
    res.type('application/vnd.apple.pkpass');
    res.setHeader('Last-Modified', modified.toUTCString());
    res.send(buf);
  } catch (e) {
    console.error('pkpass:', e.message);
    res.status(500).end();
  }
});

// Логове от устройствата (Apple праща диагностика тук).
router.post('/v1/log', jsonBody, (req, res) => res.status(200).end());

export default router;
