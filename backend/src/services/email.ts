import nodemailer from 'nodemailer';
let transporter: any = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({ host, port: parseInt(process.env.SMTP_PORT || '587'), secure: process.env.SMTP_SECURE === 'true', auth: { user, pass } });
  return transporter;
}

const layout = (title: string, body: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:30px 10px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
<tr><td style="background:linear-gradient(135deg,#0891b2,#0e1015);padding:24px 32px;">
<h1 style="margin:0;color:#fff;font-size:22px;">${process.env.AZIENDA_NOME || 'ERP Ascensori'}</h1>
<p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">Sistema Gestione Ascensori</p>
</td></tr>
<tr><td style="padding:32px;color:#1a1a1a;font-size:14px;line-height:1.6;">
<h2 style="margin:0 0 16px;color:#0891b2;font-size:18px;">${title}</h2>${body}
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
<p style="margin:0;color:#9ca3af;font-size:10px;text-align:center;">Email automatica — non rispondere</p>
</td></tr></table></td></tr></table></body></html>`;

export async function sendEmail(to: string, subject: string, html: string, attachments?: any[]): Promise<boolean> {
  const t = getTransporter(); if (!t) return false;
  try { await t.sendMail({ from: `"${process.env.AZIENDA_NOME||'ERP'}" <${process.env.SMTP_FROM||process.env.SMTP_USER}>`, to, subject, html, attachments }); return true; }
  catch (e: any) { console.error('Email fail:', e.message); return false; }
}

export async function sendScadenzaImpianto(to: string, imp: any, gg: number) {
  const subj = gg < 0 ? `SCADUTA: Revisione ${imp.matricola}` : `Revisione ${imp.matricola} tra ${gg} giorni`;
  return sendEmail(to, subj, layout(subj, `<p>Impianto <strong>${imp.matricola}</strong> (${imp.marca||''} ${imp.modello||''}) richiede revisione.</p><p>Scadenza: <strong style="color:${gg<0?'#ef4444':'#f59e0b'}">${new Date(imp.prossimaRevisione).toLocaleDateString('it-IT')}</strong></p>`));
}

export async function sendFatturaEmail(to: string, fattura: any, pdf: Buffer) {
  return sendEmail(to, `Fattura ${fattura.numero}`, layout(`Fattura ${fattura.numero}`, `<p>In allegato la fattura n. <strong>${fattura.numero}</strong> per € ${Number(fattura.totaleLordo||0).toFixed(2)}.</p>`), [{ filename: `Fattura_${fattura.numero}.pdf`, content: pdf }]);
}

export async function sendPreventivoEmail(to: string, prev: any, pdf: Buffer) {
  return sendEmail(to, `Preventivo ${prev.numero}`, layout(`Preventivo ${prev.numero}`, `<p>In allegato il preventivo n. <strong>${prev.numero}</strong> — Oggetto: ${prev.oggetto||''}.</p><p>Importo: € ${Number(prev.totaleLordo||0).toFixed(2)} | Validità: 30 giorni</p>`), [{ filename: `Preventivo_${prev.numero}.pdf`, content: pdf }]);
}

export async function sendPasswordReset(to: string, nome: string, pwd: string) {
  return sendEmail(to, 'Reset Password', layout('Password reimpostata', `<p>Ciao <strong>${nome}</strong>, la tua nuova password è: <code style="background:#0891b2;color:#fff;padding:4px 8px;border-radius:4px;">${pwd}</code></p><p><strong>Cambiala al prossimo accesso.</strong></p>`));
}

export const isEmailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
