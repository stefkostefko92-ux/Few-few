import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../env.js';

let transporter: Transporter | null = null;

/**
 * Проверява, че SMTP конфигурацията е налична. Извиква се при старт на worker-а,
 * за да спре веднага при липсваща конфигурация, вместо да приема задачи и да се
 * проваля тихо при всяко изпращане (имейлът към общината е смисълът на услугата).
 */
export function assertSmtpConfig(): void {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM) {
    throw new Error(
      'Липсва SMTP конфигурация: задай SMTP_HOST, SMTP_USER, SMTP_PASS и EMAIL_FROM.',
    );
  }
}

/**
 * Brevo SMTP транспорт, създаден лениво. SMTP пълномощията се изискват само от
 * worker процеса; ако липсват, хвърляме ясна грешка вместо мълчалив отказ.
 */
export function getTransport(): Transporter {
  if (!transporter) {
    assertSmtpConfig();
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}
