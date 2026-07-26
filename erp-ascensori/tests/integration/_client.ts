// Помощници за интеграционните тестове: HTTP клиент с cookie jar срещу
// РЕАЛНО пуснат сървър и РЕАЛНА PostgreSQL. Без мокове — точно това е смисълът.

export const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3021";

export const PASSWORD = "Ascensori!2026";
export const UTENTI = {
  MASTER: "master@erp-ascensori.local",
  ADMIN: "admin@erp-ascensori.local",
  DIREZIONE: "direzione@erp-ascensori.local",
  RESPONSABILE: "responsabile@erp-ascensori.local",
  TECNICO: "tecnico@erp-ascensori.local",
  OPERATORE: "operatore@erp-ascensori.local",
  CLIENTE: "cliente@erp-ascensori.local",
} as const;

export type Ruolo = keyof typeof UTENTI;

export interface Risposta<T = unknown> {
  status: number;
  dati: T;
}

/** Сесия с cookie jar — всяка роля си има своя. */
export class Sessione {
  private cookies = new Map<string, string>();

  /** Бисквитките като хедър — за заявки извън `richiesta` (напр. изтегляне на PDF). */
  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async richiesta<T = Record<string, unknown>>(
    metodo: string,
    percorso: string,
    corpo?: unknown,
  ): Promise<Risposta<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies]
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }
    const res = await fetch(BASE + percorso, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      redirect: "manual",
    });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      const nome = pair.slice(0, idx).trim();
      const valore = pair.slice(idx + 1).trim();
      if (valore === "") this.cookies.delete(nome);
      else this.cookies.set(nome, valore);
    }
    const testo = await res.text();
    let dati: unknown = {};
    try {
      dati = testo ? JSON.parse(testo) : {};
    } catch {
      dati = { _raw: testo.slice(0, 200) };
    }
    return { status: res.status, dati: dati as T };
  }

  get = <T = Record<string, unknown>>(p: string) => this.richiesta<T>("GET", p);
  post = <T = Record<string, unknown>>(p: string, b?: unknown) =>
    this.richiesta<T>("POST", p, b);
  put = <T = Record<string, unknown>>(p: string, b?: unknown) =>
    this.richiesta<T>("PUT", p, b);
  patch = <T = Record<string, unknown>>(p: string, b?: unknown) =>
    this.richiesta<T>("PATCH", p, b);
  del = <T = Record<string, unknown>>(p: string) =>
    this.richiesta<T>("DELETE", p);

  async entra(email: string, password = PASSWORD): Promise<number> {
    const { status } = await this.post("/api/auth/login", { email, password });
    return status;
  }
}

/** Влязла сесия за дадена роля. Хвърля, ако входът се провали. */
export async function comeRuolo(ruolo: Ruolo): Promise<Sessione> {
  const s = new Sessione();
  const status = await s.entra(UTENTI[ruolo]);
  if (status !== 200)
    throw new Error(`Вход като ${ruolo} се провали: HTTP ${status}`);
  return s;
}

/** Уникален суфикс — фикстурите не се сблъскват между тестове. */
let contatore = 0;
export function unico(prefisso = "T"): string {
  contatore += 1;
  return `${prefisso}-${process.pid}-${Date.now().toString(36)}-${contatore}`;
}
