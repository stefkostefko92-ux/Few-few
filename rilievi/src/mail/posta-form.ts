import { isIP } from 'node:net';
import { z } from 'zod';

/**
 * Формата на пощата на портала в конзолата на MASTER (#32 — Brevo SMTP): чете се строго, без база. Сървърът — име
 * на хост (в продукция никога IP или localhost: конзолата не е скенер на вътрешната мрежа), портовете — само
 * тези на Brevo, логинът и ключът — без нови редове (SMTP команди), името на подателя — без „<>“ и нови
 * редове (заглавия). Празен ключ при записан — остава записаният.
 */

/** 587 и 2525 — STARTTLS (2525 минава и при хостинг, който блокира 587); 465 — TLS от началото. */
export const PORTE_SMTP = [587, 2525, 465] as const;

export interface ValoriPosta {
  host: string;
  porta: (typeof PORTE_SMTP)[number];
  utente: string;
  /** null — остава записаният ключ. */
  password: string | null;
  mittenteNome: string;
  mittenteEmail: string;
}

export type CampoPosta = keyof ValoriPosta;

export type EsitoFormPosta =
  { ok: true; valori: ValoriPosta } | { ok: false; errori: Partial<Record<CampoPosta, string>> };

const NOME_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const CONTROLLO = /\p{Cc}/u;

const testo = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function hostDa(raw: unknown, produzione: boolean): string | null {
  const v = testo(raw).toLowerCase();
  if (v.length === 0 || v.length > 253) return null;
  if (!produzione && (v === 'localhost' || isIP(v) !== 0)) return v;
  return NOME_HOST.test(v) ? v : null;
}

const emailSchema = z.string().max(254).email();

export function leggiFormPosta(
  body: Record<string, unknown>,
  opzioni: { produzione: boolean; passwordSalvata: boolean },
): EsitoFormPosta {
  const errori: Partial<Record<CampoPosta, string>> = {};
  const host = hostDa(body.host, opzioni.produzione);
  if (!host) errori.host = 'posta.errore.host';

  const portaNum = Number(testo(body.porta));
  const porta = PORTE_SMTP.find((p) => p === portaNum) ?? null;
  if (porta === null) errori.porta = 'posta.errore.porta';

  const utente = testo(body.utente);
  if (!utente || utente.length > 254 || /\s/.test(utente) || CONTROLLO.test(utente))
    errori.utente = 'posta.errore.utente';

  // Ключът — както е написан (без trim: интервал в края може да е част от него), без управляващи знаци.
  const pass = typeof body.password === 'string' ? body.password : '';
  let password: string | null = null;
  if (pass.length === 0) {
    if (!opzioni.passwordSalvata) errori.password = 'posta.errore.password';
  } else if (pass.length > 512 || CONTROLLO.test(pass)) {
    errori.password = 'posta.errore.password';
  } else {
    password = pass;
  }

  const mittenteNome = testo(body.mittenteNome);
  if (
    !mittenteNome ||
    mittenteNome.length > 80 ||
    /[<>"\\]/.test(mittenteNome) ||
    CONTROLLO.test(mittenteNome)
  )
    errori.mittenteNome = 'posta.errore.mittenteNome';

  const mittenteEmail = testo(body.mittenteEmail).toLowerCase();
  if (CONTROLLO.test(mittenteEmail) || !emailSchema.safeParse(mittenteEmail).success)
    errori.mittenteEmail = 'posta.errore.mittenteEmail';

  if (Object.keys(errori).length > 0 || !host || porta === null) return { ok: false, errori };
  return { ok: true, valori: { host, porta, utente, password, mittenteNome, mittenteEmail } };
}
