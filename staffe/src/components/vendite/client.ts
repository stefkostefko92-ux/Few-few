'use client';

/**
 * Chiamate al proprio backend dal browser.
 *
 * Il messaggio d'errore mostrato all'operatore è **quello del server**: le
 * rotte lo scrivono già in italiano e comprensibile (`{ error: { message } }`),
 * riscriverlo qui significherebbe avere due verità diverse per lo stesso guasto.
 */
type RispostaErrore = { error?: { message?: string } };

export async function invia<T>(
  url: string,
  metodo: 'POST' | 'PATCH' | 'DELETE',
  corpo?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo ?? {}),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const messaggio = (body as RispostaErrore | null)?.error?.message;
    throw new Error(messaggio ?? 'Errore imprevisto. Riprovare.');
  }
  return (body as { data: T }).data;
}
