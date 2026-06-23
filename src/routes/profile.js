import { Router } from 'express';
import QRCode from 'qrcode';
import { authenticator } from 'otplib';
import db from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { getByUserId, updateFields, rotateToken, EDITABLE_FIELDS } from '../profiles.js';
import {
  requireAuth,
  hashPassword,
  verifyPassword,
  destroySession,
  listSessions,
  destroyOtherSessions,
  countRecoveryCodes,
  generateRecoveryCodes,
} from '../auth.js';
import { audit } from '../audit.js';
import { notifySos } from '../notify.js';
import { QR_SIZES, resolveSize, buildLabelSvg } from '../label.js';

const router = Router();

function emergencyUrl(req, token) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/e/${token}`;
}

// ---------- Табло ----------
router.get('/dashboard', requireAuth, (req, res) => {
  const profile = getByUserId(req.user.id);
  const account = db
    .prepare('SELECT email, totp_enabled, consent_at FROM users WHERE id = ?')
    .get(req.user.id);
  const recentAccess = db
    .prepare(
      'SELECT accessed_at, ip, user_agent FROM access_log WHERE profile_id = ? ORDER BY id DESC LIMIT 10'
    )
    .all(profile.id);
  const sessions = listSessions(req.user.id).map((s) => ({
    ...s,
    current: s.token === req.cookies?.sid,
  }));
  res.render('dashboard', {
    user: req.user,
    account,
    profile,
    emergencyUrl: emergencyUrl(req, profile.emergency_token),
    recentAccess,
    sessions,
    recoveryCount: account.totp_enabled ? countRecoveryCodes(req.user.id) : 0,
    qrSizes: QR_SIZES,
    saved: req.query.saved === '1',
  });
});

// ---------- SOS: спешна помощ, задействана от самия потребител ----------
router.get('/sos', requireAuth, (req, res) => {
  res.render('sos', { user: req.user, profile: getByUserId(req.user.id) });
});

router.post('/sos/alert', requireAuth, (req, res) => {
  const profile = getByUserId(req.user.id);
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  const hasLoc =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;
  const sent = notifySos(profile, hasLoc ? lat.toFixed(5) : null, hasLoc ? lng.toFixed(5) : null);
  audit(req, 'sos_triggered');
  res.json({ ok: true, notified: sent });
});

// ---------- Редакция ----------
router.get('/profile/edit', requireAuth, (req, res) => {
  res.render('profile-edit', { user: req.user, profile: getByUserId(req.user.id) });
});

router.post('/profile/edit', requireAuth, (req, res) => {
  const profile = getByUserId(req.user.id);
  const data = {};
  for (const f of EDITABLE_FIELDS) data[f] = req.body[f] != null ? String(req.body[f]).trim() : '';
  if (!data.full_name) {
    return res.status(400).render('profile-edit', {
      user: req.user,
      profile: { ...profile, ...data },
      error: res.locals.t('err.name_required'),
    });
  }
  updateFields(profile.id, data);
  const notify = req.body.notify_on_scan === 'on' ? 1 : 0;
  db.prepare('UPDATE profiles SET notify_on_scan = ? WHERE id = ?').run(notify, profile.id);
  audit(req, 'profile_update');
  res.redirect('/dashboard?saved=1');
});

// ---------- PIN ----------
router.post('/profile/pin', requireAuth, async (req, res) => {
  const profile = getByUserId(req.user.id);
  const pin = String(req.body.pin || '').trim();
  if (pin === '') {
    db.prepare(
      'UPDATE profiles SET pin_hash = NULL, pin_attempts = 0, pin_locked_until = NULL WHERE id = ?'
    ).run(profile.id);
    audit(req, 'pin_removed');
  } else if (/^\d{4,8}$/.test(pin)) {
    const pinHash = await hashPassword(pin);
    db.prepare(
      'UPDATE profiles SET pin_hash = ?, pin_attempts = 0, pin_locked_until = NULL WHERE id = ?'
    ).run(pinHash, profile.id);
    audit(req, 'pin_set');
  }
  res.redirect('/dashboard?saved=1');
});

// ---------- Превъртане на токена (обезсилва стария QR) ----------
router.post('/profile/rotate-token', requireAuth, (req, res) => {
  const profile = getByUserId(req.user.id);
  rotateToken(profile.id);
  audit(req, 'token_rotated');
  res.redirect('/dashboard?saved=1');
});

// ---------- QR код (PNG, с избираем размер) ----------
router.get('/qr.png', requireAuth, async (req, res) => {
  const profile = getByUserId(req.user.id);
  const width = QR_SIZES[resolveSize(req.query.size)].px;
  const png = await QRCode.toBuffer(emergencyUrl(req, profile.emergency_token), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width,
  });
  res.type('png').send(png);
});

// ---------- Самообяснителен медицински етикет (SVG, с избираем размер) ----------
// Винаги съдържа ясен надпис, че това са спешни медицински данни.
router.get('/label.svg', requireAuth, async (req, res) => {
  const profile = getByUserId(req.user.id);
  const url = emergencyUrl(req, profile.emergency_token);
  const qrDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 1024,
  });
  res
    .type('image/svg+xml')
    .setHeader('Cache-Control', 'no-store')
    .send(buildLabelSvg(qrDataUrl, resolveSize(req.query.size)));
});

// ---------- Карта за печат ----------
router.get('/card', requireAuth, async (req, res) => {
  const profile = getByUserId(req.user.id);
  const url = emergencyUrl(req, profile.emergency_token);
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
  res.render('card', { profile, dataUrl, url });
});

// ---------- Износ на данни (право на достъп / преносимост) ----------
router.get('/profile/export.json', requireAuth, (req, res) => {
  const profile = getByUserId(req.user.id);
  const account = db
    .prepare('SELECT email, consent_at, consent_version, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  audit(req, 'data_export');
  const payload = {
    exported_at: new Date().toISOString(),
    account,
    profile: {
      full_name: profile.full_name,
      date_of_birth: profile.date_of_birth,
      blood_type: profile.blood_type,
      allergy_keys: profile.allergy_keys,
      allergies: profile.allergies,
      condition_keys: profile.condition_keys,
      chronic_conditions: profile.chronic_conditions,
      current_medications: profile.current_medications,
      hearing_status: profile.hearing_status,
      communication_pref: profile.communication_pref,
      can_speak: profile.can_speak,
      sign_language: profile.sign_language,
      interpreter_contact: profile.interpreter_contact,
      preferred_language: profile.preferred_language,
      emergency_contact_name: profile.emergency_contact_name,
      emergency_contact_phone: profile.emergency_contact_phone,
      emergency_contact_relation: profile.emergency_contact_relation,
      emergency_contact_country: profile.emergency_contact_country,
      emergency_contact_email: profile.emergency_contact_email,
      notify_on_scan: !!profile.notify_on_scan,
      additional_notes: profile.additional_notes,
      updated_at: profile.updated_at,
    },
  };
  res.setHeader('Content-Disposition', 'attachment; filename="medqr-data.json"');
  res.type('application/json').send(JSON.stringify(payload, null, 2));
});

// ---------- Изтриване на акаунт (право на забравяне) ----------
router.get('/profile/delete', requireAuth, (req, res) => {
  res.render('delete-account', { user: req.user, error: null });
});

router.post('/profile/delete', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await verifyPassword(String(req.body.password || ''), user.password_hash))) {
    return res.status(401).render('delete-account', {
      user: req.user,
      error: res.locals.t('err.wrong_password'),
    });
  }
  audit(req, 'account_delete', { userId: user.id });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id); // каскадно трие профил, сесии, логове
  destroySession(req.cookies?.sid);
  res.clearCookie('sid');
  res.render('emergency-error', {
    message: res.locals.t('msg.account_deleted'),
    user: null,
  });
});

// ---------- Двуфакторна автентикация (TOTP) ----------
router.get('/profile/2fa', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.totp_enabled) {
    return res.render('2fa-setup', {
      user: req.user,
      state: 'enabled',
      qr: null,
      error: null,
      recoveryCount: countRecoveryCodes(req.user.id),
    });
  }
  if (user.totp_secret) {
    const secret = decrypt(user.totp_secret);
    const uri = authenticator.keyuri(user.email, 'MedQR', secret);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return res.render('2fa-setup', { user: req.user, state: 'pending', qr, error: null });
  }
  res.render('2fa-setup', { user: req.user, state: 'disabled', qr: null, error: null });
});

router.post('/profile/2fa/init', requireAuth, (req, res) => {
  const secret = authenticator.generateSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(
    encrypt(secret),
    req.user.id
  );
  res.redirect('/profile/2fa');
});

router.post('/profile/2fa/enable', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const secret = decrypt(user.totp_secret);
  const code = String(req.body.code || '').replace(/\s+/g, '');
  if (!secret || !authenticator.check(code, secret)) {
    const uri = authenticator.keyuri(user.email, 'MedQR', secret);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return res.status(400).render('2fa-setup', {
      user: req.user,
      state: 'pending',
      qr,
      error: res.locals.t('err.bad_code'),
    });
  }
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);
  audit(req, 'twofactor_enabled');
  // Генерираме резервни кодове и ги показваме веднъж.
  const codes = await generateRecoveryCodes(req.user.id);
  res.render('recovery-codes', { user: req.user, codes, regenerated: false });
});

router.post('/profile/2fa/disable', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await verifyPassword(String(req.body.password || ''), user.password_hash))) {
    return res.status(401).render('2fa-setup', {
      user: req.user,
      state: 'enabled',
      qr: null,
      error: res.locals.t('err.wrong_password'),
      recoveryCount: countRecoveryCodes(req.user.id),
    });
  }
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(req.user.id);
  db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(req.user.id);
  audit(req, 'twofactor_disabled');
  res.redirect('/dashboard?saved=1');
});

// Прегенериране на резервни кодове (изисква включена 2FA).
router.post('/profile/2fa/recovery', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user.totp_enabled) return res.redirect('/profile/2fa');
  const codes = await generateRecoveryCodes(req.user.id);
  audit(req, 'recovery_codes_regenerated');
  res.render('recovery-codes', { user: req.user, codes, regenerated: true });
});

// ---------- Активни сесии: изход от всички други устройства ----------
router.post('/profile/sessions/revoke-others', requireAuth, (req, res) => {
  destroyOtherSessions(req.user.id, req.cookies?.sid);
  audit(req, 'sessions_revoked_others');
  res.redirect('/dashboard?saved=1');
});

export default router;
