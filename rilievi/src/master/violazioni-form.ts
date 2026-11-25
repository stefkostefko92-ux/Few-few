import type { RischioViolazione, RuoloViolazione } from '@prisma/client';
import { z } from 'zod';
import { HOUR } from '../time.js';
import { momentoRoma } from './tempo.js';

/**
 * Формата на регистъра на нарушенията (чл. 33(5) GDPR; src/master/violazioni.ts) — без база: текстовете
 * (контролните знаци → интервал, отрязани), изборите и часовете по Рим. Всяка грешка — по името на полето.
 */
export const RISCHI = [
  'IMPROBABILE',
  'RISCHIO',
  'ELEVATO',
] as const satisfies readonly RischioViolazione[];
export const RUOLI = ['RESPONSABILE', 'TITOLARE'] as const satisfies readonly RuoloViolazione[];

/** Срокът за уведомяване на органа по чл. 33(1): 72 часа от узнаването. */
export const scadenza72h = (rilevataAt: Date): Date => new Date(rilevataAt.getTime() + 72 * HOUR);

const testo = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim())
    .pipe(z.string().min(1).max(max));
const facoltativo = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim())
    .pipe(z.string().max(max))
    .transform((v) => (v === '' ? null : v));
const momento = z.string().transform((v, ctx) => {
  const d = momentoRoma(v.trim());
  if (!d) ctx.addIssue({ code: 'custom', message: 'data' });
  return d ?? new Date(0);
});
const momentoFacoltativo = z.string().transform((v, ctx) => {
  if (v.trim() === '') return null;
  const d = momentoRoma(v.trim());
  if (!d) ctx.addIssue({ code: 'custom', message: 'data' });
  return d;
});

const schema = z.object({
  rilevataAt: momento,
  eventoAt: momentoFacoltativo,
  titolo: testo(160),
  rilevazione: testo(2000),
  natura: testo(4000),
  ruolo: z.enum(RUOLI),
  categorieDati: testo(2000),
  interessati: testo(2000),
  aziende: testo(2000),
  conseguenze: testo(4000),
  misure: testo(4000),
  rischio: z.enum(RISCHI),
  titolariAvvisatiAt: momentoFacoltativo,
  autoritaNotificataAt: momentoFacoltativo,
  autoritaProtocollo: facoltativo(80),
  interessatiAvvisatiAt: momentoFacoltativo,
  motivazione: facoltativo(4000),
  lezioni: facoltativo(4000),
  chiusaAt: momentoFacoltativo,
});

export type DatiViolazione = z.output<typeof schema>;
export const CAMPI_VIOLAZIONE = Object.keys(schema.shape) as Array<keyof DatiViolazione>;

export type EsitoViolazione =
  | { ok: true; dati: DatiViolazione }
  | { ok: false; errori: Partial<Record<keyof DatiViolazione, true>> };

/** Пратеното от формата; липсващото поле е празен низ (отметнатото — грешка на мястото си). */
export function leggiViolazione(body: unknown): EsitoViolazione {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const input = Object.fromEntries(
    CAMPI_VIOLAZIONE.map((k) => [k, typeof raw[k] === 'string' ? raw[k] : '']),
  );
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const errori: Partial<Record<keyof DatiViolazione, true>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string') errori[key as keyof DatiViolazione] = true;
    }
    return { ok: false, errori };
  }
  if (parsed.data.chiusaAt && parsed.data.chiusaAt < parsed.data.rilevataAt) {
    return { ok: false, errori: { chiusaAt: true } };
  }
  return { ok: true, dati: parsed.data };
}
