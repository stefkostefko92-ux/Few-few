// Константите на пощата, общи за сървъра и за формата в браузъра (без Node API).
export const BREVO_HOST = "smtp-relay.brevo.com";
/** 587 и 2525 — STARTTLS (2525 минава и при хостинг, който спира 587); 465 — TLS от началото. */
export const SMTP_PORTS = [587, 2525, 465] as const;
export type SmtpPort = (typeof SMTP_PORTS)[number];
