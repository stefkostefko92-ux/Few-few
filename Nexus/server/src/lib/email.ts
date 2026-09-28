import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Имейл слой за Nexus Dominion — SMTP през Register.it.
 *
 * Философия „save-first, send-second": имейлът е подобрение върху вече
 * записаното в БД, никога първичният път. Никога не хвърля — връща boolean.
 *
 * ⚠️ Register.it особености (научени от eternaltouch/src/lib/email.js):
 *  1. Порт по подразбиране 587 (submission + STARTTLS), НЕ 465 — 465 е
 *     блокиран изходящо на много хостове (напр. Hetzner), докато 587 е
 *     практически винаги отворен. Override през SMTP_PORT.
 *  2. authsmtp.register.it представя сертификат за *.securemail.pro /
 *     smtp.webnode.com — НЕ за connect хоста. За да пазим пълна валидация
 *     (rejectUnauthorized остава ON), задаваме SMTP_TLS_SERVERNAME към име,
 *     което Е в сертификата. Никога не изключвай валидацията.
 *  3. requireTLS на 587 — иначе активен MITM може да свали STARTTLS от EHLO
 *     и AUTH LOGIN креденшълите изтичат в plaintext. requireTLS => връзката
 *     се проваля вместо да изтече паролата.
 */

const SMTP_HOST = process.env.SMTP_HOST || 'authsmtp.register.it';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = (process.env.SMTP_SECURE || 'false') === 'true'; // true=465 implicit TLS, false=587 STARTTLS
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || (SMTP_USER ? `Nexus Dominion <${SMTP_USER}>` : '');
const SMTP_TLS_SERVERNAME = process.env.SMTP_TLS_SERVERNAME || '';
// Канонична публична база за линка за смяна на парола. Изравнено с останалата
// част от приложението (Stripe/geo използват PUBLIC_BASE_URL).
const SITE_URL = (process.env.PUBLIC_BASE_URL || process.env.SITE_URL || 'https://nexus.carbonstealth.eu').replace(/\/$/, '');

let _transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP_USER / SMTP_PASS не са конфигурирани — имейли НЯМА да се пращат (записът в БД остава).');
    return null;
  }
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    // На 587 (secure:false) изисквай STARTTLS — без silent downgrade.
    requireTLS: !SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Валидирай спрямо SMTP_TLS_SERVERNAME, когато connect хостът не е в
    // сертификата (rejectUnauthorized остава ON).
    ...(SMTP_TLS_SERVERNAME ? { tls: { servername: SMTP_TLS_SERVERNAME } } : {}),
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  return _transporter;
}

/** Дали SMTP е конфигуриран (за да реши маршрутът fallback поведение). */
export function emailConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS);
}

/** Незадължителна проверка при стартиране — само логва. Non-blocking. */
export async function verifyEmailConfig(): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.verify();
    console.log(`[email] ✓ SMTP готов · ${SMTP_HOST}:${SMTP_PORT} (${SMTP_SECURE ? 'SSL' : 'STARTTLS'})`);
    return true;
  } catch (err: any) {
    console.warn(`[email] ⚠ SMTP verify провал: ${err?.message || err}`);
    return false;
  }
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const COLOR = { bg: '#0f1218', card: '#161b24', gold: '#d6a13d', text: '#e7e9ee', muted: '#9aa0ad', line: '#2a2f3a' };

function resetHtml(username: string, resetUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Password reset</title></head>
<body style="margin:0;padding:0;background:${COLOR.bg};font-family:Arial,Helvetica,sans-serif;color:${COLOR.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.bg};padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${COLOR.card};border:1px solid ${COLOR.line};border-radius:12px;overflow:hidden;">
    <tr><td style="padding:28px 36px 12px 36px;border-bottom:1px solid ${COLOR.line};">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${COLOR.gold};">Nexus Dominion</div>
      <h1 style="font-size:22px;font-weight:600;margin:8px 0 0 0;color:${COLOR.text};">Password reset</h1>
    </td></tr>
    <tr><td style="padding:24px 36px;font-size:15px;line-height:1.7;color:${COLOR.text};">
      <p style="margin:0 0 14px 0;">Hello ${esc(username)},</p>
      <p style="margin:0 0 20px 0;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password stays unchanged.</p>
      <p style="margin:0 0 24px 0;text-align:center;">
        <a href="${esc(resetUrl)}" style="display:inline-block;background:${COLOR.gold};color:#1a1205;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Reset password</a>
      </p>
      <p style="margin:0;font-size:12px;color:${COLOR.muted};line-height:1.6;">If the button doesn't work, copy this link into your browser:<br><span style="color:${COLOR.gold};word-break:break-all;">${esc(resetUrl)}</span></p>
    </td></tr>
    <tr><td style="padding:16px 36px 28px 36px;border-top:1px solid ${COLOR.line};text-align:center;">
      <div style="font-size:12px;color:${COLOR.muted};line-height:1.6;">Nexus Dominion · Carbon Stealth VCC<br>This is an automated message — please do not reply.</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function resetText(username: string, resetUrl: string): string {
  return [
    'NEXUS DOMINION — Password reset',
    '='.repeat(48),
    '',
    `Hello ${username},`,
    '',
    'We received a request to reset your password. Open the link below to',
    'choose a new one. It expires in 1 hour. If you didn’t request this,',
    'ignore this email — your password stays unchanged.',
    '',
    resetUrl,
    '',
    '-'.repeat(48),
    'Nexus Dominion · Carbon Stealth VCC',
    'Automated message — please do not reply.',
  ].join('\n');
}

/**
 * Праща имейл за смяна на парола. Best-effort: връща true при успех, false
 * ако SMTP не е конфигуриран или пращането се провали. Никога не хвърля.
 */
export async function sendPasswordResetEmail(to: string, username: string, token: string): Promise<boolean> {
  const t = getTransporter();
  if (!t || !to) return false;
  const resetUrl = `${SITE_URL}/reset?token=${encodeURIComponent(token)}`;
  try {
    await t.sendMail({
      from: SMTP_FROM,
      to,
      subject: 'Reset your Nexus Dominion password',
      text: resetText(username, resetUrl),
      html: resetHtml(username, resetUrl),
    });
    console.log(`[email] ✓ reset изпратен на ${to}`);
    return true;
  } catch (err: any) {
    console.warn(`[email] reset провал: ${err?.message || err}`);
    return false;
  }
}
