'use client';

/**
 * Chiamata alle rotte del modulo acquisti dal browser.
 *
 * L'errore torna già pronto per l'operatore: il server risponde in italiano
 * (`{ error: { message, code, details } }`) e quel messaggio si mostra così
 * com'è. `details` serve al caso dell'eccedenza di ricevimento, che va spiegata
 * riga per riga invece di essere ridotta a un «errore».
 */
export type EsitoOk<T> = { ok: true; dati: T };
export type EsitoErrore = {
  ok: false;
  messaggio: string;
  codice: string;
  dettagli?: unknown;
};
export type Esito<T> = EsitoOk<T> | EsitoErrore;

type CorpoErrore = { error?: { message?: string; code?: string; details?: unknown } };

export async function chiama<T>(
  url: string,
  metodo: 'POST' | 'PATCH' | 'DELETE',
  corpo: unknown = {},
): Promise<Esito<T>> {
  let risposta: Response;
  try {
    risposta = await fetch(url, {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  } catch {
    return {
      ok: false,
      messaggio: 'Connessione al server non riuscita. Riprovare.',
      codice: 'rete',
    };
  }

  let json: unknown = null;
  try {
    json = await risposta.json();
  } catch {
    json = null;
  }

  if (!risposta.ok) {
    const errore = (json as CorpoErrore | null)?.error;
    return {
      ok: false,
      messaggio: errore?.message ?? 'Operazione non riuscita.',
      codice: errore?.code ?? 'errore',
      dettagli: errore?.details,
    };
  }

  return { ok: true, dati: (json as { data: T }).data };
}
