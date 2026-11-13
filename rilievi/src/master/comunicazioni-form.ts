import type { LivelloComunicazione } from '@prisma/client';
import { z } from 'zod';
import { giornoValido, mezzanotteRoma } from './tempo.js';

/**
 * Формата на ново съобщение до фирмите (views/master/comunicazioni.ejs) — без база: видовете, проверката на
 * текста и на прозореца по дни (Рим). Записът и лентите — comunicazioni.ts.
 */

export const LIVELLI = [
  'INFO',
  'AVVISO',
  'URGENTE',
] as const satisfies readonly LivelloComunicazione[];

const pulito = (max: number) =>
  z
    .string()
    .transform((v) =>
      v
        .replace(/\r\n?/g, '\n')
        .replace(/[^\P{Cc}\n]/gu, ' ')
        .trim(),
    )
    .pipe(z.string().min(2).max(max));

const giorno = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Формата на ново съобщение (views/master/comunicazioni.ejs). */
const formSchema = z
  .object({
    titolo: pulito(120).refine((v) => !v.includes('\n')),
    testo: pulito(2000),
    livello: z.enum(LIVELLI),
    destinatari: z.enum(['tutte', 'scelte']),
    aziende: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
    inizio: giorno,
    fine: z.union([giorno, z.literal('')]).optional(),
    email: z.literal('1').optional(),
  })
  .strip();

export interface NuovaComunicazione {
  titolo: string;
  testo: string;
  livello: LivelloComunicazione;
  /** Празно — до всички фирми. */
  aziendaIds: string[];
  inizioAt: Date;
  fineAt: Date | null;
  email: boolean;
}

export type EsitoForm =
  { ok: true; value: NuovaComunicazione } | { ok: false; errore: 'campi' | 'aziende' | 'date' };

/**
 * Пратеното от формата → съобщение. Дните са по Рим: от полунощ на първия до полунощ след последния;
 * последният не е преди първия и не по-късно от година. Избраните фирми трябва да съществуват (`esistenti`).
 */
export function leggiForm(body: unknown, esistenti: ReadonlySet<string>): EsitoForm {
  const parsed = formSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errore: 'campi' };
  const f = parsed.data;
  if (!giornoValido(f.inizio) || (f.fine && !giornoValido(f.fine)))
    return { ok: false, errore: 'date' };
  const aziendaIds = f.destinatari === 'tutte' ? [] : [...new Set(f.aziende)];
  if (f.destinatari === 'scelte' && (aziendaIds.length === 0 || aziendaIds.length > 500))
    return { ok: false, errore: 'aziende' };
  if (aziendaIds.some((id) => !esistenti.has(id))) return { ok: false, errore: 'aziende' };
  const inizioAt = mezzanotteRoma(f.inizio);
  const fineAt = f.fine ? mezzanotteRoma(f.fine, 1) : null;
  if (Number.isNaN(inizioAt.getTime()) || (fineAt && Number.isNaN(fineAt.getTime())))
    return { ok: false, errore: 'date' };
  if (fineAt && (fineAt <= inizioAt || fineAt.getTime() - inizioAt.getTime() > 366 * 86_400_000))
    return { ok: false, errore: 'date' };
  return {
    ok: true,
    value: {
      titolo: f.titolo,
      testo: f.testo,
      livello: f.livello,
      aziendaIds,
      inizioAt,
      fineAt,
      email: f.email === '1',
    },
  };
}
