/**
 * ================================================================
 *  PANEV ASCENSORI — Mailer service (Node.js + nodemailer)
 *  Handles: contact form emails, quote requests
 *  SMTP: Aruba (smtps.aruba.it) via env vars
 * ================================================================
 */

const nodemailer = require('nodemailer');

const SMTP_HOST     = process.env.SMTP_HOST     || 'smtps.aruba.it';
const SMTP_PORT     = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER     = process.env.SMTP_USER     || 'info@panevascensori.it';
const SMTP_PASS     = process.env.SMTP_PASS     || '';
const MAIL_FROM     = process.env.MAIL_FROM     || '"Panev Ascensori" <info@panevascensori.it>';
const MAIL_TO_ADMIN = process.env.MAIL_TO_ADMIN || 'info@panevascensori.it';

let transporter = null;
let lastError   = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_PASS) {
    console.warn('[mailer] SMTP_PASS non configurata — email disabilitate');
    return null;
  }
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    return transporter;
  } catch (err) {
    console.error('[mailer] createTransport failed:', err.message);
    lastError = err.message;
    return null;
  }
}

function escape(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
  );
}

/**
 * Build admin notification email (HTML) when a new contact/quote arrives
 */
function buildAdminHtml({ nome, email, tel, azienda, citta, servizio, messaggio, items, totale, msgId, ip, source }) {
  const isQuote = source === 'carrello' || source === 'quote' || (items && items.length);

  const fields = [
    ['Nome',       nome],
    ['Email',      `<a href="mailto:${escape(email)}" style="color:#162861">${escape(email)}</a>`],
    ['Telefono',   tel ? `<a href="tel:${escape(tel)}" style="color:#162861">${escape(tel)}</a>` : '—'],
    ['Azienda',    azienda || '—'],
    ['Città',      citta || '—'],
    ['Servizio',   servizio || '—'],
    ['Fonte',      source || 'website'],
    ['ID',         msgId],
    ['IP',         ip || '—'],
    ['Data/ora',   new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })],
  ];
  const fieldRows = fields.map(([k, v]) =>
    `<tr><td style="padding:8px 12px;color:#6a6e78;font-size:13px;width:140px;vertical-align:top">${k}</td>` +
    `<td style="padding:8px 12px;font-size:13px;font-weight:500;color:#0f1114">${v}</td></tr>`
  ).join('');

  let itemsHtml = '';
  if (items && items.length) {
    const rows = items.map(it => {
      const sub = (Number(it.price) || 0) * (Number(it.qty) || 1);
      return `<tr style="border-top:1px solid #e1e5eb">
        <td style="padding:10px 12px;font-size:13px">${escape(it.name || '—')}</td>
        <td style="padding:10px 12px;font-family:JetBrains Mono,monospace;font-size:12px;color:#6a6e78">${escape(it.codice || it.id || '')}</td>
        <td style="padding:10px 12px;text-align:right;font-size:13px">${it.qty || 1}</td>
        <td style="padding:10px 12px;text-align:right;font-size:13px">€ ${Number(it.price || 0).toFixed(2).replace('.', ',')}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:600;font-size:13px">€ ${sub.toFixed(2).replace('.', ',')}</td>
      </tr>`;
    }).join('');
    const totStr = Number(totale || 0).toFixed(2).replace('.', ',');
    itemsHtml = `
      <h3 style="color:#162861;margin:28px 0 12px;font-family:Georgia,serif;font-weight:500;font-size:15px;letter-spacing:-0.01em">Articoli richiesti (${items.length})</h3>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e1e5eb">
        <thead><tr style="background:#162861;color:#fff">
          <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase">Prodotto</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase">Codice</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;letter-spacing:0.08em;text-transform:uppercase">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;letter-spacing:0.08em;text-transform:uppercase">Prezzo</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;letter-spacing:0.08em;text-transform:uppercase">Subtotale</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f5f7fa;font-weight:700">
            <td colspan="4" style="padding:14px 12px;text-align:right;font-size:13px;color:#162861">TOTALE (IVA esclusa)</td>
            <td style="padding:14px 12px;text-align:right;font-family:Georgia,serif;font-size:18px;color:#162861">€ ${totStr}</td>
          </tr>
        </tfoot>
      </table>`;
  }

  const subjectTitle = isQuote
    ? `Nuova richiesta preventivo · ${escape(nome)}`
    : `Nuovo contatto dal sito · ${escape(servizio || 'Richiesta')}`;

  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><title>${subjectTitle}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f1114">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fa;padding:40px 0">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" border="0" style="background:#fffdf7;border:1px solid #e1e5eb;max-width:640px">
<tr><td style="background:#030818;padding:32px;border-bottom:2px solid #162861">
  <div style="color:#b9c2d7;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px;font-weight:600">Panev Ascensori · Notifica</div>
  <h1 style="color:#fff;margin:0;font-size:22px;font-weight:400;font-family:Georgia,serif;letter-spacing:-0.02em">${subjectTitle}</h1>
</td></tr>
<tr><td style="padding:32px">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e1e5eb">
    ${fieldRows}
  </table>
  <h3 style="color:#162861;margin:28px 0 12px;font-family:Georgia,serif;font-weight:500;font-size:15px;letter-spacing:-0.01em">Messaggio</h3>
  <div style="background:#f4f1ea;border-left:3px solid #162861;padding:18px 22px;font-size:14px;line-height:1.65;color:#2a2e35;white-space:pre-wrap">${escape(messaggio)}</div>
  ${itemsHtml}
  <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e1e5eb;display:flex;gap:10px;flex-wrap:wrap">
    <a href="mailto:${escape(email)}?subject=Re: ${encodeURIComponent(servizio || 'richiesta')}" style="display:inline-block;padding:12px 24px;background:#162861;color:#fff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.02em">✉ Rispondi al cliente</a>
    ${tel ? `<a href="tel:${escape(tel)}" style="display:inline-block;padding:12px 24px;background:#fff;color:#162861;border:1.5px solid #162861;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.02em">📞 Chiama ora</a>` : ''}
  </div>
</td></tr>
<tr><td style="background:#030818;padding:18px 32px;text-align:center;color:rgba(255,255,255,0.55);font-size:11px">
  Panev Ascensori SAS · P.IVA IT09346970966 · Vittuone (MI)<br>
  Email inviata automaticamente dal form su <a href="https://www.panevascensori.it" style="color:#b9c2d7">panevascensori.it</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Build customer confirmation email
 */
function buildUserHtml({ nome, servizio, msgId, isQuote }) {
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f1114">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fa;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#fffdf7;max-width:560px;border:1px solid #e1e5eb">
<tr><td style="background:#162861;padding:40px 32px;text-align:center">
  <div style="color:#fff;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;margin-bottom:12px;font-weight:600">Panev Ascensori</div>
  <h1 style="color:#fff;margin:0;font-size:28px;font-weight:300;font-family:Georgia,serif;letter-spacing:-0.02em">Grazie, ${escape(nome.split(' ')[0])}.</h1>
</td></tr>
<tr><td style="padding:36px 32px">
  <p style="font-size:16px;line-height:1.65;color:#2a2e35;margin:0 0 20px">
    Abbiamo ricevuto la tua richiesta e ti risponderemo <strong style="color:#162861">entro 2 ore lavorative</strong> (lun-ven, 8:00-18:00).
  </p>
  <p style="font-size:15px;line-height:1.65;color:#6a6e78;margin:0 0 28px">
    Un tecnico specializzato sta già esaminando la tua richiesta<br>relativa a <strong style="color:#0f1114">${escape(servizio || 'i nostri servizi')}</strong>.
  </p>
  <div style="background:#f4f1ea;padding:18px 22px;margin:0 0 28px;border-left:3px solid #162861">
    <div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#162861;margin-bottom:8px;font-weight:700">Riferimento pratica</div>
    <div style="font-family:JetBrains Mono,monospace;font-size:13px;color:#0f1114">${escape(msgId)}</div>
  </div>
  <h3 style="color:#162861;margin:28px 0 12px;font-family:Georgia,serif;font-weight:500;font-size:17px;letter-spacing:-0.015em">Hai urgenza?</h3>
  <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;width:100%">
    <tr><td style="padding:6px 0;font-size:14px;color:#2a2e35"><strong style="color:#162861">Commerciale:</strong> <a href="tel:+393463054093" style="color:#162861">+39 346 305 4093</a> (lun-ven, 8:00-18:00)</td></tr>
    <tr><td style="padding:6px 0;font-size:14px;color:#2a2e35"><strong style="color:#ce2b37">Pronto intervento 24/7:</strong> <a href="tel:+393926848978" style="color:#ce2b37">+39 392 684 8978</a></td></tr>
    <tr><td style="padding:6px 0;font-size:14px;color:#2a2e35"><strong style="color:#162861">Email:</strong> <a href="mailto:info@panevascensori.it" style="color:#162861">info@panevascensori.it</a></td></tr>
  </table>
  <p style="font-size:14px;line-height:1.65;color:#6a6e78;margin:28px 0 0;font-style:italic">
    A presto,<br>
    <span style="color:#162861;font-style:normal;font-weight:600">Il team Panev Ascensori</span>
  </p>
</td></tr>
<tr><td style="background:#030818;padding:24px 32px;text-align:center;color:rgba(255,255,255,0.6);font-size:11px;line-height:1.7">
  <strong style="color:#fff">Panev Ascensori SAS</strong> · P.IVA IT09346970966<br>
  Via Madonna del Salvatore 6 · 20010 Vittuone (MI) · Italia<br>
  <a href="https://www.panevascensori.it" style="color:#b9c2d7;text-decoration:none">www.panevascensori.it</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Send notification + confirmation emails
 * Returns { adminSent, userSent, errors }
 */
async function sendContactEmails(data) {
  const t = getTransporter();
  const result = { adminSent: false, userSent: false, errors: [] };

  if (!t) {
    result.errors.push('SMTP_PASS non configurata nel file .env');
    return result;
  }

  const isQuote = data.source === 'carrello' || data.source === 'quote' || (data.items && data.items.length);
  const adminSubject = isQuote
    ? `🛒 Nuova Richiesta Preventivo · ${data.nome}`
    : `✉ Nuovo contatto dal sito · ${data.servizio || 'Richiesta generica'}`;
  const userSubject = isQuote
    ? 'Abbiamo ricevuto la tua richiesta di preventivo — Panev Ascensori'
    : 'Grazie per averci contattato — Panev Ascensori';

  // Admin notification
  try {
    await t.sendMail({
      from: MAIL_FROM,
      to: MAIL_TO_ADMIN,
      replyTo: data.email ? `"${data.nome}" <${data.email}>` : undefined,
      subject: adminSubject,
      html: buildAdminHtml(data),
      text: `Nuovo messaggio da ${data.nome} <${data.email}>\n\nServizio: ${data.servizio || '—'}\nTelefono: ${data.tel || '—'}\n\nMessaggio:\n${data.messaggio}`,
    });
    result.adminSent = true;
  } catch (err) {
    console.error('[mailer] admin send failed:', err.message);
    result.errors.push('admin: ' + err.message);
  }

  // User confirmation
  if (data.email) {
    try {
      await t.sendMail({
        from: MAIL_FROM,
        to: data.email,
        subject: userSubject,
        html: buildUserHtml({
          nome: data.nome,
          servizio: data.servizio,
          msgId: data.msgId,
          isQuote,
        }),
      });
      result.userSent = true;
    } catch (err) {
      console.error('[mailer] user send failed:', err.message);
      result.errors.push('user: ' + err.message);
    }
  }

  return result;
}

/**
 * Verify SMTP connection (useful for admin health check)
 */
async function verifyConnection() {
  const t = getTransporter();
  if (!t) return { ok: false, reason: 'No transporter (SMTP_PASS missing)' };
  try {
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { sendContactEmails, verifyConnection, buildAdminHtml, buildUserHtml };
