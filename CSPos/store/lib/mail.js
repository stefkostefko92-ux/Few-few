// Имейл с лицензния ключ след покупка. SMTP през env (SMTP_HOST/PORT/USER/
// PASS, MAIL_FROM); без конфигурация — пропуска тихо (ключът е на success
// страницата). Изпращането е идемпотентно: колоната emailSentAt се claim-ва
// в базата ПРЕДИ изпращане (webhook и success fallback не дублират).

import nodemailer from "nodemailer";
import { db } from "./db.js";

const { SMTP_HOST, SMTP_PORT = 465, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

const transport = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    })
  : null;

const PLAN_LABEL = { monthly: "месечен", yearly: "годишен", lifetime: "доживотен" };

/** Изпраща ключа на купувача (веднъж на лиценз). Не хвърля — само логва. */
export async function sendLicenseEmail(lic, baseUrl) {
  if (!transport || !lic.email) return;
  // атомарен claim — само първият извикващ изпраща
  const claimed = db
    .prepare("UPDATE licenses SET emailSentAt=? WHERE id=? AND emailSentAt IS NULL")
    .run(Date.now(), lic.id).changes;
  if (!claimed) return;

  const dl = `${baseUrl}/download?key=${encodeURIComponent(lic.keyPlain)}`;
  try {
    await transport.sendMail({
      from: MAIL_FROM ?? SMTP_USER,
      to: lic.email,
      subject: `Вашият лиценз за Carbon Stealth POS (${lic.seats} ${lic.seats === 1 ? "каса" : "каси"})`,
      text: [
        "Благодарим Ви за покупката!",
        "",
        `Лицензен ключ (${PLAN_LABEL[lic.plan] ?? lic.plan}, ${lic.seats} каси):`,
        lic.keyPlain,
        "",
        `Сваляне на инсталатора: ${dl}`,
        "",
        "Активация: инсталирайте Carbon Stealth POS и въведете ключа в",
        "„Настройки → Лиценз“ на всяка каса (изисква еднократна интернет връзка).",
        "",
        "Запазете този имейл — ключът е и Вашият достъп за сваляне.",
        "Carbon Stealth VCC · carbonstealth.eu",
      ].join("\n"),
      html: `<div style="font-family:system-ui,sans-serif;max-width:540px;margin:auto;color:#17203a">
        <h2>Благодарим Ви за покупката! 🎉</h2>
        <p>Вашият лицензен ключ (${PLAN_LABEL[lic.plan] ?? lic.plan}, <b>${lic.seats} ${lic.seats === 1 ? "каса" : "каси"}</b>):</p>
        <p style="font-family:monospace;font-size:17px;font-weight:700;background:#f6f4ee;border:1px dashed #d98e0b;border-radius:10px;padding:14px;text-align:center">${lic.keyPlain}</p>
        <p style="text-align:center"><a href="${dl}" style="display:inline-block;background:#f5a623;color:#231a05;font-weight:700;padding:12px 22px;border-radius:12px;text-decoration:none">⬇ Свали Carbon Stealth POS (.exe)</a></p>
        <p>Активация: инсталирайте и въведете ключа в <b>„Настройки → Лиценз“</b> на всяка каса
        (еднократна интернет връзка; после касата работи офлайн).</p>
        <p style="color:#5c6b85;font-size:13px">Запазете този имейл — ключът е и Вашият достъп за сваляне.<br>Carbon Stealth VCC · carbonstealth.eu</p>
      </div>`,
    });
  } catch (err) {
    console.error("[mail]", err.message);
    // връщаме claim-а, за да опита пак при следващо събитие
    db.prepare("UPDATE licenses SET emailSentAt=NULL WHERE id=?").run(lic.id);
  }
}
