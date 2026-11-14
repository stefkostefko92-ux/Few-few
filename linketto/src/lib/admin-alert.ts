// Аларми до админите (ADMIN_EMAILS) през Brevo — най-добро усилие: провал при
// изпращане не чупи бизнес действието, само се логва. Само служебни данни
// (id на поръчка/профил, състояние) — без лични данни на трети лица.

import { emailConfigured, sendEmail } from '@/lib/email';

export function adminEmails(raw = process.env.ADMIN_EMAILS ?? ''): string[] {
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(item));
}

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

/** Чисто: тема и HTML на алармата (тества се). */
export function adminAlertEmail(input: { subject: string; lines: string[]; adminUrl: string }): {
  subject: string;
  html: string;
} {
  const items = input.lines.map((line) => `<li>${esc(line)}</li>`).join('');
  return {
    subject: `[Linketto] ${input.subject}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:18px">${esc(input.subject)}</h1>
  <ul style="line-height:1.6">${items}</ul>
  <p><a href="${esc(input.adminUrl)}" style="color:#3b82c4;font-weight:600">Админ панел →</a></p>
</div>`,
  };
}

export async function notifyAdmins(subject: string, lines: string[]): Promise<void> {
  const to = adminEmails();
  if (to.length === 0 || !emailConfigured()) return;
  const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const { subject: s, html } = adminAlertEmail({ subject, lines, adminUrl: `${base}/bg/admin` });
  for (const address of to) {
    await sendEmail({ to: address, subject: s, html, tag: 'admin-alert' }).catch(() => false);
  }
}
