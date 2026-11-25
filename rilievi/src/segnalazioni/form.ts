import { z } from 'zod';

/**
 * Формулярът за сигнал за незаконно съдържание (чл. 16, пар. 2 от Регламент (ЕС) 2022/2065; условията 2026-11-13,
 * чл. 25.5): къде е съдържанието, защо е незаконно, име и имейл на подателя — освен при престъпленията по чл. 3–7
 * от Директива 2011/93/ЕС (чл. 16, пар. 2, б. „в“: тогава са по избор) — и декларацията за добросъвестност.
 * Чист модул: сървърът решава по пратеното, страницата само го показва.
 */
export const LIMITI_SEGNALAZIONE = { dove: 2000, motivo: 5000, nome: 200, email: 254 } as const;
const MINIMI = { dove: 10, motivo: 20, nome: 2 } as const;

/** Капанът за ботове: поле, което човек не вижда; попълнено — нищо не се пази и нищо не се казва. */
export const TRAPPOLA = 'sito';

export const CAMPI_SEGNALAZIONE = ['dove', 'motivo', 'nome', 'email', 'buonaFede'] as const;
export type CampoSegnalazione = (typeof CAMPI_SEGNALAZIONE)[number];

export interface ValoriSegnalazione {
  dove: string;
  motivo: string;
  nome: string;
  email: string;
  minori: boolean;
  buonaFede: boolean;
}

export const valoriVuoti = (): ValoriSegnalazione => ({
  dove: '',
  motivo: '',
  nome: '',
  email: '',
  minori: false,
  buonaFede: false,
});

export interface DatiSegnalazione {
  dove: string;
  motivo: string;
  nome: string | null;
  email: string | null;
  minori: boolean;
}

export type SegnalazioneLetta =
  | { kind: 'ok'; dati: DatiSegnalazione }
  | {
      kind: 'invalid';
      valori: ValoriSegnalazione;
      errori: Partial<Record<CampoSegnalazione, CampoSegnalazione>>;
    }
  | { kind: 'spam' };

const grezzo = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.slice(0, max * 2) : '';

/** Един ред: управляващите знаци и редовете стават интервал (името влиза в писмо). */
const riga = (v: string): string =>
  v
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Текст на няколко реда: остават само преносите на ред. */
const testo = (v: string): string =>
  v
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n]/gu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const emailSchema = z.string().email().max(LIMITI_SEGNALAZIONE.email);

export function leggiSegnalazione(body: Record<string, unknown>): SegnalazioneLetta {
  if (grezzo(body[TRAPPOLA], 200).trim() !== '') return { kind: 'spam' };
  const dove = testo(grezzo(body.dove, LIMITI_SEGNALAZIONE.dove));
  const motivo = testo(grezzo(body.motivo, LIMITI_SEGNALAZIONE.motivo));
  const nome = riga(grezzo(body.nome, LIMITI_SEGNALAZIONE.nome));
  const email = riga(grezzo(body.email, LIMITI_SEGNALAZIONE.email)).toLowerCase();
  const minori = body.minori === 'si';
  const buonaFede = body.buonaFede === 'si';
  const errori: Partial<Record<CampoSegnalazione, CampoSegnalazione>> = {};
  if (dove.length < MINIMI.dove || dove.length > LIMITI_SEGNALAZIONE.dove) errori.dove = 'dove';
  if (motivo.length < MINIMI.motivo || motivo.length > LIMITI_SEGNALAZIONE.motivo)
    errori.motivo = 'motivo';
  const nomeOk = nome.length >= MINIMI.nome && nome.length <= LIMITI_SEGNALAZIONE.nome;
  if (!(nomeOk || (minori && nome === ''))) errori.nome = 'nome';
  if (!(emailSchema.safeParse(email).success || (minori && email === ''))) errori.email = 'email';
  if (!buonaFede) errori.buonaFede = 'buonaFede';
  if (Object.keys(errori).length > 0)
    return {
      kind: 'invalid',
      // Отметката за добросъвестност не се връща отметната: човекът я потвърждава наново.
      valori: {
        dove,
        motivo,
        nome,
        email: riga(grezzo(body.email, LIMITI_SEGNALAZIONE.email)),
        minori,
        buonaFede: false,
      },
      errori,
    };
  return {
    kind: 'ok',
    dati: { dove, motivo, nome: nome || null, email: email || null, minori },
  };
}
