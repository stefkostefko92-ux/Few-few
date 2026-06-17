import { Router } from 'express';
import QRCode from 'qrcode';
import db from '../db.js';
import { requireAuth, randomToken, hashPassword } from '../auth.js';

const router = Router();

const PROFILE_FIELDS = [
  'full_name',
  'date_of_birth',
  'blood_type',
  'allergies',
  'chronic_conditions',
  'current_medications',
  'hearing_status',
  'communication_pref',
  'preferred_language',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relation',
  'additional_notes',
];

function getProfile(userId) {
  return db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
}

function emergencyUrl(req, token) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/e/${token}`;
}

router.get('/dashboard', requireAuth, (req, res) => {
  const profile = getProfile(req.user.id);
  const recentAccess = db
    .prepare(
      'SELECT accessed_at, ip, user_agent FROM access_log WHERE profile_id = ? ORDER BY id DESC LIMIT 10'
    )
    .all(profile.id);
  res.render('dashboard', {
    user: req.user,
    profile,
    emergencyUrl: emergencyUrl(req, profile.emergency_token),
    recentAccess,
    saved: req.query.saved === '1',
  });
});

router.get('/profile/edit', requireAuth, (req, res) => {
  const profile = getProfile(req.user.id);
  res.render('profile-edit', { user: req.user, profile });
});

router.post('/profile/edit', requireAuth, (req, res) => {
  const profile = getProfile(req.user.id);
  const values = PROFILE_FIELDS.map((f) =>
    req.body[f] != null ? String(req.body[f]).trim() : ''
  );
  if (!values[0]) {
    return res.status(400).render('profile-edit', {
      user: req.user,
      profile: { ...profile, ...Object.fromEntries(PROFILE_FIELDS.map((f, i) => [f, values[i]])) },
      error: 'Името е задължително.',
    });
  }
  const setClause = PROFILE_FIELDS.map((f) => `${f} = ?`).join(', ');
  db.prepare(
    `UPDATE profiles SET ${setClause}, updated_at = datetime('now') WHERE id = ?`
  ).run(...values, profile.id);
  res.redirect('/dashboard?saved=1');
});

// Незадължителен PIN: добавя втори фактор върху спешния токен.
router.post('/profile/pin', requireAuth, (req, res) => {
  const profile = getProfile(req.user.id);
  const pin = String(req.body.pin || '').trim();
  if (pin === '') {
    db.prepare('UPDATE profiles SET pin_hash = NULL WHERE id = ?').run(profile.id);
  } else if (/^\d{4,8}$/.test(pin)) {
    db.prepare('UPDATE profiles SET pin_hash = ? WHERE id = ?').run(
      hashPassword(pin),
      profile.id
    );
  }
  res.redirect('/dashboard?saved=1');
});

// Превъртане на токена — обезсилва стария QR код (напр. при изгубена карта).
router.post('/profile/rotate-token', requireAuth, (req, res) => {
  const profile = getProfile(req.user.id);
  db.prepare('UPDATE profiles SET emergency_token = ? WHERE id = ?').run(
    randomToken(24),
    profile.id
  );
  res.redirect('/dashboard?saved=1');
});

// QR код като PNG (data URL се ползва в страницата; този маршрут дава файл за печат).
router.get('/qr.png', requireAuth, async (req, res) => {
  const profile = getProfile(req.user.id);
  const url = emergencyUrl(req, profile.emergency_token);
  const png = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 600,
  });
  res.type('png').send(png);
});

// Печатна карта за портфейл с QR код.
router.get('/card', requireAuth, async (req, res) => {
  const profile = getProfile(req.user.id);
  const url = emergencyUrl(req, profile.emergency_token);
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });
  res.render('card', { profile, dataUrl, url });
});

export default router;
