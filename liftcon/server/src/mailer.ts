// Brevo Transactional API (HTTPS, ЕС). SMTP портовете на сървъра са блокирани — затова API.
// Адресите са по документацията на Brevo (developers.brevo.com): POST /v3/smtp/email, GET /v3/account,
// GET /v3/senders; удостоверяване със заглавие `api-key`.
export interface Messaggio {
  subject: string;
  text: string;
  replyTo?: { email: string; name: string };
  to?: string;
}

export interface Mailer {
  send(msg: Messaggio): Promise<void>;
}

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export const BREVO_API = "https://api.brevo.com/v3";

export interface BrevoOptions {
  apiKey: string;
  from: { email: string; name: string };
  to: string;
  endpoint?: string;
  timeoutMs?: number;
  fetch?: FetchFn;
}

const intestazioni = (apiKey: string) => ({ "api-key": apiKey, "content-type": "application/json", accept: "application/json" });

export function brevoMailer(opts: BrevoOptions): Mailer {
  const f = opts.fetch ?? (fetch as unknown as FetchFn);
  return {
    async send(msg) {
      const res = await f(opts.endpoint ?? `${BREVO_API}/smtp/email`, {
        method: "POST",
        headers: intestazioni(opts.apiKey),
        body: JSON.stringify({
          sender: opts.from,
          to: [{ email: msg.to ?? opts.to }],
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          subject: msg.subject,
          textContent: msg.text,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      if (!res.ok) throw new Error(`Brevo ha risposto ${res.status}`);
    },
  };
}

export interface EsitoVerifica {
  ok: boolean;
  stato?: number;
  account?: string;
  mittentiAttivi: string[];
  errore?: string;
}

/** Валиден ли е ключът (GET /account) и кои податели са активни (GET /senders). */
export async function verificaBrevo(apiKey: string, f: FetchFn = fetch as unknown as FetchFn): Promise<EsitoVerifica> {
  try {
    const acc = await f(`${BREVO_API}/account`, { method: "GET", headers: intestazioni(apiKey), signal: AbortSignal.timeout(10_000) });
    if (!acc.ok) return { ok: false, stato: acc.status, mittentiAttivi: [], errore: acc.status === 401 ? "Chiave API non valida o revocata." : `Brevo ha risposto ${acc.status}.` };
    const a = (await acc.json()) as { email?: unknown; companyName?: unknown };
    const snd = await f(`${BREVO_API}/senders`, { method: "GET", headers: intestazioni(apiKey), signal: AbortSignal.timeout(10_000) });
    const s = snd.ok ? ((await snd.json()) as { senders?: Array<{ email?: unknown; active?: unknown }> }) : { senders: [] };
    const mittentiAttivi = (s.senders ?? []).filter((x) => x.active === true && typeof x.email === "string").map((x) => String(x.email).toLowerCase());
    return { ok: true, stato: acc.status, account: [a.companyName, a.email].filter((x) => typeof x === "string" && x).join(" · "), mittentiAttivi };
  } catch (err) {
    return { ok: false, mittentiAttivi: [], errore: err instanceof Error && err.name === "TimeoutError" ? "Brevo non risponde (timeout)." : "Connessione a Brevo non riuscita." };
  }
}
