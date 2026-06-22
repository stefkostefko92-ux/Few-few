import { Router } from 'express';
import db from '../db.js';
import { getByToken } from '../profiles.js';
import { verifyPassword } from '../auth.js';
import { clientIp } from '../audit.js';
import { notifyScan, notifyActive, notifyLocation } from '../notify.js';

const router = Router();
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

// Публичен спешен изглед. Достъпен само със знание на дългия токен (от QR кода).
// Показва само нужното на спешен екип. Всеки достъп се записва.
router.get('/e/:token', (req, res) => {
  const profile = getByToken(req.params.token);
  if (!profile) {
    return res.status(404).render('emergency-error', { message: 'Невалиден или изтекъл код.' });
  }
  if (profile.pin_hash) {
    return res.render('emergency-pin', {
      token: req.params.token,
      error: null,
      locked: pinLocked(profile),
    });
  }
  logAccess(profile.id, req);
  notifyScan(profile);
  res.render('emergency', { profile, notifyActive: notifyActive(profile) });
});

router.post('/e/:token', async (req, res) => {
  const profile = getByToken(req.params.token);
  if (!profile) {
    return res.status(404).render('emergency-error', { message: 'Невалиден или изтекъл код.' });
  }
  if (!profile.pin_hash) return res.redirect(`/e/${req.params.token}`);

  if (pinLocked(profile)) {
    return res.status(429).render('emergency-pin', {
      token: req.params.token,
      error: 'Твърде много опити. Опитайте отново по-късно.',
      locked: true,
    });
  }

  const pin = String(req.body.pin || '').trim();
  if (!(await verifyPassword(pin, profile.pin_hash))) {
    const attempts = (profile.pin_attempts || 0) + 1;
    if (attempts >= PIN_MAX_ATTEMPTS) {
      const until = new Date(Date.now() + PIN_LOCK_MINUTES * 60000).toISOString();
      db.prepare('UPDATE profiles SET pin_attempts = 0, pin_locked_until = ? WHERE id = ?').run(
        until,
        profile.id
      );
    } else {
      db.prepare('UPDATE profiles SET pin_attempts = ? WHERE id = ?').run(attempts, profile.id);
    }
    return res.status(401).render('emergency-pin', {
      token: req.params.token,
      error: 'Грешен PIN.',
      locked: false,
    });
  }

  db.prepare('UPDATE profiles SET pin_attempts = 0, pin_locked_until = NULL WHERE id = ?').run(
    profile.id
  );
  logAccess(profile.id, req);
  notifyScan(profile);
  res.render('emergency', { profile, notifyActive: notifyActive(profile) });
});

// Намерилият споделя местоположението си с близкия контакт.
router.post('/e/:token/locate', (req, res) => {
  const profile = getByToken(req.params.token);
  if (!profile) return res.status(404).json({ error: 'Невалиден код.' });
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Невалидни координати.' });
  }
  const sent = notifyLocation(profile, lat.toFixed(5), lng.toFixed(5));
  res.json({ ok: sent });
});

export default router;
