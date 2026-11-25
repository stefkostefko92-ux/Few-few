import { z } from 'zod';

/**
 * Данните на фирмата (собственикът, 30 октомври 2026): попълва ги администраторът ѝ в настройките, а
 * табелата „Avviso di fermo impianto“ ги слага горе до логото. Пазят се като JSON в
 * `Azienda.datiSocietari`; записаното се чете с недоверие (непознатото се маха, грешното — също). Ред с
 * дейността на табелата няма (собственикът, 30 октомври 2026: „премахни напълно Manutenzione
 * riparazione…“) — записаното отпреди остава в JSON-а, но не се чете.
 */

/** Един ред: без управляващи знаци, интервалите събрани — така е и на табелата. */
const testo = (max: number) =>
  z
    .string()
    .transform((v) =>
      v
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .pipe(z.string().max(max, 'tooLong'));

export const datiSocietariSchema = z
  .object({
    ragioneSociale: testo(160),
    indirizzo: testo(200),
    cap: testo(10).refine((v) => /^[0-9A-Za-z ]*$/.test(v), 'invalid'),
    citta: testo(80),
    provincia: testo(2).refine((v) => /^[A-Za-z]{0,2}$/.test(v), 'invalid'),
    telefono: testo(40).refine((v) => /^[0-9+()./\- ]*$/.test(v), 'phone'),
    email: testo(160).refine((v) => v === '' || z.string().email().safeParse(v).success, 'email'),
    partitaIva: testo(20).refine((v) => /^[0-9A-Za-z ]*$/.test(v), 'invalid'),
    sito: testo(160).refine((v) => !/\s/.test(v), 'invalid'),
  })
  .strict();

export type DatiSocietari = z.output<typeof datiSocietariSchema>;
export const CAMPI_DATI = Object.keys(datiSocietariSchema.shape) as Array<keyof DatiSocietari>;

export function vuoti(): DatiSocietari {
  return Object.fromEntries(CAMPI_DATI.map((key) => [key, ''])) as DatiSocietari;
}

/** Формата на настройките: всяко поле — низ (липсващото е празно); масив на мястото на низ е подправка. */
export function parseDatiSocietari(
  body: Record<string, unknown>,
):
  | { ok: true; data: DatiSocietari }
  | { ok: false; errors: Partial<Record<keyof DatiSocietari, string>> } {
  const input = Object.fromEntries(
    CAMPI_DATI.map((key) => [key, body[key] === undefined ? '' : body[key]]),
  );
  const parsed = datiSocietariSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: Partial<Record<keyof DatiSocietari, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof DatiSocietari;
    if (!errors[key]) errors[key] = issue.code === 'invalid_type' ? 'invalid' : issue.message;
  }
  return { ok: false, errors };
}

/**
 * Записаното в базата: всяко поле поотделно — грешното или непознатото става празно. `null` — фирмата
 * още не е записала нищо (дейността тогава е тази по подразбиране).
 */
export function datiSalvati(value: unknown): DatiSocietari | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out = vuoti();
  for (const key of CAMPI_DATI) {
    const one = datiSocietariSchema.shape[key].safeParse(raw[key]);
    if (one.success) out[key] = one.data;
  }
  return out;
}

/** Главата на табелата: името (получер) и до три реда с адреса и контактите. */
export interface IntestazioneAzienda {
  nome: string;
  righe: string[];
}

export function intestazioneDi(nomeAzienda: string, salvati: unknown): IntestazioneAzienda {
  const dati = datiSalvati(salvati);
  if (!dati) return { nome: nomeAzienda, righe: [] };
  const luogo = [dati.cap, dati.citta].filter(Boolean).join(' ');
  const sede = [
    dati.indirizzo,
    luogo + (dati.provincia ? ` (${dati.provincia.toUpperCase()})` : ''),
  ]
    .filter((v) => v.trim() !== '')
    .join(', ');
  const contatti = [dati.telefono && `Tel. ${dati.telefono}`, dati.email]
    .filter(Boolean)
    .join(' – ');
  const fiscale = [dati.partitaIva && `P. IVA ${dati.partitaIva}`, dati.sito]
    .filter(Boolean)
    .join(' – ');
  return {
    nome: dati.ragioneSociale || nomeAzienda,
    righe: [sede, contatti, fiscale].filter((v) => v !== ''),
  };
}
