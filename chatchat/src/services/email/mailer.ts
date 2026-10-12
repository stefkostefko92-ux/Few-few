/**
 * Изпращачът на имейли през Brevo (транзакционен HTTPS API, `POST /v3/smtp/email`, хедър
 * `api-key`) — порт 443, защото Hetzner блокира 25/465/587; без зависимост (вграденият fetch).
 * Ключът е само в паметта на процеса (от средата) — никога в лог, грешка или отговор. От
 * отговора на доставчика четем САМО статуса: тялото може да цитира адреса на получателя.
 * Класификация: 2xx — изпратено; 429/5xx/мрежа/таймаут — повтори по-късно; друго 4xx — край.
 */

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Редът в outbox-а: един и същ при повторен опит (Brevo `Idempotency-Key`). */
  idempotencyKey: string;
  /** Вид за статистиката на доставчика (MESSAGE, DIGEST…) — без лични данни. */
  tag: string;
}

export type SendResult = { ok: true } | { ok: false; retry: boolean; code: string };

export interface Mailer {
  send(mail: OutgoingMail): Promise<SendResult>;
}

export interface BrevoConfig {
  apiKey: string;
  apiUrl: string;
  fromEmail: string;
  fromName: string;
  timeoutMs: number;
}

export class BrevoMailer implements Mailer {
  constructor(
    private readonly cfg: BrevoConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(mail: OutgoingMail): Promise<SendResult> {
    let status: number;
    try {
      const res = await this.fetchImpl(this.cfg.apiUrl, {
        method: 'POST',
        headers: {
          'api-key': this.cfg.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: this.cfg.fromEmail, name: this.cfg.fromName },
          to: [{ email: mail.to }],
          subject: mail.subject,
          textContent: mail.text,
          htmlContent: mail.html,
          headers: { 'Idempotency-Key': mail.idempotencyKey },
          tags: [`chatchat-${mail.tag.toLowerCase()}`],
        }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      status = res.status;
      // Тялото не ни трябва (може да цитира адреса) — само освобождаваме връзката.
      await res.body?.cancel().catch(() => undefined);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      return { ok: false, retry: true, code: name === 'TimeoutError' ? 'timeout' : 'network' };
    }
    if (status >= 200 && status < 300) return { ok: true };
    return { ok: false, retry: status === 429 || status >= 500, code: `http_${status}` };
  }
}
