import { Router } from 'express';
import db from '../db.js';
import { verifyPassword } from '../auth.js';

const router = Router();

function logAccess(profileId, req) {
  const ip =
    (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();
  const ua = String(req.get('user-agent') || '').slice(0, 300);
  db.prepare(
    'INSERT INTO access_log (profile_id, ip, user_agent) VALUES (?, ?, ?)'
  ).run(profileId, ip, ua);
}

// Публичен спешен изглед. Достъпен само със знание на дългия токен (от QR кода).
// Показва само това, което е нужно на спешен екип. Всеки достъп се записва.
router.get('/e/:token', (req, res) => {
  const profile = db
    .prepare('SELECT * FROM profiles WHERE emergency_token = ?')
    .get(req.params.token);

  if (!profile) {
    return res.status(404).render('emergency-error', {
      message: 'Невалиден или изтекъл код.',
    });
  }

  // Ако има PIN, изискваме го преди да покажем данните.
  if (profile.pin_hash) {
    return res.render('emergency-pin', { token: req.params.token, error: null });
  }

  logAccess(profile.id, req);
  res.render('emergency', { profile });
});

router.post('/e/:token', (req, res) => {
  const profile = db
    .prepare('SELECT * FROM profiles WHERE emergency_token = ?')
    .get(req.params.token);

  if (!profile) {
    return res.status(404).render('emergency-error', {
      message: 'Невалиден или изтекъл код.',
    });
  }
  if (!profile.pin_hash) return res.redirect(`/e/${req.params.token}`);

  const pin = String(req.body.pin || '').trim();
  if (!verifyPassword(pin, profile.pin_hash)) {
    return res.status(401).render('emergency-pin', {
      token: req.params.token,
      error: 'Грешен PIN.',
    });
  }

  logAccess(profile.id, req);
  res.render('emergency', { profile });
});

export default router;
