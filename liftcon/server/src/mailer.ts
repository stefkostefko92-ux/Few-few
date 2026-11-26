// Изпращане през Brevo Transactional API (HTTPS, ЕС). SMTP портовете на сървъра са блокирани — затова API.
export interface Messaggio {
  subject: string;
  text: string;
  replyTo: { email: string; name: string };
}

export interface Mailer {
  send(msg: Messaggio): Promise<void>;
}

export interface BrevoOptions {
  apiKey: string;
  from: { email: string; name: string };
  to: string;
  endpoint?: string;
  timeoutMs?: number;
}

export function brevoMailer(opts: BrevoOptions): Mailer {
  const endpoint = opts.endpoint ?? "https://api.brevo.com/v3/smtp/email";
  return {
    async send(msg) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "api-key": opts.apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: opts.from,
          to: [{ email: opts.to }],
          replyTo: msg.replyTo,
          subject: msg.subject,
          textContent: msg.text,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      if (!res.ok) throw new Error(`Brevo ha risposto ${res.status}`);
    },
  };
}
