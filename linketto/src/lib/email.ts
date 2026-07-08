import 'server-only';

// Транзакционен имейл през Resend HTTP API (само server-side ключ, като
// подхода за Gemini). Без RESEND_API_KEY е тих no-op — билдът и локалната
// разработка не изискват ключ; на продукция собственикът го попълва.

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

/** Имейл с линка за достъп до купения дигитален продукт (fulfilment). */
export function deliveryEmailHtml(input: {
  productTitle: string;
  deliveryUrl: string;
  amountCents: number;
}): string {
  const price = `€${(input.amountCents / 100).toFixed(2)}`;
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Linketto</h1>
  <p>Благодарим за покупката на <strong>${esc(input.productTitle)}</strong> (${price}).</p>
  <p>Ето линка ти за достъп:</p>
  <p><a href="${esc(input.deliveryUrl)}" style="display:inline-block;background:#3b82c4;color:#fff;padding:12px 20px;border-radius:9999px;text-decoration:none;font-weight:600">Отвори покупката</a></p>
  <p style="color:#64748b;font-size:13px">Ако бутонът не работи: ${esc(input.deliveryUrl)}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#94a3b8;font-size:12px">Този имейл е разписка за покупката ти на траен носител. Пази линка — води те директно до съдържанието.</p>
  <p style="color:#94a3b8;font-size:12px">Потвърждаваме, че преди покупката изрично поиска съдържанието да ти бъде предоставено веднага и се съгласи, че така губиш 14-дневното право на отказ (чл. 57, т. 13 ЗЗП).</p>
</div>`;
}
