import nodemailer from "nodemailer";

// Email notifications are optional: if SMTP isn't configured, the lead is still
// saved in the admin inbox and we simply skip sending.
function transporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

export type LeadEmail = { name: string; email: string; topic: string; message: string; locale: string };

export async function notifyNewLead(lead: LeadEmail): Promise<void> {
  const tx = transporter();
  if (!tx) return;
  const to = process.env.LEADS_NOTIFY_TO || process.env.ADMIN_EMAIL || "centroquibulgaria@gmail.com";
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || to;

  const subject = `Nuova richiesta dal sito — ${lead.name} (${lead.topic || "—"})`;
  const text =
    `Nome: ${lead.name}\nEmail: ${lead.email}\nInteresse: ${lead.topic}\nLingua: ${lead.locale}\n\n${lead.message}`;
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:560px">
      <h2 style="color:#0f7a3d;margin:0 0 12px">Nuova richiesta dal sito</h2>
      <p style="margin:.2rem 0"><b>Nome:</b> ${escapeHtml(lead.name)}</p>
      <p style="margin:.2rem 0"><b>Email:</b> <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></p>
      <p style="margin:.2rem 0"><b>Interesse:</b> ${escapeHtml(lead.topic)} · <b>Lingua:</b> ${escapeHtml(lead.locale)}</p>
      <p style="margin:14px 0 4px"><b>Messaggio:</b></p>
      <p style="white-space:pre-wrap;background:#f6f7f9;padding:12px;border-radius:8px">${escapeHtml(lead.message)}</p>
    </div>`;

  await tx.sendMail({ from, to, replyTo: lead.email, subject, text, html });
}
