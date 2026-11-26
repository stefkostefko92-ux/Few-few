// Настройките на имейла (Brevo) — от панела, иначе от средата. Ключът е шифрован в базата и не се показва
// отново (само последните 4 знака). Известията четат настройките при всяко изпращане (кеш до записа).
import type { Store } from "../store/types.js";
import type { Sigillo } from "../auth/seal.js";
import { brevoMailer, verificaBrevo, type FetchFn, type Mailer, type EsitoVerifica } from "../mailer.js";

const CHIAVE = "email";
const ETICHETTA = "brevo-v1";

interface Salvate {
  apiKeyEnc?: string;
  mittente: string;
  nomeMittente: string;
  destinatario: string;
}

export interface ConfigEmail {
  apiKey: string | null;
  mittente: string;
  nomeMittente: string;
  destinatario: string;
  fonte: "pannello" | "ambiente" | "nessuna";
}

export interface DefaultEmail {
  apiKey?: string | undefined;
  mittente?: string | undefined;
  nomeMittente: string;
  destinatario?: string | undefined;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function gestoreEmail(o: { store: Store; sigillo: Sigillo; env: DefaultEmail; fetch?: FetchFn }) {
  let cache: ConfigEmail | null = null;

  async function leggi(): Promise<ConfigEmail> {
    if (cache) return cache;
    const r = await o.store.impostazioni.leggi(CHIAVE);
    const s = r?.valore as Salvate | undefined;
    if (s) {
      cache = {
        apiKey: s.apiKeyEnc ? o.sigillo.decifra(ETICHETTA, s.apiKeyEnc) : (o.env.apiKey ?? null),
        mittente: s.mittente,
        nomeMittente: s.nomeMittente,
        destinatario: s.destinatario,
        fonte: "pannello",
      };
    } else {
      cache = {
        apiKey: o.env.apiKey ?? null,
        mittente: o.env.mittente ?? "",
        nomeMittente: o.env.nomeMittente,
        destinatario: o.env.destinatario ?? "",
        fonte: o.env.apiKey ? "ambiente" : "nessuna",
      };
    }
    return cache;
  }

  return {
    leggi,

    /** Последните 4 знака на ключа (за показване) или null. */
    async codaChiave(): Promise<string | null> {
      const c = await leggi();
      return c.apiKey ? c.apiKey.slice(-4) : null;
    },

    /** Запис; празен apiKey = ключът остава. Връща дали ключът е сменен. */
    async salva(v: { apiKey: string; mittente: string; nomeMittente: string; destinatario: string }, autoreId: string): Promise<boolean> {
      const r = await o.store.impostazioni.leggi(CHIAVE);
      const prec = r?.valore as Salvate | undefined;
      const nuova = v.apiKey.trim();
      const valore: Salvate = {
        ...(nuova ? { apiKeyEnc: o.sigillo.cifra(ETICHETTA, nuova) } : prec?.apiKeyEnc ? { apiKeyEnc: prec.apiKeyEnc } : {}),
        mittente: v.mittente.trim().toLowerCase(),
        nomeMittente: v.nomeMittente.trim(),
        destinatario: v.destinatario.trim().toLowerCase(),
      };
      await o.store.impostazioni.salva(CHIAVE, valore, autoreId);
      cache = null;
      return Boolean(nuova);
    },

    async verifica(): Promise<EsitoVerifica & { mittenteAttivo: boolean }> {
      const c = await leggi();
      if (!c.apiKey) return { ok: false, mittentiAttivi: [], errore: "Nessuna chiave API configurata.", mittenteAttivo: false };
      const e = await verificaBrevo(c.apiKey, o.fetch);
      return { ...e, mittenteAttivo: e.mittentiAttivi.includes(c.mittente.toLowerCase()) };
    },

    /** Mailer, който чете настройките при всяко изпращане. */
    mailer(): Mailer {
      return {
        send: async (msg) => {
          const c = await leggi();
          if (!c.apiKey || !EMAIL_RE.test(c.mittente) || !EMAIL_RE.test(c.destinatario)) throw new Error("Email non configurata");
          await brevoMailer({ apiKey: c.apiKey, from: { email: c.mittente, name: c.nomeMittente || "LiftCon" }, to: c.destinatario, ...(o.fetch ? { fetch: o.fetch } : {}) }).send(msg);
        },
      };
    },
  };
}

export type GestoreEmail = ReturnType<typeof gestoreEmail>;
