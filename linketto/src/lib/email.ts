// Транзакционен имейл през Resend HTTP API (само server-side ключ, като
// подхода за Gemini). Без RESEND_API_KEY е тих no-op — билдът и локалната
// разработка не изискват ключ; на продукция собственикът го попълва.
// Чистите HTML-строители нямат странични ефекти и се тестват директно;
// sendEmail сам се гейтва по env, затова не изисква „server-only" пазач.

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );

// Локализиран текст на имейла-разписка (на езика на купувача). bg е
// източникът; липсващ език пада към en.
interface EmailStrings {
  subjectPrefix: string;
  thanks: (title: string, price: string) => string;
  here: string;
  open: string;
  fallback: (url: string) => string;
  receipt: string;
  waiver: string;
  viewReceipt: string;
}

const EMAIL_STRINGS: Record<string, EmailStrings> = {
  bg: {
    subjectPrefix: 'Покупка',
    thanks: (t, p) => `Благодарим за покупката на <strong>${t}</strong> (${p}).`,
    here: 'Ето линка ти за достъп:',
    open: 'Отвори покупката',
    fallback: (u) => `Ако бутонът не работи: ${u}`,
    receipt:
      'Този имейл е разписка за покупката ти на траен носител. Пази линка — води те директно до съдържанието.',
    waiver:
      'Потвърждаваме, че преди покупката изрично поиска съдържанието да ти бъде предоставено веднага и се съгласи, че така губиш 14-дневното право на отказ.',
    viewReceipt: 'Виж разписката',
  },
  en: {
    subjectPrefix: 'Purchase',
    thanks: (t, p) => `Thank you for buying <strong>${t}</strong> (${p}).`,
    here: 'Here is your access link:',
    open: 'Open your purchase',
    fallback: (u) => `If the button does not work: ${u}`,
    receipt:
      'This email is your purchase receipt on a durable medium. Keep the link — it takes you straight to the content.',
    waiver:
      'We confirm that before the purchase you expressly requested immediate delivery of the content and agreed that you thereby lose the 14-day right of withdrawal.',
    viewReceipt: 'View receipt',
  },
  it: {
    subjectPrefix: 'Acquisto',
    thanks: (t, p) => `Grazie per aver acquistato <strong>${t}</strong> (${p}).`,
    here: 'Ecco il tuo link di accesso:',
    open: 'Apri il tuo acquisto',
    fallback: (u) => `Se il pulsante non funziona: ${u}`,
    receipt:
      'Questa email è la ricevuta del tuo acquisto su un supporto durevole. Conserva il link — ti porta direttamente al contenuto.',
    waiver:
      "Confermiamo che prima dell'acquisto hai richiesto espressamente la consegna immediata del contenuto e hai accettato di perdere così il diritto di recesso di 14 giorni.",
    viewReceipt: 'Vedi la ricevuta',
  },
  es: {
    subjectPrefix: 'Compra',
    thanks: (t, p) => `Gracias por comprar <strong>${t}</strong> (${p}).`,
    here: 'Aquí tienes tu enlace de acceso:',
    open: 'Abrir tu compra',
    fallback: (u) => `Si el botón no funciona: ${u}`,
    receipt:
      'Este email es el recibo de tu compra en un soporte duradero. Guarda el enlace — te lleva directamente al contenido.',
    waiver:
      'Confirmamos que antes de la compra solicitaste expresamente la entrega inmediata del contenido y aceptaste perder así el derecho de desistimiento de 14 días.',
    viewReceipt: 'Ver recibo',
  },
  de: {
    subjectPrefix: 'Kauf',
    thanks: (t, p) => `Danke für den Kauf von <strong>${t}</strong> (${p}).`,
    here: 'Hier ist dein Zugangslink:',
    open: 'Kauf öffnen',
    fallback: (u) => `Falls der Button nicht funktioniert: ${u}`,
    receipt:
      'Diese E-Mail ist deine Kaufquittung auf einem dauerhaften Datenträger. Bewahre den Link auf — er führt dich direkt zum Inhalt.',
    waiver:
      'Wir bestätigen, dass du vor dem Kauf ausdrücklich die sofortige Bereitstellung des Inhalts verlangt und zugestimmt hast, dadurch dein 14-tägiges Widerrufsrecht zu verlieren.',
    viewReceipt: 'Beleg ansehen',
  },
  fr: {
    subjectPrefix: 'Achat',
    thanks: (t, p) => `Merci d'avoir acheté <strong>${t}</strong> (${p}).`,
    here: "Voici votre lien d'accès :",
    open: 'Ouvrir votre achat',
    fallback: (u) => `Si le bouton ne fonctionne pas : ${u}`,
    receipt:
      "Cet e-mail est le reçu de votre achat sur un support durable. Conservez le lien — il vous mène directement au contenu.",
    waiver:
      "Nous confirmons qu'avant l'achat vous avez expressément demandé la livraison immédiate du contenu et accepté de perdre ainsi votre droit de rétractation de 14 jours.",
    viewReceipt: 'Voir le reçu',
  },
};

/** Тема на имейла за доставка (на езика на купувача). */
export function deliverySubject(productTitle: string, locale?: string): string {
  const s = EMAIL_STRINGS[locale ?? 'bg'] ?? EMAIL_STRINGS.en;
  return `Linketto — ${s.subjectPrefix}: ${productTitle}`;
}

/** Имейл с линка за достъп до купения дигитален продукт (fulfilment). */
export function deliveryEmailHtml(input: {
  productTitle: string;
  deliveryUrl: string;
  amountCents: number;
  locale?: string;
  receiptUrl?: string;
}): string {
  const s = EMAIL_STRINGS[input.locale ?? 'bg'] ?? EMAIL_STRINGS.en;
  const price = `€${(input.amountCents / 100).toFixed(2)}`;
  const url = esc(input.deliveryUrl);
  const receiptLink = input.receiptUrl
    ? `<p style="margin-top:8px"><a href="${esc(input.receiptUrl)}" style="color:#3b82c4;font-size:13px;font-weight:600">${s.viewReceipt} →</a></p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Linketto</h1>
  <p>${s.thanks(esc(input.productTitle), price)}</p>
  <p>${s.here}</p>
  <p><a href="${url}" style="display:inline-block;background:#3b82c4;color:#fff;padding:12px 20px;border-radius:9999px;text-decoration:none;font-weight:600">${s.open}</a></p>
  <p style="color:#64748b;font-size:13px">${s.fallback(url)}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#94a3b8;font-size:12px">${s.receipt}</p>
  ${receiptLink}
  <p style="color:#94a3b8;font-size:12px">${s.waiver}</p>
</div>`;
}
