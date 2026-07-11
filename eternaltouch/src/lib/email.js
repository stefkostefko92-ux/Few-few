// Eternal Touch — Email module
// SMTP via Register.it (authsmtp.register.it:465 SSL).
// Lazy initialization, save-first-send-second philosophy: emails are an
// enhancement on top of DB persistence, never the primary path.

import nodemailer from 'nodemailer';

// --- Configuration --------------------------------------------------
const SMTP_HOST   = process.env.SMTP_HOST   || 'authsmtp.register.it';
// Default to 587 (submission + STARTTLS): port 465 is blocked outbound on many
// hosts (e.g. Hetzner), whereas 587 is virtually always open. Override via .env.
const SMTP_PORT   = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = (process.env.SMTP_SECURE || 'false') === 'true'; // true=465 implicit TLS, false=587 STARTTLS
const SMTP_USER   = process.env.SMTP_USER   || '';
const SMTP_PASS   = process.env.SMTP_PASS   || '';
const SMTP_FROM   = process.env.SMTP_FROM   || `Eternal Touch <${SMTP_USER}>`;
const NOTIFY_TO   = process.env.NOTIFY_TO   || SMTP_USER;
const SITE_URL    = process.env.SITE_URL    || 'https://eternaltouch.it';
// Some providers (e.g. Register.it) front their SMTP with a shared platform
// whose TLS certificate does NOT list the connect hostname — Register.it's
// authsmtp.register.it presents a *.securemail.pro / smtp.webnode.com cert.
// Setting SMTP_TLS_SERVERNAME to a name that IS in the presented certificate
// lets us keep full certificate validation (rejectUnauthorized stays on) while
// connecting to SMTP_HOST. Prefer this over disabling validation.
const SMTP_TLS_SERVERNAME = process.env.SMTP_TLS_SERVERNAME || '';

// --- Transporter (lazy singleton) -----------------------------------
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP_USER / SMTP_PASS not configured — emails will NOT be sent. Messages still saved in DB.');
    return null;
  }
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    // On 587 (secure:false) enforce STARTTLS. Without this nodemailer only
    // upgrades opportunistically: an active MITM could strip STARTTLS from the
    // EHLO response and the AUTH LOGIN credentials would go over plaintext.
    // requireTLS makes the connection FAIL instead of leaking the password.
    requireTLS: !SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Validate the cert against SMTP_TLS_SERVERNAME when the connect host isn't
    // in the cert (keeps rejectUnauthorized on — no silent downgrade).
    ...(SMTP_TLS_SERVERNAME ? { tls: { servername: SMTP_TLS_SERVERNAME } } : {}),
    // Resilience: don't hang the request thread forever
    connectionTimeout: 8000,
    greetingTimeout:   8000,
    socketTimeout:    12000
  });
  return _transporter;
}

// --- Optional startup verify ----------------------------------------
// Call this once from server.js to log whether SMTP is reachable.
// Non-blocking — just logs a warning if the credentials are wrong.
export async function verifyEmailConfig() {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.verify();
    console.log(`[email] ✓ SMTP ready · ${SMTP_HOST}:${SMTP_PORT} (${SMTP_SECURE ? 'SSL' : 'STARTTLS'})`);
    return true;
  } catch (err) {
    console.warn(`[email] ⚠ SMTP verify failed: ${err.message}`);
    console.warn('[email]   Messages will still be saved in DB but no emails will be sent.');
    return false;
  }
}

// --- HTML escape ----------------------------------------------------
function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// --- Brand colours (mirror the site) --------------------------------
const COLOR = {
  cream:    '#FAF6EC',
  cream2:   '#F5EFE0',
  ink:      '#2A2620',
  muted:    '#7A6E5E',
  gold:     '#C9A96E',
  goldDark: '#A8894C',
  line:     '#E8DFC8'
};

// --- Notification template (admin) ----------------------------------
function adminNotificationHtml({ name, email, phone, subject, message, language, source, createdAt }) {
  const adminUrl = `${SITE_URL}/admin/messages`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Nuovo messaggio</title></head>
<body style="margin:0;padding:0;background:${COLOR.cream2};font-family:Georgia,serif;color:${COLOR.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.cream2};padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COLOR.cream};border:1px solid ${COLOR.line};">
    <tr><td style="padding:32px 40px 16px 40px;border-bottom:1px solid ${COLOR.line};">
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${COLOR.gold};">Eternal Touch · Admin</div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;margin:8px 0 0 0;color:${COLOR.ink};">Nuovo messaggio dal sito</h1>
    </td></tr>
    <tr><td style="padding:24px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.6;">
        <tr><td style="padding:6px 0;color:${COLOR.muted};width:110px;">Da:</td><td style="padding:6px 0;color:${COLOR.ink};font-weight:600;">${esc(name)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLOR.muted};">Email:</td><td style="padding:6px 0;"><a href="mailto:${esc(email)}" style="color:${COLOR.goldDark};text-decoration:none;">${esc(email)}</a></td></tr>
        ${phone   ? `<tr><td style="padding:6px 0;color:${COLOR.muted};">Telefono:</td><td style="padding:6px 0;">${esc(phone)}</td></tr>` : ''}
        ${subject ? `<tr><td style="padding:6px 0;color:${COLOR.muted};">Oggetto:</td><td style="padding:6px 0;">${esc(subject)}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:${COLOR.muted};">Lingua:</td><td style="padding:6px 0;text-transform:uppercase;font-size:11px;letter-spacing:1px;">${esc(language)}${source ? ' · ' + esc(source) : ''}</td></tr>
        <tr><td style="padding:6px 0;color:${COLOR.muted};">Quando:</td><td style="padding:6px 0;">${esc(new Date(createdAt).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }))}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:8px 40px 24px 40px;">
      <div style="border-top:1px solid ${COLOR.line};padding-top:16px;">
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${COLOR.muted};margin-bottom:12px;">Messaggio</div>
        <div style="font-family:Georgia,serif;font-size:15px;line-height:1.7;color:${COLOR.ink};white-space:pre-wrap;">${esc(message)}</div>
      </div>
    </td></tr>
    <tr><td align="center" style="padding:0 40px 32px 40px;">
      <a href="${adminUrl}" style="display:inline-block;background:${COLOR.ink};color:${COLOR.cream};padding:12px 28px;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;">Apri pannello admin</a>
    </td></tr>
    <tr><td style="padding:16px 40px 32px 40px;border-top:1px solid ${COLOR.line};text-align:center;">
      <div style="font-family:Georgia,serif;font-size:12px;color:${COLOR.muted};line-height:1.6;">
        Eternal Touch · Bobov Dol, България / Milano, Italia<br>
        Per rispondere, scrivi direttamente a <a href="mailto:${esc(email)}" style="color:${COLOR.goldDark};text-decoration:none;">${esc(email)}</a>
      </div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function adminNotificationText({ name, email, phone, subject, message, language, source, createdAt }) {
  return [
    'NUOVO MESSAGGIO DAL SITO — Eternal Touch',
    '═'.repeat(56),
    '',
    `Da:        ${name}`,
    `Email:     ${email}`,
    phone   ? `Telefono:  ${phone}`   : null,
    subject ? `Oggetto:   ${subject}` : null,
    `Lingua:    ${language}${source ? ' · ' + source : ''}`,
    `Quando:    ${new Date(createdAt).toLocaleString('it-IT')}`,
    '',
    '── Messaggio ─────────────────────────────────────────',
    message,
    '',
    `Apri il pannello admin: ${SITE_URL}/admin/messages`,
    `Per rispondere, scrivi direttamente a: ${email}`
  ].filter(Boolean).join('\n');
}

// --- Customer confirmation template (3 languages) -------------------
const GREETING = {
  bg: name => `Здравейте ${name},`,
  it: name => `Ciao ${name},`,
  en: name => `Hello ${name},`
};

const CONFIRM_COPY = {
  bg: {
    subject:    'Получихме съобщението ви · Eternal Touch',
    eyebrow:    'Eternal Touch · Ателие',
    title:      'Благодарим ви за съобщението.',
    body1:      'Получихме съобщението ви и ще ви отговорим в рамките на 24 часа в работни дни.',
    body2:      'Ако въпросът е спешен, може да ни се обадите директно на номерата по-долу.',
    yourMsgLabel: 'Вашето съобщение',
    signoff:    'С топъл поздрав,',
    team:       'Симона · Айви · Мая',
    location:   'Бобов дол, България · Милано, Италия',
    phones:     'Тел. (BG): +359 877 876 709  ·  Tel. (IT): +39 393 6943854',
    footerNote: 'Това е автоматично потвърждение. Не отговаряйте на това съобщение.'
  },
  it: {
    subject:    'Abbiamo ricevuto il tuo messaggio · Eternal Touch',
    eyebrow:    'Eternal Touch · Atelier',
    title:      'Grazie per averci scritto.',
    body1:      'Abbiamo ricevuto il tuo messaggio e ti risponderemo entro 24 ore nei giorni feriali.',
    body2:      'Se la richiesta è urgente, puoi chiamarci direttamente ai numeri qui sotto.',
    yourMsgLabel: 'Il tuo messaggio',
    signoff:    'Un caro saluto,',
    team:       'Simona · Ivy · Maya',
    location:   'Bobov Dol, Bulgaria · Milano, Italia',
    phones:     'Tel. (IT): +39 393 6943854  ·  Tel. (BG): +359 877 876 709',
    footerNote: 'Questa è una conferma automatica. Non rispondere a questo messaggio.'
  },
  en: {
    subject:    'We received your message · Eternal Touch',
    eyebrow:    'Eternal Touch · Atelier',
    title:      'Thank you for writing to us.',
    body1:      'We received your message and will reply within 24 hours on business days.',
    body2:      'If your request is urgent, feel free to call us directly at the numbers below.',
    yourMsgLabel: 'Your message',
    signoff:    'Warm regards,',
    team:       'Simona · Ivy · Maya',
    location:   'Bobov Dol, Bulgaria · Milan, Italy',
    phones:     'Tel. (IT): +39 393 6943854  ·  Tel. (BG): +359 877 876 709',
    footerNote: 'This is an automatic confirmation. Please do not reply to this message.'
  }
};

function customerConfirmationHtml({ name, message, language }) {
  const c = CONFIRM_COPY[language] || CONFIRM_COPY.en;
  const greet = (GREETING[language] || GREETING.en)(esc(name));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:${COLOR.cream2};font-family:Georgia,serif;color:${COLOR.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.cream2};padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COLOR.cream};border:1px solid ${COLOR.line};">
    <tr><td align="center" style="padding:40px 40px 8px 40px;">
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${COLOR.gold};">${esc(c.eyebrow)}</div>
    </td></tr>
    <tr><td align="center" style="padding:8px 40px 24px 40px;">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:400;margin:0;color:${COLOR.ink};line-height:1.2;">${esc(c.title)}</h1>
    </td></tr>
    <tr><td style="padding:8px 40px 24px 40px;">
      <p style="font-family:Georgia,serif;font-size:16px;line-height:1.7;color:${COLOR.ink};margin:0 0 16px 0;">${greet}</p>
      <p style="font-family:Georgia,serif;font-size:16px;line-height:1.7;color:${COLOR.ink};margin:0 0 14px 0;">${esc(c.body1)}</p>
      <p style="font-family:Georgia,serif;font-size:16px;line-height:1.7;color:${COLOR.ink};margin:0;">${esc(c.body2)}</p>
    </td></tr>
    <tr><td style="padding:8px 40px 24px 40px;">
      <div style="background:${COLOR.cream2};border-left:3px solid ${COLOR.gold};padding:18px 22px;">
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${COLOR.muted};margin-bottom:10px;">${esc(c.yourMsgLabel)}</div>
        <div style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:${COLOR.ink};white-space:pre-wrap;">${esc(message)}</div>
      </div>
    </td></tr>
    <tr><td style="padding:24px 40px 32px 40px;border-top:1px solid ${COLOR.line};">
      <p style="font-family:Georgia,serif;font-style:italic;font-size:15px;color:${COLOR.ink};margin:0 0 6px 0;">${esc(c.signoff)}</p>
      <p style="font-family:Georgia,serif;font-size:16px;color:${COLOR.ink};margin:0 0 16px 0;letter-spacing:0.3px;"><strong style="color:${COLOR.goldDark};font-weight:600;">${esc(c.team)}</strong></p>
      <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:${COLOR.muted};margin:0 0 4px 0;line-height:1.6;">${esc(c.location)}</p>
      <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:${COLOR.muted};margin:0;line-height:1.6;">${esc(c.phones)}</p>
    </td></tr>
    <tr><td align="center" style="padding:16px 40px 24px 40px;background:${COLOR.cream2};">
      <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:${COLOR.muted};margin:0;line-height:1.5;">${esc(c.footerNote)}</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function customerConfirmationText({ name, message, language }) {
  const c = CONFIRM_COPY[language] || CONFIRM_COPY.en;
  const greet = (GREETING[language] || GREETING.en)(name);
  return [
    c.eyebrow,
    '═'.repeat(56),
    '',
    c.title,
    '',
    greet,
    '',
    c.body1,
    c.body2,
    '',
    `── ${c.yourMsgLabel} ─────────────────────────────────`,
    message,
    '',
    c.signoff,
    c.team,
    '',
    c.location,
    c.phones,
    '',
    '─'.repeat(56),
    c.footerNote
  ].join('\n');
}

// --- Main entry: send both notifications ----------------------------
// Returns { adminSent, customerSent } — booleans. Never throws.
// Caller (api.js) has already saved the message to DB; this is best-effort.
export async function sendContactNotifications(payload) {
  const t = getTransporter();
  if (!t) return { adminSent: false, customerSent: false, reason: 'smtp-not-configured' };

  const { name, email, phone, subject, message, language, source, createdAt } = payload;
  const lang = ['bg', 'it', 'en'].includes(language) ? language : 'en';
  const confirmCopy = CONFIRM_COPY[lang];

  // Send both in parallel — independent failure modes
  const [adminResult, customerResult] = await Promise.allSettled([
    t.sendMail({
      from: SMTP_FROM,
      to: NOTIFY_TO,
      replyTo: `${name} <${email}>`,    // hitting "Reply" goes straight to the customer
      subject: `[Eternal Touch] ${subject || 'Nuovo messaggio'} — ${name}`,
      text: adminNotificationText(payload),
      html: adminNotificationHtml(payload)
    }),
    t.sendMail({
      from: SMTP_FROM,
      to: `${name} <${email}>`,
      subject: confirmCopy.subject,
      text: customerConfirmationText({ name, message, language: lang }),
      html: customerConfirmationHtml({ name, message, language: lang })
    })
  ]);

  if (adminResult.status === 'rejected') {
    console.warn(`[email] admin notification failed: ${adminResult.reason?.message || adminResult.reason}`);
  } else {
    console.log(`[email] ✓ admin notified (${name} <${email}>)`);
  }
  if (customerResult.status === 'rejected') {
    console.warn(`[email] customer confirmation failed: ${customerResult.reason?.message || customerResult.reason}`);
  } else {
    console.log(`[email] ✓ customer confirmed (${email})`);
  }

  return {
    adminSent:    adminResult.status === 'fulfilled',
    customerSent: customerResult.status === 'fulfilled'
  };
}
