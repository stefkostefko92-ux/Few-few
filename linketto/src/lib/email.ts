// Транзакционен имейл през Brevo (Sendinblue SAS, Франция — ЕС; API v3).
// Само server-side ключ (като Gemini). Без BREVO_API_KEY е тих no-op — билдът
// и локалната разработка не изискват ключ; на продукция собственикът го попълва.
// Чистите строители (HTML, заявката към Brevo) нямат странични ефекти и се
// тестват директно; sendEmail сам се гейтва по env.
//
// Brevo НЕ приема стандартни хедъри (вкл. List-Unsubscribe) и сам добавя свой
// List-Unsubscribe към транзакционните писма — отписването от седмичния отчет е
// нашата връзка в тялото на писмото (DEPLOY.md §2: настройката при Brevo).

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export interface EmailSender {
  name?: string;
  email: string;
}

/** EMAIL_FROM „Linketto <no-reply@…>“ или само адрес → подател за Brevo. */
export function parseSender(raw: string): EmailSender | null {
  const value = raw.trim();
  const match = /^(.*?)\s*<([^>]+)>$/.exec(value);
  const email = (match ? match[2] : value).trim();
  if (!EMAIL_RE.test(email)) return null;
  const name = match?.[1].trim().replace(/^"|"$/g, '').trim();
  return name ? { name, email } : { email };
}

/** Тялото на POST /v3/smtp/email (само полетата, които ползваме). */
export function brevoPayload(input: {
  sender: EmailSender;
  to: string;
  subject: string;
  html: string;
  tag?: string;
}) {
  return {
    sender: input.sender,
    to: [{ email: input.to }],
    subject: input.subject,
    htmlContent: input.html,
    ...(input.tag ? { tags: [input.tag] } : {}),
  };
}

export function emailConfigured(): boolean {
  return Boolean(
    process.env.BREVO_API_KEY && parseSender(process.env.EMAIL_FROM ?? ''),
  );
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  /** Етикет в Brevo за филтриране (delivery, digest, newsletter…). */
  tag?: string;
}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = parseSender(process.env.EMAIL_FROM ?? '');
  if (!apiKey || !sender) return false;
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(brevoPayload({ sender, ...input })),
      signal: AbortSignal.timeout(15_000),
    });
    // 201 = изпратено (202 е само при scheduledAt, което не ползваме).
    return res.status === 201;
  } catch {
    return false;
  }
}

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );

// ── Бюлетин (email capture): потвърждение + разпращане ────────────────
interface NewsletterStrings {
  confirmSubject: (who: string) => string;
  confirmIntro: (who: string) => string;
  confirmButton: string;
  confirmIgnore: string;
  unsubscribe: string;
  sentVia: string;
}

const NEWSLETTER_STRINGS: Record<string, NewsletterStrings> = {
  bg: {
    confirmSubject: (w) => `Потвърди абонамента за ${w}`,
    confirmIntro: (w) => `Записа се за бюлетина на <strong>${w}</strong>. Потвърди имейла си:`,
    confirmButton: 'Потвърди абонамента',
    confirmIgnore: 'Ако не си ти, просто игнорирай този имейл — нищо няма да получиш.',
    unsubscribe: 'Отписване',
    sentVia: 'Изпратено през Linketto',
  },
  en: {
    confirmSubject: (w) => `Confirm your subscription to ${w}`,
    confirmIntro: (w) => `You signed up for <strong>${w}</strong>'s newsletter. Please confirm your email:`,
    confirmButton: 'Confirm subscription',
    confirmIgnore: "If this wasn't you, just ignore this email — you won't receive anything.",
    unsubscribe: 'Unsubscribe',
    sentVia: 'Sent via Linketto',
  },
  it: {
    confirmSubject: (w) => `Conferma l'iscrizione a ${w}`,
    confirmIntro: (w) => `Ti sei iscritto alla newsletter di <strong>${w}</strong>. Conferma la tua email:`,
    confirmButton: "Conferma l'iscrizione",
    confirmIgnore: 'Se non sei stato tu, ignora questa email — non riceverai nulla.',
    unsubscribe: 'Annulla iscrizione',
    sentVia: 'Inviato tramite Linketto',
  },
  es: {
    confirmSubject: (w) => `Confirma tu suscripción a ${w}`,
    confirmIntro: (w) => `Te suscribiste al boletín de <strong>${w}</strong>. Confirma tu correo:`,
    confirmButton: 'Confirmar suscripción',
    confirmIgnore: 'Si no fuiste tú, ignora este correo — no recibirás nada.',
    unsubscribe: 'Cancelar suscripción',
    sentVia: 'Enviado a través de Linketto',
  },
  de: {
    confirmSubject: (w) => `Bestätige dein Abo von ${w}`,
    confirmIntro: (w) => `Du hast den Newsletter von <strong>${w}</strong> abonniert. Bitte bestätige deine E-Mail:`,
    confirmButton: 'Abo bestätigen',
    confirmIgnore: 'Falls du das nicht warst, ignoriere diese E-Mail — du erhältst nichts.',
    unsubscribe: 'Abbestellen',
    sentVia: 'Gesendet über Linketto',
  },
  fr: {
    confirmSubject: (w) => `Confirmez votre abonnement à ${w}`,
    confirmIntro: (w) => `Vous vous êtes inscrit à la newsletter de <strong>${w}</strong>. Confirmez votre e-mail :`,
    confirmButton: "Confirmer l'abonnement",
    confirmIgnore: "Si ce n'était pas vous, ignorez cet e-mail — vous ne recevrez rien.",
    unsubscribe: 'Se désabonner',
    sentVia: 'Envoyé via Linketto',
  },
};

function newsletterStrings(locale?: string): NewsletterStrings {
  return NEWSLETTER_STRINGS[locale ?? 'bg'] ?? NEWSLETTER_STRINGS.en;
}

export function subscribeConfirmSubject(who: string, locale?: string): string {
  return newsletterStrings(locale).confirmSubject(who);
}

/** Имейл за двойно съгласие (GDPR) с линк за потвърждение. */
export function subscribeConfirmHtml(input: {
  sellerName: string;
  confirmUrl: string;
  locale?: string;
}): string {
  const s = newsletterStrings(input.locale);
  const who = esc(input.sellerName);
  const url = esc(input.confirmUrl);
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Linketto</h1>
  <p>${s.confirmIntro(who)}</p>
  <p><a href="${url}" style="display:inline-block;background:#3b82c4;color:#fff;padding:12px 20px;border-radius:9999px;text-decoration:none;font-weight:600">${s.confirmButton}</a></p>
  <p style="color:#94a3b8;font-size:12px">${s.confirmIgnore}</p>
</div>`;
}

export function broadcastSubject(subject: string): string {
  return subject;
}

/** Имейл на бюлетина към потвърден абонат, с локализиран линк за отписване. */
export function broadcastHtml(input: {
  sellerName: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
  locale?: string;
}): string {
  const s = newsletterStrings(input.locale);
  // Тялото е обикновен текст от създателя — екранираме и пазим редовете.
  const bodyHtml = esc(input.body).replace(/\n/g, '<br>');
  const url = esc(input.unsubscribeUrl);
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="font-size:18px">${esc(input.sellerName)}</h1>
  <h2 style="font-size:20px">${esc(input.subject)}</h2>
  <div style="font-size:15px;line-height:1.6;color:#0f172a">${bodyHtml}</div>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#94a3b8;font-size:12px">${s.sentVia} · <a href="${url}" style="color:#94a3b8">${s.unsubscribe}</a></p>
</div>`;
}
