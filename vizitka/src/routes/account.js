// Настройки на акаунта: парола, двуфакторно влизане, активни сесии, изтегляне на
// данните (чл. 15 и 20 ОРЗД) и изтриване на акаунта (чл. 17 ОРЗД) — самообслужване,
// без имейл до поддръжката.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import db, { UPLOADS_DIR } from '../db.js';
import { requireAuth, verifyPassword, hashPassword, destroySession } from '../auth.js';
import { csrfProtect, sameOriginOnly } from '../csrf.js';
import { baseUrl } from '../config.js';
import {
  generateSecret,
  otpauthUri,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  totpAvailable,
} from '../totp.js';
import { verifySecondFactor, remainingRecoveryCodes } from '../twofactor.js';
import { zipStore } from '../wallet/binary.js';
import { buildVCard } from '../vcard.js';
import { getLinks } from '../links.js';
import { dailyViews } from '../stats.js';
import { submitUrls } from '../indexnow.js';
import { notifyWalletUpdate } from '../wallet/index.js';
import { sendEmailChangeConfirm, sendVerifyEmail, notifySafely } from '../mailer.js';
import {
  issueToken,
  findToken,
  confirmVerify,
  confirmChange,
  changeError,
  emailTaken,
  normalizeEmail,
  cancelPendingChange,
  pendingChangeEmail,
} from '../emailflow.js';
import { isReservedAdminEmail } from '../auth.js';

const router = Router();

// Чувствителните действия (парола, 2FA, изтриване) — отделен таван: проверката на
// паролата е bcrypt (скъпа), а грешен код за 2FA не бива да се налучква безкрайно.
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Твърде много опити. Опитай отново след 15 минути.',
});

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const getProfile = (userId) => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);

// Непрозрачен идентификатор на сесия за страницата — НЕ ключът от базата (той е
// sha256 на бисквитката; не го показваме, макар сам да не дава достъп).
const sessionHandle = (id) =>
  crypto.createHash('sha256').update(`handle:${id}`).digest('hex').slice(0, 16);

function listSessions(userId, currentId) {
  return db
    .prepare(
      'SELECT id, device, created_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC'
    )
    .all(userId, Date.now())
    .map((s) => ({
      handle: sessionHandle(s.id),
      device: s.device || 'Непознато устройство',
      createdAt: s.created_at,
      current: s.id === currentId,
    }));
}

function renderSettings(req, res, extra = {}) {
  const user = getUser(req.user.id);
  res.render('settings', {
    title: 'Настройки на акаунта',
    account: {
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      pendingEmail: pendingChangeEmail(user.id),
      createdAt: user.created_at,
      twoFactor: Boolean(user.totp_enabled),
      recoveryLeft: user.totp_enabled ? remainingRecoveryCodes(user.id) : 0,
    },
    profile: getProfile(user.id),
    sessions: listSessions(user.id, req.session.id),
    totpAvailable: totpAvailable(),
    notice: null,
    error: null,
    setup: null, // { qr, secret } по време на включване на 2FA
    recoveryCodes: null, // показват се ЕДИН път — след включване/подновяване
    recoveryUsed:
      req.query.recovery_used !== undefined ? Number(req.query.recovery_used) || 0 : null,
    ...extra,
  });
}

router.get('/settings', requireAuth, (req, res) => {
  const notices = {
    pw: 'Паролата е сменена. Останалите ти сесии са прекратени.',
    revoked: 'Сесията е прекратена.',
    others: 'Излезе от всички други устройства.',
    off: 'Двуфакторното влизане е изключено.',
    sent: 'Изпратихме нова връзка за потвърждаване. Провери пощата си (и папката за спам).',
    cancelled: 'Смяната на имейла е отказана — връзката вече не важи.',
  };
  renderSettings(req, res, { notice: notices[req.query.done] || null });
});

// ── Парола ───────────────────────────────────────────────────────────────────
router.post('/settings/password', requireAuth, csrfProtect, sensitiveLimiter, async (req, res) => {
  const user = getUser(req.user.id);
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (!(await verifyPassword(current, user.password_hash)))
    return renderSettings(req, res.status(400), { error: 'Грешна текуща парола.' });
  if (next.length < 8 || next.length > 200)
    return renderSettings(req, res.status(400), {
      error: 'Новата парола трябва да е поне 8 знака.',
    });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    await hashPassword(next),
    user.id
  );
  // Всички други сесии излизат — само текущата остава.
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, req.session.id);
  cancelPendingChange(user.id); // висяща смяна на имейла може да е на нападателя
  notifySafely(
    user.email,
    'Паролата за акаунта ти е сменена',
    'Смяната е от „Настройки на акаунта“; другите устройства излязоха от акаунта.'
  );
  res.redirect('/settings?done=pw');
});

// ── Двуфакторно влизане ──────────────────────────────────────────────────────
async function setupView(user, secret) {
  const uri = otpauthUri(secret, user.email);
  return {
    qr: await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: 'M' }),
    // На групи по 4 — по-лесно за ръчно въвеждане, когато камерата не стига.
    secret: secret.match(/.{1,4}/g).join(' '),
  };
}

router.post('/settings/2fa/setup', requireAuth, csrfProtect, async (req, res) => {
  const user = getUser(req.user.id);
  if (user.totp_enabled) return res.redirect('/settings');
  if (!totpAvailable())
    return renderSettings(req, res.status(503), {
      error: 'Двуфакторното влизане още не е активирано на сървъра.',
    });
  const secret = generateSecret();
  db.prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(encryptSecret(secret), user.id);
  renderSettings(req, res, { setup: await setupView(user, secret) });
});

router.post(
  '/settings/2fa/enable',
  requireAuth,
  csrfProtect,
  sensitiveLimiter,
  async (req, res) => {
    const user = getUser(req.user.id);
    if (user.totp_enabled) return res.redirect('/settings');
    const secret = decryptSecret(user.totp_pending);
    if (!secret) return res.redirect('/settings');
    const step = verifyTotp(secret, req.body.code);
    if (step === null)
      return renderSettings(req, res.status(400), {
        setup: await setupView(user, secret),
        error: 'Кодът не съвпада. Въведи текущия 6-цифрен код от приложението.',
      });

    const codes = generateRecoveryCodes();
    db.transaction(() => {
      db.prepare(
        `UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled = 1,
         totp_last_step = ? WHERE id = ?`
      ).run(step, user.id);
      db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
      const ins = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
      for (const c of codes) ins.run(user.id, hashRecoveryCode(c));
      // Новата защита важи веднага: другите сесии (влезли само с парола) излизат.
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, req.session.id);
    })();
    notifySafely(
      user.email,
      'Двуфакторното влизане е включено',
      'Оттук нататък входът иска и код от приложението ти; другите устройства излязоха от акаунта.'
    );
    renderSettings(req, res, {
      recoveryCodes: codes,
      notice: 'Двуфакторното влизане е включено. Запази резервните кодове — показват се само сега.',
    });
  }
);

// Изключване и нови резервни кодове: искат И паролата, И код — откраднатата
// сесия сама не стига, за да се свали защитата.
async function confirmIdentity(req, res, user) {
  if (!(await verifyPassword(String(req.body.password || ''), user.password_hash))) {
    renderSettings(req, res.status(400), { error: 'Грешна парола.' });
    return false;
  }
  if (!verifySecondFactor(user, req.body.code)) {
    renderSettings(req, res.status(400), { error: 'Грешен или вече използван код.' });
    return false;
  }
  return true;
}

router.post(
  '/settings/2fa/disable',
  requireAuth,
  csrfProtect,
  sensitiveLimiter,
  async (req, res) => {
    const user = getUser(req.user.id);
    if (!user.totp_enabled) return res.redirect('/settings');
    if (!(await confirmIdentity(req, res, user))) return;
    db.transaction(() => {
      db.prepare(
        `UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled = 0,
         totp_last_step = 0 WHERE id = ?`
      ).run(user.id);
      db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
    })();
    notifySafely(
      user.email,
      'Двуфакторното влизане е изключено',
      'Входът вече иска само паролата.'
    );
    res.redirect('/settings?done=off');
  }
);

router.post(
  '/settings/2fa/recovery',
  requireAuth,
  csrfProtect,
  sensitiveLimiter,
  async (req, res) => {
    const user = getUser(req.user.id);
    if (!user.totp_enabled) return res.redirect('/settings');
    if (!(await confirmIdentity(req, res, user))) return;
    const codes = generateRecoveryCodes();
    db.transaction(() => {
      db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
      const ins = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
      for (const c of codes) ins.run(user.id, hashRecoveryCode(c));
    })();
    notifySafely(
      user.email,
      'Нови резервни кодове за двуфакторното влизане',
      'Старите резервни кодове вече не важат.'
    );
    renderSettings(req, res, {
      recoveryCodes: codes,
      notice: 'Новите резервни кодове заменят старите. Запази ги — показват се само сега.',
    });
  }
);

// ── Имейл: потвърждаване и смяна (src/emailflow.js) ─────────────────────────
const maskEmail = (e) => e.replace(/^(.)[^@]*(@.*)$/, (_, a, d) => `${a}***${d}`);
const message = (res, status, heading, msg) =>
  res.status(status).render('message', { title: heading, heading, message: msg, ok: status < 400 });

router.post('/settings/email/verify', requireAuth, csrfProtect, sensitiveLimiter, (req, res) => {
  const user = getUser(req.user.id);
  if (user.email_verified_at) return res.redirect('/settings');
  const token = issueToken(user.id, 'verify', user.email);
  sendVerifyEmail(user.email, `${baseUrl(req)}/verify-email?token=${token}`).catch((err) =>
    console.error('Писмото за потвърждаване не беше изпратено:', err.message)
  );
  res.redirect('/settings?done=sent');
});

// Връзката от писмото — работи и без вход (отворена от пощата на телефона). GET само
// показва бутон: скенерите на пощата (Safe Links и др.) отварят връзките сами и не бива да
// потвърждават нищо. Действа POST — тайната е самият токен (без сесия, но same-origin).
const invalidLink = (res) =>
  message(
    res,
    400,
    'Връзката не важи',
    'Връзката е изтекла, вече е използвана или имейлът е сменен. Поискай нова от „Настройки на акаунта“.'
  );
const confirmPage = (res, action, token, heading, text, button) =>
  res.render('email-confirm', { title: heading, heading, text, button, action, token });

router.get('/verify-email', (req, res) => {
  const t = findToken(req.query.token, 'verify');
  if (!t) return invalidLink(res);
  confirmPage(
    res,
    '/verify-email',
    req.query.token,
    'Потвърди имейла',
    `Потвърди, че ${t.email} е твоят имейл.`,
    'Потвърди имейла'
  );
});

router.post('/verify-email', sameOriginOnly, sensitiveLimiter, (req, res) => {
  if (!confirmVerify(req.body.token))
    return message(
      res,
      400,
      'Връзката не важи',
      'Връзката е изтекла, вече е използвана или имейлът е сменен. Поискай нова от „Настройки на акаунта“.'
    );
  message(res, 200, 'Имейлът е потвърден', 'Готово — важните писма за акаунта ще стигат до теб.');
});

router.post('/settings/email', requireAuth, csrfProtect, sensitiveLimiter, async (req, res) => {
  const user = getUser(req.user.id);
  const next = normalizeEmail(req.body.new_email);
  const err = changeError(user.email, next);
  if (err) return renderSettings(req, res.status(400), { error: err });
  if (!(await verifyPassword(String(req.body.password || ''), user.password_hash)))
    return renderSettings(req, res.status(400), { error: 'Грешна парола.' });
  if (user.totp_enabled && !verifySecondFactor(user, req.body.code))
    return renderSettings(req, res.status(400), { error: 'Грешен или вече използван код.' });

  // Зает адрес: същият отговор и никакво писмо — иначе формата казва чии са адресите.
  if (!emailTaken(next)) {
    const token = issueToken(user.id, 'change', next);
    sendEmailChangeConfirm(next, `${baseUrl(req)}/settings/email/confirm?token=${token}`).catch(
      (e) => console.error('Писмото за смяна на имейла не беше изпратено:', e.message)
    );
  }
  notifySafely(
    user.email,
    'Заявена е смяна на имейла за вход',
    `Новият адрес (${maskEmail(next)}) получи връзка за потвърждаване. Докато не бъде отворена, имейлът ти остава този.`
  );
  renderSettings(req, res, {
    notice: `Изпратихме връзка на ${next}. Имейлът се сменя, когато я отвориш (важи 1 час). Ако не дойде, провери папката за спам — или адресът вече се ползва от друг акаунт.`,
  });
});

const takenPage = (res) =>
  message(
    res,
    409,
    'Адресът е зает',
    'Междувременно този имейл вече се ползва от друг акаунт. Имейлът ти не е сменен.'
  );

router.get('/settings/email/confirm', (req, res) => {
  const t = findToken(req.query.token, 'change');
  if (!t)
    return message(
      res,
      400,
      'Връзката не важи',
      'Връзката е изтекла или вече е използвана. Заяви смяната отново от „Настройки на акаунта“.'
    );
  if (emailTaken(t.email) || isReservedAdminEmail(t.email)) return takenPage(res);
  confirmPage(
    res,
    '/settings/email/confirm',
    req.query.token,
    'Смени имейла',
    `Имейлът за вход във Vizitka ще стане ${t.email}.`,
    'Потвърди смяната'
  );
});

router.post('/settings/email/cancel', requireAuth, csrfProtect, (req, res) => {
  cancelPendingChange(req.user.id);
  res.redirect('/settings?done=cancelled');
});

router.post('/settings/email/confirm', sameOriginOnly, sensitiveLimiter, (req, res) => {
  const r = confirmChange(req.body.token);
  if (!r.ok)
    return r.reason === 'taken'
      ? takenPage(res)
      : message(
          res,
          400,
          'Връзката не важи',
          'Връзката е изтекла или вече е използвана. Заяви смяната отново от „Настройки на акаунта“.'
        );
  notifySafely(
    r.oldEmail,
    'Имейлът за вход в акаунта ти е сменен',
    `Новият имейл е ${maskEmail(r.newEmail)}. Писмата за акаунта вече отиват там.`
  );
  message(res, 200, 'Имейлът е сменен', `Отсега влизаш с ${r.newEmail}.`);
});

// ── Активни сесии ────────────────────────────────────────────────────────────
router.post('/settings/sessions/revoke', requireAuth, csrfProtect, (req, res) => {
  const handle = String(req.body.session || '');
  const target = db
    .prepare('SELECT id FROM sessions WHERE user_id = ?')
    .all(req.user.id)
    .find((s) => sessionHandle(s.id) === handle);
  // Само ЧУЖДИ сесии на същия потребител; текущата се затваря с „Изход“.
  if (target && target.id !== req.session.id)
    db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(target.id, req.user.id);
  res.redirect('/settings?done=revoked');
});

router.post('/settings/sessions/revoke-others', requireAuth, csrfProtect, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.user.id, req.session.id);
  cancelPendingChange(req.user.id); // „възстанови контрола“ — и висящата смяна на имейла отпада
  res.redirect('/settings?done=others');
});

// ── Изтегляне на данните (чл. 15 и 20 ОРЗД) ──────────────────────────────────
const readUpload = (name) => {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(name || '')) return null;
  const path = join(UPLOADS_DIR, name);
  return fs.existsSync(path) ? fs.readFileSync(path) : null;
};

router.get('/settings/export', requireAuth, (req, res) => {
  const user = getUser(req.user.id);
  const profile = getProfile(user.id);
  const base = baseUrl(req);
  const files = [];
  const photo = readUpload(profile.photo);
  const cover = readUpload(profile.cover);
  if (photo) files.push({ name: `snimki/${profile.photo}`, data: photo });
  if (cover) files.push({ name: `snimki/${profile.cover}`, data: cover });

  const data = {
    format: 'vizitka-export/1',
    exported_at: new Date().toISOString(),
    service: { name: 'Vizitka', url: base },
    account: {
      email: user.email,
      created_at: user.created_at,
      email_verified_at: user.email_verified_at || null,
      two_factor_enabled: Boolean(user.totp_enabled),
    },
    profile: {
      ...Object.fromEntries(Object.entries(profile).filter(([k]) => k !== 'user_id')),
      public_url: `${base}/p/${profile.slug}`,
    },
    links: getLinks(profile.id).map(({ label, url, icon }) => ({ label, url, icon })),
    statistics: {
      total_views: profile.views,
      daily_views_last_400_days: dailyViews(profile.id, 400).filter((d) => d.views > 0),
    },
    sessions: db
      .prepare('SELECT device, created_at, expires_at FROM sessions WHERE user_id = ?')
      .all(user.id)
      .map((s) => ({ ...s, expires_at: new Date(s.expires_at).toISOString() })),
    // Модерационни действия на администратора върху ТВОЯТА визитка (чл. 15(1)).
    // Без имейла на служителя — достатъчни са действието, датата и бележката.
    moderation: db
      .prepare(
        'SELECT action, detail, created_at FROM admin_audit WHERE profile_id = ? ORDER BY id'
      )
      .all(profile.id),
    wallet_devices: db
      .prepare('SELECT COUNT(*) AS n FROM apple_pass_registrations WHERE serial_number = ?')
      .get(String(profile.id)).n,
  };

  files.unshift(
    { name: 'danni.json', data: Buffer.from(JSON.stringify(data, null, 2), 'utf8') },
    {
      name: `${profile.slug}.vcf`,
      data: Buffer.from(
        buildVCard(
          profile,
          base,
          photo ? { buffer: photo, ext: profile.photo.split('.').pop() } : null
        ),
        'utf8'
      ),
    },
    {
      name: 'PROCHETI.txt',
      data: Buffer.from(
        [
          'Твоите данни от Vizitka',
          '',
          `Изтеглени на ${data.exported_at} за ${user.email}.`,
          '',
          'danni.json  — всичко, което пазим за акаунта и визитката ти (машинно четим формат,',
          '              чл. 20 ОРЗД — можеш да го пренесеш в друга услуга).',
          `${profile.slug}.vcf — визитката като контакт за телефона/пощата.`,
          'snimki/     — качените от теб снимки (ако има).',
          '',
          'Паролата и кодовете за двуфакторно влизане НЕ са тук — пазим ги само като',
          'необратим хеш или шифровани и те не са „твои данни“ в преносим вид.',
          '',
        ].join('\r\n'),
        'utf8'
      ),
    }
  );

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="vizitka-${profile.slug}-${data.exported_at.slice(0, 10)}.zip"`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(zipStore(files));
});

// ── Изтриване на акаунта (чл. 17 ОРЗД) ───────────────────────────────────────
router.post('/settings/delete', requireAuth, csrfProtect, sensitiveLimiter, async (req, res) => {
  const user = getUser(req.user.id);
  const profile = getProfile(user.id);
  if (String(req.body.confirm || '').trim() !== profile.slug)
    return renderSettings(req, res.status(400), {
      error: `За потвърждение напиши адреса на визитката си: ${profile.slug}`,
    });
  if (!(await verifyPassword(String(req.body.password || ''), user.password_hash)))
    return renderSettings(req, res.status(400), { error: 'Грешна парола.' });
  if (user.totp_enabled && !verifySecondFactor(user, req.body.code))
    return renderSettings(req, res.status(400), { error: 'Грешен или вече използван код.' });

  const base = baseUrl(req);
  // Портфейлите: Google картата става празна и изтекла ПРЕДИ да изчезне профилът.
  notifyWalletUpdate({ ...profile, is_public: 0 }, base);

  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO retired_slugs (slug) VALUES (?)').run(profile.slug);
    db.prepare('DELETE FROM apple_pass_registrations WHERE serial_number = ?').run(
      String(profile.id)
    );
    // ON DELETE CASCADE: визитка, бутони, сесии, нулирания, резервни кодове, статистика.
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  })();

  for (const name of [profile.photo, profile.cover]) {
    if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(name || '')) continue;
    const path = join(UPLOADS_DIR, name);
    if (fs.existsSync(path)) fs.unlinkSync(path);
  }
  // Търсачките виждат 410 при следващото обхождане — подаваме адреса веднага.
  if (profile.is_public) submitUrls(base, [`${base}/p/${profile.slug}`]);

  // Последното писмо до този адрес: потвърждение, че изтриването е станало (и сигнал, ако не е бил той).
  notifySafely(
    user.email,
    'Акаунтът ти във Vizitka е изтрит',
    'Визитката, снимките и всички данни на акаунта са изтрити. Адресът ѝ няма да бъде даден на друг. Това е последното ни писмо до теб.'
  );
  destroySession(req, res);
  res.locals.user = null; // заглавката вече не е на влязъл потребител
  res.locals.isAdmin = false;
  res.status(200).render('404', {
    title: 'Акаунтът е изтрит',
    heading: 'Акаунтът е изтрит',
    message:
      'Визитката, снимките и всички данни на акаунта са изтрити. Адресът ѝ няма да бъде даден на друг.',
  });
});

export default router;
