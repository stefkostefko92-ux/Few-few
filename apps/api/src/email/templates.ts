import type { OutgoingEmail } from "./mailer.js";

/**
 * Bulgarian-language email templates. Markup is deliberately inline-styled and
 * table-free-minimal so it renders consistently across mail clients. Each
 * template returns both an HTML and a plain-text part.
 */

const BRAND = "АСО";
const ACCENT = "#d9b25f";
const BG = "#0a1d15";

function shell(title: string, intro: string, ctaLabel: string, ctaUrl: string, note: string): string {
  return `<!doctype html><html lang="bg"><body style="margin:0;background:${BG};font-family:Georgia,'Times New Roman',serif;color:#e8e2d2">
  <div style="max-width:520px;margin:0 auto;padding:40px 28px">
    <div style="text-align:center;margin-bottom:28px">
      <div style="font-size:40px;letter-spacing:.06em;color:${ACCENT};font-weight:700">${BRAND}</div>
      <div style="font-size:13px;color:#9aa39b;letter-spacing:.18em;text-transform:uppercase">Премиум клуб за игри</div>
    </div>
    <div style="background:rgba(18,48,38,.6);border:1px solid rgba(217,178,95,.18);border-radius:16px;padding:28px">
      <h1 style="font-size:22px;margin:0 0 12px;color:#fff">${title}</h1>
      <p style="font-size:15px;line-height:1.6;color:#cdd4cb;margin:0 0 24px">${intro}</p>
      <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,${ACCENT},#b8923f);color:#0a1d15;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px">${ctaLabel}</a>
      <p style="font-size:13px;line-height:1.6;color:#9aa39b;margin:24px 0 0">${note}</p>
      <p style="font-size:12px;color:#7b8379;margin:16px 0 0;word-break:break-all">${ctaUrl}</p>
    </div>
    <p style="text-align:center;font-size:12px;color:#6b7268;margin-top:24px">Created and Designed by Carbon Stealth VCC</p>
  </div></body></html>`;
}

export function verificationEmail(to: string, url: string): OutgoingEmail {
  return {
    to,
    subject: `${BRAND} — потвърди своя имейл`,
    html: shell(
      "Потвърди своя имейл",
      "Добре дошъл в АСО! Натисни бутона по-долу, за да потвърдиш имейла си и да активираш всички функции на акаунта.",
      "Потвърди имейла",
      url,
      "Линкът е валиден 24 часа. Ако не си създавал акаунт, просто игнорирай това съобщение.",
    ),
    text: `Добре дошъл в АСО!\n\nПотвърди имейла си на следния адрес (валиден 24 часа):\n${url}\n\nАко не си създавал акаунт, игнорирай това съобщение.`,
  };
}

export function passwordResetEmail(to: string, url: string): OutgoingEmail {
  return {
    to,
    subject: `${BRAND} — нулиране на паролата`,
    html: shell(
      "Нулиране на паролата",
      "Получихме заявка за нова парола за твоя акаунт. Натисни бутона, за да зададеш нова парола.",
      "Задай нова парола",
      url,
      "Линкът е валиден 1 час. Ако не си заявявал това, паролата ти остава непроменена.",
    ),
    text: `Заявка за нова парола в АСО.\n\nЗадай нова парола на следния адрес (валиден 1 час):\n${url}\n\nАко не си заявявал това, игнорирай съобщението — паролата ти остава непроменена.`,
  };
}
